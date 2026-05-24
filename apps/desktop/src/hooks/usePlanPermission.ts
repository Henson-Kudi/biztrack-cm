'use client'

import { useMemo } from 'react'
import type { Resource, SubscriptionPlan } from '@biztrack/types'
import { usePlanStore } from '@/stores/plan.store'
import { getPermissionAccessFromState } from '@/lib/plan-access'

export type PlanPermissionResult = {
  allowed: boolean
  requiredPlan: SubscriptionPlan | null
  loading: boolean
}

export function usePlanPermission(resource: Resource): PlanPermissionResult {
  const { current, loading, hydrated } = usePlanStore((s) => ({
    current: s.current,
    loading: s.loading,
    hydrated: s.hydrated,
  }))

  return useMemo(() => {
    if (!hydrated || loading || !current) {
      return { allowed: true, requiredPlan: null, loading: !hydrated || loading }
    }

    const gate = getPermissionAccessFromState(current, resource)
    return { allowed: gate.allowed, requiredPlan: gate.requiredPlan, loading: false }
  }, [current, hydrated, loading, resource])
}
