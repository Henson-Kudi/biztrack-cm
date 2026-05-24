'use client'

import { buttonVariants } from '@biztrack/ui'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import Link from 'next/link'
import {
  getFirstAccessibleAppPath,
  getRequiredResourceForAppPath,
  removeLocalePrefix,
} from '@/lib/app-route-access'
import { getPermissionAccessFromState } from '@/lib/plan-access'
import { cn } from '@/lib/utils'
import { usePlanStore } from '@/stores/plan.store'

export function PlanRouteGuard({ children }: { children: ReactNode }) {
  const locale = useLocale()
  const pathname = usePathname()
  const t = useTranslations('app.plan_gate')
  const hydrated = usePlanStore((state) => state.hydrated)
  const planState = usePlanStore((state) => state.current)

  const routeDecision = useMemo(() => {
    if (!hydrated || !planState) {
      return null
    }

    const appPath = removeLocalePrefix(pathname, locale)
    const requiredResource = getRequiredResourceForAppPath(appPath)
    if (!requiredResource) {
      return {
        allowed: true,
        requiredResource: null,
        fallbackHref: getFirstAccessibleAppPath(planState, locale),
        requiredPlan: null,
      }
    }

    const gate = getPermissionAccessFromState(planState, requiredResource)
    return {
      allowed: gate.allowed,
      requiredResource,
      requiredPlan: gate.requiredPlan,
      fallbackHref: getFirstAccessibleAppPath(planState, locale),
    }
  }, [hydrated, locale, pathname, planState])

  if (!hydrated) {
    return null
  }

  if (!planState || routeDecision?.allowed !== false) {
    return <>{children}</>
  }

  // We intentionally block the renderer route locally instead of redirecting
  // blindly. That keeps the user oriented, preserves access to the rest of the
  // shell, and explains that the API would reject the same screen anyway.
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center">
      <div className="w-full rounded-3xl border border-border bg-card p-8 shadow-sm">
        <div className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
          {t('badge')}
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-foreground">{t('title')}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {t('description', {
            resource: routeDecision.requiredResource ?? 'RESOURCE',
            plan: routeDecision.requiredPlan ?? 'PAID',
          })}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/${locale}/subscription`}
            className={cn(buttonVariants({ variant: 'secondary' }))}
          >
            {t('upgrade_action')}
          </Link>
          <Link
            href={routeDecision.fallbackHref}
            className={cn(buttonVariants({ variant: 'primary' }))}
          >
            {t('go_available')}
          </Link>
        </div>
      </div>
    </section>
  )
}
