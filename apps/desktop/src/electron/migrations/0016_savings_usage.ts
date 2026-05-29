import { ensureColumn } from './runner'
import type { Migration } from './runner'

export const migration_0016: Migration = {
  id: 16,
  name: '0016_savings_usage',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS savings_usages (
        id TEXT PRIMARY KEY,
        savings_id TEXT NOT NULL REFERENCES savings_accounts(id) ON DELETE CASCADE,
        sale_id TEXT NOT NULL,
        business_id TEXT NOT NULL,
        amount REAL NOT NULL,
        notes TEXT,
        recorded_by_id TEXT,
        used_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_savings_usages_savings_id
        ON savings_usages (savings_id);

      CREATE INDEX IF NOT EXISTS idx_savings_usages_sale_id
        ON savings_usages (sale_id);
    `)

    ensureColumn(db, 'sale_payments', 'savings_account_id', 'TEXT')
  },
}
