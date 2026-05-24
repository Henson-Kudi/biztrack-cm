import type { Migration } from './runner'

export const migration_0004: Migration = {
  id: 4,
  name: '0004_roles',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS roles (
        id          TEXT    PRIMARY KEY,
        business_id TEXT    NOT NULL,
        name        TEXT    NOT NULL,
        description TEXT,
        is_system   INTEGER NOT NULL DEFAULT 0,
        is_owner_role INTEGER NOT NULL DEFAULT 0,
        colour      TEXT,
        is_deleted  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT    NOT NULL,
        updated_at  TEXT    NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_roles_business_id
        ON roles (business_id);
    `)
  },
}
