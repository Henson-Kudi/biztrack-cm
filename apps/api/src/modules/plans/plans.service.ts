import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AuthNextStep, BusinessStatus, DEFAULT_PLAN_QUOTAS, SubscriptionPlan, type PlanQuotaMap } from '@biztrack/types'
import type {
  ListPlansResponse,
  PlanStateResponse,
  QuotaUsageResponse,
} from '@biztrack/types'
import type { AppConfig } from '@/config/configuration'
import { SubscriptionStatus } from '@/entities/business.entity'
import { SubscriptionEventType } from '@/entities/subscription-event.entity'
import { BusinessesRepository } from '@/modules/business/repositories/businesses.repository'
import { PermissionsService } from '@/modules/permissions/permissions.service'
import { QuotaService } from '@/modules/permissions/quota.service'
import { PlanConfigsRepository } from '@/modules/permissions/repositories/plan-configs.repository'
import { SubscriptionEventsRepository } from '@/modules/subscriptions/repositories/subscription-events.repository'
import { I18nService } from 'nestjs-i18n'
import type { I18nTranslations } from '@/i18n/i18n.types'

const PLAN_STATE_STALE_AFTER_MS = 24 * 60 * 60 * 1000

@Injectable()
export class PlansService {
  constructor(
    private readonly businessesRepo: BusinessesRepository,
    private readonly planConfigsRepo: PlanConfigsRepository,
    private readonly subscriptionEventsRepo: SubscriptionEventsRepository,
    private readonly permissionsService: PermissionsService,
    private readonly quotaService: QuotaService,
    private readonly config: ConfigService<AppConfig>,
    private readonly i18n: I18nService<I18nTranslations>,
  ) {}

  async listPlans(businessId: string): Promise<ListPlansResponse> {
    const plans = await this.planConfigsRepo.find({ order: { priceXAF: 'ASC' } })
    const business = await this.businessesRepo.findOne({ where: { id: businessId } })
    const planOrder = [SubscriptionPlan.FREE, SubscriptionPlan.SOLO, SubscriptionPlan.BUSINESS, SubscriptionPlan.PRO]
    const byPlan = new Map(plans.map((plan) => [plan.plan, plan]))
    const paidTrialDays = this.getPaidPlanTrialDays()

    return {
      plans: planOrder
        .map((name) => byPlan.get(name))
        .filter(Boolean)
        .map((plan, index) => {
          const inheritsFrom = index > 0 ? planOrder[index - 1] : null
          const baseResources = inheritsFrom ? byPlan.get(inheritsFrom)?.resources ?? [] : []
          return {
            name: plan!.plan,
            displayName: plan!.displayName,
            priceXAF: plan!.priceXAF,
            trialDays: plan!.plan === SubscriptionPlan.FREE ? 0 : paidTrialDays,
            resources: plan!.resources,
            quotas: awaitableQuotaMap(plan!.plan, plan!.quotas),
            inheritsFrom: inheritsFrom ?? null,
            additionalResources: plan!.resources.filter((resource) => !baseResources.includes(resource)),
          }
        }),
      currentPlan: business?.plan ?? null,
    }
  }

  async selectPlan(businessId: string, plan: SubscriptionPlan) {
    const business = await this.businessesRepo.findOne({ where: { id: businessId } })
    if (!business) {
      throw new Error(await this.i18n.translate('errors.business_not_found'))
    }

    const paidTrialDays = this.getPaidPlanTrialDays()
    const now = new Date()
    const subscriptionState = this.buildSubscriptionStateForPlanChange(
      business,
      plan,
      now,
      paidTrialDays,
    )
    await this.businessesRepo.update(business.id, subscriptionState.persistedFields)

    await this.subscriptionEventsRepo.createOne({
      businessId: business.id,
      event: SubscriptionEventType.PLAN_SELECTED,
      toPlan: plan,
    })

    await this.permissionsService.invalidateCache(business.id)
    const authPermissions = await this.permissionsService.buildAuthPermissions(business.id)

    return {
      nextStep: AuthNextStep.DASHBOARD,
      message:
        plan === SubscriptionPlan.FREE
          ? await this.i18n.translate('plans.free_selected')
          : await this.i18n.translate('plans.selected', { args: { plan, days: paidTrialDays } }),
      authPermissions,
      subscription: {
        status: subscriptionState.status,
        trialEndsAt: subscriptionState.trialEndsAt,
        trialDaysRemaining: subscriptionState.trialDaysRemaining,
      },
    }
  }

