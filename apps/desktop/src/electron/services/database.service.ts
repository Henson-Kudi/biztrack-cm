import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'
import { runMigrations } from '../migrations/runner'
import { migration_0001 } from '../migrations/0001_initial_schema'
import { migration_0002 } from '../migrations/0002_business_members'
import { migration_0003 } from '../migrations/0003_business_members_role_id'
import { migration_0004 } from '../migrations/0004_roles'

const MIGRATIONS = [migration_0001, migration_0002, migration_0003, migration_0004]

export class DatabaseService {
  private db: Database.Database

  constructor() {
    const dbPath = app.isPackaged
      ? join(app.getPath('userData'), 'biztrack.db')
      : join(__dirname, '../../../biztrack-dev.db')

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    runMigrations(this.db, MIGRATIONS)
  }

  query(sql: string, params?: unknown[]): unknown[] {
    return this.db.prepare(sql).all(params ?? [])
  }

  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
    return this.db.prepare(sql).run(params ?? [])
  }

  batch(operations: Array<{ sql: string; params?: unknown[] }>): { changes: number } {
    const transaction = this.db.transaction((steps: Array<{ sql: string; params?: unknown[] }>) => {
      let changes = 0
      for (const step of steps) {
        changes += this.db.prepare(step.sql).run(step.params ?? []).changes
      }
      return { changes }
    })

    return transaction(operations)
  }

  close() {
    this.db.close()
  }
}
