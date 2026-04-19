import { ipcMain } from 'electron'
import { DatabaseService } from '../services/database.service'

export function registerDatabaseIpc(db: DatabaseService) {
  ipcMain.handle('db:query', (_event, sql: string, params?: unknown[]) => {
    return db.query(sql, params)
  })

  ipcMain.handle('db:run', (_event, sql: string, params?: unknown[]) => {
    return db.run(sql, params)
  })

  ipcMain.handle(
    'db:batch',
    (_event, operations: Array<{ sql: string; params?: unknown[] }>) => {
      return db.batch(operations)
    },
  )
}
