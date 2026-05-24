import { Injectable } from '@nestjs/common'
import {
  DEFAULT_PLAN_QUOTAS,
  DEFAULT_PLAN_RESOURCES,
  type AuthPermissions,
  type PlanQuotaMap,
  type PlanQuotaResource,
  type Resource,
  type SpecialPermission,
  SubscriptionPlan,
} from '@biztrack/types'
import { IsNull, MoreThan } from 'typeorm'
import { RedisService } from '@/common/redis/redis.service'
import { SubscriptionStatus, type Business } from '@/entities/business.entity'
import { BusinessesRepository } from '@/modules/business/repositories/businesses.repository'
import { BusinessOverridesRepository } from './repositories/business-overrides.repository'
import { PlanConfigsRepository } from './repositories/plan-configs.repository'

type BusinessEntitlementFields = Pick<
  Business,
  | 'id'
  | 'plan'
  | 'subscriptionStatus'
  | 'trialStartedAt'
  | 'trialEndsAt'
  | 'currentPeriodStart'
  | 'currentPeriodEnd'
  | 'cancelAtPeriodEnd'
>

export type ResolvedBusinessEntitlement = {
  selectedPlan: SubscriptionPlan
  effectivePlan: SubscriptionPlan
  entitlementValid: boolean
  entitlementExpiresAt: number | null
  business: BusinessEntitlementFields
}

@Injectable()
export class PermissionsService {
  private readonly CACHE_TTL = 300
  private readonly PLAN_ORDER = [
    SubscriptionPlan.FREE,
    SubscriptionPlan.SOLO,
    SubscriptionPlan.BUSINESS,
    SubscriptionPlan.PRO,
  ]

  constructor(
    private readonly businessesRepo: BusinessesRepository,
    private readonly planConfigsRepo: PlanConfigsRepository,
    private readonly overridesRepo: BusinessOverridesRepository,
    private readonly redis: RedisService,
  ) {}

  async getEffectivePermissions(businessId: string): Promise<Resource[]> {
    const cacheKey = `permissions:${businessId}`
    const cached = await this.redis.get(cacheKey)
    if (cached) {
      return JSON.parse(cached) as Resource[]
    }

    const entitlement = await this.getBusinessEntitlement(businessId)
    if (!entitlement) {
      return []
    }

    const [planConfig, overrides] = await Promise.all([
      this.planConfigsRepo.findOne({ where: { plan: entitlement.effectivePlan } }),
      this.getActiveOverrides(businessId),
    ])

    const permissions = new Set<Resource>(
      (planConfig?.resources ?? DEFAULT_PLAN_RESOURCES[entitlement.effectivePlan]) as Resource[],
    )

    for (const override of overrides) {
      const resource = override.resource as Resource
      if (override.granted) {
        permissions.add(resource)
      } else {
        permissions.delete(resource)
      }
    }

    const result = Array.from(permissions)
    const ttlSeconds = this.resolvePermissionCacheTtlSeconds(entitlement, overrides)
    if (ttlSeconds !== null) {
      await this.redis.setex(cacheKey, ttlSeconds, JSON.stringify(result))
    }

    return result
  }

  async buildAuthPermissions(businessId: string): Promise<AuthPermissions> {
    const entitlement = await this.getBusinessEntitlement(businessId)
    if (!entitlement) {
      const now = Date.now()
      return {
        plan: SubscriptionPlan.FREE,
        effectivePermissions: [],
        specialPermissions: [],
        permissionsIssuedAt: now,
        permissionsExpiresAt: null,
      }
    }

    const [effectivePermissions, overrides] = await Promise.all([
      this.getEffectivePermissions(businessId),
      this.getActiveOverrides(businessId),
    ])

    const specialPermissions: SpecialPermission[] = overrides.map((override) => ({
      resource: override.resource as Resource,
      grantedAt: override.grantedAt.getTime(),
      expiresAt: override.expiresAt?.getTime() ?? null,
      grantedBy: override.grantedBy,
      reason: override.reason,
      isRevocation: !override.granted,
    }))

    return {
      // `plan` intentionally remains the selected plan. Consumers that need the
      // currently-usable plan can compare `permissionsExpiresAt` with "now" or
      // ask the dedicated plan-state endpoint for the server-computed fallback.
      plan: entitlement.selectedPlan,
      effectivePermissions,
      specialPermissions,
      permissionsIssuedAt: Date.now(),
      permissionsExpiresAt: entitlement.entitlementExpiresAt,
    }
  }

  async getBusinessEntitlement(businessId: string): Promise<ResolvedBusinessEntitlement | null> {
    const business = await this.businessesRepo.findOne({
      where: { id: businessId },
      select: {
        id: true,
        plan: true,
        subscriptionStatus: true,
        trialStartedAt: true,
        trialEndsAt: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
      } as any,
    })

    return business ? this.resolveBusinessEntitlement(business) : null
  }

