'use client'

import {
  SubscriptionPlan,
  DEFAULT_PLAN_RESOURCES,
  type PlanQuotaResource,
  type PlanQuotaUsage,
  type Resource,
} from '@biztrack/types'
import { computePermissionAccess } from '@biztrack/utils'
import {
  type DesktopPlanState,
  loadPlanStateCache,
  materializeDesktopPlanState,
} from '@/services/plan-state.local'
import { usePlanStore } from '@/stores/plan.store'

const PLAN_ORDER = [
  SubscriptionPlan.FREE,
  SubscriptionPlan.SOLO,
  SubscriptionPlan.BUSINESS,
  SubscriptionPlan.PRO,
] as const satisfies SubscriptionPlan[]

export type LocalQuotaGate = {
  allowed: boolean
  resource: PlanQuotaResource
  limit: number | null
  used: number
  remaining: number | null
  requiredPlan: SubscriptionPlan | null
  state: DesktopPlanState
}

export type LocalPermissionGate = {
  allowed: boolean
  resource: Resource
  requiredPlan: SubscriptionPlan | null
  state: DesktopPlanState
  access: ReturnType<typeof computePermissionAccess>
}

export class PlanPermissionLocalError extends Error {
  readonly code = 'PLAN_RESOURCE_FORBIDDEN'

  constructor(
    public readonly resource: Resource,
    public readonly requiredPlan: SubscriptionPlan | null,
    public readonly reason: ReturnType<typeof computePermissionAccess>['reason'],
  ) {
    super(buildLocalPermissionErrorMessage(resource, requiredPlan, reason))
    this.name = 'PlanPermissionLocalError'
  }
}

export async function resolveDesktopPlanState(
  businessId: string,
): Promise<DesktopPlanState> {
  const store = usePlanStore.getState()
  if (store.businessId === businessId && store.current) {
    return store.current
  }

  const cached = await loadPlanStateCache(businessId)
  return materializeDesktopPlanState(businessId, cached)
}

export async function getLocalQuotaGate(
  businessId: string,
  resource: PlanQuotaResource,
): Promise<LocalQuotaGate> {
  const state = await resolveDesktopPlanState(businessId)
  const quota = findQuotaUsage(state.quotaUsage, resource)

  if (!quota || quota.limit === null) {
    return {
      allowed: true,
      resource,
      limit: quota?.limit ?? null,
      used: quota?.used ?? 0,
      remaining: quota?.remaining ?? null,
      requiredPlan: quota?.requiredPlan ?? null,
      state,
    }
  }

  return {
    allowed: quota.used < quota.limit,
    resource,
    limit: quota.limit,
    used: quota.used,
    remaining: quota.remaining,
    requiredPlan: quota.requiredPlan ?? null,
    state,
  }
}

export async function getLocalPermissionAccess(
  businessId: string,
  resource: Resource,
) {
  const state = await resolveDesktopPlanState(businessId)

  return getPermissionAccessFromState(state, resource).access
}

export async function getLocalPermissionGate(
  businessId: string,
  resource: Resource,
): Promise<LocalPermissionGate> {
  const state = await resolveDesktopPlanState(businessId)
  return getPermissionAccessFromState(state, resource)
}

export async function assertLocalPermissionAccess(
  businessId: string,
  resource: Resource,
): Promise<DesktopPlanState> {
  const gate = await getLocalPermissionGate(businessId, resource)
  if (!gate.allowed) {
    // Local desktop writes must obey the same boolean feature matrix as API
    // controllers. Throwing before SQLite/outbox writes keeps offline behavior
    // deterministic instead of hoping sync will reject the change later.
    throw new PlanPermissionLocalError(resource, gate.requiredPlan, gate.access.reason)
  }

  return gate.state
}

export function getPermissionAccessFromState(
  state: DesktopPlanState,
  resource: Resource,
): LocalPermissionGate {
  const access = computePermissionAccess(resource, state.authPermissions)
  const requiredPlan = access.granted ? null : resolveRequiredPlanForResource(resource)

  return {
    allowed: access.granted,
    resource,
    requiredPlan,
    state,
    access,
  }
}

export function resolveRequiredPlanForResource(resource: Resource): SubscriptionPlan | null {
  for (const plan of PLAN_ORDER) {
    if (DEFAULT_PLAN_RESOURCES[plan].includes(resource)) {
      return plan
    }
  }

  return null
}

function findQuotaUsage(
  quotaUsage: PlanQuotaUsage[],
  resource: PlanQuotaResource,
) {
  return quotaUsage.find((entry) => entry.resource === resource) ?? null
}

function buildLocalPermissionErrorMessage(
  resource: Resource,
  requiredPlan: SubscriptionPlan | null,
  reason: ReturnType<typeof computePermissionAccess>['reason'],
) {
  const resourceLabel = formatResourceLabel(resource)

  if (reason === 'REVOKED') {
    return `${resourceLabel} is disabled for this business right now. Reconnect to the internet if you need the latest permissions.`
  }

  if (reason === 'PLAN_EXPIRED') {
    return requiredPlan
      ? `${resourceLabel} now requires the ${requiredPlan} plan because the cached paid entitlement expired on this device. Reconnect to the internet before trying again.`
      : `${resourceLabel} is no longer available because the cached paid entitlement expired on this device. Reconnect to the internet before trying again.`
  }

  return requiredPlan
    ? `${resourceLabel} requires the ${requiredPlan} plan. Reconnect to the internet to refresh the plan state and upgrade before trying again.`
    : `${resourceLabel} is not available on the current business plan.`
}

function formatResourceLabel(resource: Resource) {
  return resource
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ')
}
