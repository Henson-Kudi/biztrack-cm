import { Injectable } from '@nestjs/common'
import { SubscriptionPlan, BusinessStatus, AuthNextStep } from '@biztrack/types'
import { BusinessesRepository } from '@/modules/business/repositories/businesses.repository'
import { PlanConfigsRepository } from '@/modules/permissions/repositories/plan-configs.repository'
import { SubscriptionEventsRepository } from '@/modules/subscriptions/repositories/subscription-events.repository'
import { PermissionsService } from '@/modules/permissions/permissions.service'
import { SubscriptionEventType } from '@/entities/subscription-event.entity'
import { SubscriptionStatus } from '@/entities/business.entity'
import { I18nService } from 'nestjs-i18n'
import type { I18nTranslations } from '@/i18n/i18n.types'

@Injectable()
export class PlansService {
  constructor(
    private businessesRepo: BusinessesRepository,
    private planConfigsRepo: PlanConfigsRepository,
    private subscriptionEventsRepo: SubscriptionEventsRepository,
    private permissionsService: PermissionsService,
    private i18n: I18nService<I18nTranslations>,
  ) {}

  async listPlans(businessId: string) {
    const plans = await this.planConfigsRepo.find({ order: { priceXAF: 'ASC' } })
    const business = await this.businessesRepo.findOne({ where: { id: businessId } })

    const planOrder = [SubscriptionPlan.FREE, SubscriptionPlan.SOLO, SubscriptionPlan.BUSINESS, SubscriptionPlan.PRO]
    const byPlan = new Map(plans.map((p) => [p.plan, p]))

    const response = planOrder
      .map((name) => byPlan.get(name))
      .filter(Boolean)
      .map((plan, index) => {
        const inheritsFrom = index > 0 ? planOrder[index - 1] : null
        const base = inheritsFrom ? byPlan.get(inheritsFrom)?.resources ?? [] : []
        const additionalResources = plan!.resources.filter((r) => !base.includes(r))
        return {
          name: plan!.plan,
          displayName: plan!.displayName,
          priceXAF: plan!.priceXAF,
          trialDays: plan!.plan === SubscriptionPlan.FREE ? 0 : 30,
          resources: plan!.resources,
          inheritsFrom,
          additionalResources,
        }
      })

    return { plans: response, currentPlan: business?.plan ?? null }
  }

  async selectPlan(businessId: string, plan: SubscriptionPlan) {
    const business = await this.businessesRepo.findOne({ where: { id: businessId } })
    if (!business) {
      throw new Error(await this.i18n.translate('errors.business_not_found'))
    }

    if (plan === SubscriptionPlan.FREE) {
      await this.businessesRepo.update(business.id, {
        plan,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        trialStartedAt: null,
        trialEndsAt: null,
        cancelAtPeriodEnd: false,
        businessStatus: BusinessStatus.ACTIVE,
      })
    } else {
      const now = new Date()
      const trialEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      await this.businessesRepo.update(business.id, {
        plan,
        subscriptionStatus: SubscriptionStatus.TRIAL,
        trialStartedAt: now,
        trialEndsAt,
        cancelAtPeriodEnd: false,
        businessStatus: BusinessStatus.ACTIVE,
      })
    }

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
          : await this.i18n.translate('plans.selected', { args: { plan, days: 30 } }),
      authPermissions,
      subscription: {
        status: plan === SubscriptionPlan.FREE ? SubscriptionStatus.ACTIVE : SubscriptionStatus.TRIAL,
        trialEndsAt: plan === SubscriptionPlan.FREE ? null : authPermissions.permissionsExpiresAt,
        trialDaysRemaining: plan === SubscriptionPlan.FREE ? 0 : 30,
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
    await this.businessesRepo.update(business.id, { plan })
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
}