  async mySubscription(businessId: string) {
    const business = await this.businessesRepo.findOne({ where: { id: businessId } })
    if (!business) {
      throw new Error(await this.i18n.translate('errors.business_not_found'))
    }

    const now = Date.now()
    const trialEndsAt = business.trialEndsAt?.getTime() ?? null
    const trialDaysRemaining =
      trialEndsAt && trialEndsAt > now ? Math.ceil((trialEndsAt - now) / (24 * 60 * 60 * 1000)) : 0

    return {
      plan: business.plan,
      status: business.subscriptionStatus,
      trialEndsAt: business.trialEndsAt ?? null,
      trialDaysRemaining,
      currentPeriodEnd: business.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: business.cancelAtPeriodEnd,
      paymentConfigured: false,
    }
  }

  async upgradePlan(businessId: string, plan: SubscriptionPlan) {
    const business = await this.businessesRepo.findOne({ where: { id: businessId } })
    if (!business) {
      throw new Error(await this.i18n.translate('errors.business_not_found'))
    }

    const fromPlan = business.plan
    const subscriptionState = this.buildSubscriptionStateForPlanChange(
      business,
      plan,
      new Date(),
      this.getPaidPlanTrialDays(),
    )
    await this.businessesRepo.update(business.id, subscriptionState.persistedFields)
    await this.subscriptionEventsRepo.createOne({
      businessId: business.id,
      event: plan === fromPlan ? SubscriptionEventType.PLAN_SELECTED : SubscriptionEventType.PLAN_UPGRADED,
      fromPlan,
      toPlan: plan,
    })
    await this.permissionsService.invalidateCache(business.id)
    const authPermissions = await this.permissionsService.buildAuthPermissions(business.id)

    return { authPermissions }
  }

  async cancelPlan(businessId: string) {
    const business = await this.businessesRepo.findOne({ where: { id: businessId } })
    if (!business) {
      throw new Error(await this.i18n.translate('errors.business_not_found'))
    }

    await this.businessesRepo.update(business.id, { cancelAtPeriodEnd: true })
    await this.subscriptionEventsRepo.createOne({
      businessId: business.id,
      event: SubscriptionEventType.CANCELLED,
    })

    return { cancelAtPeriodEnd: true, currentPeriodEnd: business.currentPeriodEnd ?? null }
  }

  async getPlanState(businessId: string): Promise<PlanStateResponse> {
    const entitlement = await this.permissionsService.getBusinessEntitlement(businessId)
    if (!entitlement) {
      throw new Error(await this.i18n.translate('errors.business_not_found'))
    }

    const [authPermissions, quotas, quotaUsage] = await Promise.all([
      this.permissionsService.buildAuthPermissions(businessId),
      this.permissionsService.getQuotaMapForBusiness(businessId),
      this.quotaService.getQuotaUsage(businessId),
    ])

    const fetchedAt = new Date()

    return {
      selectedPlan: entitlement.selectedPlan,
      effectivePlan: entitlement.effectivePlan,
      status: entitlement.business.subscriptionStatus,
      trialStartedAt: entitlement.business.trialStartedAt?.toISOString() ?? null,
      trialEndsAt: entitlement.business.trialEndsAt?.toISOString() ?? null,
      currentPeriodStart: entitlement.business.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: entitlement.business.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: entitlement.business.cancelAtPeriodEnd,
      entitlementValid: entitlement.entitlementValid,
      entitlementExpiresAt:
        entitlement.entitlementExpiresAt !== null
          ? new Date(entitlement.entitlementExpiresAt).toISOString()
          : null,
      fetchedAt: fetchedAt.toISOString(),
      staleAfter: new Date(fetchedAt.getTime() + PLAN_STATE_STALE_AFTER_MS).toISOString(),
      authPermissions,
      quotas,
      quotaUsage,
    }
  }

