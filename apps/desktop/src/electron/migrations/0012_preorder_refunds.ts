import type { Migration } from './runner'

export const migration_0012: Migration = {
  id: 12,
  name: '0012_preorder_refunds',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS preorder_refunds (
        id               TEXT PRIMARY KEY,
        preorder_id      TEXT NOT NULL REFERENCES preorders(id),
        business_id      TEXT NOT NULL,
        amount           REAL NOT NULL,
        method           TEXT NOT NULL,
        mobile_money_reference TEXT,
        notes            TEXT,
        recorded_by_id   TEXT,
        refunded_at      TEXT NOT NULL,
        created_at       TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_preorder_refunds_preorder_id
        ON preorder_refunds(preorder_id);
      CREATE INDEX IF NOT EXISTS idx_preorder_refunds_business_id
        ON preorder_refunds(business_id);
    `)
  },
}
