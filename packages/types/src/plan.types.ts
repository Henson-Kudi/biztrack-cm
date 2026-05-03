import type { AuthNextStep } from './auth.types'
import type { SubscriptionPlan, SubscriptionStatus } from './business.types'
import type { IsoDateString } from './http.types'
import type { AuthPermissions } from './permissions.types'

export interface PlanResourceSummary {
  name: SubscriptionPlan
  displayName: string
  priceXAF: number
  trialDays: number
  resources: string[]
  inheritsFrom: SubscriptionPlan | null
  additionalResources: string[]
}

export interface ListPlansResponse {
  plans: PlanResourceSummary[]
  currentPlan: SubscriptionPlan | null
}

export interface SelectPlanRequest {
  plan: SubscriptionPlan
}

export interface SelectPlanResponse {
  nextStep: AuthNextStep
  message: string
  authPermissions: AuthPermissions
  subscription: {
    status: SubscriptionStatus
    trialEndsAt: IsoDateString | null
    trialDaysRemaining: number
  }
}

export interface CurrentSubscriptionResponse {
  plan: SubscriptionPlan
  status: SubscriptionStatus
  trialEndsAt: IsoDateString | null
  trialDaysRemaining: number
  currentPeriodEnd: IsoDateString | null
  cancelAtPeriodEnd: boolean
  paymentConfigured: boolean
}

export interface UpgradePlanRequest {
  plan: SubscriptionPlan
}

export interface UpgradePlanResponse {
  authPermissions: AuthPermissions
}

export interface CancelPlanResponse {
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: IsoDateString | null
}
