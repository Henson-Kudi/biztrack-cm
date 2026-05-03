'use client'

import { ipc } from './ipc.bridge'

async function isIpcStoreAvailable() {
  try {
    return await ipc.secureStore.isAvailable()
  } catch {
    return false
  }
}

export const secureStore = {
  isAvailable: async () => await isIpcStoreAvailable(),
  get: async (key: string) => {
    if (await isIpcStoreAvailable()) return ipc.secureStore.get(key)
    return null
  },
  set: async (key: string, value: string) => {
    if (await isIpcStoreAvailable()) return ipc.secureStore.set(key, value)
    return false
  },
  delete: async (key: string) => {
    if (await isIpcStoreAvailable()) return ipc.secureStore.delete(key)
    return false
  },
  clear: async () => {
    if (await isIpcStoreAvailable()) return ipc.secureStore.clear()
    return false
  },
}
