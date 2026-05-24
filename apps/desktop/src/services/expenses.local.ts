'use client'

import {
  PaymentMethod,
  Resource,
  type CreateExpenseRequest,
  type Expense,
  type ExpenseCategory,
  type ExpenseListResult,
  type ExpensesQuery,
  type UpdateExpenseRequest,
} from '@biztrack/types'
import { assertLocalPermissionAccess } from '@/lib/plan-access'
import { compareValues, dbBatch, dbQuery, normalizeSortOrder, paginateResult } from './local-db'
import { assertBusinessId } from './products.local'
import { buildOutboxUpsertOperation, requestBackgroundSync } from './sync.local'

type ExpenseCategoryRow = {
  id: string
  business_id: string | null
  name: string
  slug: string | null
  color: string | null
  icon: string | null
  sort_order: number | null
  is_active: number
  is_deleted: number
  created_at: string
  updated_at: string
}

type ExpenseRow = {
  id: string
  business_id: string
  recorded_by_id: string
  category_id: string | null
  description: string
  amount: number
  currency: string | null
  payment_method: string | null
  receipt_url: string | null
  vendor: string | null
  notes: string | null
  is_recurring: number
  date: string
  is_deleted: number
  created_at: string
  updated_at: string
  category_join_id: string | null
  category_business_id: string | null
  category_name: string | null
  category_slug: string | null
  category_color: string | null
  category_icon: string | null
  category_sort_order: number | null
  category_created_at: string | null
  category_updated_at: string | null
}

type LocalExpensesQuery = ExpensesQuery & {
  includeDeleted?: boolean
}

export class ExpenseLocalError extends Error {
  constructor(
    public readonly code:
      | 'BUSINESS_REQUIRED'
      | 'EXPENSE_NOT_FOUND'
      | 'EXPENSE_CATEGORY_NOT_FOUND'
      | 'EXPENSE_DESCRIPTION_INVALID'
      | 'EXPENSE_AMOUNT_INVALID'
      | 'EXPENSE_DATE_INVALID'
      | 'EXPENSE_DATE_FUTURE'
      | 'EXPENSE_VENDOR_TOO_LONG'
      | 'EXPENSE_NOTES_TOO_LONG',
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'ExpenseLocalError'
  }
}

export async function listExpenseCategoriesLocal(businessId: string) {
  const normalizedBusinessId = assertBusinessId(businessId)
  const rows = await dbQuery<ExpenseCategoryRow>(
    `
      SELECT
        id,
        business_id,
        name,
        slug,
        color,
        icon,
        sort_order,
        is_active,
        is_deleted,
        created_at,
        updated_at
      FROM expense_categories
      WHERE is_deleted = 0
        AND is_active = 1
        AND (business_id IS NULL OR business_id = ?)
      ORDER BY sort_order ASC, name ASC
    `,
    [normalizedBusinessId],
  )

  return rows.map(mapExpenseCategoryRow)
}

export async function listExpensesLocal(
  businessId: string,
  query: LocalExpensesQuery = {},
): Promise<ExpenseListResult> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const rows = await fetchExpenseRows(normalizedBusinessId)
  const search = query.search?.trim().toLowerCase() ?? ''
  const includeDeleted = query.includeDeleted ?? false
  const filtered = rows.filter((row) => {
    if (!includeDeleted && row.is_deleted) {
      return false
    }

    if (query.dateFrom && row.date < query.dateFrom) {
      return false
    }

    if (query.dateTo && row.date > query.dateTo) {
      return false
    }

    if (query.categoryId && row.category_id !== query.categoryId) {
      return false
    }

    if (query.isRecurring !== undefined && Boolean(row.is_recurring) !== query.isRecurring) {
      return false
    }

    if (search) {
      const haystack = [
        row.description,
        row.vendor ?? '',
        row.category_name ?? '',
      ]
        .join(' ')
        .toLowerCase()

      if (!haystack.includes(search)) {
        return false
      }
    }

    return true
  })

  const sortOrder = normalizeSortOrder(query.sortOrder)
  const sortField = query.sortBy ?? 'expenseDate'

  filtered.sort((left, right) => {
    switch (sortField) {
      case 'amount':
        return compareValues(left.amount, right.amount, sortOrder)
      case 'description':
        return compareValues(left.description, right.description, sortOrder)
      case 'createdAt':
        return compareValues(left.created_at, right.created_at, sortOrder)
      case 'updatedAt':
        return compareValues(left.updated_at, right.updated_at, sortOrder)
      case 'expenseDate':
      default:
        return compareValues(left.date, right.date, sortOrder)
    }
  })

  const totalAmount = filtered.reduce((sum, row) => sum + row.amount, 0)
  const paginated = paginateResult(filtered.map(mapExpenseRow), query.page, query.limit ?? 20)

  return {
    ...paginated,
    totalAmount: roundMoney(totalAmount),
  }
}

