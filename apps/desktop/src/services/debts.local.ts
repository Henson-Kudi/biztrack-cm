'use client'

import {
  ContactStatementEntryType,
  ContactType,
  DebtDirection,
  DebtSource,
  DebtStatus,
  PaymentMethod,
  Resource,
  type ContactStatement,
  type Debt,
  type DebtSyncPayload,
  type DebtDirectionSummary,
  type DebtListResult,
  type DebtsQuery,
  type RecordDebtPaymentRequest,
  type WriteOffDebtRequest,
} from '@biztrack/types'
import { assertLocalPermissionAccess } from '@/lib/plan-access'
import { compareValues, dbBatch, dbQuery, normalizeSortOrder, paginateResult } from './local-db'
import { assertBusinessId } from './products.local'
import { buildOutboxEventOperation, requestBackgroundSync } from './sync.local'

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

type ContactRow = {
  id: string
  type: string
  name: string
  phone: string | null
  is_active: number | null
}

type DebtRow = {
  id: string
  business_id: string
  contact_id: string
  direction: string
  source_type: string
  source_id: string
  source_reference: string
  original_amount: number
  paid_amount: number | null
  status: string
  due_date: string | null
  notes: string | null
  created_at: string
  settled_at: string | null
  written_off_at: string | null
  written_off_by: string | null
  written_off_reason: string | null
  contact_type: string | null
  contact_name: string | null
  contact_phone: string | null
}

type DebtPaymentRow = {
  id: string
  business_id: string
  debt_id: string
  amount: number
  method: string
  mobile_money_reference: string | null
  payment_date: string
  notes: string | null
  recorded_by: string
  created_at: string
}

type DebtFilters = {
  businessId: string
  direction?: DebtDirection
  contactId?: string
  contactIds?: string[]
  debtId?: string
  sourceType?: DebtSource
  sourceId?: string
  status?: DebtStatus
  search?: string
  dateFrom?: string
  dateTo?: string
}

export class DebtLocalError extends Error {
  constructor(
    public readonly code:
      | 'CONTACT_NOT_FOUND'
      | 'CONTACT_INACTIVE'
      | 'CONTACT_TYPE_INVALID'
      | 'CONTACT_STATEMENT_DIRECTION_REQUIRED'
      | 'DEBT_NOT_FOUND'
      | 'DEBT_PAYMENT_NOT_FOUND'
      | 'DEBT_PAYMENT_LOCKED'
      | 'DEBT_PAYMENT_AMOUNT_EXCEEDS_OUTSTANDING'
      | 'DEBT_PAYMENT_DATE_INVALID'
      | 'DEBT_PAYMENT_METHOD_INVALID'
      | 'DEBT_ALREADY_WRITTEN_OFF'
      | 'DEBT_ALREADY_SETTLED'
      | 'DEBT_WRITE_OFF_REASON_INVALID'
      | 'INVALID_DATE'
      | 'INVALID_DATE_RANGE',
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'DebtLocalError'
  }
}

export async function listDebtsByDirectionLocal(
  businessId: string,
  direction: DebtDirection,
  query: DebtsQuery = {},
): Promise<DebtListResult> {
  const normalizedBusinessId = assertBusinessId(businessId)
  await assertValidDateRange(query.dateFrom, query.dateTo)

  const debts = await fetchDebtsLocal(
    {
      businessId: normalizedBusinessId,
      direction,
      contactId: query.contactId,
      status: query.status,
      search: query.search,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    },
    { includePayments: false },
  )

  return paginateResult(
    sortDebts(debts, query.sortBy, normalizeSortOrder(query.sortOrder)),
    query.page,
    query.limit,
  )
}

export async function listAllDebtsByDirectionLocal(
  businessId: string,
  direction: DebtDirection,
  options: {
    includePayments?: boolean
  } = {},
): Promise<Debt[]> {
  return fetchDebtsLocal(
    {
      businessId: assertBusinessId(businessId),
      direction,
    },
    { includePayments: options.includePayments ?? false },
  )
}

