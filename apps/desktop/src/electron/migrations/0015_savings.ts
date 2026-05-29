import type { Migration } from './runner'

export const migration_0015: Migration = {
  id: 15,
  name: '0015_savings',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS savings_accounts (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        customer_name TEXT,
        customer_phone TEXT,
        account_number TEXT NOT NULL,
        balance REAL NOT NULL DEFAULT 0,
        total_deposited REAL NOT NULL DEFAULT 0,
        total_refunded REAL NOT NULL DEFAULT 0,
        total_used REAL NOT NULL DEFAULT 0,
        tagged_products TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS unq_savings_accounts_business_customer
        ON savings_accounts (business_id, customer_id);

      CREATE UNIQUE INDEX IF NOT EXISTS unq_savings_accounts_business_account_number
        ON savings_accounts (business_id, account_number);

      CREATE INDEX IF NOT EXISTS idx_savings_accounts_business_created_at
        ON savings_accounts (business_id, created_at);

      CREATE TABLE IF NOT EXISTS savings_deposits (
        id TEXT PRIMARY KEY,
        savings_id TEXT NOT NULL REFERENCES savings_accounts(id) ON DELETE CASCADE,
        business_id TEXT NOT NULL,
        amount REAL NOT NULL,
        method TEXT NOT NULL,
        mobile_money_reference TEXT,
        notes TEXT,
        recorded_by_id TEXT,
        deposited_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_savings_deposits_savings_id
        ON savings_deposits (savings_id);

      CREATE TABLE IF NOT EXISTS savings_refunds (
        id TEXT PRIMARY KEY,
        savings_id TEXT NOT NULL REFERENCES savings_accounts(id) ON DELETE CASCADE,
        business_id TEXT NOT NULL,
        amount REAL NOT NULL,
        method TEXT NOT NULL,
        mobile_money_reference TEXT,
        notes TEXT,
        recorded_by_id TEXT,
        refunded_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_savings_refunds_savings_id
        ON savings_refunds (savings_id);

      CREATE TABLE IF NOT EXISTS savings_account_sequences (
        business_id TEXT NOT NULL,
        account_date TEXT NOT NULL,
        last_sequence INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (business_id, account_date)
      );
    `)
  },
}
