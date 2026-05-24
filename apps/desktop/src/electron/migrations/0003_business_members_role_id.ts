import type Database from 'better-sqlite3'
import { type Migration } from './runner'

export const migration_0003: Migration = {
  id: 3,
  name: '0003_business_members_role_id',
  up(db: Database.Database) {
    db.exec(`
      ALTER TABLE business_members ADD COLUMN role_id TEXT;
    `)
  },
}
