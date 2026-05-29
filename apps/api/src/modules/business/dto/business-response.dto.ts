import type {
  Business,
  BusinessMembershipBusinessSummary,
  BusinessMembershipSummary,
  ListTeamMembersResponse,
  RemoveTeamMemberResponse,
  TeamMember,
  UpdateMemberRoleResponse,
} from '@biztrack/types'
import { Business as BusinessEntity, BusinessType } from '@/entities/business.entity'
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
  id!: BusinessMembershipBusinessSummary['id']
  name!: BusinessMembershipBusinessSummary['name']
  slug!: BusinessMembershipBusinessSummary['slug']
  city!: BusinessMembershipBusinessSummary['city']
  type!: BusinessMembershipBusinessSummary['type']
  plan!: BusinessMembershipBusinessSummary['plan']
  businessStatus!: BusinessMembershipBusinessSummary['businessStatus']
  description!: BusinessMembershipBusinessSummary['description']
  phone!: BusinessMembershipBusinessSummary['phone']
  email!: BusinessMembershipBusinessSummary['email']
  address!: BusinessMembershipBusinessSummary['address']
  currency!: BusinessMembershipBusinessSummary['currency']
  logoUrl!: BusinessMembershipBusinessSummary['logoUrl']
  ownerId!: BusinessMembershipBusinessSummary['ownerId']
  owner!: BusinessMembershipBusinessSummary['owner']
  subscriptionStatus!: BusinessMembershipBusinessSummary['subscriptionStatus']
  trialStartedAt!: BusinessMembershipBusinessSummary['trialStartedAt']
  trialEndsAt!: BusinessMembershipBusinessSummary['trialEndsAt']
  currentPeriodStart!: BusinessMembershipBusinessSummary['currentPeriodStart']
  currentPeriodEnd!: BusinessMembershipBusinessSummary['currentPeriodEnd']
  cancelAtPeriodEnd!: BusinessMembershipBusinessSummary['cancelAtPeriodEnd']


  static fromEntity(entity?: BusinessEntity | null): BusinessMembershipBusinessSummaryDto | null {
    if (!entity) return null

    const dto = new BusinessMembershipBusinessSummaryDto()
    dto.id = entity.id
    dto.name = entity.name
    dto.slug = entity.slug
    dto.city = entity.city ?? null
    dto.type = entity.type
    dto.plan = entity.plan
    dto.businessStatus = entity.businessStatus
    dto.description = entity.description ?? null
    dto.phone = entity.phone ?? null
    dto.email = entity.email ?? null
    dto.address = entity.address ?? null
    dto.currency = entity.currency
    dto.logoUrl = entity.logoUrl ?? null
    dto.ownerId = entity.ownerId
    dto.owner = entity.owner ? entity.owner.name : null
    dto.subscriptionStatus = entity.subscriptionStatus
    dto.trialStartedAt = toIsoString(entity.trialStartedAt)
    dto.trialEndsAt = toIsoString(entity.trialEndsAt)
    dto.currentPeriodStart = toIsoString(entity.currentPeriodStart)
    dto.currentPeriodEnd = toIsoString(entity.currentPeriodEnd)
    dto.cancelAtPeriodEnd = entity.cancelAtPeriodEnd
    
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

export class TeamMemberDto implements TeamMember {
  memberId!: string
  userId!: string
  roleId!: string
  roleName!: string
  role!: TeamMember['role']
  status!: TeamMember['status']
  name!: string | null
  email!: string | null
  phone!: string | null
  joinedAt!: string

  static fromModel(m: TeamMember): TeamMemberDto {
    const dto = new TeamMemberDto()
    dto.memberId = m.memberId
    dto.userId = m.userId
    dto.roleId = m.roleId
    dto.roleName = m.roleName
    dto.role = m.role
    dto.status = m.status
    dto.name = m.name
    dto.email = m.email
    dto.phone = m.phone
    dto.joinedAt = m.joinedAt
    return dto
  }
}

export class ListTeamMembersResponseDto implements ListTeamMembersResponse {
  members!: TeamMember[]

  static fromModel(response: ListTeamMembersResponse): ListTeamMembersResponseDto {
    const dto = new ListTeamMembersResponseDto()
    dto.members = response.members.map((m) => TeamMemberDto.fromModel(m))
    return dto
  }
}

export class RemoveTeamMemberResponseDto implements RemoveTeamMemberResponse {
  removed!: boolean

  static fromModel(response: RemoveTeamMemberResponse): RemoveTeamMemberResponseDto {
    const dto = new RemoveTeamMemberResponseDto()
    dto.removed = response.removed
    return dto
  }
}

export class UpdateMemberRoleResponseDto implements UpdateMemberRoleResponse {
  memberId!: string
  roleId!: string
  roleName!: string
  role!: UpdateMemberRoleResponse['role']

  static fromModel(response: UpdateMemberRoleResponse): UpdateMemberRoleResponseDto {
    const dto = new UpdateMemberRoleResponseDto()
    dto.memberId = response.memberId
    dto.roleId = response.roleId
    dto.roleName = response.roleName
    dto.role = response.role
    return dto
  }
}

