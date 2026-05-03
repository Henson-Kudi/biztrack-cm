import { ipcMain, BrowserWindow } from 'electron'
import { SyncService } from '../services/sync.service'
import type { SyncSettings } from '@biztrack/types'

export function registerSyncIpc(syncService: SyncService) {
  ipcMain.handle('sync:trigger', async () => {
    return syncService.sync(true)
  })

  ipcMain.handle('sync:nudge', async () => {
    return syncService.nudge()
  })

  ipcMain.handle('sync:getSnapshot', () => {
    return syncService.getSnapshot()
  })

  ipcMain.handle('sync:getSettings', async () => {
    return syncService.getSettings()
  })

  ipcMain.handle('sync:updateSettings', async (_event, settings: Partial<SyncSettings>) => {
    return syncService.updateSettings(settings)
  })

  // Allow sync service to push status updates to all renderer windows
  syncService.on('status', (status: string) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('sync:status', status)
    })
  })

  syncService.on('snapshot', (snapshot) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('sync:snapshot', snapshot)
    })
  })

  syncService.on('tokens-updated', () => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('auth:tokens-updated')
    })
  })
}
