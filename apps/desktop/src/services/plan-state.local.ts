'use client'

import {
  DEFAULT_PLAN_QUOTAS,
  DEFAULT_PLAN_RESOURCES,
  PLAN_QUOTA_RESOURCES,
  SubscriptionPlan,
  SubscriptionStatus,
  type AuthPermissions,
  type PlanQuotaMap,
  type PlanQuotaResource,
  type PlanQuotaUsage,
  type PlanStateResponse,
  type QuotaUsageResponse,
} from '@biztrack/types'
import { dbQuery, dbRun } from './local-db'

export const PLAN_STATE_CACHE_STALE_AFTER_MS = 24 * 60 * 60 * 1000

type PlanStateCacheRow = {
  business_id: string
  selected_plan: SubscriptionPlan
  effective_plan: SubscriptionPlan
  subscription_status: SubscriptionStatus
  trial_started_at: string | null
  trial_ends_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: number
  entitlement_valid: number
  entitlement_expires_at: string | null
  auth_permissions_json: string
  quotas_json: string
  quota_usage_json: string
  fetched_at: string
  last_validated_at: string
  stale_after: string
  updated_at: string
}

export type DesktopPlanState = PlanStateResponse & {
  isStale: boolean
  lastValidatedAt: string | null
  source: 'server' | 'cache' | 'expired_fallback' | 'free_fallback'
  offlineExpiredFallback: boolean
}

const PLAN_ORDER = [
  SubscriptionPlan.FREE,
  SubscriptionPlan.SOLO,
  SubscriptionPlan.BUSINESS,
  SubscriptionPlan.PRO,
] as const

export async function loadPlanStateCache(businessId: string): Promise<PlanStateResponse | null> {
  const [row] = await dbQuery<PlanStateCacheRow>(
    `
      SELECT
        business_id,
        selected_plan,
        effective_plan,
        subscription_status,
        trial_started_at,
        trial_ends_at,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        entitlement_valid,
        entitlement_expires_at,
        auth_permissions_json,
        quotas_json,
        quota_usage_json,
        fetched_at,
        last_validated_at,
        stale_after,
        updated_at
      FROM plan_state_cache
      WHERE business_id = ?
      LIMIT 1
    `,
    [businessId],
  )

  return row ? mapPlanStateCacheRow(row) : null
}

export async function savePlanStateCache(
  businessId: string,
  state: PlanStateResponse,
): Promise<void> {
  const now = new Date().toISOString()

  await dbRun(
    `
      INSERT INTO plan_state_cache (
        business_id,
        selected_plan,
        effective_plan,
        subscription_status,
        trial_started_at,
        trial_ends_at,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        entitlement_valid,
        entitlement_expires_at,
        auth_permissions_json,
        quotas_json,
        quota_usage_json,
        fetched_at,
        last_validated_at,
        stale_after,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(business_id) DO UPDATE SET
        selected_plan = excluded.selected_plan,
        effective_plan = excluded.effective_plan,
        subscription_status = excluded.subscription_status,
        trial_started_at = excluded.trial_started_at,
        trial_ends_at = excluded.trial_ends_at,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        entitlement_valid = excluded.entitlement_valid,
        entitlement_expires_at = excluded.entitlement_expires_at,
        auth_permissions_json = excluded.auth_permissions_json,
        quotas_json = excluded.quotas_json,
        quota_usage_json = excluded.quota_usage_json,
        fetched_at = excluded.fetched_at,
        last_validated_at = excluded.last_validated_at,
        stale_after = excluded.stale_after,
        updated_at = excluded.updated_at
    `,
    [
      businessId,
      state.selectedPlan,
      state.effectivePlan,
      state.status,
      state.trialStartedAt,
      state.trialEndsAt,
      state.currentPeriodStart,
      state.currentPeriodEnd,
      state.cancelAtPeriodEnd ? 1 : 0,
      state.entitlementValid ? 1 : 0,
      state.entitlementExpiresAt,
      JSON.stringify(state.authPermissions),
      JSON.stringify(state.quotas),
      JSON.stringify(state.quotaUsage),
      state.fetchedAt,
      state.fetchedAt,
      state.staleAfter,
      now,
    ],
  )
}

