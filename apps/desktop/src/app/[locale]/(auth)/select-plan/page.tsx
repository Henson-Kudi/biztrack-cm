'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@biztrack/ui'
import type { PlanResourceSummary, SubscriptionPlan } from '@biztrack/types'
import { AuthCard } from '@/components/auth/AuthCard'
import { listPlans, selectPlan } from '@/services/auth.api'
import { getApiErrorMessage } from '@/services/api-response'
import { routeForNextStep } from '@/lib/auth-routing'

export default function SelectPlanPage() {
  const locale = useLocale()
  const t = useTranslations('auth')
  const router = useRouter()
  const [plans, setPlans] = useState<PlanResourceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const goTo = (path: string) => router.push(`/${locale}${path}`)

  useEffect(() => {
    listPlans()
      .then((data) => setPlans(data.plans))
      .catch(() => setError(t('select_plan.load_error')))
      .finally(() => setLoading(false))
  }, [t])

  const handleSelect = async (plan: SubscriptionPlan) => {
    setError(null)
    try {
      const response = await selectPlan({ plan })
      return goTo(routeForNextStep(response.nextStep))
    } catch (error) {
      setError(getApiErrorMessage(error, t('select_plan.select_error')))
    }
  }

  return (
    <AuthCard title={t('select_plan.title')} subtitle={t('select_plan.subtitle')}>
      {loading && <p className="text-sm text-muted-foreground">{t('select_plan.loading')}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="space-y-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className="border border-border rounded-lg p-4 flex items-center justify-between"
          >
            <div>
              <div className="font-medium text-foreground">{plan.displayName}</div>
              <div className="text-xs text-muted-foreground">
                {t('select_plan.price', { price: plan.priceXAF })}
              </div>
            </div>
            <Button variant="secondary" onClick={() => handleSelect(plan.name)}>
              {t('select_plan.choose')}
            </Button>
          </div>
        ))}
      </div>
    </AuthCard>
  )
}
