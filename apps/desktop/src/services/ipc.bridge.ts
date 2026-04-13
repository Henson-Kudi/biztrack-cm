'use client'

// Typed wrapper around window.electronAPI (exposed by preload.ts)
declare global {
  interface Window {
    electronAPI: {
      db: {
        query: (sql: string, params?: unknown[]) => Promise<unknown[]>
        run: (sql: string, params?: unknown[]) => Promise<{ changes: number }>
      }
      sync: {
        trigger: () => Promise<{ success: boolean; message: string }>
        onStatus: (callback: (status: string) => void) => void
      }
      network: {
        isOnline: () => Promise<boolean>
        onStatusChange: (callback: (online: boolean) => void) => void
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
  },
  sync: {
    trigger: async () => ({ success: false, message: 'unavailable' }),
    onStatus: () => {},
  },
  network: {
    isOnline: async () => true,
    onStatusChange: () => {},
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
