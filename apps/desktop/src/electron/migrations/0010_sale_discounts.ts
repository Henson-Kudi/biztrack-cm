import type { Migration } from './runner'

export const migration_0010: Migration = {
  id: 10,
  name: '0010_sale_discounts',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sale_discounts (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        sale_item_id TEXT,
        business_id TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        discount_type TEXT NOT NULL DEFAULT 'FIXED_AMOUNT',
        rate REAL,
        amount REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sale_discounts_sale_id ON sale_discounts(sale_id);
      CREATE INDEX IF NOT EXISTS idx_sale_discounts_business_id ON sale_discounts(business_id);
    `)
  },
}
