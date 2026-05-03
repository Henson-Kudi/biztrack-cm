import type {
  Business,
  BusinessMembershipBusinessSummary,
  BusinessMembershipSummary,
} from '@biztrack/types'
import { Business as BusinessEntity } from '@/entities/business.entity'
import { BusinessMember } from '@/entities/business-member.entity'
import { toIsoString } from '@/common/http/serialization'

export class BusinessDto implements Business {
  id!: string
  name!: string
  slug!: string
  description?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  country!: string
  type!: Business['type']
  currency!: Business['currency']
  logoUrl?: string | null
  ownerId!: string
  plan!: Business['plan']
  subscriptionStatus!: Business['subscriptionStatus']
  businessStatus!: Business['businessStatus']
  trialStartedAt?: string | null
  trialEndsAt?: string | null
  currentPeriodStart?: string | null
  currentPeriodEnd?: string | null
  cancelAtPeriodEnd!: boolean
  createdAt!: string
  updatedAt!: string

  static fromEntity(entity?: BusinessEntity | null): BusinessDto | null {
    if (!entity) return null

    const dto = new BusinessDto()
    dto.id = entity.id
    dto.name = entity.name
    dto.slug = entity.slug
    dto.description = entity.description ?? null
    dto.phone = entity.phone ?? null
    dto.email = entity.email ?? null
    dto.address = entity.address ?? null
    dto.city = entity.city ?? null
    dto.country = entity.country
    dto.type = entity.type as Business['type']
    dto.currency = entity.currency
    dto.logoUrl = entity.logoUrl ?? null
    dto.ownerId = entity.ownerId
    dto.plan = entity.plan
    dto.subscriptionStatus = entity.subscriptionStatus as Business['subscriptionStatus']
    dto.businessStatus = entity.businessStatus
    dto.trialStartedAt = toIsoString(entity.trialStartedAt)
    dto.trialEndsAt = toIsoString(entity.trialEndsAt)
    dto.currentPeriodStart = toIsoString(entity.currentPeriodStart)
    dto.currentPeriodEnd = toIsoString(entity.currentPeriodEnd)
    dto.cancelAtPeriodEnd = entity.cancelAtPeriodEnd
    dto.createdAt = toIsoString(entity.createdAt) ?? ''
    dto.updatedAt = toIsoString(entity.updatedAt) ?? ''
    return dto
  }
}

export class BusinessMembershipBusinessSummaryDto implements BusinessMembershipBusinessSummary {
  id!: string
  name!: string
  slug!: string
  city?: string | null
  type?: BusinessMembershipBusinessSummary['type']
  plan?: BusinessMembershipBusinessSummary['plan']
  businessStatus?: BusinessMembershipBusinessSummary['businessStatus']

  static fromEntity(entity?: BusinessEntity | null): BusinessMembershipBusinessSummaryDto | null {
    if (!entity) return null

    const dto = new BusinessMembershipBusinessSummaryDto()
    dto.id = entity.id
    dto.name = entity.name
    dto.slug = entity.slug
    dto.city = entity.city ?? null
    dto.type = entity.type as BusinessMembershipBusinessSummary['type']
    dto.plan = entity.plan
    dto.businessStatus = entity.businessStatus
    return dto
  }
}

export class BusinessMembershipSummaryDto implements BusinessMembershipSummary {
  businessId!: string
  role!: BusinessMembershipSummary['role']
  status!: BusinessMembershipSummary['status']
  business!: BusinessMembershipSummary['business']

  static fromEntity(entity: BusinessMember): BusinessMembershipSummaryDto {
    const dto = new BusinessMembershipSummaryDto()
    dto.businessId = entity.businessId
    dto.role = entity.role
    dto.status = entity.status
    dto.business = BusinessMembershipBusinessSummaryDto.fromEntity(entity.business)
    return dto
  }
}
