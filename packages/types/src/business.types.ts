import type { IsoDateString } from './http.types'

export interface Business {
  id: string
  name: string
  slug: string
  description?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  country: string
  type: BusinessType
  currency: Currency | string
  logoUrl?: string | null
  ownerId: string
  plan: SubscriptionPlan
  subscriptionStatus: SubscriptionStatus
  businessStatus: BusinessStatus
  trialStartedAt?: IsoDateString | null
  trialEndsAt?: IsoDateString | null
  currentPeriodStart?: IsoDateString | null
  currentPeriodEnd?: IsoDateString | null
  cancelAtPeriodEnd: boolean
  createdAt: IsoDateString
  updatedAt: IsoDateString
}

export enum Currency {
  XAF = 'XAF',
  USD = 'USD',
  EUR = 'EUR',
}

export enum BusinessType {
  EPICERIE = 'EPICERIE',
  BOUTIQUE = 'BOUTIQUE',
  RESTAURANT = 'RESTAURANT',
  PHARMACIE = 'PHARMACIE',
  SALON = 'SALON',
  ELECTRONIQUE = 'ELECTRONIQUE',
  AUTRE = 'AUTRE',
}

export enum SubscriptionPlan {
  FREE = 'FREE',
  SOLO = 'SOLO',
  BUSINESS = 'BUSINESS',
  PRO = 'PRO',
}

export enum SubscriptionStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELLED = 'CANCELLED',
  SUSPENDED = 'SUSPENDED',
}

export enum BusinessMemberRole {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  CASHIER = 'CASHIER',
  ACCOUNTANT = 'ACCOUNTANT',
}

export enum BusinessMemberStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  REMOVED = 'REMOVED',
}

export enum BusinessStatus {
  ONBOARDING = 'ONBOARDING',
  PLAN_PENDING = 'PLAN_PENDING',
  ACTIVE = 'ACTIVE',
}

export interface CreateBusinessRequest {
  name: string
  description?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  country?: string
  currency?: Currency | string
}

export interface UpdateBusinessRequest extends Partial<CreateBusinessRequest> {}

export interface BusinessMembershipBusinessSummary {
  id: string
  name: string
  slug: string
  city?: string | null
  type?: BusinessType | null
  plan?: SubscriptionPlan | null
  businessStatus?: BusinessStatus | null
}

export interface BusinessMembershipSummary {
  businessId: string
  role: BusinessMemberRole
  status: BusinessMemberStatus
  business: BusinessMembershipBusinessSummary | null
}

export const SUBSCRIPTION_LIMITS: Record<SubscriptionPlan, {
  maxProducts: number
  maxUsers: number
  maxDevices: number
  thermalPrinting: boolean
  advancedReports: boolean
  multiDevice: boolean
  multiBranch: boolean
  apiAccess: boolean
}> = {
  [SubscriptionPlan.FREE]: {
    maxProducts: 50,
    maxUsers: 1,
    maxDevices: 1,
    thermalPrinting: false,
    advancedReports: false,
    multiDevice: false,
    multiBranch: false,
    apiAccess: false,
  },
  [SubscriptionPlan.SOLO]: {
    maxProducts: Infinity,
    maxUsers: 1,
    maxDevices: 1,
    thermalPrinting: false,
    advancedReports: true,
    multiDevice: false,
    multiBranch: false,
    apiAccess: false,
  },
  [SubscriptionPlan.BUSINESS]: {
    maxProducts: Infinity,
    maxUsers: 3,
    maxDevices: 3,
    thermalPrinting: true,
    advancedReports: true,
    multiDevice: true,
    multiBranch: false,
    apiAccess: false,
  },
  [SubscriptionPlan.PRO]: {
    maxProducts: Infinity,
    maxUsers: Infinity,
    maxDevices: Infinity,
    thermalPrinting: true,
    advancedReports: true,
    multiDevice: true,
    multiBranch: true,
    apiAccess: true,
  },
}
