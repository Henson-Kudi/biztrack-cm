import type { Migration } from './runner'

export const migration_0017: Migration = {
  id: 17,
  name: '0017_savings_transactions',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS savings_transactions (
        id TEXT PRIMARY KEY,
        savings_id TEXT NOT NULL REFERENCES savings_accounts(id) ON DELETE CASCADE,
        business_id TEXT NOT NULL,
        type TEXT NOT NULL,
        direction TEXT NOT NULL,
        amount REAL NOT NULL,
        method TEXT,
        mobile_money_reference TEXT,
        sale_id TEXT,
        notes TEXT,
        recorded_by_id TEXT,
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_savings_transactions_savings_id
        ON savings_transactions (savings_id)
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_savings_transactions_sale_id
        ON savings_transactions (sale_id)
    `)

    // Migrate from savings_deposits
    db.exec(`
      INSERT OR IGNORE INTO savings_transactions
        (id, savings_id, business_id, type, direction, amount, method, mobile_money_reference,
         sale_id, notes, recorded_by_id, occurred_at, created_at)
      SELECT id, savings_id, business_id, 'deposit', 'inbound', amount, method,
             mobile_money_reference, NULL, notes, recorded_by_id, deposited_at, created_at
      FROM savings_deposits
    `)

    // Migrate from savings_refunds
    db.exec(`
      INSERT OR IGNORE INTO savings_transactions
        (id, savings_id, business_id, type, direction, amount, method, mobile_money_reference,
         sale_id, notes, recorded_by_id, occurred_at, created_at)
      SELECT id, savings_id, business_id, 'refund', 'outbound', amount, method,
             mobile_money_reference, NULL, notes, recorded_by_id, refunded_at, created_at
      FROM savings_refunds
    `)

    // Migrate from savings_usages (created in migration 0016)
    const usagesExists = (
      db.prepare(
        `SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table' AND name='savings_usages'`,
      ).get() as { cnt: number }
    ).cnt > 0

    if (usagesExists) {
      db.exec(`
        INSERT OR IGNORE INTO savings_transactions
          (id, savings_id, business_id, type, direction, amount, method, mobile_money_reference,
           sale_id, notes, recorded_by_id, occurred_at, created_at)
        SELECT id, savings_id, business_id, 'sale', 'outbound', amount, NULL, NULL,
               sale_id, notes, recorded_by_id, used_at, created_at
        FROM savings_usages
      `)
    }

    // Convert pending outbox entries from old entity types to savingsTransactions format
    type OutboxEntry = {
      id: string
      record_id: string
      operation: string
      payload: string | null
      status: string
      attempt_count: number
      created_at: string
      updated_at: string
    }

    const insertOutbox = db.prepare(`
      INSERT INTO sync_outbox
        (id, entity, record_id, operation, payload, status, attempt_count,
         last_attempt_at, last_error, last_error_details, created_at, updated_at)
      VALUES (?, 'savingsTransactions', ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
      ON CONFLICT(entity, record_id) DO UPDATE SET
        payload = excluded.payload,
        status = 'pending',
        last_error = NULL,
        last_error_details = NULL,
        updated_at = excluded.updated_at
    `)

    const deleteOutbox = db.prepare(`DELETE FROM sync_outbox WHERE id = ?`)

    const oldDeposits = db.prepare(
      `SELECT id, record_id, operation, payload, status, attempt_count, created_at, updated_at
       FROM sync_outbox WHERE entity = 'savingsDeposits'`,
    ).all() as OutboxEntry[]

    for (const row of oldDeposits) {
      if (row.payload) {
        try {
          const p = JSON.parse(row.payload) as Record<string, unknown>
          const newPayload = {
            transactionId: (p.depositId as string | undefined) ?? row.record_id,
            savingsId: p.savingsId,
            businessId: p.businessId,
            type: 'deposit',
            direction: 'inbound',
            amount: p.amount,
            method: p.method ?? null,
            mobileMoneyReference: p.mobileMoneyReference ?? null,
            saleId: null,
            notes: p.notes ?? null,
            recordedById: p.recordedById ?? null,
            occurredAt: (p.depositedAt as string | undefined) ?? row.created_at,
            createdAt: (p.createdAt as string | undefined) ?? row.created_at,
          }
          insertOutbox.run(
            crypto.randomUUID(), row.record_id, row.operation,
            JSON.stringify(newPayload), row.status, row.attempt_count,
            row.created_at, row.updated_at,
          )
        } catch { /* skip unparseable */ }
      }
      deleteOutbox.run(row.id)
    }

    const oldRefunds = db.prepare(
      `SELECT id, record_id, operation, payload, status, attempt_count, created_at, updated_at
       FROM sync_outbox WHERE entity = 'savingsRefunds'`,
    ).all() as OutboxEntry[]

    for (const row of oldRefunds) {
      if (row.payload) {
        try {
          const p = JSON.parse(row.payload) as Record<string, unknown>
          const newPayload = {
            transactionId: (p.refundId as string | undefined) ?? row.record_id,
            savingsId: p.savingsId,
            businessId: p.businessId,
            type: 'refund',
            direction: 'outbound',
            amount: p.amount,
            method: p.method ?? null,
            mobileMoneyReference: p.mobileMoneyReference ?? null,
            saleId: null,
            notes: p.notes ?? null,
            recordedById: p.recordedById ?? null,
            occurredAt: (p.refundedAt as string | undefined) ?? row.created_at,
            createdAt: (p.createdAt as string | undefined) ?? row.created_at,
          }
          insertOutbox.run(
            crypto.randomUUID(), row.record_id, row.operation,
            JSON.stringify(newPayload), row.status, row.attempt_count,
            row.created_at, row.updated_at,
          )
        } catch { /* skip */ }
      }
      deleteOutbox.run(row.id)
    }

    const oldUsages = db.prepare(
      `SELECT id, record_id, operation, payload, status, attempt_count, created_at, updated_at
       FROM sync_outbox WHERE entity = 'savingsUsages'`,
    ).all() as OutboxEntry[]

    for (const row of oldUsages) {
      if (row.payload) {
        try {
          const p = JSON.parse(row.payload) as Record<string, unknown>
          const newPayload = {
            transactionId: (p.usageId as string | undefined) ?? row.record_id,
            savingsId: p.savingsId,
            businessId: p.businessId,
            type: 'sale',
            direction: 'outbound',
            amount: p.amount,
            method: null,
            mobileMoneyReference: null,
            saleId: (p.saleId as string | undefined) ?? null,
            notes: p.notes ?? null,
            recordedById: p.recordedById ?? null,
            occurredAt: (p.usedAt as string | undefined) ?? row.created_at,
            createdAt: (p.createdAt as string | undefined) ?? row.created_at,
          }
          insertOutbox.run(
            crypto.randomUUID(), row.record_id, row.operation,
            JSON.stringify(newPayload), row.status, row.attempt_count,
            row.created_at, row.updated_at,
          )
        } catch { /* skip */ }
      }
      deleteOutbox.run(row.id)
    }

    // Drop old tables
    db.exec(`DROP TABLE IF EXISTS savings_usages`)
    db.exec(`DROP TABLE IF EXISTS savings_refunds`)
    db.exec(`DROP TABLE IF EXISTS savings_deposits`)
  },
}