  async getQuotaUsage(businessId: string): Promise<QuotaUsageResponse> {
    const entitlement = await this.permissionsService.getBusinessEntitlement(businessId)
    if (!entitlement) {
      throw new Error(await this.i18n.translate('errors.business_not_found'))
    }

    return {
      selectedPlan: entitlement.selectedPlan,
      effectivePlan: entitlement.effectivePlan,
      entitlementValid: entitlement.entitlementValid,
      fetchedAt: new Date().toISOString(),
      quotaUsage: await this.quotaService.getQuotaUsage(businessId),
    }
  }

  private getPaidPlanTrialDays(): number {
    return this.config.get('MVP_PAID_PLAN_TRIAL_DAYS', { infer: true }) || 180
  }

  private buildSubscriptionStateForPlanChange(
    business: {
      plan: SubscriptionPlan
      subscriptionStatus: SubscriptionStatus
      trialStartedAt?: Date | null
      trialEndsAt?: Date | null
      currentPeriodStart?: Date | null
      currentPeriodEnd?: Date | null
      cancelAtPeriodEnd?: boolean
    },
    plan: SubscriptionPlan,
    now: Date,
    paidTrialDays: number,
  ) {
    if (plan === SubscriptionPlan.FREE) {
      return {
        status: SubscriptionStatus.ACTIVE,
        trialEndsAt: null,
        trialDaysRemaining: 0,
        persistedFields: {
          plan,
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          trialStartedAt: null,
          trialEndsAt: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          businessStatus: BusinessStatus.ACTIVE,
        },
      }
    }

    const hasLiveTrial =
      business.subscriptionStatus === SubscriptionStatus.TRIAL &&
      Boolean(business.trialEndsAt) &&
      business.trialEndsAt!.getTime() > now.getTime()

    if (hasLiveTrial) {
      const remainingMs = Math.max(0, business.trialEndsAt!.getTime() - now.getTime())
      return {
        status: SubscriptionStatus.TRIAL,
        trialEndsAt: business.trialEndsAt ?? null,
        trialDaysRemaining: Math.ceil(remainingMs / (24 * 60 * 60 * 1000)),
        // We intentionally preserve the original paid-plan trial window when a
        // business switches between paid plans mid-trial. That prevents plan
        // hopping from silently resetting the MVP trial clock.
        persistedFields: {
          plan,
          subscriptionStatus: SubscriptionStatus.TRIAL,
          trialStartedAt: business.trialStartedAt ?? now,
          trialEndsAt: business.trialEndsAt ?? null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          businessStatus: BusinessStatus.ACTIVE,
        },
      }
    }

    const hasActivePaidEntitlement =
      business.plan !== SubscriptionPlan.FREE &&
      [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE].includes(
        business.subscriptionStatus,
      )

    if (hasActivePaidEntitlement) {
      return {
        status: business.subscriptionStatus,
        trialEndsAt: business.trialEndsAt ?? null,
        trialDaysRemaining: 0,
        persistedFields: {
          plan,
          subscriptionStatus: business.subscriptionStatus,
          trialStartedAt: business.trialStartedAt ?? null,
          trialEndsAt: business.trialEndsAt ?? null,
          currentPeriodStart: business.currentPeriodStart ?? null,
          currentPeriodEnd: business.currentPeriodEnd ?? null,
          cancelAtPeriodEnd: business.cancelAtPeriodEnd ?? false,
          businessStatus: BusinessStatus.ACTIVE,
        },
      }
    }

    const trialEndsAt = new Date(now.getTime() + paidTrialDays * 24 * 60 * 60 * 1000)
    return {
      status: SubscriptionStatus.TRIAL,
      trialEndsAt,
      trialDaysRemaining: paidTrialDays,
      persistedFields: {
        plan,
        subscriptionStatus: SubscriptionStatus.TRIAL,
        trialStartedAt: now,
        trialEndsAt,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        businessStatus: BusinessStatus.ACTIVE,
      },
    }
  }
}

function awaitableQuotaMap(
  plan: SubscriptionPlan,
  quotas: Partial<PlanQuotaMap> | null | undefined,
): PlanQuotaMap {
  const fallback = DEFAULT_PLAN_QUOTAS[plan]
  return {
    products: quotas?.products ?? fallback.products,
    contacts: quotas?.contacts ?? fallback.contacts,
    categories: quotas?.categories ?? fallback.categories,
    users: quotas?.users ?? fallback.users,
  }
}
