import Database from 'better-sqlite3'

export interface Migration {
  id: number
  name: string
  up(db: Database.Database): void
}

/**
 * Adds a column to a table only if it does not already exist.
 * SQLite does not support `ALTER TABLE ADD COLUMN IF NOT EXISTS`, so we
 * check via PRAGMA first.
 */
export function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>
  if (columns.some((c) => c.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
}

/**
 * Runs all pending migrations in ascending id order.
 * Each migration is wrapped in a transaction; on success its id is recorded
 * in `_migrations` so it is never re-applied.
 */
export function runMigrations(db: Database.Database, migrations: Migration[]): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      applied_at TEXT    NOT NULL
    )
  `)

  const applied = new Set(
    (db.prepare('SELECT id FROM _migrations').all() as { id: number }[]).map((r) => r.id),
  )

  const pending = [...migrations].sort((a, b) => a.id - b.id).filter((m) => !applied.has(m.id))

  for (const migration of pending) {
    const run = db.transaction(() => {
      migration.up(db)
      db.prepare('INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)').run(
        migration.id,
        migration.name,
        new Date().toISOString(),
      )
    })
    run()
  }
}
