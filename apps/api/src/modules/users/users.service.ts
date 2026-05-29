import { Inject, Injectable } from '@nestjs/common'
import { UsersRepository } from './repositories/users.repository'
import { UpdateUserDto } from './dto/update-user.dto'
import type { Logger, LogMetadata } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import { AppException } from '@/common/exceptions/app.exception'
import { AppInternalServerException, AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { I18nService } from 'nestjs-i18n'
import type { I18nTranslations } from '@/i18n/i18n.types'

@Injectable()
export class UsersService {
  constructor(
    private usersRepo: UsersRepository,
    private i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private logger: Logger,
  ) {
    this.logger.setContext('UsersService')
  }

  async findById(id: string) {
    this.logger.debug('Find user by id', 'UsersService', { id })
    
    try {
      const user = await this.usersRepo.findOne({
        where: { id },
        select: [
          'id', 'email', 'phone', 'name', 'avatarUrl', 'role',
          'language', 'isEmailVerified', 'isPhoneVerified',
          'businessId', 'createdAt', 'updatedAt', 'status',
          'onboardingStep', 'preferredPhoneChannel', 'isActive',
        ],
      })
      if (!user) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.user_not_found'),
          'USER_NOT_FOUND',
        )
      }
      return user
    } catch (error) {
      return this.handleServiceError('findById', error, { id })
    }
  }

  async update(id: string, dto: UpdateUserDto) {
    this.logger.debug('Update user', 'UsersService', { id })

    try {
      const { locale, ...rest } = dto
      const updatePayload = {
        ...rest,
        ...(locale ? { language: locale } : {}),
      }
      await this.usersRepo.update(id, updatePayload)
      return this.findById(id)
    } catch (error) {
      return this.handleServiceError('update', error, { id })
    }
  }

  private async handleServiceError(action: string, error: unknown, metadata?: LogMetadata): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('UsersService error', 'UsersService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    this.logger.error('UsersService unexpected error', 'UsersService', {
      action,
      message,
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'USERS_SERVICE_ERROR',
      { action },
    )
  }
}