export async function listDebtsForContactLocal(
  contactId: string,
  businessId: string,
  query: DebtsQuery = {},
): Promise<DebtListResult> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const normalizedContactId = contactId.trim()

  if (!normalizedContactId) {
    throw new DebtLocalError('CONTACT_NOT_FOUND')
  }

  await assertValidDateRange(query.dateFrom, query.dateTo)
  await requireContactLocal(normalizedContactId, normalizedBusinessId)

  const debts = await fetchDebtsLocal(
    {
      businessId: normalizedBusinessId,
      contactId: normalizedContactId,
      status: query.status,
      search: query.search,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    },
    { includePayments: false },
  )

  return paginateResult(
    sortDebts(debts, query.sortBy, normalizeSortOrder(query.sortOrder)),
    query.page,
    query.limit,
  )
}

export async function listDebtsForContactsLocal(
  businessId: string,
  contactIds: string[],
  options: {
    includePayments?: boolean
  } = {},
): Promise<Debt[]> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const normalizedContactIds = [...new Set(contactIds.map((value) => value.trim()).filter(Boolean))]
  if (normalizedContactIds.length === 0) {
    return []
  }

  return fetchDebtsLocal(
    {
      businessId: normalizedBusinessId,
      contactIds: normalizedContactIds,
    },
    { includePayments: options.includePayments ?? false },
  )
}

export async function getDebtSummaryLocal(
  businessId: string,
  direction: DebtDirection,
): Promise<DebtDirectionSummary> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const debts = await fetchDebtsLocal(
    {
      businessId: normalizedBusinessId,
      direction,
    },
    { includePayments: false },
  )

  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const monthEnd = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
  )

  let totalOutstanding = 0
  let outstandingDebtCount = 0
  let partiallyPaidDebtCount = 0
  let partiallyPaidOutstanding = 0
  let settledThisMonthCount = 0
  let settledThisMonthAmount = 0

  for (const debt of debts) {
    if (
      [DebtStatus.OUTSTANDING, DebtStatus.PARTIALLY_PAID].includes(debt.status) &&
      debt.outstandingAmount > 0
    ) {
      totalOutstanding = roundMoney(totalOutstanding + debt.outstandingAmount)
      outstandingDebtCount += 1
    }

    if (debt.status === DebtStatus.PARTIALLY_PAID && debt.outstandingAmount > 0) {
      partiallyPaidDebtCount += 1
      partiallyPaidOutstanding = roundMoney(partiallyPaidOutstanding + debt.outstandingAmount)
    }

    if (
      debt.status === DebtStatus.SETTLED &&
      debt.settledAt &&
      isDateInRange(debt.settledAt, monthStart, monthEnd)
    ) {
      settledThisMonthCount += 1
      settledThisMonthAmount = roundMoney(settledThisMonthAmount + debt.originalAmount)
    }
  }

  return {
    direction,
    totalOutstanding,
    outstandingDebtCount,
    partiallyPaidDebtCount,
    partiallyPaidOutstanding,
    settledThisMonthCount,
    settledThisMonthAmount,
  }
}

export async function getDebtByIdLocal(
  businessId: string,
  debtId: string,
  direction?: DebtDirection,
): Promise<Debt> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const normalizedDebtId = debtId.trim()

  if (!normalizedDebtId) {
    throw new DebtLocalError('DEBT_NOT_FOUND')
  }

  const [debt] = await fetchDebtsLocal(
    {
      businessId: normalizedBusinessId,
      debtId: normalizedDebtId,
      direction,
    },
    { includePayments: true },
  )

  if (!debt) {
    throw new DebtLocalError('DEBT_NOT_FOUND')
  }

  return debt
}

export async function getDebtBySourceLocal(
  businessId: string,
  direction: DebtDirection,
  sourceType: DebtSource,
  sourceId: string,
  options: {
    includePayments?: boolean
  } = {},
): Promise<Debt | null> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const normalizedSourceId = sourceId.trim()

  if (!normalizedSourceId) {
    return null
  }

  const [debt] = await fetchDebtsLocal(
    {
      businessId: normalizedBusinessId,
      direction,
      sourceType,
      sourceId: normalizedSourceId,
    },
    { includePayments: options.includePayments ?? true },
  )

  return debt ?? null
}

