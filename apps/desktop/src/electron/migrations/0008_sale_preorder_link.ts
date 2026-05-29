import type { Migration } from './runner'
import { ensureColumn } from './runner'

export const migration_0008: Migration = {
  id: 8,
  name: '0008_sale_preorder_link',
  up(db) {
    ensureColumn(db, 'sales', 'preorder_id', 'TEXT')
  },
}
