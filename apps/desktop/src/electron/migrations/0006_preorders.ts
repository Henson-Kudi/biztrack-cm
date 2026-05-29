import type { Migration } from './runner'
import { ensureColumn } from './runner'

export const migration_0006: Migration = {
  id: 6,
  name: '0006_preorders',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS preorders (
        id                TEXT PRIMARY KEY,
        business_id       TEXT NOT NULL,
        preorder_number   TEXT NOT NULL,
        type              TEXT NOT NULL,
        status            TEXT NOT NULL DEFAULT 'OPEN',
        customer_id       TEXT,
        customer_name     TEXT,
        customer_phone    TEXT,
        cashier_id        TEXT,
        cashier_name      TEXT,
        subtotal          REAL NOT NULL DEFAULT 0,
        discount_amount   REAL NOT NULL DEFAULT 0,
        total_amount      REAL NOT NULL DEFAULT 0,
        deposit_paid      REAL NOT NULL DEFAULT 0,
        notes             TEXT,
        expires_at        TEXT,
        collected_at      TEXT,
        cancelled_at      TEXT,
        sale_id           TEXT,
        is_deleted        INTEGER NOT NULL DEFAULT 0,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS unq_preorders_business_preorder_number
        ON preorders(business_id, preorder_number);
      CREATE INDEX IF NOT EXISTS idx_preorders_business_status
        ON preorders(business_id, status);
      CREATE INDEX IF NOT EXISTS idx_preorders_business_created_at
        ON preorders(business_id, created_at);

      CREATE TABLE IF NOT EXISTS preorder_items (
        id              TEXT PRIMARY KEY,
        preorder_id     TEXT NOT NULL REFERENCES preorders(id),
        business_id     TEXT NOT NULL,
        product_id      TEXT NOT NULL,
        product_name    TEXT NOT NULL,
        product_sku     TEXT,
        unit_of_measure TEXT,
        quantity        REAL NOT NULL DEFAULT 0,
        unit_price      REAL NOT NULL DEFAULT 0,
        discount_amount REAL NOT NULL DEFAULT 0,
        line_total      REAL NOT NULL DEFAULT 0,
        is_deleted      INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_preorder_items_preorder_id
        ON preorder_items(preorder_id);

      CREATE TABLE IF NOT EXISTS preorder_payments (
        id                     TEXT PRIMARY KEY,
        preorder_id            TEXT NOT NULL REFERENCES preorders(id),
        business_id            TEXT NOT NULL,
        amount                 REAL NOT NULL DEFAULT 0,
        method                 TEXT NOT NULL,
        mobile_money_reference TEXT,
        notes                  TEXT,
        recorded_by_id         TEXT,
        paid_at                TEXT NOT NULL,
        created_at             TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_preorder_payments_preorder_id
        ON preorder_payments(preorder_id);

      CREATE TABLE IF NOT EXISTS preorder_number_sequences (
        business_id    TEXT    NOT NULL,
        preorder_date  TEXT    NOT NULL,
        last_sequence  INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (business_id, preorder_date)
      );
    `)

    ensureColumn(db, 'inventory_levels', 'quantity_reserved', 'REAL NOT NULL DEFAULT 0')
  },
}
