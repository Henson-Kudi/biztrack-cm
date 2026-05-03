import type {
  CancelPlanResponse,
  CurrentSubscriptionResponse,
  ListPlansResponse,
  PlanResourceSummary,
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
