import { Inject, Injectable } from '@nestjs/common'
import type {
  BulkUpdateMemberRoleRequest,
  BulkUpdateMemberRoleResponse,
  CreateBusinessRequest,
  JwtPayload,
  ListTeamMembersResponse,
  RemoveTeamMemberResponse,
  UpdateBusinessRequest,
  UpdateMemberRoleRequest,
  UpdateMemberRoleResponse,
} from '@biztrack/types'
import { BusinessesRepository } from './repositories/businesses.repository'
import { BusinessMembersRepository } from './repositories/business-members.repository'
import { generateSlug } from '@biztrack/utils'
import type { Logger, LogMetadata } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppForbiddenException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { I18nService } from 'nestjs-i18n'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { BusinessMemberRole, BusinessMemberStatus, BusinessStatus } from '@biztrack/types'
import { RolesService } from '@/modules/roles/roles.service'

@Injectable()
export class BusinessService {
  constructor(
    private businessRepo: BusinessesRepository,
    private membersRepo: BusinessMembersRepository,
    private rolesService: RolesService,
    private i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private logger: Logger,
  ) {
    this.logger.setContext('BusinessService')
  }

  async create(ownerId: string, dto: CreateBusinessRequest) {
    this.logger.debug('Create business', 'BusinessService', { ownerId, name: dto.name })

    try {
      const baseSlug = generateSlug(dto.name)
      const slug = await this.generateUniqueSlug(baseSlug)

      const business = this.businessRepo.create({
        ...dto,
        slug,
        ownerId,
        businessStatus: BusinessStatus.ONBOARDING,
      })
      await this.businessRepo.save(business)

      // Seed the 4 default roles for this new business
      await this.rolesService.seedDefaultRoles(business.id, ownerId)
      const ownerRole = await this.rolesService.findOwnerRole(business.id)

      const member = this.membersRepo.create({
        businessId: business.id,
        userId: ownerId,
        role: BusinessMemberRole.OWNER,
        roleId: ownerRole?.id ?? null,
        status: BusinessMemberStatus.ACTIVE,
      })
      await this.membersRepo.save(member)

      this.logger.log('Business created', 'BusinessService', { businessId: business.id, ownerId })
      return business
    } catch (error) {
      return this.handleServiceError('create', error, { ownerId, name: dto.name })
    }
  }

