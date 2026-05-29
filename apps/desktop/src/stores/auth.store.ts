'use client'

import { create } from 'zustand'
import type { AuthTokens, BusinessMemberRole, JwtPayload } from '@biztrack/types'
import { decodeJwtPayload } from '@/lib/jwt'
import { ipc } from '@/services/ipc.bridge'
import { getLocalBusiness } from '@/services/local-businesses.local'
import { getLocalUserProfile } from '@/services/local-user-profiles.local'
import { secureStore } from '@/services/secure-store'

const TOKENS_KEY = 'auth.tokens'
const PASSWORD_HASH_KEY = 'auth.passwordHash'
const LAST_BUSINESS_KEY = 'auth.lastBusinessId'
const LAST_ROLE_KEY = 'auth.lastRole'
const LAST_USER_KEY = 'auth.lastUserId'
const SYNC_CREDENTIAL_KEY = 'sync.deviceCredential'

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

async function loadBusinessMeta(businessId: string | null) {
  if (!businessId) return null
  try {
    return await getLocalBusiness(businessId)
  } catch {
    return null
  }
}

async function loadUserFromLocal(userId: string | null) {
  if (!userId) return null
  try {
    return await getLocalUserProfile(userId)
  } catch {
    return null
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

export type AuthUser = {
  id: string
  email: string | null
  phone: string | null
  name: string | null
  avatarUrl: string | null
  language: string | null
}

export type AuthBusinessMeta = {
  businessName: string | null
  businessCurrency: string
  businessPhone: string | null
  businessEmail: string | null
  businessAddress: string | null
  businessCity: string | null
  businessLogoUrl: string | null
}

type AuthState = {
  hydrated: boolean
  isOffline: boolean
  accessToken: string | null
  refreshToken: string | null
  tokenType: TokenType | null
  businessId: string | null
  role: BusinessMemberRole | null
  user: AuthUser | null
} & AuthBusinessMeta & {
  pending: PendingAuth
  setPending: (pending: PendingAuth) => void
  setTokens: (tokens: AuthTokens) => Promise<void>
  applyUser: (user: AuthUser | null) => void
  setOfflineSession: (businessId: string | null, role?: BusinessMemberRole | null) => Promise<void>
  clearSession: () => Promise<void>
  hydrate: () => Promise<void>
  storePasswordHash: (hash: string) => Promise<void>
  getPasswordHash: () => Promise<string | null>
}

const EMPTY_BUSINESS_META: AuthBusinessMeta = {
  businessName: null,
  businessCurrency: 'XAF',
  businessPhone: null,
  businessEmail: null,
  businessAddress: null,
  businessCity: null,
  businessLogoUrl: null,
}

function businessMetaFromLocal(
  local: Awaited<ReturnType<typeof getLocalBusiness>>,
): AuthBusinessMeta {
  if (!local) return EMPTY_BUSINESS_META
  return {
    businessName: local.name,
    businessCurrency: local.currency || 'XAF',
    businessPhone: local.phone,
    businessEmail: local.email,
    businessAddress: local.address,
    businessCity: local.city,
    businessLogoUrl: local.logoUrl,
  }
}

function userFromLocal(
  local: Awaited<ReturnType<typeof getLocalUserProfile>>,
  jwtUserId?: string | null,
  jwtEmail?: string | null,
  jwtPhone?: string | null,
): AuthUser | null {
  // Prefer locally saved full profile; fall back to JWT claims
  if (local) {
    return {
      id: local.id,
      email: local.email,
      phone: local.phone,
      name: local.name,
      avatarUrl: local.avatarUrl,
      language: local.language,
    }
  }
  if (jwtUserId) {
    return {
      id: jwtUserId,
      email: jwtEmail ?? null,
      phone: jwtPhone ?? null,
      name: null,
      avatarUrl: null,
      language: null,
    }
  }
  return null
}

export const useAuthStore = create<AuthState>((set, get) => ({
  hydrated: false,
  isOffline: false,
  accessToken: null,
  refreshToken: null,
  tokenType: null,
  businessId: null,
  role: null,
  user: null,
  ...EMPTY_BUSINESS_META,
  pending: {},

  setPending: (pending) => set({ pending: { ...get().pending, ...pending } }),

  setTokens: async (tokens) => {
    const payload = decodeJwtPayload<JwtPayload>(tokens.accessToken)
    const tokenType = (payload?.type ?? null) as TokenType | null
    const businessId = (payload?.businessId ?? null) as string | null
    const role = (payload?.role ?? null) as BusinessMemberRole | null
    const userId = payload?.sub ?? null
    const jwtEmail = payload?.email ?? null
    const jwtPhone = payload?.phone ?? null

    const canPersist = await secureStore.isAvailable()
    if (canPersist) await secureStore.set(TOKENS_KEY, JSON.stringify(tokens))
    if (canPersist && businessId) await secureStore.set(LAST_BUSINESS_KEY, businessId)
    if (canPersist && role) await secureStore.set(LAST_ROLE_KEY, role)
    if (canPersist && userId) await secureStore.set(LAST_USER_KEY, userId)

    const [businessMeta, localUser] =
      tokenType === 'phase2'
        ? await Promise.all([
            loadBusinessMeta(businessId).then(businessMetaFromLocal),
            loadUserFromLocal(userId),
          ])
        : [EMPTY_BUSINESS_META, null]

    set({
      accessToken: tokens.accessToken,
      refreshToken: canPersist ? tokens.refreshToken : null,
      tokenType,
      businessId,
      role,
      isOffline: false,
      user: userFromLocal(localUser, userId, jwtEmail, jwtPhone),
      ...businessMeta,
    })

    await nudgeDesktopSync()
  },

  applyUser: (user) => {
    set({ user })
  },

  setOfflineSession: async (businessId, role) => {
    const lastUserId = get().user?.id ?? (await secureStore.get(LAST_USER_KEY))

    const [businessMeta, localUser] = await Promise.all([
      loadBusinessMeta(businessId ?? null).then(businessMetaFromLocal),
      loadUserFromLocal(lastUserId),
    ])

    set({
      isOffline: true,
      tokenType: 'phase2',
      businessId: businessId ?? null,
      role: role ?? null,
      accessToken: null,
      refreshToken: null,
      user: userFromLocal(localUser, lastUserId),
      ...businessMeta,
    })

    void nudgeDesktopSync()
  },

  clearSession: async () => {
    await secureStore.delete(TOKENS_KEY)
    await secureStore.delete(SYNC_CREDENTIAL_KEY)
    set({
      isOffline: false,
      accessToken: null,
      refreshToken: null,
      tokenType: null,
      businessId: null,
      role: null,
      user: null,
      ...EMPTY_BUSINESS_META,
    })

    await nudgeDesktopSync()
  },

  hydrate: async () => {
    const stored = await secureStore.get(TOKENS_KEY)
    if (stored) {
      try {
        const tokens = JSON.parse(stored) as AuthTokens
        const payload = decodeJwtPayload<JwtPayload>(tokens.accessToken)
        const businessId = (payload?.businessId ?? null) as string | null
        const userId = (payload?.sub ?? null) as string | null
        const jwtEmail = (payload?.email ?? null) as string | null
        const jwtPhone = (payload?.phone ?? null) as string | null

        const [businessMeta, localUser] = await Promise.all([
          loadBusinessMeta(businessId).then(businessMetaFromLocal),
          loadUserFromLocal(userId),
        ])

        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenType: (payload?.type ?? null) as TokenType | null,
          businessId,
          role: (payload?.role ?? null) as BusinessMemberRole | null,
          user: userFromLocal(localUser, userId, jwtEmail, jwtPhone),
          ...businessMeta,
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

export async function getLastSessionContext() {
  const [businessId, role] = await Promise.all([
    secureStore.get(LAST_BUSINESS_KEY),
    secureStore.get(LAST_ROLE_KEY),
  ])
  return { businessId, role: role as BusinessMemberRole | null }
}
