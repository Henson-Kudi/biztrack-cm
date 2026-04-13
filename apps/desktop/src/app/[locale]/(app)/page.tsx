'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@biztrack/ui'
import { logout } from '@/services/auth.api'
import { useAuthStore } from '@/stores/auth.store'

export default function DashboardPage() {
  const locale = useLocale()
  const t = useTranslations('app')
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const refreshToken = useAuthStore((s) => s.refreshToken)
  const clearSession = useAuthStore((s) => s.clearSession)

  const handleLogout = async () => {
    setLoading(true)
    try {
      await logout(refreshToken ?? undefined)
    } finally {
      await clearSession()
      router.replace(`/${locale}/login`)
      setLoading(false)
    }
  }

  return (
    <div>
      <h2>{t('dashboard.title')}</h2>
      <p>{t('dashboard.subtitle')}</p>
      <Button onClick={handleLogout} disabled={loading}>
        {loading ? t('dashboard.logout_loading') : t('dashboard.logout')}
      </Button>
    </div>
  )
}
