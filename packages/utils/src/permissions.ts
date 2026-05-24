import { DEFAULT_PLAN_RESOURCES, SubscriptionPlan, type Resource } from '@biztrack/types'

type PermissionAccessInput = {
  effectivePermissions: Resource[]
  specialPermissions: Array<{
    resource: Resource
    grantedAt: number
    expiresAt: number | null
    grantedBy: string
    reason: string
    isRevocation: boolean
  }>
  permissionsExpiresAt: number | null
}

type PermissionAccessResult = {
  granted: boolean
  reason: 'PLAN' | 'SPECIAL_GRANT' | 'REVOKED' | 'PLAN_EXPIRED'
  expiresAt: number | null
  grantReason?: string
}

const FREE_PERMISSIONS = DEFAULT_PLAN_RESOURCES[SubscriptionPlan.FREE]

export const computePermissionAccess = (
  resource: Resource,
  auth: PermissionAccessInput,
  now: number = Date.now(),
): PermissionAccessResult => {
  const revocation = auth.specialPermissions.find(
    (p) => p.resource === resource && p.isRevocation && (!p.expiresAt || now < p.expiresAt),
  )
  if (revocation) {
    return {
      granted: false,
      reason: 'REVOKED',
      expiresAt: revocation.expiresAt ?? null,
    }
  }

  const grant = auth.specialPermissions.find(
    (p) => p.resource === resource && !p.isRevocation && (!p.expiresAt || now < p.expiresAt),
  )
  if (grant) {
    return {
      granted: true,
      reason: 'SPECIAL_GRANT',
      expiresAt: grant.expiresAt ?? null,
      grantReason: grant.reason,
    }
  }

  const planExpired =
    auth.permissionsExpiresAt !== null && now > auth.permissionsExpiresAt
  if (planExpired) {
    return {
      granted: FREE_PERMISSIONS.includes(resource),
      reason: 'PLAN_EXPIRED',
      expiresAt: null,
    }
  }

  return {
    granted: auth.effectivePermissions.includes(resource),
    reason: 'PLAN',
    expiresAt: auth.permissionsExpiresAt,
  }
}
