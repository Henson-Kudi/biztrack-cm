'use client'

import { useEffect, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useAuthStore } from '@/stores/auth.store'

type AuthRouteKind =
  | 'login'
  | 'register'
  | 'loginOtp'
  | 'loginPassword'
  | 'verifyPhone'
  | 'verifyEmail'
  | 'selectBusiness'
  | 'selectPlan'
  | 'setupBusiness'
  | 'addFirstProduct'
  | 'invite'
  | 'other'

export function AuthRedirect({ children }: { children: ReactNode }) {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const hydrated = useAuthStore((s) => s.hydrated)
  const accessToken = useAuthStore((s) => s.accessToken)
  const tokenType = useAuthStore((s) => s.tokenType)
  const isOffline = useAuthStore((s) => s.isOffline)
  const pending = useAuthStore((s) => s.pending)
  const routeKind = getAuthRouteKind(pathname)
  const redirectTarget = hydrated
    ? resolveRedirectTarget({
        routeKind,
        isOffline,
        hasPhase1Session: tokenType === 'phase1' && Boolean(accessToken),
        hasPhase2Session: tokenType === 'phase2' && Boolean(accessToken),
        hasPendingIdentifier: Boolean(pending.identifier),
        hasPendingPhone: Boolean(pending.phone),
        hasPendingEmail: Boolean(pending.email),
      })
    : null

  useEffect(() => {
    if (!hydrated || !redirectTarget) {
      return
    }

    router.replace(`/${locale}${redirectTarget}`)
  }, [hydrated, locale, redirectTarget, router])

  if (!hydrated) return null
  if (redirectTarget) return null

  return <>{children}</>
}

function getAuthRouteKind(pathname: string | null): AuthRouteKind {
  if (!pathname) return 'other'
  if (pathname.includes('/login/password')) return 'loginPassword'
  if (pathname.includes('/login/otp')) return 'loginOtp'
  if (pathname.includes('/verify-phone')) return 'verifyPhone'
  if (pathname.includes('/verify-email')) return 'verifyEmail'
  if (pathname.includes('/select-business')) return 'selectBusiness'
  if (pathname.includes('/select-plan')) return 'selectPlan'
  if (pathname.includes('/setup-business')) return 'setupBusiness'
  if (pathname.includes('/add-first-product')) return 'addFirstProduct'
  if (pathname.includes('/invite')) return 'invite'
  if (pathname.includes('/register')) return 'register'
  if (pathname.includes('/login')) return 'login'
  return 'other'
}

function resolveRedirectTarget({
  routeKind,
  isOffline,
  hasPhase1Session,
  hasPhase2Session,
  hasPendingIdentifier,
  hasPendingPhone,
  hasPendingEmail,
}: {
  routeKind: AuthRouteKind
  isOffline: boolean
  hasPhase1Session: boolean
  hasPhase2Session: boolean
  hasPendingIdentifier: boolean
  hasPendingPhone: boolean
  hasPendingEmail: boolean
}): string | null {
  // Auth routes depend on different transient prerequisites. After a cold start
  // we may no longer have the token or in-memory pending auth state that the
  // current screen needs, so we redirect early instead of rendering a blank page.
  if (isOffline) {
    return '/'
  }

  if (hasPhase2Session) {
    if (
      routeKind === 'selectPlan' ||
      routeKind === 'setupBusiness' ||
      routeKind === 'addFirstProduct'
    ) {
      return null
    }

    return '/'
  }

  if (routeKind === 'selectBusiness') {
    return hasPhase1Session ? null : '/login'
  }

  if (
    routeKind === 'selectPlan' ||
    routeKind === 'setupBusiness' ||
    routeKind === 'addFirstProduct'
  ) {
    return '/login'
  }

  if (routeKind === 'loginPassword' || routeKind === 'loginOtp') {
    if (!hasPendingIdentifier) {
      return hasPhase1Session ? '/select-business' : '/login'
    }

    return null
  }

  if (routeKind === 'verifyPhone') {
    if (!hasPendingPhone) {
      return hasPhase1Session ? '/select-business' : '/login'
    }

    return null
  }

  if (routeKind === 'verifyEmail') {
    if (!hasPendingEmail) {
      return hasPhase1Session ? '/select-business' : '/login'
    }

    return null
  }

  if (routeKind === 'invite') {
    return hasPhase1Session ? '/select-business' : null
  }

  if (hasPhase1Session) {
    return '/select-business'
  }

  return null
}