export async function recordDebtPaymentLocal(
  businessId: string,
  debtId: string,
  direction: DebtDirection,
  payload: RecordDebtPaymentRequest,
  options?: {
    recordedById?: string | null
  },
): Promise<Debt> {
  const normalizedBusinessId = assertBusinessId(businessId)
  await assertLocalPermissionAccess(normalizedBusinessId, Resource.DEBTS_RECORD_PAYMENT)
  const normalizedDebtId = debtId.trim()
  const paymentDate = assertDateOnly(payload.paymentDate)
  const amount = roundMoney(payload.amount)
  const method = assertPaymentMethod(payload.method)

  const debt = await getDebtByIdLocal(normalizedBusinessId, normalizedDebtId, direction)
  if ([DebtStatus.SETTLED, DebtStatus.WRITTEN_OFF].includes(debt.status)) {
    throw new DebtLocalError('DEBT_PAYMENT_LOCKED')
  }

  if (amount <= 0 || amount > debt.outstandingAmount) {
    throw new DebtLocalError('DEBT_PAYMENT_AMOUNT_EXCEEDS_OUTSTANDING')
  }

  if (paymentDate < toDateOnly(debt.createdAt)) {
    throw new DebtLocalError('DEBT_PAYMENT_DATE_INVALID')
  }

  const now = new Date().toISOString()
  const paymentId = crypto.randomUUID()
  await dbBatch([
    {
      sql: `
        INSERT INTO debt_payments (
          id,
          business_id,
          debt_id,
          amount,
          method,
          mobile_money_reference,
          payment_date,
          notes,
          recorded_by,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        paymentId,
        normalizedBusinessId,
        normalizedDebtId,
        amount,
        method,
        normalizeOptionalString(payload.mobileMoneyReference),
        paymentDate,
        normalizeOptionalString(payload.notes),
        normalizeRecordedById(options?.recordedById),
        now,
      ],
    },
  ])

  return queueDebtSyncEventLocal(normalizedBusinessId, normalizedDebtId, direction, now)
}

export async function deleteDebtPaymentLocal(
  businessId: string,
  debtId: string,
  paymentId: string,
  direction: DebtDirection,
): Promise<void> {
  const normalizedBusinessId = assertBusinessId(businessId)
  await assertLocalPermissionAccess(normalizedBusinessId, Resource.DEBTS_DELETE_PAYMENT)
  const normalizedDebtId = debtId.trim()
  const normalizedPaymentId = paymentId.trim()

  await getDebtByIdLocal(normalizedBusinessId, normalizedDebtId, direction)

  const [payment] = await dbQuery<DebtPaymentRow>(
    `
      SELECT
        id,
        business_id,
        debt_id,
        amount,
        method,
        mobile_money_reference,
        payment_date,
        notes,
        recorded_by,
        created_at
      FROM debt_payments
      WHERE id = ?
        AND debt_id = ?
        AND business_id = ?
      LIMIT 1
    `,
    [normalizedPaymentId, normalizedDebtId, normalizedBusinessId],
  )

  if (!payment) {
    throw new DebtLocalError('DEBT_PAYMENT_NOT_FOUND')
  }

  await dbBatch([
    {
      sql: `
        DELETE FROM debt_payments
        WHERE id = ?
          AND debt_id = ?
          AND business_id = ?
      `,
      params: [normalizedPaymentId, normalizedDebtId, normalizedBusinessId],
    },
  ])

  await queueDebtSyncEventLocal(
    normalizedBusinessId,
    normalizedDebtId,
    direction,
    new Date().toISOString(),
  )
}

export async function writeOffDebtLocal(
  businessId: string,
  debtId: string,
  direction: DebtDirection,
  payload: WriteOffDebtRequest,
  options?: {
    writtenOffById?: string | null
  },
): Promise<Debt> {
  const normalizedBusinessId = assertBusinessId(businessId)
  await assertLocalPermissionAccess(normalizedBusinessId, Resource.DEBTS_WRITE_OFF)
  const normalizedDebtId = debtId.trim()
  const reason = normalizeWriteOffReason(payload.reason)
  const debt = await getDebtByIdLocal(normalizedBusinessId, normalizedDebtId, direction)

  if (debt.status === DebtStatus.WRITTEN_OFF) {
    throw new DebtLocalError('DEBT_ALREADY_WRITTEN_OFF')
  }

  if (debt.status === DebtStatus.SETTLED) {
    throw new DebtLocalError('DEBT_ALREADY_SETTLED')
  }

  const now = new Date().toISOString()
  await dbBatch([
    {
      sql: `
        UPDATE debts
        SET status = ?,
            settled_at = NULL,
            written_off_at = ?,
            written_off_by = ?,
            written_off_reason = ?
        WHERE id = ?
          AND business_id = ?
      `,
      params: [
        DebtStatus.WRITTEN_OFF,
        now,
        normalizeRecordedById(options?.writtenOffById),
        reason,
        normalizedDebtId,
        normalizedBusinessId,
      ],
    },
  ])

  return queueDebtSyncEventLocal(normalizedBusinessId, normalizedDebtId, direction, now)
}

export async function getContactStatementLocal(
  contactId: string,
  businessId: string,
  requestedDirection?: DebtDirection,
): Promise<ContactStatement> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const normalizedContactId = contactId.trim()
  const contact = await requireContactLocal(normalizedContactId, normalizedBusinessId)

  const directions = await dbQuery<{ direction: string }>(
    `
      SELECT DISTINCT direction
      FROM debts
      WHERE business_id = ?
        AND contact_id = ?
    `,
    [normalizedBusinessId, normalizedContactId],
  )

  let direction = requestedDirection
  if (!direction) {
    if (directions.length <= 1) {
      direction = normalizeDebtDirection(directions[0]?.direction)
    } else {
      throw new DebtLocalError('CONTACT_STATEMENT_DIRECTION_REQUIRED')
    }
  }

  const debts = await fetchDebtsLocal(
    {
      businessId: normalizedBusinessId,
      contactId: normalizedContactId,
      direction: direction ?? DebtDirection.RECEIVABLE,
    },
    { includePayments: true },
  )

  const events: Array<{
    sortAt: number
    date: string
    type: ContactStatementEntryType
    reference: string | null
    description: string
    debit: number
    credit: number
  }> = []

  for (const debt of debts) {
    events.push({
      sortAt: getTimestamp(debt.createdAt),
      date: toDateOnly(debt.createdAt),
      type: ContactStatementEntryType.DEBT_CREATED,
      reference: debt.sourceReference ?? null,
      description: debt.sourceType === DebtSource.SALE ? 'Sale on credit' : 'Restock on credit',
      debit: roundMoney(debt.originalAmount),
      credit: 0,
    })

    for (const payment of debt.payments ?? []) {
      events.push({
        sortAt: getPaymentSortAt(payment.paymentDate, payment.createdAt),
        date: payment.paymentDate,
        type: ContactStatementEntryType.PAYMENT,
        reference: null,
        description: `${getPaymentMethodLabel(payment.method)} payment`,
        debit: 0,
        credit: roundMoney(payment.amount),
      })
    }

    if (debt.status === DebtStatus.WRITTEN_OFF && debt.writtenOffAt) {
      const remaining = computeRawOutstanding(debt.originalAmount, debt.paidAmount)
      if (remaining > 0) {
        events.push({
          sortAt: getTimestamp(debt.writtenOffAt),
          date: toDateOnly(debt.writtenOffAt),
          type: ContactStatementEntryType.WRITE_OFF,
          reference: debt.sourceReference ?? null,
          description: 'Debt written off',
          debit: 0,
          credit: remaining,
        })
      }
    }
  }

  events.sort((left, right) => left.sortAt - right.sortAt)

  let balance = 0
  const entries = events.map((event) => {
    balance = roundMoney(balance + event.debit - event.credit)
    return {
      date: event.date,
      type: event.type,
      direction: direction ?? DebtDirection.RECEIVABLE,
      reference: event.reference,
      description: event.description,
      debit: event.debit,
      credit: event.credit,
      balance,
    }
  })

  return {
    contact: {
      id: contact.id,
      name: contact.name,
      phone: contact.phone ?? null,
    },
    direction: direction ?? DebtDirection.RECEIVABLE,
    openingBalance: 0,
    entries,
    closingBalance: balance,
  }
}

async function queueDebtSyncEventLocal(
  businessId: string,
  debtId: string,
  direction: DebtDirection,
  updatedAt: string,
) {
  const debt = await getDebtByIdLocal(businessId, debtId, direction)
  await dbBatch([
    buildOutboxEventOperation('debts', debt.id, buildDebtSyncPayloadLocal(debt, updatedAt)),
  ])
  requestBackgroundSync()
  return debt
}

function buildDebtSyncPayloadLocal(debt: Debt, updatedAt: string): DebtSyncPayload {
  return {
    contactId: debt.contactId,
    direction: debt.direction,
    sourceType: debt.sourceType,
    sourceId: debt.sourceId,
    sourceReference: debt.sourceReference,
    originalAmount: roundMoney(debt.originalAmount),
    status: debt.status,
    dueDate: debt.dueDate ?? null,
    notes: debt.notes ?? null,
    createdAt: debt.createdAt,
    updatedAt,
    settledAt: debt.settledAt ?? null,
    writtenOffAt: debt.writtenOffAt ?? null,
    writtenOffById: debt.writtenOffById ?? null,
    writtenOffReason: debt.writtenOffReason ?? null,
    payments: (debt.payments ?? []).map((payment) => ({
      id: payment.id,
      amount: roundMoney(payment.amount),
      method: payment.method,
      mobileMoneyReference: payment.mobileMoneyReference ?? null,
      paymentDate: payment.paymentDate,
      notes: payment.notes ?? null,
      recordedById: payment.recordedById ?? null,
      createdAt: payment.createdAt,
    })),
  }
}

async function fetchDebtsLocal(
  filters: DebtFilters,
  options: {
    includePayments: boolean
  },
): Promise<Debt[]> {
  const rows = await queryDebtRowsLocal(filters)
  const paymentsByDebtId = options.includePayments
    ? await queryDebtPaymentsByDebtIds(rows.map((row) => row.id))
    : new Map<string, DebtPaymentRow[]>()

  return rows.map((row) => mapDebtRow(row, paymentsByDebtId.get(row.id)))
}

async function queryDebtRowsLocal(filters: DebtFilters) {
  const clauses = ['d.business_id = ?']
  const params: unknown[] = [filters.businessId]

  if (filters.direction) {
    clauses.push('d.direction = ?')
    params.push(filters.direction)
  }

  if (filters.contactId) {
    clauses.push('d.contact_id = ?')
    params.push(filters.contactId)
  }

  if (filters.contactIds && filters.contactIds.length > 0) {
    const placeholders = filters.contactIds.map(() => '?').join(', ')
    clauses.push(`d.contact_id IN (${placeholders})`)
    params.push(...filters.contactIds)
  }

  if (filters.debtId) {
    clauses.push('d.id = ?')
    params.push(filters.debtId)
  }

  if (filters.sourceType) {
    clauses.push('d.source_type = ?')
    params.push(filters.sourceType)
  }

  if (filters.sourceId) {
    clauses.push('d.source_id = ?')
    params.push(filters.sourceId)
  }

  if (filters.status) {
    clauses.push('d.status = ?')
    params.push(filters.status)
  }

  if (filters.dateFrom) {
    clauses.push('substr(d.created_at, 1, 10) >= ?')
    params.push(filters.dateFrom)
  }

  if (filters.dateTo) {
    clauses.push('substr(d.created_at, 1, 10) <= ?')
    params.push(filters.dateTo)
  }

  if (filters.search?.trim()) {
    const search = `%${filters.search.trim().toLowerCase()}%`
    clauses.push(`
      (
        LOWER(COALESCE(d.source_reference, '')) LIKE ?
        OR LOWER(COALESCE(c.name, '')) LIKE ?
        OR LOWER(COALESCE(c.phone, '')) LIKE ?
      )
    `)
    params.push(search, search, search)
  }

  return dbQuery<DebtRow>(
    `
      SELECT
        d.id,
        d.business_id,
        d.contact_id,
        d.direction,
        d.source_type,
        d.source_id,
        d.source_reference,
        d.original_amount,
        COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = d.id), 0) AS paid_amount,
        d.status,
        d.due_date,
        d.notes,
        d.created_at,
        d.settled_at,
        d.written_off_at,
        d.written_off_by,
        d.written_off_reason,
        c.type AS contact_type,
        c.name AS contact_name,
        c.phone AS contact_phone
      FROM debts d
      LEFT JOIN contacts c
        ON c.id = d.contact_id
       AND c.business_id = d.business_id
      WHERE ${clauses.join('\n        AND ')}
      ORDER BY d.created_at DESC, d.id DESC
    `,
    params,
  )
}

async function queryDebtPaymentsByDebtIds(debtIds: string[]) {
  if (debtIds.length === 0) {
    return new Map<string, DebtPaymentRow[]>()
  }

  const placeholders = debtIds.map(() => '?').join(', ')
  const rows = await dbQuery<DebtPaymentRow>(
    `
      SELECT
        id,
        business_id,
        debt_id,
        amount,
        method,
        mobile_money_reference,
        payment_date,
        notes,
        recorded_by,
        created_at
      FROM debt_payments
      WHERE debt_id IN (${placeholders})
      ORDER BY payment_date ASC, created_at ASC, id ASC
    `,
    debtIds,
  )

  const paymentsByDebtId = new Map<string, DebtPaymentRow[]>()
  for (const row of rows) {
    const existing = paymentsByDebtId.get(row.debt_id)
    if (existing) {
      existing.push(row)
      continue
    }

    paymentsByDebtId.set(row.debt_id, [row])
  }

  return paymentsByDebtId
}

function mapDebtRow(row: DebtRow, paymentRows?: DebtPaymentRow[]): Debt {
  const payments = paymentRows
    ? paymentRows.map((payment) => ({
        id: payment.id,
        businessId: payment.business_id,
        debtId: payment.debt_id,
        amount: roundMoney(payment.amount),
        method: coercePaymentMethod(payment.method),
        mobileMoneyReference: payment.mobile_money_reference ?? null,
        paymentDate: payment.payment_date,
        notes: payment.notes ?? null,
        recordedById: payment.recorded_by,
        recordedBy: null,
        createdAt: payment.created_at,
      }))
    : undefined
  const paidAmount = payments
    ? roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0))
    : roundMoney(row.paid_amount ?? 0)
  const status = normalizeDebtStatus(row.status)
  const outstandingAmount =
    status === DebtStatus.WRITTEN_OFF ? 0 : computeRawOutstanding(row.original_amount, paidAmount)

  return {
    id: row.id,
    businessId: row.business_id,
    contactId: row.contact_id,
    contact: row.contact_name
      ? {
          id: row.contact_id,
          type: normalizeContactType(row.contact_type),
          name: row.contact_name,
          phone: row.contact_phone ?? null,
        }
      : null,
    direction: normalizeDebtDirection(row.direction),
    sourceType: normalizeDebtSource(row.source_type),
    sourceId: row.source_id,
    sourceReference: row.source_reference,
    originalAmount: roundMoney(row.original_amount),
    paidAmount,
    outstandingAmount,
    status,
    dueDate: row.due_date ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    settledAt: row.settled_at ?? null,
    writtenOffAt: row.written_off_at ?? null,
    writtenOffById: row.written_off_by ?? null,
    writtenOffReason: row.written_off_reason ?? null,
    payments,
  }
}

function sortDebts(debts: Debt[], sortBy?: string, sortOrder: 'ASC' | 'DESC' = 'DESC') {
  const order = normalizeSortOrder(sortOrder)
  const records = [...debts]

  records.sort((left, right) => {
    let comparison = 0

    switch (sortBy) {
      case 'dueDate':
        comparison = compareValues(left.dueDate ?? null, right.dueDate ?? null, order)
        break
      case 'originalAmount':
        comparison = compareValues(left.originalAmount, right.originalAmount, order)
        break
      case 'sourceReference':
        comparison = compareValues(left.sourceReference, right.sourceReference, order)
        break
      case 'status':
        comparison = compareValues(left.status, right.status, order)
        break
      case 'contactName':
        comparison = compareValues(left.contact?.name ?? null, right.contact?.name ?? null, order)
        break
      case 'createdAt':
      default:
        comparison = compareValues(left.createdAt, right.createdAt, order)
        break
    }

    if (comparison !== 0) {
      return comparison
    }

    if (right.createdAt !== left.createdAt) {
      return right.createdAt.localeCompare(left.createdAt)
    }

    return left.id.localeCompare(right.id)
  })

  return records
}

async function requireContactLocal(contactId: string, businessId: string) {
  const [contact] = await dbQuery<ContactRow>(
    `
      SELECT
        id,
        type,
        name,
        phone,
        is_active
      FROM contacts
      WHERE id = ?
        AND business_id = ?
      LIMIT 1
    `,
    [contactId, businessId],
  )

  if (!contact) {
    throw new DebtLocalError('CONTACT_NOT_FOUND')
  }

  return contact
}

export async function requireCreditContactLocal(
  contactId: string,
  businessId: string,
  direction: DebtDirection,
) {
  const contact = await requireContactLocal(contactId, businessId)

  if ((contact.is_active ?? 1) === 0) {
    throw new DebtLocalError('CONTACT_INACTIVE')
  }

  const type = normalizeContactType(contact.type)
  if (!matchesRequiredContactType(type, direction)) {
    throw new DebtLocalError('CONTACT_TYPE_INVALID')
  }

  return {
    id: contact.id,
    type,
    name: contact.name,
    phone: contact.phone ?? null,
  }
}

async function assertValidDateRange(dateFrom?: string, dateTo?: string) {
  if (!dateFrom || !dateTo) {
    return
  }

  if (dateFrom > dateTo) {
    throw new DebtLocalError('INVALID_DATE_RANGE')
  }
}

function assertDateOnly(value: string) {
  const normalized = value.trim()
  if (!DATE_ONLY_REGEX.test(normalized)) {
    throw new DebtLocalError('INVALID_DATE')
  }

  return normalized
}

function normalizeDebtDirection(value: string | null | undefined) {
  return value === DebtDirection.PAYABLE ? DebtDirection.PAYABLE : DebtDirection.RECEIVABLE
}

function normalizeDebtSource(value: string | null | undefined) {
  return value === DebtSource.RESTOCK ? DebtSource.RESTOCK : DebtSource.SALE
}

function normalizeDebtStatus(value: string | null | undefined) {
  if (value === DebtStatus.PARTIALLY_PAID) return DebtStatus.PARTIALLY_PAID
  if (value === DebtStatus.SETTLED) return DebtStatus.SETTLED
  if (value === DebtStatus.WRITTEN_OFF) return DebtStatus.WRITTEN_OFF
  return DebtStatus.OUTSTANDING
}

function normalizeContactType(value: string | null | undefined) {
  if (value === ContactType.SUPPLIER || value === ContactType.BOTH) {
    return value
  }

  return ContactType.CUSTOMER
}

function assertPaymentMethod(value: PaymentMethod | string | null | undefined) {
  if (!value) {
    throw new DebtLocalError('DEBT_PAYMENT_METHOD_INVALID')
  }

  const normalized = value.trim().toUpperCase()
  if (!Object.values(PaymentMethod).includes(normalized as PaymentMethod)) {
    throw new DebtLocalError('DEBT_PAYMENT_METHOD_INVALID')
  }

  return normalized as PaymentMethod
}

function coercePaymentMethod(value: string | null | undefined) {
  if (!value) {
    return PaymentMethod.CASH
  }

  const normalized = value.trim().toUpperCase()
  return Object.values(PaymentMethod).includes(normalized as PaymentMethod)
    ? (normalized as PaymentMethod)
    : PaymentMethod.CASH
}

function normalizeOptionalString(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeRecordedById(value?: string | null) {
  return value?.trim() || 'local-user'
}

function normalizeWriteOffReason(value: string) {
  const normalized = value.trim()
  if (normalized.length < 3 || normalized.length > 1000) {
    throw new DebtLocalError('DEBT_WRITE_OFF_REASON_INVALID')
  }

  return normalized
}

function matchesRequiredContactType(type: ContactType, direction: DebtDirection) {
  if (direction === DebtDirection.RECEIVABLE) {
    return type === ContactType.CUSTOMER || type === ContactType.BOTH
  }

  return type === ContactType.SUPPLIER || type === ContactType.BOTH
}

function computeRawOutstanding(originalAmount: number, paidAmount: number) {
  return roundMoney(Math.max(0, roundMoney(originalAmount) - roundMoney(paidAmount)))
}

function roundMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function toDateOnly(value: string) {
  return value.slice(0, 10)
}

function getTimestamp(value: string) {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function getPaymentSortAt(paymentDate: string, createdAt: string) {
  const normalized = Date.parse(`${paymentDate}T12:00:00.000Z`)
  if (!Number.isNaN(normalized)) {
    return normalized
  }

  return getTimestamp(createdAt)
}

function getPaymentMethodLabel(method: PaymentMethod) {
  switch (method) {
    case PaymentMethod.MTN_MOMO:
      return 'MTN MoMo'
    case PaymentMethod.ORANGE_MONEY:
      return 'Orange Money'
    case PaymentMethod.CARD:
      return 'Card'
    case PaymentMethod.MIXED:
      return 'Mixed'
    default:
      return 'Cash'
  }
}

function isDateInRange(value: string, start: Date, end: Date) {
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    return false
  }

  return timestamp >= start.getTime() && timestamp < end.getTime()
}
