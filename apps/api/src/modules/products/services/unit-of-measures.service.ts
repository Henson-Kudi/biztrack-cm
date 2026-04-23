import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Logger, LogMetadata } from '@biztrack/logger'
import type {
  CreateUnitOfMeasureRequest,
  UnitOfMeasuresQuery,
  UpdateUnitOfMeasureRequest,
} from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import { Brackets, IsNull, Repository } from 'typeorm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppConflictException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import { UnitOfMeasure } from '@/entities/unit-of-measure.entity'
import { Product } from '@/entities/product.entity'

@Injectable()
export class UnitOfMeasuresService {
  constructor(
    @InjectRepository(UnitOfMeasure)
    private readonly unitsRepo: Repository<UnitOfMeasure>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('UnitOfMeasuresService')
  }

  async findForBusiness(businessId: string, query: UnitOfMeasuresQuery) {
    try {
      const sortField = this.validateSortField(query.sortBy)
      const page = Math.max(query.page ?? 1, 1)
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
      const skip = (page - 1) * limit
      const qb = this.unitsRepo
        .createQueryBuilder('uom')
        .where('uom.deleted_at IS NULL')
        .andWhere(
          new Brackets((builder) => {
            builder.where('uom.business_id IS NULL').orWhere('uom.business_id = :businessId', {
              businessId,
            })
          }),
        )

      if (query.sortBy) {
        qb.orderBy(`uom.${sortField}`, query.sortOrder ?? 'ASC').addOrderBy('uom.name', 'ASC')
      } else {
        qb.orderBy('uom.is_default', 'DESC').addOrderBy('uom.name', 'ASC')
      }

      const [data, total] = await qb.skip(skip).take(limit).getManyAndCount()

      return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    } catch (error) {
      return this.handleServiceError('findForBusiness', error, { businessId })
    }
  }

  private validateSortField(field?: string) {
    const allowedFields = ['name', 'abbreviation', 'type', 'createdAt', 'isDefault']
    return allowedFields.includes(field ?? '') ? field! : 'name'
  }

  async create(businessId: string, dto: CreateUnitOfMeasureRequest) {
    try {
      const existing = await this.unitsRepo
        .createQueryBuilder('uom')
        .where('uom.business_id = :businessId', { businessId })
        .andWhere('LOWER(uom.name) = LOWER(:name)', { name: dto.name.trim() })
        .getOne()

      if (existing) {
        throw new AppConflictException(
          await this.i18n.translate('errors.unit_of_measure_exists'),
          'UNIT_OF_MEASURE_EXISTS',
        )
      }

      const unit = this.unitsRepo.create({
        businessId,
        name: dto.name.trim(),
        abbreviation: dto.abbreviation.trim(),
        type: dto.type,
        isDefault: false,
        isActive: true,
      } as Partial<UnitOfMeasure>)
      return this.unitsRepo.save(unit)
    } catch (error) {
      return this.handleServiceError('create', error, { businessId, name: dto.name })
    }
  }

  async update(id: string, businessId: string, dto: UpdateUnitOfMeasureRequest) {
    try {
      const unit = await this.findEditableById(id, businessId)
      const name = dto.name?.trim() ?? unit.name
      const abbreviation = dto.abbreviation?.trim() ?? unit.abbreviation
      const type = dto.type ?? unit.type

      if (!name) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.validation_failed'),
          'UNIT_OF_MEASURE_NAME_REQUIRED',
        )
      }

      if (dto.name && dto.name.trim().toLowerCase() !== unit.name.trim().toLowerCase()) {
        const existing = await this.unitsRepo
          .createQueryBuilder('uom')
          .withDeleted()
          .where('uom.business_id = :businessId', { businessId })
          .andWhere('LOWER(uom.name) = LOWER(:name)', { name })
          .andWhere('uom.id <> :id', { id })
          .getOne()

        if (existing) {
          throw new AppConflictException(
            await this.i18n.translate('errors.unit_of_measure_exists'),
            'UNIT_OF_MEASURE_EXISTS',
          )
        }
      }

      await this.unitsRepo.update(id, {
        name,
        abbreviation,
        type,
        isActive: dto.isActive ?? unit.isActive,
      })

      return this.findEditableById(id, businessId)
    } catch (error) {
      return this.handleServiceError('update', error, { id, businessId })
    }
  }

  async remove(id: string, businessId: string): Promise<void> {
    try {
      await this.findEditableById(id, businessId)
      const productCount = await this.productsRepo.count({
        where: {
          businessId,
          unitOfMeasureId: id,
          deletedAt: IsNull(),
        },
      })

      if (productCount > 0) {
        throw new AppConflictException(
          await this.i18n.translate('errors.unit_of_measure_in_use'),
          'UNIT_OF_MEASURE_IN_USE',
          { productCount },
        )
      }

      await this.unitsRepo
        .createQueryBuilder()
        .update(UnitOfMeasure)
        .set({
          isActive: false,
          deletedAt: new Date(),
        })
        .where('id = :id', { id })
        .execute()
    } catch (error) {
      return this.handleServiceError('remove', error, { id, businessId })
    }
  }

  private async findEditableById(id: string, businessId: string) {
    const unit = await this.unitsRepo.findOne({
      where: { id, businessId, deletedAt: IsNull() },
    })

    if (!unit) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.unit_of_measure_not_found'),
        'UNIT_OF_MEASURE_NOT_FOUND',
      )
    }

    if (unit.isDefault || !unit.businessId) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.unit_of_measure_system_immutable'),
        'UNIT_OF_MEASURE_SYSTEM_IMMUTABLE',
      )
    }

    return unit
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('UnitOfMeasuresService error', 'UnitOfMeasuresService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    this.logger.error('UnitOfMeasuresService unexpected error', 'UnitOfMeasuresService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'UNIT_OF_MEASURES_SERVICE_ERROR',
      { action },
    )
  }
}
