import type {
  CancelPlanResponse,
  CurrentSubscriptionResponse,
  ListPlansResponse,
  PlanResourceSummary,
  PlanStateResponse,
  QuotaUsageResponse,
  SelectPlanResponse,
  UpgradePlanResponse,
} from '@biztrack/types'
import { toIsoString } from '@/common/http/serialization'

export class PlanResourceSummaryDto implements PlanResourceSummary {
  name!: PlanResourceSummary['name']
  displayName!: string
  priceXAF!: number
  trialDays!: number
  resources!: string[]
  quotas!: PlanResourceSummary['quotas']
  inheritsFrom!: PlanResourceSummary['inheritsFrom']
  additionalResources!: string[]

  static fromModel(model: Omit<PlanResourceSummary, 'inheritsFrom'> & { inheritsFrom?: PlanResourceSummary['inheritsFrom'] }): PlanResourceSummaryDto {
    const dto = new PlanResourceSummaryDto()
    Object.assign(dto, model)
    dto.inheritsFrom = model.inheritsFrom ?? null
    return dto
  }
}

export class ListPlansResponseDto implements ListPlansResponse {
  plans!: PlanResourceSummaryDto[]
  currentPlan!: ListPlansResponse['currentPlan']

  static fromModel(model: {
    plans: Array<Omit<PlanResourceSummary, 'inheritsFrom'> & { inheritsFrom?: PlanResourceSummary['inheritsFrom'] }>
    currentPlan: ListPlansResponse['currentPlan']
  }): ListPlansResponseDto {
    const dto = new ListPlansResponseDto()
    dto.plans = model.plans.map((plan) => PlanResourceSummaryDto.fromModel(plan))
    dto.currentPlan = model.currentPlan
    return dto
  }
}

export class SelectPlanResponseDto implements SelectPlanResponse {
  nextStep!: SelectPlanResponse['nextStep']
  message!: string
  authPermissions!: SelectPlanResponse['authPermissions']
  subscription!: SelectPlanResponse['subscription']

  static fromModel(model: {
    nextStep: SelectPlanResponse['nextStep']
    message: string
    authPermissions: SelectPlanResponse['authPermissions']
    subscription: {
      status: SelectPlanResponse['subscription']['status']
      trialEndsAt: Date | string | number | null
      trialDaysRemaining: number
    }
  }): SelectPlanResponseDto {
    const dto = new SelectPlanResponseDto()
    dto.nextStep = model.nextStep
    dto.message = model.message
    dto.authPermissions = model.authPermissions
    dto.subscription = {
      status: model.subscription.status,
      trialEndsAt: toIsoString(model.subscription.trialEndsAt) ?? null,
      trialDaysRemaining: model.subscription.trialDaysRemaining,
    }
    return dto
  }
}

export class CurrentSubscriptionResponseDto implements CurrentSubscriptionResponse {
  plan!: CurrentSubscriptionResponse['plan']
  status!: CurrentSubscriptionResponse['status']
  trialEndsAt!: string | null
  trialDaysRemaining!: number
  currentPeriodEnd!: string | null
  cancelAtPeriodEnd!: boolean
  paymentConfigured!: boolean

  static fromModel(model: {
    plan: CurrentSubscriptionResponse['plan']
    status: CurrentSubscriptionResponse['status']
    trialEndsAt: Date | string | number | null
    trialDaysRemaining: number
    currentPeriodEnd: Date | string | number | null
    cancelAtPeriodEnd: boolean
    paymentConfigured: boolean
  }): CurrentSubscriptionResponseDto {
    const dto = new CurrentSubscriptionResponseDto()
    dto.plan = model.plan
    dto.status = model.status
    dto.trialEndsAt = toIsoString(model.trialEndsAt) ?? null
    dto.trialDaysRemaining = model.trialDaysRemaining
    dto.currentPeriodEnd = toIsoString(model.currentPeriodEnd) ?? null
    dto.cancelAtPeriodEnd = model.cancelAtPeriodEnd
    dto.paymentConfigured = model.paymentConfigured
    return dto
  }
}

