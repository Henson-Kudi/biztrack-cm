import { contextBridge, ipcRenderer } from 'electron'
import type { NetworkSnapshot, SyncSettings, SyncSnapshot } from '@biztrack/types'

// Expose safe APIs to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Database operations
  db: {
    query: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:query', sql, params),
    run: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:run', sql, params),
    batch: (operations: Array<{ sql: string; params?: unknown[] }>) =>
      ipcRenderer.invoke('db:batch', operations),
  },
  // Sync
  sync: {
    trigger: () => ipcRenderer.invoke('sync:trigger'),
    nudge: () => ipcRenderer.invoke('sync:nudge'),
    getSnapshot: () => ipcRenderer.invoke('sync:getSnapshot'),
    getSettings: () => ipcRenderer.invoke('sync:getSettings'),
    updateSettings: (settings: Partial<SyncSettings>) =>
      ipcRenderer.invoke('sync:updateSettings', settings),
    onStatus: (callback: (status: string) => void) => {
      ipcRenderer.on('sync:status', (_event, status) => callback(status))
    },
    onSnapshotChange: (callback: (snapshot: SyncSnapshot) => void) => {
      ipcRenderer.on('sync:snapshot', (_event, snapshot) => callback(snapshot))
    },
    onTokensUpdated: (callback: () => void) => {
      ipcRenderer.on('auth:tokens-updated', () => callback())
    },
  },
  // Network
  network: {
    isOnline: () => ipcRenderer.invoke('network:isOnline'),
    getSnapshot: () => ipcRenderer.invoke('network:getSnapshot'),
    onStatusChange: (callback: (online: boolean) => void) => {
      ipcRenderer.on('network:change', (_event, online) => callback(online))
    },
    onSnapshotChange: (callback: (snapshot: NetworkSnapshot) => void) => {
      ipcRenderer.on('network:snapshot', (_event, snapshot) => callback(snapshot))
    },
  },
  // Print
  print: {
    receipt: (data: {
      buffer?: number[]
      html?: string
      filename?: string
      printerName?: string
      paperWidthMm?: number
      silent?: boolean
    }) => ipcRenderer.invoke('print:receipt', data),
  },
  // Native sharing
  share: {
    file: (data: { buffer: number[]; filename: string; mimeType?: string }) =>
      ipcRenderer.invoke('share:file', data),
    url: (payload: { url: string; text?: string; title?: string }) =>
      ipcRenderer.invoke('share:url', payload),
  },
  documents: {
    exportPdf: (data: { html?: string; filename?: string }) =>
      ipcRenderer.invoke('document:export-pdf', data),
    renderPdf: (data: { html?: string }) =>
      ipcRenderer.invoke('document:render-pdf', data),
    exportFile: (data: {
      content?: string
      filename?: string
      filters?: Array<{ name: string; extensions: string[] }>
    }) => ipcRenderer.invoke('document:export-file', data),
  },
  // App info
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
    isWhatsAppInstalled: () => ipcRenderer.invoke('app:is-whatsapp-installed'),
  },
  // Secure storage
  secureStore: {
    isAvailable: () => ipcRenderer.invoke('secure-store:is-available'),
    get: (key: string) => ipcRenderer.invoke('secure-store:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('secure-store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('secure-store:delete', key),
    clear: () => ipcRenderer.invoke('secure-store:clear'),
  },
  theme: {
    onThemeChange: (callback: (theme: 'light' | 'dark') => void) => {
      ipcRenderer.on('theme-changed', (_event, theme) => callback(theme))
    },
    setTheme: (theme: 'light' | 'dark' | 'system') => ipcRenderer.send('set-theme', theme),
  },
})
