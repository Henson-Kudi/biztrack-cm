import type { Migration } from './runner'

export const migration_0019: Migration = {
  id: 19,
  name: '0019_local_businesses_extended',
  up(db) {
    const existing = (
      db
        .prepare(`PRAGMA table_info(local_businesses)`)
        .all() as Array<{ name: string }>
    ).map((col) => col.name)

    const additions: Array<[string, string]> = [
      ['type', 'TEXT'],
      ['description', 'TEXT'],
      ['business_status', 'TEXT'],
      ['owner_id', 'TEXT'],
      ['owner', 'TEXT'],
      ['subscription_status', 'TEXT'],
      ['trial_started_at', 'TEXT'],
      ['trial_ends_at', 'TEXT'],
      ['current_period_start', 'TEXT'],
      ['current_period_end', 'TEXT'],
      ['cancel_at_period_end', 'INTEGER'],
    ]

    for (const [col, colType] of additions) {
      if (!existing.includes(col)) {
        db.exec(`ALTER TABLE local_businesses ADD COLUMN ${col} ${colType}`)
      }
    }
  },
}