export class UpgradePlanResponseDto implements UpgradePlanResponse {
  authPermissions!: UpgradePlanResponse['authPermissions']

  static fromModel(model: UpgradePlanResponse): UpgradePlanResponseDto {
    return Object.assign(new UpgradePlanResponseDto(), model)
  }
}

export class CancelPlanResponseDto implements CancelPlanResponse {
  cancelAtPeriodEnd!: boolean
  currentPeriodEnd!: string | null

  static fromModel(model: {
    cancelAtPeriodEnd: boolean
    currentPeriodEnd: Date | string | number | null
  }): CancelPlanResponseDto {
    const dto = new CancelPlanResponseDto()
    dto.cancelAtPeriodEnd = model.cancelAtPeriodEnd
    dto.currentPeriodEnd = toIsoString(model.currentPeriodEnd) ?? null
    return dto
  }
}

export class PlanStateResponseDto implements PlanStateResponse {
  selectedPlan!: PlanStateResponse['selectedPlan']
  effectivePlan!: PlanStateResponse['effectivePlan']
  status!: PlanStateResponse['status']
  trialStartedAt!: string | null
  trialEndsAt!: string | null
  currentPeriodStart!: string | null
  currentPeriodEnd!: string | null
  cancelAtPeriodEnd!: boolean
  entitlementValid!: boolean
  entitlementExpiresAt!: string | null
  fetchedAt!: string
  staleAfter!: string
  authPermissions!: PlanStateResponse['authPermissions']
  quotas!: PlanStateResponse['quotas']
  quotaUsage!: PlanStateResponse['quotaUsage']

  static fromModel(model: Omit<PlanStateResponse, 'fetchedAt' | 'staleAfter'> & {
    fetchedAt: Date | string | number
    staleAfter: Date | string | number
  }): PlanStateResponseDto {
    const dto = new PlanStateResponseDto()
    dto.selectedPlan = model.selectedPlan
    dto.effectivePlan = model.effectivePlan
    dto.status = model.status
    dto.trialStartedAt = toIsoString(model.trialStartedAt) ?? null
    dto.trialEndsAt = toIsoString(model.trialEndsAt) ?? null
    dto.currentPeriodStart = toIsoString(model.currentPeriodStart) ?? null
    dto.currentPeriodEnd = toIsoString(model.currentPeriodEnd) ?? null
    dto.cancelAtPeriodEnd = model.cancelAtPeriodEnd
    dto.entitlementValid = model.entitlementValid
    dto.entitlementExpiresAt = toIsoString(model.entitlementExpiresAt) ?? null
    dto.fetchedAt = toIsoString(model.fetchedAt) ?? new Date().toISOString()
    dto.staleAfter = toIsoString(model.staleAfter) ?? new Date().toISOString()
    dto.authPermissions = model.authPermissions
    dto.quotas = model.quotas
    dto.quotaUsage = model.quotaUsage
    return dto
  }
}

export class QuotaUsageResponseDto implements QuotaUsageResponse {
  selectedPlan!: QuotaUsageResponse['selectedPlan']
  effectivePlan!: QuotaUsageResponse['effectivePlan']
  entitlementValid!: boolean
  fetchedAt!: string
  quotaUsage!: QuotaUsageResponse['quotaUsage']

  static fromModel(model: Omit<QuotaUsageResponse, 'fetchedAt'> & {
    fetchedAt: Date | string | number
  }): QuotaUsageResponseDto {
    const dto = new QuotaUsageResponseDto()
    dto.selectedPlan = model.selectedPlan
    dto.effectivePlan = model.effectivePlan
    dto.entitlementValid = model.entitlementValid
    dto.fetchedAt = toIsoString(model.fetchedAt) ?? new Date().toISOString()
    dto.quotaUsage = model.quotaUsage
    return dto
  }
}
