'use client'

import { useEffect, type ReactNode } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { ipc } from '@/services/ipc.bridge'

export function AuthProvider({ children }: { children: ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate)

  useEffect(() => {
    hydrate()
    ipc.sync.onTokensUpdated(() => {
      void hydrate()
    })
  }, [hydrate])

  return <>{children}</>
}