export async function getExpenseLocal(businessId: string, expenseId: string) {
  const normalizedBusinessId = assertBusinessId(businessId)
  const rows = await fetchExpenseRows(normalizedBusinessId, expenseId)
  const row = rows.find((item) => item.id === expenseId && !item.is_deleted)

  if (!row) {
    throw new ExpenseLocalError('EXPENSE_NOT_FOUND')
  }

  return mapExpenseRow(row)
}

export async function createExpenseLocal(
  businessId: string,
  recordedById: string,
  payload: CreateExpenseRequest,
) {
  const normalizedBusinessId = assertBusinessId(businessId)
  await assertLocalPermissionAccess(normalizedBusinessId, Resource.EXPENSES_CREATE)
  const normalizedCategory = await resolveExpenseCategory(normalizedBusinessId, payload.categoryId)
  const description = normalizeDescription(payload.description)
  const amount = normalizeAmount(payload.amount)
  const expenseDate = normalizeExpenseDate(payload.expenseDate)
  const vendor = normalizeVendor(payload.vendor)
  const notes = normalizeNotes(payload.notes)
  const isRecurring = payload.isRecurring ? 1 : 0
  const paymentMethod = normalizePaymentMethod(payload.paymentMethod)
  const receiptUrl = normalizeOptionalString(payload.receiptUrl)
  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  await dbBatch([
    {
      sql: `
        INSERT INTO expenses (
          id,
          business_id,
          recorded_by_id,
          category_id,
          category,
          description,
          amount,
          currency,
          payment_method,
          receipt_url,
          vendor,
          notes,
          is_recurring,
          date,
          is_deleted,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, '', ?, ?, 'XAF', ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `,
      params: [
        id,
        normalizedBusinessId,
        recordedById,
        normalizedCategory.id,
        description,
        amount,
        paymentMethod,
        receiptUrl,
        vendor,
        notes,
        isRecurring,
        expenseDate,
        now,
        now,
      ],
    },
    buildOutboxUpsertOperation('expenses', id),
  ])

  requestBackgroundSync()
  return getExpenseLocal(normalizedBusinessId, id)
}

export async function updateExpenseLocal(
  businessId: string,
  expenseId: string,
  payload: UpdateExpenseRequest,
) {
  const normalizedBusinessId = assertBusinessId(businessId)
  await assertLocalPermissionAccess(normalizedBusinessId, Resource.EXPENSES_EDIT)
  const existing = await getExpenseLocal(normalizedBusinessId, expenseId)
  const categoryId = payload.categoryId
    ? (await resolveExpenseCategory(normalizedBusinessId, payload.categoryId)).id
    : existing.categoryId
  const description =
    payload.description === undefined
      ? existing.description
      : normalizeDescription(payload.description)
  const amount =
    payload.amount === undefined ? existing.amount : normalizeAmount(payload.amount)
  const expenseDate =
    payload.expenseDate === undefined
      ? existing.expenseDate
      : normalizeExpenseDate(payload.expenseDate)
  const vendor =
    payload.vendor === undefined ? existing.vendor ?? null : normalizeVendor(payload.vendor)
  const notes =
    payload.notes === undefined ? existing.notes ?? null : normalizeNotes(payload.notes)
  const isRecurring =
    payload.isRecurring === undefined ? (existing.isRecurring ? 1 : 0) : payload.isRecurring ? 1 : 0
  const paymentMethod =
    payload.paymentMethod === undefined
      ? normalizePaymentMethod(existing.paymentMethod ?? undefined)
      : normalizePaymentMethod(payload.paymentMethod)
  const receiptUrl =
    payload.receiptUrl === undefined
      ? existing.receiptUrl ?? null
      : normalizeOptionalString(payload.receiptUrl)
  const now = new Date().toISOString()

  await dbBatch([
    {
      sql: `
        UPDATE expenses
        SET category_id = ?,
            description = ?,
            amount = ?,
            payment_method = ?,
            receipt_url = ?,
            vendor = ?,
            notes = ?,
            is_recurring = ?,
            date = ?,
            updated_at = ?
        WHERE id = ?
          AND business_id = ?
      `,
      params: [
        categoryId,
        description,
        amount,
        paymentMethod,
        receiptUrl,
        vendor,
        notes,
        isRecurring,
        expenseDate,
        now,
        expenseId,
        normalizedBusinessId,
      ],
    },
    buildOutboxUpsertOperation('expenses', expenseId),
  ])

  requestBackgroundSync()
  return getExpenseLocal(normalizedBusinessId, expenseId)
}

export async function deleteExpenseLocal(businessId: string, expenseId: string) {
  const normalizedBusinessId = assertBusinessId(businessId)
  await assertLocalPermissionAccess(normalizedBusinessId, Resource.EXPENSES_DELETE)
  await getExpenseLocal(normalizedBusinessId, expenseId)
  const now = new Date().toISOString()

  await dbBatch([
    {
      sql: `
        UPDATE expenses
        SET is_deleted = 1,
            updated_at = ?
        WHERE id = ?
          AND business_id = ?
      `,
      params: [now, expenseId, normalizedBusinessId],
    },
    buildOutboxUpsertOperation('expenses', expenseId),
  ])

  requestBackgroundSync()
}

