'use client'

import { useEffect, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useAuthStore } from '@/stores/auth.store'

export function AuthRedirect({ children }: { children: ReactNode }) {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const hydrated = useAuthStore((s) => s.hydrated)
  const tokenType = useAuthStore((s) => s.tokenType)
  const isOffline = useAuthStore((s) => s.isOffline)
  const pending = useAuthStore((s) => s.pending)
  const hasPendingAuth = Boolean(pending.identifier || pending.inviteToken)
  const isOnboardingRoute =
    pathname?.includes('/setup-business') ||
    pathname?.includes('/select-plan') ||
    pathname?.includes('/add-first-product')

  useEffect(() => {
    if (!hydrated) return
    if (isOffline || (tokenType === 'phase2' && !isOnboardingRoute)) {
      router.replace(`/${locale}`)
      return
    }
    if (!hasPendingAuth && tokenType === 'phase1') {
      router.replace(`/${locale}/select-business`)
    }
  }, [hydrated, isOffline, tokenType, router, locale, hasPendingAuth, isOnboardingRoute])

  if (!hydrated) return null
  if (isOffline || (tokenType === 'phase2' && !isOnboardingRoute)) return null
  if (tokenType === 'phase1' && !hasPendingAuth) return null

  return <>{children}</>
}
