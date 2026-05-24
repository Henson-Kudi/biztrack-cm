'use client'

import type { Resource } from '@biztrack/types'
import { useTranslations } from 'next-intl'
import { usePlanPermission } from '@/hooks/usePlanPermission'
import { PlanUpgradeCallout } from './PlanUpgradeCallout'

type PermissionGateProps = {
  resource: Resource
  mode?: 'hide' | 'lock'
  fallback?: React.ReactNode
  children: React.ReactNode
}

export function PermissionGate({
  resource,
  mode = 'lock',
  fallback,
  children,
}: PermissionGateProps) {
  const { allowed, requiredPlan, loading } = usePlanPermission(resource)
  const t = useTranslations('app.plan_gate')

  if (loading || allowed) {
    return <>{children}</>
  }

  if (mode === 'hide') {
    return fallback ? <>{fallback}</> : null
  }

  // mode === 'lock': show a greyed overlay with upgrade callout
  return (
    <div className="relative">
      <div aria-hidden="true" className="pointer-events-none select-none opacity-40">
        {children}
      </div>
      <div className="absolute inset-0 flex items-start justify-center pt-6">
        <PlanUpgradeCallout
          title={t('locked_feature_title')}
          description={t('locked_feature_description', {
            report: resource,
            section: resource,
            plan: requiredPlan ?? '',
          })}
          requiredPlan={requiredPlan}
          className="w-full max-w-md shadow-lg"
        />
      </div>
    </div>
  )
}
