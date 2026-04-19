import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { DatabaseService } from './services/database.service'
import { SyncService } from './services/sync.service'
import { NetworkService } from './services/network.service'
import { SecureStoreService } from './services/secure-store.service'
import { registerDatabaseIpc } from './ipc/database.ipc'
import { registerSyncIpc } from './ipc/sync.ipc'
import { registerNetworkIpc } from './ipc/network.ipc'
import { registerSecureStoreIpc } from './ipc/secure-store.ipc'

const isDev = !app.isPackaged

let networkService: NetworkService | null = null
let syncService: SyncService | null = null

function getSystemTheme() {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

function broadcastTheme(theme: 'light' | 'dark') {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('theme-changed', theme)
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  })

  if (isDev) {
    const rendererUrl = process.env.DESKTOP_RENDERER_URL
    if (!rendererUrl) {
      throw new Error('DESKTOP_RENDERER_URL is not set for the Electron renderer.')
    }
    win.loadURL(rendererUrl)
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('theme-changed', getSystemTheme())
  })

  win.once('ready-to-show', () => win.show())
}

app.whenReady().then(async () => {
  const databaseService = new DatabaseService()
  networkService = new NetworkService()
  const secureStoreService = new SecureStoreService()
  syncService = new SyncService(networkService, databaseService, secureStoreService)

  registerDatabaseIpc(databaseService)
  registerSyncIpc(syncService)
  registerNetworkIpc(networkService)
  registerSecureStoreIpc(secureStoreService)

  ipcMain.on('set-theme', (_event, theme: 'light' | 'dark' | 'system') => {
    nativeTheme.themeSource = theme
    broadcastTheme(getSystemTheme())
  })

  nativeTheme.on('updated', () => {
    broadcastTheme(getSystemTheme())
  })

  networkService.start()
  await syncService.start()

  createWindow()

  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  networkService?.stop()
  syncService?.stop()
  if (process.platform !== 'darwin') app.quit()
})
