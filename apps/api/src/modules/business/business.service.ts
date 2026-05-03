import { Inject, Injectable } from '@nestjs/common'
import type { CreateBusinessRequest, UpdateBusinessRequest } from '@biztrack/types'
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

@Injectable()
export class BusinessService {
  constructor(
    private businessRepo: BusinessesRepository,
    private membersRepo: BusinessMembersRepository,
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

      const member = this.membersRepo.create({
        businessId: business.id,
        userId: ownerId,
        role: BusinessMemberRole.OWNER,
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
