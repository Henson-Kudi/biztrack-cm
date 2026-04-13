import { ipcMain } from 'electron'
import { SecureStoreService } from '../services/secure-store.service'

export function registerSecureStoreIpc(store: SecureStoreService) {
  ipcMain.handle('secure-store:is-available', () => {
    return store.isAvailable()
  })

  ipcMain.handle('secure-store:get', (_event, key: string) => {
    return store.get(key)
  })

  ipcMain.handle('secure-store:set', (_event, key: string, value: string) => {
    store.set(key, value)
    return true
  })

  ipcMain.handle('secure-store:delete', (_event, key: string) => {
    store.delete(key)
    return true
  })

  ipcMain.handle('secure-store:clear', () => {
    store.clear()
    return true
  })
}
