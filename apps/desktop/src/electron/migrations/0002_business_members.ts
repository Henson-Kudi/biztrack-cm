import type Database from 'better-sqlite3'
import { type Migration } from './runner'

export const migration_0002: Migration = {
  id: 2,
  name: '0002_business_members',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS business_members (
        id           TEXT    PRIMARY KEY,
        business_id  TEXT    NOT NULL,
        user_id      TEXT    NOT NULL,
        role         TEXT    NOT NULL,
        status       TEXT    NOT NULL DEFAULT 'ACTIVE',
        name         TEXT,
        email        TEXT,
        phone        TEXT,
        is_deleted   INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT    NOT NULL,
        updated_at   TEXT    NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_business_members_business_id
        ON business_members (business_id);

      CREATE UNIQUE INDEX IF NOT EXISTS unq_business_members_user_id
        ON business_members (business_id, user_id);
    `)
  },
}
