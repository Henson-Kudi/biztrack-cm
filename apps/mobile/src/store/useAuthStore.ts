import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Locale = 'fr' | 'en'

export type OnboardingStep =
  | 'PENDING'
  | 'PHONE_VERIFIED'
  | 'VERIFY_EMAIL'
  | 'SETUP_BUSINESS'
  | 'PLAN_PENDING'
  | 'ADD_FIRST_PRODUCT'
  | 'COMPLETE'

export type BusinessRole = 'OWNER' | 'MANAGER' | 'CASHIER' | 'ACCOUNTANT'
export type SubscriptionPlan = 'FREE' | 'SOLO' | 'BUSINESS' | 'PRO'

export interface AuthUser {
  id: string
  name: string
  phone: string
  email?: string
  locale: Locale
  onboardingStep: OnboardingStep
}

export interface AuthBusiness {
  id: string
  name: string
  plan: SubscriptionPlan
  role: BusinessRole
}

export interface AuthPermissions {
  plan: SubscriptionPlan
  effectivePermissions: string[]
  specialPermissions: unknown[]
  permissionsIssuedAt: number
  permissionsExpiresAt: number
}

// ─── State & Actions ───────────────────────────────────────────────────────────

interface AuthState {
  // NOTE: Tokens are stored in AsyncStorage via Zustand persist for cold-start
  // UX (so users aren't logged out on every app restart). For higher-security
  // requirements, mirror these to expo-secure-store via a side-effect in setTokens.
  // AsyncStorage alone is NOT encrypted — evaluate your app's threat model.
  accessToken: string | null
  refreshToken: string | null

  // User & Business context
  user: AuthUser | null
  business: AuthBusiness | null
  authPermissions: AuthPermissions | null

  // UI-level locale (set BEFORE auth on the entry screen)
  locale: Locale

  // Internal state tracking AsyncStorage load time
  _hasHydrated: boolean
  setHasHydrated: (h: boolean) => void

  // ── Actions ──
  setLocale: (locale: Locale) => void
  setTokens: (access: string, refresh: string) => void
  setUser: (user: AuthUser) => void
  setBusiness: (business: AuthBusiness) => void
  setPermissions: (permissions: AuthPermissions) => void

  /** Full auth state received after login / registration */
  setAuthState: (params: {
    accessToken: string
    refreshToken: string
    user: AuthUser
    business?: AuthBusiness
    authPermissions?: AuthPermissions
  }) => void

  /** Clear all auth state and return to login */
  logout: () => void

  /** True only when Phase 2 token exists (user has selected a business) */
  isAuthenticated: () => boolean
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      business: null,
      authPermissions: null,
      locale: 'fr',
      _hasHydrated: false,

      setHasHydrated: (h) => set({ _hasHydrated: h }),

      setLocale: (locale) => set({ locale }),

      setTokens: (access, refresh) =>
        set({ accessToken: access, refreshToken: refresh }),

      setUser: (user) => set({ user }),

      setBusiness: (business) => set({ business }),

      setPermissions: (authPermissions) => set({ authPermissions }),

      setAuthState: ({ accessToken, refreshToken, user, business, authPermissions }) =>
        set({
          accessToken,
          refreshToken,
          user,
          business: business ?? null,
          authPermissions: authPermissions ?? null,
          // Sync locale from user data once we have it
          locale: user.locale,
        }),

      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          business: null,
          authPermissions: null,
        }),

      isAuthenticated: () => {
        const { accessToken, business } = get()
        return Boolean(accessToken && business)
      },
    }),
    {
      name: 'biztrack-auth',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state) state.setHasHydrated(true)
      },
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        locale: state.locale,
        user: state.user,
        business: state.business,
        authPermissions: state.authPermissions,
      }),
    }
  )
)
