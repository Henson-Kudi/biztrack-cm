import type { Migration } from './runner'

export const migration_0014: Migration = {
  id: 14,
  name: '0014_drop_preorders',
  up(db) {
    db.exec(`
      DROP TABLE IF EXISTS preorder_refunds;
      DROP TABLE IF EXISTS preorder_payments;
      DROP TABLE IF EXISTS preorder_items;
      DROP TABLE IF EXISTS preorder_number_sequences;
      DROP TABLE IF EXISTS preorders;
    `)

    try {
      db.exec(`ALTER TABLE sales DROP COLUMN preorder_id`)
    } catch {
      // Column absent or SQLite < 3.35 — safe to ignore
    }
  },
}
