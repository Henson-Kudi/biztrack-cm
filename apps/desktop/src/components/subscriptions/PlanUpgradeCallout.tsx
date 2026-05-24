'use client'

import { PlanUpgradeCallout as HeadlessPlanUpgradeCallout } from '@biztrack/ui'
import { type SubscriptionPlan } from '@biztrack/types'
import { useLocale, useTranslations } from 'next-intl'

type PlanUpgradeCalloutProps = {
  title: string
  description: string
  requiredPlan?: SubscriptionPlan | null
  className?: string
}

export function PlanUpgradeCallout({
  title,
  description,
  requiredPlan = null,
  className,
}: PlanUpgradeCalloutProps) {
  const locale = useLocale()
  const t = useTranslations('app.plan_gate')

  return (
    <HeadlessPlanUpgradeCallout
      title={title}
      description={description}
      requiredPlan={requiredPlan}
      upgradeHref={`/${locale}/subscription`}
      upgradeLabel={t('upgrade_action')}
      className={className}
    />
  )
}
