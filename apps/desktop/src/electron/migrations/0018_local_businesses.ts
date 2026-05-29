import type { Migration } from './runner'

export const migration_0018: Migration = {
  id: 18,
  name: '0018_local_businesses',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS local_businesses (
        id        TEXT PRIMARY KEY,
        name      TEXT NOT NULL,
        slug      TEXT,
        currency  TEXT NOT NULL DEFAULT 'XAF',
        phone     TEXT,
        email     TEXT,
        address   TEXT,
        city      TEXT,
        logo_url  TEXT,
        plan      TEXT,
        saved_at  TEXT NOT NULL
      )
    `)
  },
}
