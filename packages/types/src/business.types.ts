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
  /** Generic placeholder for custom (non-system) roles */
  STAFF = 'STAFF',
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
  description?:string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  currency?: Currency | string
  logoUrl?: string | null
  ownerId?: string | null
  owner?: string | null
  subscriptionStatus?: SubscriptionStatus | null
  trialStartedAt?: IsoDateString | null
  trialEndsAt?: IsoDateString | null
  currentPeriodStart?: IsoDateString | null
  currentPeriodEnd?: IsoDateString | null
  cancelAtPeriodEnd?: boolean | null
}

export interface BusinessMembershipSummary {
  businessId: string
  role: BusinessMemberRole
  status: BusinessMemberStatus
  business: BusinessMembershipBusinessSummary | null
}

export interface TeamMember {
  memberId: string
  userId: string
  roleId: string
  roleName: string
  role: BusinessMemberRole | null
  status: BusinessMemberStatus
  name: string | null
  email: string | null
  phone: string | null
  joinedAt: IsoDateString
}

export interface ListTeamMembersResponse {
  members: TeamMember[]
}

export interface RemoveTeamMemberResponse {
  removed: boolean
}

export interface UpdateMemberRoleRequest {
  roleId: string
}

export interface UpdateMemberRoleResponse {
  memberId: string
  roleId: string
  roleName: string
  role: BusinessMemberRole | null
}

export interface BulkUpdateMemberRoleRequest {
  userIds: string[]
  roleId: string
}

export interface BulkUpdateMemberRoleResponse {
  updated: number
}

export type InviteStatus = 'pending' | 'expired'

export interface PendingInviteItem {
  id: string
  roleId: string
  roleName: string
  role: BusinessMemberRole | null
  phone: string | null
  email: string | null
  status: InviteStatus
  expiresAt: IsoDateString
  createdAt: IsoDateString
}

export interface ListPendingInvitesResponse {
  invites: PendingInviteItem[]
}

export interface ResendInviteResponse {
  resent: boolean
  inviteUrl: string | null
}

export interface CancelInviteResponse {
  cancelled: boolean
}