async function fetchExpenseRows(businessId: string, expenseId?: string) {
  return dbQuery<ExpenseRow>(
    `
      SELECT
        expense.id,
        expense.business_id,
        expense.recorded_by_id,
        expense.category_id,
        expense.description,
        expense.amount,
        expense.currency,
        expense.payment_method,
        expense.receipt_url,
        expense.vendor,
        expense.notes,
        expense.is_recurring,
        expense.date,
        expense.is_deleted,
        expense.created_at,
        expense.updated_at,
        category.id AS category_join_id,
        category.business_id AS category_business_id,
        category.name AS category_name,
        category.slug AS category_slug,
        category.color AS category_color,
        category.icon AS category_icon,
        category.sort_order AS category_sort_order,
        category.created_at AS category_created_at,
        category.updated_at AS category_updated_at
      FROM expenses expense
      LEFT JOIN expense_categories category
        ON category.id = expense.category_id
      WHERE expense.business_id = ?
        ${expenseId ? 'AND expense.id = ?' : ''}
      ORDER BY expense.date DESC, expense.created_at DESC
    `,
    expenseId ? [businessId, expenseId] : [businessId],
  )
}

async function resolveExpenseCategory(businessId: string, categoryId: string) {
  const [row] = await dbQuery<ExpenseCategoryRow>(
    `
      SELECT
        id,
        business_id,
        name,
        slug,
        color,
        icon,
        sort_order,
        is_active,
        is_deleted,
        created_at,
        updated_at
      FROM expense_categories
      WHERE id = ?
        AND is_deleted = 0
        AND is_active = 1
        AND (business_id IS NULL OR business_id = ?)
      LIMIT 1
    `,
    [categoryId, businessId],
  )

  if (!row) {
    throw new ExpenseLocalError('EXPENSE_CATEGORY_NOT_FOUND')
  }

  return mapExpenseCategoryRow(row)
}

function mapExpenseCategoryRow(row: ExpenseCategoryRow): ExpenseCategory {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    slug: row.slug ?? row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    color: row.color ?? '#888780',
    icon: row.icon,
    sortOrder: row.sort_order ?? 0,
    isSystem: !row.business_id,
    expenseCount: undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapExpenseRow(row: ExpenseRow): Expense {
  return {
    id: row.id,
    businessId: row.business_id,
    categoryId: row.category_id ?? '',
    category: row.category_join_id
      ? {
          id: row.category_join_id,
          businessId: row.category_business_id,
          name: row.category_name ?? 'Unknown',
          slug:
            row.category_slug ??
            (row.category_name ?? 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          color: row.category_color ?? '#888780',
          icon: row.category_icon,
          sortOrder: row.category_sort_order ?? 0,
          isSystem: !row.category_business_id,
          createdAt: row.category_created_at ?? row.created_at,
          updatedAt: row.category_updated_at ?? row.updated_at,
        }
      : null,
    description: row.description,
    amount: row.amount,
    currency: row.currency ?? 'XAF',
    expenseDate: row.date,
    vendor: row.vendor,
    notes: row.notes,
    isRecurring: Boolean(row.is_recurring),
    recordedById: row.recorded_by_id,
    recordedBy: null,
    paymentMethod: row.payment_method ?? PaymentMethod.CASH,
    receiptUrl: row.receipt_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.is_deleted ? row.updated_at : null,
    isDeleted: Boolean(row.is_deleted),
  }
}

function normalizeDescription(value: string) {
  const trimmed = value.trim()
  if (trimmed.length < 3 || trimmed.length > 300) {
    throw new ExpenseLocalError('EXPENSE_DESCRIPTION_INVALID')
  }

  return trimmed
}

function normalizeAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ExpenseLocalError('EXPENSE_AMOUNT_INVALID')
  }

  return roundMoney(value)
}

function normalizeExpenseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ExpenseLocalError('EXPENSE_DATE_INVALID')
  }

  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    throw new ExpenseLocalError('EXPENSE_DATE_INVALID')
  }

  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`

  if (value > todayKey) {
    throw new ExpenseLocalError('EXPENSE_DATE_FUTURE')
  }

  return value
}

function normalizeVendor(value?: string | null) {
  const trimmed = normalizeOptionalString(value)
  if (trimmed && trimmed.length > 200) {
    throw new ExpenseLocalError('EXPENSE_VENDOR_TOO_LONG')
  }

  return trimmed
}

function normalizeNotes(value?: string | null) {
  const trimmed = normalizeOptionalString(value)
  if (trimmed && trimmed.length > 5000) {
    throw new ExpenseLocalError('EXPENSE_NOTES_TOO_LONG')
  }

  return trimmed
}

function normalizePaymentMethod(value?: PaymentMethod | string | null) {
  if (!value) {
    return PaymentMethod.CASH
  }

  return Object.values(PaymentMethod).includes(value as PaymentMethod)
    ? (value as PaymentMethod)
    : PaymentMethod.CASH
}

function normalizeOptionalString(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}