  resolveBusinessEntitlement(
    business: BusinessEntitlementFields,
    nowMs: number = Date.now(),
  ): ResolvedBusinessEntitlement {
    const selectedPlan = business.plan ?? SubscriptionPlan.FREE
    if (selectedPlan === SubscriptionPlan.FREE) {
      return {
        selectedPlan,
        effectivePlan: SubscriptionPlan.FREE,
        entitlementValid: true,
        entitlementExpiresAt: null,
        business,
      }
    }

    const trialEndsAtMs = business.trialEndsAt?.getTime() ?? null
    const periodEndsAtMs = business.currentPeriodEnd?.getTime() ?? null

    if (business.subscriptionStatus === SubscriptionStatus.TRIAL) {
      const entitlementValid = trialEndsAtMs !== null && nowMs <= trialEndsAtMs
      return {
        selectedPlan,
        effectivePlan: entitlementValid ? selectedPlan : SubscriptionPlan.FREE,
        entitlementValid,
        entitlementExpiresAt: trialEndsAtMs,
        business,
      }
    }

    if (
      business.subscriptionStatus === SubscriptionStatus.PAST_DUE ||
      business.subscriptionStatus === SubscriptionStatus.CANCELLED ||
      business.subscriptionStatus === SubscriptionStatus.SUSPENDED
    ) {
      const entitlementValid = periodEndsAtMs !== null && nowMs <= periodEndsAtMs
      return {
        selectedPlan,
        effectivePlan: entitlementValid ? selectedPlan : SubscriptionPlan.FREE,
        entitlementValid,
        entitlementExpiresAt: periodEndsAtMs,
        business,
      }
    }

    if (periodEndsAtMs !== null) {
      const entitlementValid = nowMs <= periodEndsAtMs
      return {
        selectedPlan,
        effectivePlan: entitlementValid ? selectedPlan : SubscriptionPlan.FREE,
        entitlementValid,
        entitlementExpiresAt: periodEndsAtMs,
        business,
      }
    }

    return {
      selectedPlan,
      effectivePlan: selectedPlan,
      entitlementValid: true,
      entitlementExpiresAt: null,
      business,
    }
  }

  async getQuotaMapForPlan(plan: SubscriptionPlan): Promise<PlanQuotaMap> {
    const config = await this.planConfigsRepo.findOne({ where: { plan } })
    return this.normalizeQuotaMap(plan, config?.quotas)
  }

  async getQuotaMapForBusiness(businessId: string): Promise<PlanQuotaMap> {
    const entitlement = await this.getBusinessEntitlement(businessId)
    if (!entitlement) {
      return DEFAULT_PLAN_QUOTAS[SubscriptionPlan.FREE]
    }

    const config = await this.planConfigsRepo.findOne({
      where: { plan: entitlement.effectivePlan },
    })
    return this.normalizeQuotaMap(entitlement.effectivePlan, config?.quotas)
  }

  async invalidateCache(businessId: string): Promise<void> {
    await this.redis.del(`permissions:${businessId}`)
  }

  async getMinimumPlanFor(resource: Resource): Promise<SubscriptionPlan> {
    const configs = await this.planConfigsRepo.find()

    for (const plan of this.PLAN_ORDER) {
      const config = configs.find((candidate) => candidate.plan === plan)
      const resources = (config?.resources ?? DEFAULT_PLAN_RESOURCES[plan]) as Resource[]
      if (resources.includes(resource)) {
        return plan
      }
    }

    return SubscriptionPlan.PRO
  }

  async getMinimumPlanForQuota(
    resource: PlanQuotaResource,
    requiredUsage: number,
  ): Promise<SubscriptionPlan | null> {
    for (const plan of this.PLAN_ORDER) {
      const quotas = await this.getQuotaMapForPlan(plan)
      const limit = quotas[resource]
      if (limit === null || limit >= requiredUsage) {
        return plan
      }
    }

    return null
  }

  private async getActiveOverrides(businessId: string) {
    return this.overridesRepo.find({
      where: [
        { businessId, expiresAt: IsNull() },
        { businessId, expiresAt: MoreThan(new Date()) },
      ] as any,
    })
  }

  private normalizeQuotaMap(
    plan: SubscriptionPlan,
    quotas: Partial<Record<PlanQuotaResource, number | null>> | null | undefined,
  ): PlanQuotaMap {
    const fallback = DEFAULT_PLAN_QUOTAS[plan]
    return {
      products: quotas?.products ?? fallback.products,
      contacts: quotas?.contacts ?? fallback.contacts,
      categories: quotas?.categories ?? fallback.categories,
      users: quotas?.users ?? fallback.users,
    }
  }

  private resolvePermissionCacheTtlSeconds(
    entitlement: ResolvedBusinessEntitlement,
    overrides: Array<{ expiresAt?: Date | null }>,
  ): number | null {
    const nowMs = Date.now()
    let ttlSeconds = this.CACHE_TTL

    if (entitlement.entitlementExpiresAt !== null) {
      ttlSeconds = Math.min(
        ttlSeconds,
        Math.floor((entitlement.entitlementExpiresAt - nowMs) / 1000),
      )
    }

    for (const override of overrides) {
      if (!override.expiresAt) {
        continue
      }

      ttlSeconds = Math.min(
        ttlSeconds,
        Math.floor((override.expiresAt.getTime() - nowMs) / 1000),
      )
    }

    return ttlSeconds > 0 ? ttlSeconds : null
  }
}
