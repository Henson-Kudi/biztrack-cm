import type { Migration } from './runner'
import { ensureColumn } from './runner'

export const migration_0007: Migration = {
  id: 7,
  name: '0007_fix_quantity_reserved',
  up(db) {
    // Migration 0006 had a bug in ensureColumn that generated:
    //   ALTER TABLE inventory_levels ADD COLUMN REAL NOT NULL DEFAULT 0
    // (column name omitted) instead of:
    //   ALTER TABLE inventory_levels ADD COLUMN quantity_reserved REAL NOT NULL DEFAULT 0
    // This migration adds the correct column on affected databases.
    ensureColumn(db, 'inventory_levels', 'quantity_reserved', 'REAL NOT NULL DEFAULT 0')
  },
}
