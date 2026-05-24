import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { promisify } from 'util'
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
import { registerShareIpc } from './ipc/share.ipc'
import { registerPrintIpc } from './ipc/print.ipc'
import { registerDocumentIpc } from './ipc/document.ipc'
import { startRendererServer } from './renderer-server'

const execFileAsync = promisify(execFile)

const isForcedProduction =
  process.env.NODE_ENV === 'production' || process.env.DESKTOP_FORCE_PRODUCTION === '1'
const isDev = !app.isPackaged && !isForcedProduction

let networkService: NetworkService | null = null
let syncService: SyncService | null = null
let rendererServer: Awaited<ReturnType<typeof startRendererServer>> | null = null

function getSystemTheme() {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

function broadcastTheme(theme: 'light' | 'dark') {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('theme-changed', theme)
  }
}

function getWindowIconPath() {
  return join(app.getAppPath(), 'assets', 'icon.png')
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    icon: getWindowIconPath(),
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
    if (!rendererServer) {
      throw new Error('Renderer server is not running for the production desktop app.')
    }

    win.loadURL(rendererServer.url)
  }

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (!isMainFrame) {
      return
    }

    console.error('[Electron] Failed to load renderer', {
      errorCode,
      errorDescription,
      validatedUrl,
    })
  })

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('theme-changed', getSystemTheme())
  })

  win.once('ready-to-show', () => win.show())
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('cm.biztrack.desktop')
  }

  const databaseService = new DatabaseService()
  networkService = new NetworkService()
  const secureStoreService = new SecureStoreService()
  syncService = new SyncService(networkService, databaseService, secureStoreService)

  registerDatabaseIpc(databaseService)
  registerSyncIpc(syncService)
  registerNetworkIpc(networkService)
  registerSecureStoreIpc(secureStoreService)
  registerShareIpc()
  registerPrintIpc()
  registerDocumentIpc()

  ipcMain.handle('app:open-external', async (_event, url: string) => {
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch {
      return { success: false }
    }
  })

  ipcMain.handle('app:is-whatsapp-installed', async () => {
    try {
      if (process.platform === 'win32') {
        try {
          await execFileAsync('reg', ['query', 'HKCR\\WhatsApp'], { timeout: 3000 })
          return { installed: true }
        } catch {
          return { installed: false }
        }
      } else if (process.platform === 'darwin') {
        return { installed: existsSync('/Applications/WhatsApp.app') }
      }
      return { installed: false }
    } catch {
      return { installed: false }
    }
  })

  ipcMain.on('set-theme', (_event, theme: 'light' | 'dark' | 'system') => {
    nativeTheme.themeSource = theme
    broadcastTheme(getSystemTheme())
  })

  nativeTheme.on('updated', () => {
    broadcastTheme(getSystemTheme())
  })

  networkService.start()
  await syncService.start()

  if (!isDev) {
    rendererServer = await startRendererServer(join(__dirname, '../renderer'))
  }

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
  if (process.platform !== 'darwin') {
    void rendererServer?.close()
    rendererServer = null
    app.quit()
  }
})

app.on('before-quit', () => {
  void rendererServer?.close()
  rendererServer = null
})