export async function applyQuotaUsageRefreshCache(
  businessId: string,
  response: QuotaUsageResponse,
): Promise<PlanStateResponse | null> {
  const existing = await loadPlanStateCache(businessId)
  if (!existing) {
    return null
  }

  const refreshedAtMs = Date.parse(response.fetchedAt)
  const staleAfter = new Date(
    (Number.isFinite(refreshedAtMs) ? refreshedAtMs : Date.now()) + PLAN_STATE_CACHE_STALE_AFTER_MS,
  ).toISOString()

  const nextState: PlanStateResponse = {
    ...existing,
    selectedPlan: response.selectedPlan,
    effectivePlan: response.effectivePlan,
    entitlementValid: response.entitlementValid,
    quotaUsage: response.quotaUsage,
    fetchedAt: response.fetchedAt,
    staleAfter,
  }

  await savePlanStateCache(businessId, nextState)
  return nextState
}

export async function materializeDesktopPlanState(
  businessId: string,
  cachedState: PlanStateResponse | null,
): Promise<DesktopPlanState> {
  const derivedState = derivePlanStateForOfflineUse(cachedState)
  const quotaUsage = await buildLocalQuotaUsage(
    businessId,
    derivedState.quotas,
    derivedState.quotaUsage,
    derivedState.effectivePlan,
  )

  return {
    ...derivedState,
    quotaUsage,
  }
}

export function derivePlanStateForOfflineUse(
  cachedState: PlanStateResponse | null,
  nowMs: number = Date.now(),
): DesktopPlanState {
  if (!cachedState) {
    return {
      ...createFreeFallbackPlanState(),
      isStale: false,
      lastValidatedAt: null,
      source: 'free_fallback',
      offlineExpiredFallback: false,
    }
  }

  const staleAfterMs = safeParseDate(cachedState.staleAfter)
  const isStale = staleAfterMs !== null ? nowMs > staleAfterMs : false
  const entitlementExpiresAtMs = safeParseDate(cachedState.entitlementExpiresAt)
  const entitlementExpired =
    cachedState.selectedPlan !== SubscriptionPlan.FREE &&
    (
      cachedState.entitlementValid === false ||
      (entitlementExpiresAtMs !== null && nowMs > entitlementExpiresAtMs)
    )

  if (!entitlementExpired) {
    return {
      ...cachedState,
      isStale,
      lastValidatedAt: cachedState.fetchedAt,
      source: 'cache',
      offlineExpiredFallback: false,
    }
  }

  // Falling back to FREE on actual entitlement expiry is deliberate. We do not
  // downgrade merely because the cache is old; we only downgrade when the last
  // verified entitlement has a known end time and that end time is now past.
  const fallbackAuthPermissions: AuthPermissions = {
    ...cachedState.authPermissions,
    effectivePermissions: [...DEFAULT_PLAN_RESOURCES[SubscriptionPlan.FREE]],
    permissionsIssuedAt: nowMs,
    permissionsExpiresAt: entitlementExpiresAtMs,
  }

  return {
    ...cachedState,
    effectivePlan: SubscriptionPlan.FREE,
    entitlementValid: false,
    authPermissions: fallbackAuthPermissions,
    quotas: DEFAULT_PLAN_QUOTAS[SubscriptionPlan.FREE],
    isStale,
    lastValidatedAt: cachedState.fetchedAt,
    source: 'expired_fallback',
    offlineExpiredFallback: true,
  }
}

export async function countLocalQuotaUsage(
  businessId: string,
  resource: PlanQuotaResource,
  fallbackUsage: PlanQuotaUsage[] = [],
): Promise<number> {
  if (resource === 'users') {
    // Staff invites and onboarding stay fully online in v1, so the desktop
    // keeps the last server-validated seat count instead of inventing an
    // offline local counter for memberships that cannot be created offline.
    return fallbackUsage.find((entry) => entry.resource === resource)?.used ?? 0
  }

  const resourceQuery = getQuotaCountQuery(resource)
  const [row] = await dbQuery<{ total: number }>(resourceQuery.sql, [businessId])
  return row?.total ?? 0
}

