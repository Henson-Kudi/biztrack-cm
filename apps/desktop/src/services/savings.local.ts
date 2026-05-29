'use client'

import type {
  CreateSavingsInput,
  CreateSavingsTransactionInput,
  SavingsAccount,
  SavingsStatement,
  SavingsTaggedProduct,
  SavingsQuery,
  SavingsTransactionType,
  SavingsTransactionDirection,
} from '@biztrack/types'
import type { PaginatedResult } from '@biztrack/types'
import { dbBatch, dbQuery, dbRun } from './local-db'
import { buildOutboxEventOperation } from './sync.local'

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

type SavingsAccountRow = {
  id: string
  business_id: string
  customer_id: string
  customer_name: string | null
  customer_phone: string | null
  account_number: string
  balance: number
  total_deposited: number
  total_refunded: number
  total_used: number
  tagged_products: string | null
  is_deleted: number
  created_at: string
  updated_at: string
}

type SavingsTransactionRow = {
  id: string
  savings_id: string
  business_id: string
  type: string
  direction: string
  amount: number
  method: string | null
  mobile_money_reference: string | null
  sale_id: string | null
  notes: string | null
  recorded_by_id: string | null
  occurred_at: string
  created_at: string
}

type SavingsAccountListRow = SavingsAccountRow & {
  transaction_count: number
  last_transaction_at: string | null
}

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type LocalSavingsAccount = SavingsAccount & {
  depositCount: number
  lastTransactionAt: string | null
}

