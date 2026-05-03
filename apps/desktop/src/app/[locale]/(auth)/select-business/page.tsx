'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { BusinessMembershipSummary } from '@biztrack/types'
import { Button } from '@biztrack/ui'
import { AuthCard } from '@/components/auth/AuthCard'
import { getBusinesses, getAuthTokens, selectBusiness } from '@/services/auth.api'
import { getApiErrorMessage } from '@/services/api-response'
import { useAuthStore } from '@/stores/auth.store'
import { routeForNextStep } from '@/lib/auth-routing'

export default function SelectBusinessPage() {
  const locale = useLocale()
  const t = useTranslations('auth')
  const router = useRouter()
  const [businesses, setBusinesses] = useState<BusinessMembershipSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const setTokens = useAuthStore((s) => s.setTokens)

  const goTo = (path: string) => router.push(`/${locale}${path}`)

  useEffect(() => {
    let mounted = true
    getBusinesses()
      .then((items) => {
        if (!mounted) return
        setBusinesses(items)
      })
      .catch(() => setError(t('select_business.load_error')))
      .finally(() => setLoading(false))
    return () => {
      mounted = false
    }
  }, [t])

  const handleSelect = async (businessId: string) => {
    setError(null)
    try {
      const response = await selectBusiness({ businessId })
      const tokens = getAuthTokens(response)
      if (tokens) {
        await setTokens(tokens)
      }
      return goTo(routeForNextStep(response.nextStep))
    } catch (error) {
      setError(getApiErrorMessage(error, t('select_business.select_error')))
    }
  }

  return (
    <AuthCard title={t('select_business.title')} subtitle={t('select_business.subtitle')}>
      {loading && <p className="text-sm text-muted-foreground">{t('select_business.loading')}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && businesses.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('select_business.empty')}</p>
      )}
      <div className="space-y-3">
        {businesses.map((item) => (
          <div
            key={item.businessId}
            className="border border-border rounded-lg p-4 flex items-center justify-between"
          >
            <div>
              <div className="font-medium text-foreground">
                {item.business?.name ?? t('select_business.fallback_name')}
              </div>
              <div className="text-xs text-muted-foreground">
                {item.role} - {item.business?.city ?? t('select_business.default_city')}
              </div>
            </div>
            <Button variant="secondary" onClick={() => handleSelect(item.businessId)}>
              {t('select_business.choose')}
            </Button>
          </div>
        ))}
      </div>
    </AuthCard>
  )
}
