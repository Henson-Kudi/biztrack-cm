'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useAuthStore } from '@/stores/auth.store'

export function AuthGate({ children }: { children: ReactNode }) {
  const locale = useLocale()
  const router = useRouter()
  const hydrated = useAuthStore((s) => s.hydrated)
  const tokenType = useAuthStore((s) => s.tokenType)
  const isOffline = useAuthStore((s) => s.isOffline)

  useEffect(() => {
    if (!hydrated) return
    if (!isOffline && tokenType !== 'phase2') {
      const target = tokenType === 'phase1' ? '/select-business' : '/login'
      router.replace(`/${locale}${target}`)
    }
  }, [hydrated, isOffline, tokenType, router, locale])

  if (!hydrated) return null
  if (!isOffline && tokenType !== 'phase2') return null

  return <>{children}</>
}