function createFreeFallbackPlanState(): PlanStateResponse {
  const now = new Date()
  const nowIso = now.toISOString()

  return {
    selectedPlan: SubscriptionPlan.FREE,
    effectivePlan: SubscriptionPlan.FREE,
    status: SubscriptionStatus.ACTIVE,
    trialStartedAt: null,
    trialEndsAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    entitlementValid: true,
    entitlementExpiresAt: null,
    fetchedAt: nowIso,
    staleAfter: new Date(now.getTime() + PLAN_STATE_CACHE_STALE_AFTER_MS).toISOString(),
    authPermissions: {
      plan: SubscriptionPlan.FREE,
      effectivePermissions: [...DEFAULT_PLAN_RESOURCES[SubscriptionPlan.FREE]],
      specialPermissions: [],
      permissionsIssuedAt: now.getTime(),
      permissionsExpiresAt: null,
    },
    quotas: DEFAULT_PLAN_QUOTAS[SubscriptionPlan.FREE],
    quotaUsage: [],
  }
}

async function buildLocalQuotaUsage(
  businessId: string,
  quotas: PlanQuotaMap,
  fallbackUsage: PlanQuotaUsage[],
  effectivePlan: SubscriptionPlan,
): Promise<PlanQuotaUsage[]> {
  const usageByResource = new Map(fallbackUsage.map((entry) => [entry.resource, entry]))

  return Promise.all(
    PLAN_QUOTA_RESOURCES.map(async (resource) => {
      const limit = quotas[resource]
      const used = await countLocalQuotaUsage(businessId, resource, fallbackUsage)
      const requiredPlan =
        limit === null
          ? null
          : resolveRequiredPlanForQuota(resource, used + 1, effectivePlan)

      return {
        resource,
        limit,
        used,
        remaining: limit === null ? null : Math.max(limit - used, 0),
        unlimited: limit === null,
        requiredPlan: requiredPlan ?? usageByResource.get(resource)?.requiredPlan ?? null,
      }
    }),
  )
}

function resolveRequiredPlanForQuota(
  resource: PlanQuotaResource,
  requiredUsage: number,
  currentPlan: SubscriptionPlan,
): SubscriptionPlan | null {
  for (const plan of PLAN_ORDER) {
    const limit = DEFAULT_PLAN_QUOTAS[plan][resource]
    if (limit === null || limit >= requiredUsage) {
      return plan === currentPlan ? null : plan
    }
  }

  return null
}

function getQuotaCountQuery(resource: PlanQuotaResource) {
  switch (resource) {
    case 'products':
      return {
        sql: `
          SELECT COUNT(*) AS total
          FROM products
          WHERE business_id = ?
            AND is_active = 1
            AND is_deleted = 0
        `,
      }
    case 'contacts':
      return {
        sql: `
          SELECT COUNT(*) AS total
          FROM contacts
          WHERE business_id = ?
            AND is_active = 1
        `,
      }
    case 'categories':
      return {
        sql: `
          SELECT COUNT(*) AS total
          FROM product_categories
          WHERE business_id = ?
            AND is_active = 1
            AND is_deleted = 0
        `,
      }
    case 'users':
    default:
      return {
        sql: `
          SELECT 0 AS total
        `,
      }
  }
}

function mapPlanStateCacheRow(row: PlanStateCacheRow): PlanStateResponse {
  return {
    selectedPlan: row.selected_plan,
    effectivePlan: row.effective_plan,
    status: row.subscription_status,
    trialStartedAt: row.trial_started_at,
    trialEndsAt: row.trial_ends_at,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    entitlementValid: Boolean(row.entitlement_valid),
    entitlementExpiresAt: row.entitlement_expires_at,
    authPermissions: parseJson<AuthPermissions>(row.auth_permissions_json, {
      plan: row.selected_plan,
      effectivePermissions: [...DEFAULT_PLAN_RESOURCES[row.effective_plan]],
      specialPermissions: [],
      permissionsIssuedAt: safeParseDate(row.fetched_at) ?? Date.now(),
      permissionsExpiresAt: safeParseDate(row.entitlement_expires_at),
    }),
    quotas: parseJson<PlanQuotaMap>(row.quotas_json, DEFAULT_PLAN_QUOTAS[row.effective_plan]),
    quotaUsage: parseJson<PlanQuotaUsage[]>(row.quota_usage_json, []),
    fetchedAt: row.fetched_at,
    staleAfter: row.stale_after,
  }
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function safeParseDate(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}
