import type { Migration } from './runner'

export const migration_0005: Migration = {
  id: 5,
  name: '0005_opening_balances',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS contact_opening_balances (
        id            TEXT    PRIMARY KEY,
        business_id   TEXT    NOT NULL,
        contact_id    TEXT    NOT NULL,
        direction     TEXT    NOT NULL,
        amount        REAL    NOT NULL,
        as_of_date    TEXT    NOT NULL,
        notes         TEXT,
        recorded_by_id TEXT,
        created_at    TEXT    NOT NULL,
        updated_at    TEXT    NOT NULL,
        CONSTRAINT uq_opening_balance_contact_direction
          UNIQUE (business_id, contact_id, direction)
      );

      CREATE INDEX IF NOT EXISTS idx_opening_balances_business_id
        ON contact_opening_balances (business_id);

      CREATE INDEX IF NOT EXISTS idx_opening_balances_contact_id
        ON contact_opening_balances (business_id, contact_id);
    `)
  },
}
