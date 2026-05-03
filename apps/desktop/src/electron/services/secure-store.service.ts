import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'

type SecureStoreMap = Record<string, string>

export class SecureStoreService {
  private filePath = join(app.getPath('userData'), 'secure-store.json')

  private readStore(): SecureStoreMap {
    if (!existsSync(this.filePath)) return {}
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      return raw ? (JSON.parse(raw) as SecureStoreMap) : {}
    } catch {
      return {}
    }
  }

  private writeStore(data: SecureStoreMap) {
    const dir = dirname(this.filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(data), { encoding: 'utf-8' })
  }

  isAvailable() {
    return safeStorage.isEncryptionAvailable()
  }

  set(key: string, value: string) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage is not available on this device.')
    }
    const store = this.readStore()
    const encrypted = safeStorage.encryptString(value).toString('base64')
    store[key] = encrypted
    this.writeStore(store)
  }

  get(key: string): string | null {
    const store = this.readStore()
    const encrypted = store[key]
    if (!encrypted) return null
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage is not available on this device.')
    }
    try {
      const buffer = Buffer.from(encrypted, 'base64')
      return safeStorage.decryptString(buffer)
    } catch {
      return null
    }
  }

  delete(key: string) {
    const store = this.readStore()
    if (store[key]) {
      delete store[key]
      this.writeStore(store)
    }
  }

  clear() {
    this.writeStore({})
  }
}
