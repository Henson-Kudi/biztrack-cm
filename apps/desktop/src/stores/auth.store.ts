'use client'

import { create } from 'zustand'
import type { AuthTokens, BusinessMemberRole, JwtPayload } from '@biztrack/types'
import { decodeJwtPayload } from '@/lib/jwt'
import { ipc } from '@/services/ipc.bridge'
import { secureStore } from '@/services/secure-store'

const TOKENS_KEY = 'auth.tokens'
const PASSWORD_HASH_KEY = 'auth.passwordHash'
const LAST_BUSINESS_KEY = 'auth.lastBusinessId'
const LAST_ROLE_KEY = 'auth.lastRole'

async function nudgeDesktopSync() {
  if (typeof window === 'undefined' || !window.electronAPI) {
    return
  }

  try {
    await ipc.sync.nudge()
  } catch {
    // Auth changes should not fail if the desktop sync runtime is temporarily unavailable.
  }
}

type TokenType = 'phase1' | 'phase2'

type PendingAuth = {
  identifier?: string
  phone?: string
  email?: string
  inviteToken?: string | null
  otpMessage?: string | null
  maskedPhone?: string | null
  maskedEmail?: string | null
  otpExpiresIn?: number | null
}

type AuthState = {
  hydrated: boolean
  isOffline: boolean
  accessToken: string | null
  refreshToken: string | null
  tokenType: TokenType | null
  businessId: string | null
  businessName: string | null
  role: BusinessMemberRole | null
  pending: PendingAuth
  setPending: (pending: PendingAuth) => void
  setTokens: (tokens: AuthTokens) => Promise<void>
  setOfflineSession: (businessId: string | null, role?: BusinessMemberRole | null) => void
  clearSession: () => Promise<void>
  hydrate: () => Promise<void>
  storePasswordHash: (hash: string) => Promise<void>
  getPasswordHash: () => Promise<string | null>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  hydrated: false,
  isOffline: false,
  accessToken: null,
  refreshToken: null,
  tokenType: null,
  businessId: null,
  businessName: null,
  role: null,
  pending: {},
  setPending: (pending) => set({ pending: { ...get().pending, ...pending } }),
  setTokens: async (tokens) => {
    const payload = decodeJwtPayload<JwtPayload>(tokens.accessToken)
    const tokenType = (payload?.type ?? null) as TokenType | null
    const businessId = (payload?.businessId ?? null) as string | null
    const role = (payload?.role ?? null) as BusinessMemberRole | null
    const canPersist = await secureStore.isAvailable()
    if (canPersist) {
      await secureStore.set(TOKENS_KEY, JSON.stringify(tokens))
    }
    if (canPersist && businessId) await secureStore.set(LAST_BUSINESS_KEY, businessId)
    if (canPersist && role) await secureStore.set(LAST_ROLE_KEY, role)

    set({
      accessToken: tokens.accessToken,
      refreshToken: canPersist ? tokens.refreshToken : null,
      tokenType,
      businessId,
      role,
      businessName: get().businessName,
      isOffline: false,
    })

    await nudgeDesktopSync()
  },
  setOfflineSession: (businessId, role) => {
    set({
      isOffline: true,
      tokenType: 'phase2',
      businessId: businessId ?? null,
      businessName: get().businessName,
      role: role ?? null,
      accessToken: null,
      refreshToken: null,
    })

    void nudgeDesktopSync()
  },
  clearSession: async () => {
    await secureStore.delete(TOKENS_KEY)
    set({
      isOffline: false,
      accessToken: null,
      refreshToken: null,
      tokenType: null,
      businessId: null,
      businessName: null,
      role: null,
    })

    await nudgeDesktopSync()
  },
  hydrate: async () => {
    const stored = await secureStore.get(TOKENS_KEY)
    if (stored) {
      try {
        const tokens = JSON.parse(stored) as AuthTokens
        const payload = decodeJwtPayload<JwtPayload>(tokens.accessToken)
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenType: (payload?.type ?? null) as TokenType | null,
          businessId: (payload?.businessId ?? null) as string | null,
          businessName: get().businessName,
          role: (payload?.role ?? null) as BusinessMemberRole | null,
        })
      } catch {
        await secureStore.delete(TOKENS_KEY)
      }
    }
    set({ hydrated: true })
  },
  storePasswordHash: async (hash) => {
    await secureStore.set(PASSWORD_HASH_KEY, hash)
  },
  getPasswordHash: async () => {
    return secureStore.get(PASSWORD_HASH_KEY)
  },
}))

export async function getLastBusinessContext() {
  const [businessId, role] = await Promise.all([
    secureStore.get(LAST_BUSINESS_KEY),
    secureStore.get(LAST_ROLE_KEY),
  ])
  return { businessId, role: role as BusinessMemberRole | null }
}
