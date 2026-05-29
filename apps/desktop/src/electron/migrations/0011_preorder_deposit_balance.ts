import type { Migration } from './runner'
import { ensureColumn } from './runner'

export const migration_0011: Migration = {
  id: 11,
  name: '0011_preorder_deposit_balance',
  up(db) {
    ensureColumn(db, 'preorders', 'deposit_balance', 'REAL NOT NULL DEFAULT 0')
    ensureColumn(db, 'preorders', 'refunded_amount', 'REAL NOT NULL DEFAULT 0')
  },
}
