import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'
import { runMigrations } from '../migrations/runner'
import { migration_0001 } from '../migrations/0001_initial_schema'
import { migration_0002 } from '../migrations/0002_business_members'
import { migration_0003 } from '../migrations/0003_business_members_role_id'
import { migration_0004 } from '../migrations/0004_roles'
import { migration_0005 } from '../migrations/0005_opening_balances'
import { migration_0006 } from '../migrations/0006_preorders'
import { migration_0007 } from '../migrations/0007_fix_quantity_reserved'
import { migration_0008 } from '../migrations/0008_sale_preorder_link'
import { migration_0009 } from '../migrations/0009_charge_types'
import { migration_0010 } from '../migrations/0010_sale_discounts'
import { migration_0011 } from '../migrations/0011_preorder_deposit_balance'
import { migration_0012 } from '../migrations/0012_preorder_refunds'
import { migration_0013 } from '../migrations/0013_backfill_deposit_balance'
import { migration_0014 } from '../migrations/0014_drop_preorders'
import { migration_0015 } from '../migrations/0015_savings'
import { migration_0016 } from '../migrations/0016_savings_usage'
import { migration_0017 } from '../migrations/0017_savings_transactions'
import { migration_0018 } from '../migrations/0018_local_businesses'
import { migration_0019 } from '../migrations/0019_local_businesses_extended'
import { migration_0020 } from '../migrations/0020_local_user_profiles'

const MIGRATIONS = [migration_0001, migration_0002, migration_0003, migration_0004, migration_0005, migration_0006, migration_0007, migration_0008, migration_0009, migration_0010, migration_0011, migration_0012, migration_0013, migration_0014, migration_0015, migration_0016, migration_0017, migration_0018, migration_0019, migration_0020]

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