  async findByOwner(ownerId: string) {
    this.logger.debug('Find business by owner', 'BusinessService', { ownerId })

    try {
      const business = await this.businessRepo.findOne({
        where: { ownerId },
        relations: ['members'],
      })
      if (!business) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.business_not_found'),
          'BUSINESS_NOT_FOUND',
        )
      }
      return business
    } catch (error) {
      return this.handleServiceError('findByOwner', error, { ownerId })
    }
  }

  async findById(id: string) {
    this.logger.debug('Find business by id', 'BusinessService', { id })

    try {
      const business = await this.businessRepo.findOne({ where: { id } })
      if (!business) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.business_not_found'),
          'BUSINESS_NOT_FOUND',
        )
      }
      return business
    } catch (error) {
      return this.handleServiceError('findById', error, { id })
    }
  }

  async update(id: string, ownerId: string, dto: UpdateBusinessRequest) {
    this.logger.debug('Update business', 'BusinessService', { id, ownerId })

    try {
      const business = await this.businessRepo.findOne({ where: { id } })
      if (!business) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.business_not_found'),
          'BUSINESS_NOT_FOUND',
        )
      }
      const member = await this.membersRepo.findOne({ where: { businessId: id, userId: ownerId } })
      if (!member || member.role !== BusinessMemberRole.OWNER) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.business_forbidden'),
          'BUSINESS_FORBIDDEN',
        )
      }

      const nextStatus =
        business.businessStatus === BusinessStatus.ONBOARDING
          ? BusinessStatus.PLAN_PENDING
          : business.businessStatus
      await this.businessRepo.update(id, { ...dto, businessStatus: nextStatus })
      return this.businessRepo.findOne({ where: { id } })
    } catch (error) {
      return this.handleServiceError('update', error, { id, ownerId })
    }
  }

  async listTeamMembers(businessId: string): Promise<ListTeamMembersResponse> {
    this.logger.debug('List team members', 'BusinessService', { businessId })

    try {
      const members = await this.membersRepo.find({
        where: { businessId, status: BusinessMemberStatus.ACTIVE },
        relations: ['user', 'roleRecord'],
        order: { createdAt: 'ASC' },
      })

      return {
        members: members.map((m) => ({
          memberId: m.id,
          userId: m.userId,
          roleId: m.roleId ?? '',
          roleName: m.roleRecord?.name ?? m.role,
          role: m.role ?? null,
          status: m.status,
          name: m.user?.name ?? null,
          email: m.user?.email ?? null,
          phone: m.user?.phone ?? null,
          joinedAt: m.createdAt.toISOString(),
        })),
      }
    } catch (error) {
      return this.handleServiceError('listTeamMembers', error, { businessId })
    }
  }

  async removeMember(
    businessId: string,
    requestingUserId: string,
    targetUserId: string,
  ): Promise<RemoveTeamMemberResponse> {
    this.logger.debug('Remove team member', 'BusinessService', {
      businessId,
      requestingUserId,
      targetUserId,
    })

    try {
      const requester = await this.membersRepo.findOne({
        where: { businessId, userId: requestingUserId, status: BusinessMemberStatus.ACTIVE },
      })
      if (!requester || requester.role !== BusinessMemberRole.OWNER) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.forbidden'),
          'FORBIDDEN',
        )
      }

      if (requestingUserId === targetUserId) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.team_cannot_remove_self'),
          'TEAM_CANNOT_REMOVE_SELF',
        )
      }

      const target = await this.membersRepo.findOne({
        where: { businessId, userId: targetUserId },
      })
      if (!target) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.not_found'),
          'NOT_FOUND',
        )
      }

      await this.membersRepo.update(target.id, { status: BusinessMemberStatus.REMOVED })

      return { removed: true }
    } catch (error) {
      return this.handleServiceError('removeMember', error, {
        businessId,
        requestingUserId,
        targetUserId,
      })
    }
  }

  async updateMemberRole(
    businessId: string,
    actor: JwtPayload,
    targetUserId: string,
    dto: UpdateMemberRoleRequest,
  ): Promise<UpdateMemberRoleResponse> {
    this.logger.debug('Update member role', 'BusinessService', {
      businessId,
      actorId: actor.sub,
      targetUserId,
    })

    try {
      if (actor.sub === targetUserId) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.team_cannot_change_own_role'),
          'TEAM_CANNOT_CHANGE_OWN_ROLE',
        )
      }

      const target = await this.membersRepo.findOne({
        where: { businessId, userId: targetUserId, status: BusinessMemberStatus.ACTIVE },
        relations: ['roleRecord'],
      })
      if (!target) {
        throw new AppNotFoundException(await this.i18n.translate('errors.not_found'), 'NOT_FOUND')
      }

      // Cannot reassign the owner
      if (target.roleRecord?.isOwnerRole) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.forbidden'),
          'FORBIDDEN',
        )
      }

      const newRole = await this.rolesService.findByIdOrFail(dto.roleId, businessId)
      if (newRole.isOwnerRole) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.forbidden'),
          'FORBIDDEN',
        )
      }

      // Non-owners: must have roles:manage and pass containment on both current and new role
      if (!actor.isOwner) {
        const actorPerms = await this.rolesService.getActorPermissions(actor.roleId, businessId)
        if (!actorPerms.has('roles:manage')) {
          throw new AppForbiddenException(
            await this.i18n.translate('errors.forbidden'),
            'FORBIDDEN',
          )
        }
        // Cannot touch a member whose current role exceeds actor's permissions
        if (target.roleId) {
          await this.rolesService.assertRoleContained(target.roleId, actorPerms)
        }
        // Cannot assign a role that exceeds actor's permissions
        await this.rolesService.assertRoleContained(newRole.id, actorPerms)
      }

      const enumRole = RolesService.toMemberRoleEnum(newRole.name)
      await this.membersRepo.update(target.id, { role: enumRole, roleId: newRole.id })

      return { memberId: target.id, roleId: newRole.id, roleName: newRole.name, role: enumRole }
    } catch (error) {
      return this.handleServiceError('updateMemberRole', error, {
        businessId,
        actorId: actor.sub,
        targetUserId,
      })
    }
  }

  async bulkUpdateMemberRole(
    businessId: string,
    actor: JwtPayload,
    dto: BulkUpdateMemberRoleRequest,
  ): Promise<BulkUpdateMemberRoleResponse> {
    this.logger.debug('Bulk update member roles', 'BusinessService', {
      businessId,
      actorId: actor.sub,
      count: dto.userIds.length,
    })

    try {
      const newRole = await this.rolesService.findByIdOrFail(dto.roleId, businessId)
      if (newRole.isOwnerRole) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.forbidden'),
          'FORBIDDEN',
        )
      }

      let actorPerms: Set<string> | null = null
      if (!actor.isOwner) {
        actorPerms = await this.rolesService.getActorPermissions(actor.roleId, businessId)
        if (!actorPerms.has('roles:manage')) {
          throw new AppForbiddenException(
            await this.i18n.translate('errors.forbidden'),
            'FORBIDDEN',
          )
        }
        await this.rolesService.assertRoleContained(newRole.id, actorPerms)
      }

      const members = await this.membersRepo.find({
        where: { businessId, status: BusinessMemberStatus.ACTIVE },
        relations: ['roleRecord'],
      })

      const eligibleMembers = members.filter(
        (m) =>
          dto.userIds.includes(m.userId) &&
          m.userId !== actor.sub &&
          !m.roleRecord?.isOwnerRole,
      )

      if (!actor.isOwner && actorPerms) {
        for (const m of eligibleMembers) {
          if (m.roleId) {
            await this.rolesService.assertRoleContained(m.roleId, actorPerms)
          }
        }
      }

      const enumRole = RolesService.toMemberRoleEnum(newRole.name)
      await Promise.all(
        eligibleMembers.map((m) =>
          this.membersRepo.update(m.id, { role: enumRole, roleId: newRole.id }),
        ),
      )

      return { updated: eligibleMembers.length }
    } catch (error) {
      return this.handleServiceError('bulkUpdateMemberRole', error, {
        businessId,
        actorId: actor.sub,
      })
    }
  }

  async listMembershipsForUser(userId: string) {
    this.logger.debug('List memberships for user', 'BusinessService', { userId })

    try {
      return this.membersRepo.find({
        where: { userId },
        relations: ['business'],
        order: { createdAt: 'ASC' },
      })
    } catch (error) {
      return this.handleServiceError('listMembershipsForUser', error, { userId })
    }
  }

  private async generateUniqueSlug(base: string): Promise<string> {
    let slug = base
    let counter = 1
    while (await this.businessRepo.findOne({ where: { slug } })) {
      slug = `${base}-${counter++}`
    }
    return slug
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('BusinessService error', 'BusinessService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    this.logger.error('BusinessService unexpected error', 'BusinessService', {
      action,
      message,
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'BUSINESS_SERVICE_ERROR',
      { action },
    )
  }
}