export type LocalSavingsStatement = Omit<SavingsStatement, 'account'> & {
  account: LocalSavingsAccount
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export type SavingsErrorCode =
  | 'SAVINGS_CUSTOMER_REQUIRED'
  | 'SAVINGS_AMOUNT_INVALID'
  | 'SAVINGS_INSUFFICIENT_BALANCE'
  | 'SAVINGS_NOT_FOUND'
  | 'SAVINGS_METHOD_INVALID'

export class SavingsLocalError extends Error {
  constructor(
    public readonly code: SavingsErrorCode,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'SavingsLocalError'
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertBusinessId(businessId: string | null | undefined): asserts businessId is string {
  if (!businessId) {
    throw new SavingsLocalError('SAVINGS_CUSTOMER_REQUIRED', 'Business ID is required')
  }
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

async function getNextAccountNumber(businessId: string): Promise<string> {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const dateKey = `${year}${month}${day}`

  await dbRun(
    `
      INSERT INTO savings_account_sequences (business_id, account_date, last_sequence)
      VALUES (?, ?, 1)
      ON CONFLICT(business_id, account_date) DO UPDATE SET
        last_sequence = last_sequence + 1
    `,
    [businessId, dateKey],
  )

  const rows = await dbQuery<{ last_sequence: number }>(
    `SELECT last_sequence FROM savings_account_sequences WHERE business_id = ? AND account_date = ?`,
    [businessId, dateKey],
  )

  const seq = rows[0]?.last_sequence ?? 1
  return `SAV-${dateKey}-${String(seq).padStart(3, '0')}`
}

function rowToAccount(
  row: SavingsAccountRow,
  transactionCount = 0,
  lastTxAt: string | null = null,
): LocalSavingsAccount {
  let taggedProducts: SavingsTaggedProduct[] | null = null
  if (row.tagged_products) {
    try {
      taggedProducts = JSON.parse(row.tagged_products) as SavingsTaggedProduct[]
    } catch {
      taggedProducts = null
    }
  }

  return {
    id: row.id,
    businessId: row.business_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    accountNumber: row.account_number,
    balance: row.balance,
    totalDeposited: row.total_deposited,
    totalRefunded: row.total_refunded,
    totalUsed: row.total_used,
    taggedProducts,
    isDeleted: Boolean(row.is_deleted),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    depositCount: transactionCount,
    lastTransactionAt: lastTxAt,
  }
}

function buildAccountSyncPayload(account: SavingsAccountRow, now: string) {
  return {
    savingsId: account.id,
    businessId: account.business_id,
    customerId: account.customer_id,
    accountNumber: account.account_number,
    balance: account.balance,
    totalDeposited: account.total_deposited,
    totalRefunded: account.total_refunded,
    totalUsed: account.total_used,
    taggedProducts: account.tagged_products ? (JSON.parse(account.tagged_products) as SavingsTaggedProduct[]) : null,
    customerName: account.customer_name,
    customerPhone: account.customer_phone,
    createdAt: account.created_at,
    updatedAt: now,
  }
}

// ---------------------------------------------------------------------------
// Public service functions
// ---------------------------------------------------------------------------

export async function createOrDepositSavingsLocal(
  businessId: string,
  input: CreateSavingsInput & { actorId?: string | null },
): Promise<{ accountId: string; transactionId: string; wasCreated: boolean }> {
  assertBusinessId(businessId)

  if (!input.customerId) {
    throw new SavingsLocalError('SAVINGS_CUSTOMER_REQUIRED', 'Customer ID is required')
  }

  const { amount, method } = input.initialDeposit

  if (!amount || amount <= 0) {
    throw new SavingsLocalError('SAVINGS_AMOUNT_INVALID', 'Deposit amount must be greater than zero')
  }

  const existing = await dbQuery<{ id: string }>(
    `SELECT id FROM savings_accounts WHERE business_id = ? AND customer_id = ? AND is_deleted = 0 LIMIT 1`,
    [businessId, input.customerId],
  )

  if (existing.length > 0) {
    const accountId = (existing[0] as { id: string }).id
    const tx = await createSavingsTransactionLocal(businessId, accountId, {
      ...input.initialDeposit,
      recordedById: input.initialDeposit.recordedById ?? input.actorId ?? null,
    })
    return { accountId, transactionId: tx.id, wasCreated: false }
  }

  const accountNumber = await getNextAccountNumber(businessId)
  const accountId = crypto.randomUUID()
  const transactionId = crypto.randomUUID()
  const now = new Date().toISOString()
  const safeAmount = roundMoney(amount)
  const effectiveRecordedById = input.initialDeposit.recordedById ?? input.actorId ?? null
  const taggedProductsJson = input.taggedProducts ? JSON.stringify(input.taggedProducts) : null

  await dbBatch([
    {
      sql: `
        INSERT INTO savings_accounts (
          id, business_id, customer_id, customer_name, customer_phone,
          account_number, balance, total_deposited, total_refunded, total_used,
          tagged_products, is_deleted, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, ?, ?)
      `,
      params: [
        accountId,
        businessId,
        input.customerId,
        input.customerName ?? null,
        input.customerPhone ?? null,
        accountNumber,
        safeAmount,
        safeAmount,
        taggedProductsJson,
        now,
        now,
      ],
    },
    {
      sql: `
        INSERT INTO savings_transactions (
          id, savings_id, business_id, type, direction, amount, method,
          mobile_money_reference, sale_id, notes, recorded_by_id, occurred_at, created_at
        ) VALUES (?, ?, ?, 'deposit', 'inbound', ?, ?, ?, NULL, ?, ?, ?, ?)
      `,
      params: [
        transactionId,
        accountId,
        businessId,
        safeAmount,
        method ?? null,
        input.initialDeposit.mobileMoneyReference ?? null,
        input.initialDeposit.notes ?? null,
        effectiveRecordedById,
        now,
        now,
      ],
    },
    buildOutboxEventOperation('savings', accountId, {
      savingsId: accountId,
      businessId,
      customerId: input.customerId,
      accountNumber,
      balance: safeAmount,
      totalDeposited: safeAmount,
      totalRefunded: 0,
      totalUsed: 0,
      taggedProducts: input.taggedProducts ?? null,
      customerName: input.customerName ?? null,
      customerPhone: input.customerPhone ?? null,
      createdAt: now,
      updatedAt: now,
    }),
    buildOutboxEventOperation('savingsTransactions', transactionId, {
      transactionId,
      savingsId: accountId,
      businessId,
      type: 'deposit',
      direction: 'inbound',
      amount: safeAmount,
      method: method ?? null,
      mobileMoneyReference: input.initialDeposit.mobileMoneyReference ?? null,
      saleId: null,
      notes: input.initialDeposit.notes ?? null,
      recordedById: effectiveRecordedById,
      occurredAt: now,
      createdAt: now,
    }),
  ])

  return { accountId, transactionId, wasCreated: true }
}

export async function createSavingsTransactionLocal(
  businessId: string,
  savingsId: string,
  input: CreateSavingsTransactionInput & { actorId?: string | null },
): Promise<{ id: string }> {
  assertBusinessId(businessId)

  const { type, direction, amount } = input

  if (!amount || amount <= 0) {
    throw new SavingsLocalError('SAVINGS_AMOUNT_INVALID', 'Transaction amount must be greater than zero')
  }

  const accountRows = await dbQuery<SavingsAccountRow>(
    `SELECT * FROM savings_accounts WHERE id = ? AND business_id = ? AND is_deleted = 0 LIMIT 1`,
    [savingsId, businessId],
  )

  if (!accountRows.length) {
    throw new SavingsLocalError('SAVINGS_NOT_FOUND', 'Savings account not found')
  }

  const account = accountRows[0]!
  const safeAmount = roundMoney(amount)

  const isInbound = direction === 'inbound'
  if (!isInbound && safeAmount > account.balance) {
    throw new SavingsLocalError('SAVINGS_INSUFFICIENT_BALANCE', 'Transaction amount exceeds account balance')
  }

  const transactionId = crypto.randomUUID()
  const now = new Date().toISOString()
  const effectiveRecordedById = input.recordedById ?? (input as { actorId?: string | null }).actorId ?? null

  const newBalance = isInbound
    ? roundMoney(account.balance + safeAmount)
    : roundMoney(account.balance - safeAmount)

  const newTotalDeposited = type === 'deposit'
    ? roundMoney(account.total_deposited + safeAmount)
    : account.total_deposited

  const newTotalRefunded = type === 'refund'
    ? roundMoney(account.total_refunded + safeAmount)
    : account.total_refunded

  const newTotalUsed = type === 'sale'
    ? roundMoney(account.total_used + safeAmount)
    : (type === 'voided_sale'
        ? roundMoney(Math.max(0, account.total_used - safeAmount))
        : account.total_used)

  await dbBatch([
    {
      sql: `
        INSERT INTO savings_transactions (
          id, savings_id, business_id, type, direction, amount, method,
          mobile_money_reference, sale_id, notes, recorded_by_id, occurred_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        transactionId,
        savingsId,
        businessId,
        type,
        direction,
        safeAmount,
        input.method ?? null,
        input.mobileMoneyReference ?? null,
        input.saleId ?? null,
        input.notes ?? null,
        effectiveRecordedById,
        now,
        now,
      ],
    },
    {
      sql: `
        UPDATE savings_accounts
        SET balance = ?, total_deposited = ?, total_refunded = ?, total_used = ?, updated_at = ?
        WHERE id = ?
      `,
      params: [newBalance, newTotalDeposited, newTotalRefunded, newTotalUsed, now, savingsId],
    },
    buildOutboxEventOperation('savings', savingsId, buildAccountSyncPayload(
      { ...account, balance: newBalance, total_deposited: newTotalDeposited, total_refunded: newTotalRefunded, total_used: newTotalUsed },
      now,
    )),
    buildOutboxEventOperation('savingsTransactions', transactionId, {
      transactionId,
      savingsId,
      businessId,
      type,
      direction,
      amount: safeAmount,
      method: input.method ?? null,
      mobileMoneyReference: input.mobileMoneyReference ?? null,
      saleId: input.saleId ?? null,
      notes: input.notes ?? null,
      recordedById: effectiveRecordedById,
      occurredAt: now,
      createdAt: now,
    }),
  ])

  return { id: transactionId }
}

export async function recordSavingsDepositLocal(
  businessId: string,
  savingsId: string,
  input: { amount: number; method?: string | null; mobileMoneyReference?: string | null; notes?: string | null; recordedById?: string | null; actorId?: string | null },
): Promise<{ id: string }> {
  return createSavingsTransactionLocal(businessId, savingsId, {
    type: 'deposit',
    direction: 'inbound',
    amount: input.amount,
    method: input.method ?? null,
    mobileMoneyReference: input.mobileMoneyReference ?? null,
    notes: input.notes ?? null,
    recordedById: input.recordedById ?? null,
    actorId: input.actorId ?? null,
  })
}

export async function recordSavingsRefundLocal(
  businessId: string,
  savingsId: string,
  input: { amount: number; method?: string | null; mobileMoneyReference?: string | null; notes?: string | null; recordedById?: string | null; actorId?: string | null },
): Promise<{ id: string }> {
  return createSavingsTransactionLocal(businessId, savingsId, {
    type: 'refund',
    direction: 'outbound',
    amount: input.amount,
    method: input.method ?? null,
    mobileMoneyReference: input.mobileMoneyReference ?? null,
    notes: input.notes ?? null,
    recordedById: input.recordedById ?? null,
    actorId: input.actorId ?? null,
  })
}

export async function recordSavingsUsageLocal(
  businessId: string,
  savingsId: string,
  saleId: string,
  amount: number,
  options?: { recordedById?: string | null; notes?: string | null },
): Promise<{ id: string }> {
  assertBusinessId(businessId)

  const safeAmount = roundMoney(amount)
  if (safeAmount <= 0) {
    throw new SavingsLocalError('SAVINGS_AMOUNT_INVALID', 'Usage amount must be greater than zero')
  }

  return createSavingsTransactionLocal(businessId, savingsId, {
    type: 'sale',
    direction: 'outbound',
    amount: safeAmount,
    method: null,
    saleId,
    notes: options?.notes ?? null,
    recordedById: options?.recordedById ?? null,
  })
}

export async function recordVoidedSaleTransactionLocal(
  businessId: string,
  savingsId: string,
  saleId: string,
  amount: number,
  options?: { recordedById?: string | null },
): Promise<{ id: string }> {
  assertBusinessId(businessId)

  const safeAmount = roundMoney(amount)
  if (safeAmount <= 0) {
    return { id: '' }
  }

  return createSavingsTransactionLocal(businessId, savingsId, {
    type: 'voided_sale',
    direction: 'inbound',
    amount: safeAmount,
    method: null,
    saleId,
    notes: null,
    recordedById: options?.recordedById ?? null,
  })
}

export async function getSavingsAccountLocal(
  businessId: string,
  savingsId: string,
): Promise<LocalSavingsAccount> {
  assertBusinessId(businessId)

  const rows = await dbQuery<SavingsAccountListRow>(
    `
      SELECT
        sa.*,
        COALESCE(tc.transaction_count, 0) AS transaction_count,
        last_tx.last_transaction_at
      FROM savings_accounts sa
      LEFT JOIN (
        SELECT savings_id, COUNT(*) AS transaction_count
        FROM savings_transactions
        WHERE savings_id = ? AND type = 'deposit'
        GROUP BY savings_id
      ) tc ON tc.savings_id = sa.id
      LEFT JOIN (
        SELECT savings_id, MAX(occurred_at) AS last_transaction_at
        FROM savings_transactions
        WHERE savings_id = ?
        GROUP BY savings_id
      ) last_tx ON last_tx.savings_id = sa.id
      WHERE sa.id = ? AND sa.business_id = ? AND sa.is_deleted = 0
      LIMIT 1
    `,
    [savingsId, savingsId, savingsId, businessId],
  )

  if (!rows.length) {
    throw new SavingsLocalError('SAVINGS_NOT_FOUND', 'Savings account not found')
  }

  const row = rows[0]!
  return rowToAccount(row, row.transaction_count ?? 0, row.last_transaction_at ?? null)
}

export async function getSavingsAccountByCustomerLocal(
  businessId: string,
  customerId: string,
): Promise<LocalSavingsAccount | null> {
  assertBusinessId(businessId)

  const rows = await dbQuery<SavingsAccountListRow>(
    `
      SELECT
        sa.*,
        COALESCE(tc.transaction_count, 0) AS transaction_count,
        last_tx.last_transaction_at
      FROM savings_accounts sa
      LEFT JOIN (
        SELECT savings_id, COUNT(*) AS transaction_count
        FROM savings_transactions
        WHERE type = 'deposit'
        GROUP BY savings_id
      ) tc ON tc.savings_id = sa.id
      LEFT JOIN (
        SELECT savings_id, MAX(occurred_at) AS last_transaction_at
        FROM savings_transactions
        GROUP BY savings_id
      ) last_tx ON last_tx.savings_id = sa.id
      WHERE sa.business_id = ? AND sa.customer_id = ? AND sa.is_deleted = 0
      LIMIT 1
    `,
    [businessId, customerId],
  )

  if (!rows.length) {
    return null
  }

  const row = rows[0]!
  return rowToAccount(row, row.transaction_count ?? 0, row.last_transaction_at ?? null)
}

export async function getSavingsStatementLocal(
  businessId: string,
  savingsId: string,
): Promise<LocalSavingsStatement> {
  assertBusinessId(businessId)

  const accountRows = await dbQuery<SavingsAccountRow>(
    `SELECT * FROM savings_accounts WHERE id = ? AND business_id = ? AND is_deleted = 0 LIMIT 1`,
    [savingsId, businessId],
  )

  if (!accountRows.length) {
    throw new SavingsLocalError('SAVINGS_NOT_FOUND', 'Savings account not found')
  }

  const accountRow = accountRows[0]!

  const txRows = await dbQuery<SavingsTransactionRow>(
    `SELECT * FROM savings_transactions WHERE savings_id = ? ORDER BY occurred_at ASC, created_at ASC`,
    [savingsId],
  )

  const depositCount = txRows.filter((r) => r.type === 'deposit').length
  const lastTxAt = txRows.length > 0 ? txRows[txRows.length - 1]!.occurred_at : null

  let runningBalance = 0
  const entries = txRows.map((tx) => {
    const isInbound = tx.direction === 'inbound'
    runningBalance = isInbound
      ? roundMoney(runningBalance + tx.amount)
      : roundMoney(runningBalance - tx.amount)

    return {
      id: tx.id,
      type: tx.type as SavingsTransactionType,
      direction: tx.direction as SavingsTransactionDirection,
      amount: tx.amount,
      method: tx.method,
      mobileMoneyReference: tx.mobile_money_reference,
      saleId: tx.sale_id,
      notes: tx.notes,
      occurredAt: tx.occurred_at,
      createdAt: tx.created_at,
      runningBalance,
    }
  })

  return {
    account: rowToAccount(accountRow, depositCount, lastTxAt),
    entries,
  }
}

export async function listSavingsAccountsLocal(
  businessId: string,
  query: SavingsQuery = {},
): Promise<PaginatedResult<LocalSavingsAccount>> {
  assertBusinessId(businessId)

  const { page = 1, limit = 20, search } = query

  const allRows = await dbQuery<SavingsAccountListRow>(
    `
      SELECT
        sa.*,
        COALESCE(tc.transaction_count, 0) AS transaction_count,
        last_tx.last_transaction_at
      FROM savings_accounts sa
      LEFT JOIN (
        SELECT savings_id, COUNT(*) AS transaction_count
        FROM savings_transactions
        WHERE type = 'deposit'
        GROUP BY savings_id
      ) tc ON tc.savings_id = sa.id
      LEFT JOIN (
        SELECT savings_id, MAX(occurred_at) AS last_transaction_at
        FROM savings_transactions
        GROUP BY savings_id
      ) last_tx ON last_tx.savings_id = sa.id
      WHERE sa.business_id = ? AND sa.is_deleted = 0
      ORDER BY sa.created_at DESC
    `,
    [businessId],
  )

  const searchLower = search?.toLowerCase().trim()
  const filtered = searchLower
    ? allRows.filter(
        (row) =>
          row.customer_name?.toLowerCase().includes(searchLower) ||
          row.account_number.toLowerCase().includes(searchLower),
      )
    : allRows

  const safePage = Math.max(1, page)
  const safeLimit = Math.max(1, limit)
  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / safeLimit))
  const start = (safePage - 1) * safeLimit
  const pageRows = filtered.slice(start, start + safeLimit)

  return {
    data: pageRows.map((row) => rowToAccount(row, row.transaction_count ?? 0, row.last_transaction_at ?? null)),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages,
  }
}
