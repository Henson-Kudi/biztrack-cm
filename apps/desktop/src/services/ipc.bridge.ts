'use client'

import type { NetworkSnapshot, SyncSettings, SyncSnapshot } from '@biztrack/types'

// Typed wrapper around window.electronAPI (exposed by preload.ts)
declare global {
  interface Window {
    electronAPI: {
      db: {
        query: (sql: string, params?: unknown[]) => Promise<unknown[]>
        run: (sql: string, params?: unknown[]) => Promise<{ changes: number }>
        batch: (
          operations: Array<{ sql: string; params?: unknown[] }>,
        ) => Promise<{ changes: number }>
      }
      sync: {
        trigger: () => Promise<{ success: boolean; message: string }>
        nudge: () => Promise<SyncSnapshot>
        getSnapshot: () => Promise<SyncSnapshot>
        getSettings: () => Promise<SyncSettings>
        updateSettings: (settings: Partial<SyncSettings>) => Promise<SyncSnapshot>
        onStatus: (callback: (status: string) => void) => void
        onSnapshotChange: (callback: (snapshot: SyncSnapshot) => void) => void
        onTokensUpdated: (callback: () => void) => void
      }
      network: {
        isOnline: () => Promise<boolean>
        getSnapshot: () => Promise<NetworkSnapshot>
        onStatusChange: (callback: (online: boolean) => void) => void
        onSnapshotChange: (callback: (snapshot: NetworkSnapshot) => void) => void
      }
      print: {
        receipt: (data: unknown) => Promise<void>
      }
      app: {
        version: () => Promise<string>
      }
      secureStore: {
        isAvailable: () => Promise<boolean>
        get: (key: string) => Promise<string | null>
        set: (key: string, value: string) => Promise<boolean>
        delete: (key: string) => Promise<boolean>
        clear: () => Promise<boolean>
      }
      theme: {
        onThemeChange: (callback: (theme: 'light' | 'dark') => void) => void
        setTheme: (theme: 'light' | 'dark' | 'system') => void
      }
    }
  }
}

const fallbackIpc: Window['electronAPI'] = {
  db: {
    query: async () => [],
    run: async () => ({ changes: 0 }),
    batch: async () => ({ changes: 0 }),
  },
  sync: {
    trigger: async () => ({ success: false, message: 'unavailable' }),
    nudge: async () => ({
      status: 'disabled',
      pendingCount: 0,
      lastSyncedAt: null,
      lastError: null,
      network: {
        online: true,
        quality: 'strong',
        latencyMs: null,
        lastCheckedAt: null,
      },
      settings: {
        autoSyncEnabled: false,
        minQuality: 'fair',
      },
      realtime: {
        mode: 'disabled',
        status: 'disconnected',
      },
    }),
    getSnapshot: async () => ({
      status: 'disabled',
      pendingCount: 0,
      lastSyncedAt: null,
      lastError: null,
      network: {
        online: true,
        quality: 'strong',
        latencyMs: null,
        lastCheckedAt: null,
      },
      settings: {
        autoSyncEnabled: false,
        minQuality: 'fair',
      },
      realtime: {
        mode: 'disabled',
        status: 'disconnected',
      },
    }),
    getSettings: async () => ({
      autoSyncEnabled: false,
      minQuality: 'fair',
    }),
    updateSettings: async () => ({
      status: 'disabled',
      pendingCount: 0,
      lastSyncedAt: null,
      lastError: null,
      network: {
        online: true,
        quality: 'strong',
        latencyMs: null,
        lastCheckedAt: null,
      },
      settings: {
        autoSyncEnabled: false,
        minQuality: 'fair',
      },
      realtime: {
        mode: 'disabled',
        status: 'disconnected',
      },
    }),
    onStatus: () => {},
    onSnapshotChange: () => {},
    onTokensUpdated: () => {},
  },
  network: {
    isOnline: async () => true,
    getSnapshot: async () => ({
      online: true,
      quality: 'strong',
      latencyMs: null,
      lastCheckedAt: null,
    }),
    onStatusChange: () => {},
    onSnapshotChange: () => {},
  },
  print: {
    receipt: async () => {},
  },
  app: {
    version: async () => 'web',
  },
  secureStore: {
    isAvailable: async () => false,
    get: async () => null,
    set: async () => false,
    delete: async () => false,
    clear: async () => false,
  },
  theme: {
    onThemeChange: () => {},
    setTheme: () => {},
  },
}

export const ipc =
  typeof window !== 'undefined' && window.electronAPI ? window.electronAPI : fallbackIpc

export function hasDesktopIpc() {
  return typeof window !== 'undefined' && Boolean(window.electronAPI)
}
