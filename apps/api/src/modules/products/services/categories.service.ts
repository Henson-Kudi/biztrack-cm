import { Inject, Injectable } from '@nestjs/common'
import type { Logger, LogMetadata } from '@biztrack/logger'
import type { CategoriesQuery, CreateCategoryRequest, UpdateCategoryRequest } from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import { IsNull } from 'typeorm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppConflictException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import { QuotaService } from '@/modules/permissions/quota.service'
import { ProductCategoriesRepository } from '../repositories/product-categories.repository'
import { ProductsRepository } from '../repositories/products.repository'
import { SlugService } from './slug.service'

@Injectable()
export class CategoriesService {
  constructor(
    private readonly categoriesRepo: ProductCategoriesRepository,
    private readonly productsRepo: ProductsRepository,
    private readonly slugService: SlugService,
    private readonly quotaService: QuotaService,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('CategoriesService')
  }

  async create(businessId: string, dto: CreateCategoryRequest) {
    try {
      await this.quotaService.assertWithinQuota(businessId, 'categories')

      const slug = await this.slugService.generateCategorySlug(dto.name, businessId)
      const category = this.categoriesRepo.create({
        businessId,
        name: dto.name.trim(),
        slug,
        isActive: true,
        color: dto.color?.trim() ?? null,
        icon: dto.icon?.trim() ?? null,
        imageUrl: dto.imageUrl?.trim() ?? null,
        sortOrder: dto.sortOrder ?? 0,
      })
      return this.categoriesRepo.save(category)
    } catch (error) {
      return this.handleServiceError('create', error, { businessId, name: dto.name })
    }
  }

  async findAll(businessId: string, query: CategoriesQuery) {
    try {
      const sortField = this.validateSortField(query.sortBy)

      const paginationOptions = {
        page: query.page,
        limit: query.limit,
        order: {
          [sortField]: query.sortOrder || 'ASC',
        },
      }


      const result = await this.categoriesRepo.paginate(
        { businessId, deletedAt: IsNull() },
        paginationOptions,
      )

      return result
    } catch (error) {
      return this.handleServiceError('findAll', error, { businessId })
    }
  }

  private validateSortField(field?: string): string {
    const allowedFields = ['name', 'createdAt', 'updatedAt', 'sortOrder']
    return allowedFields.includes(field ?? '') ? field! : 'sortOrder'
  }

  async update(id: string, businessId: string, dto: UpdateCategoryRequest) {
    try {
      const category = await this.findById(id, businessId)
      const slug = dto.name
        ? await this.slugService.generateCategorySlug(dto.name, businessId, id)
        : category.slug

      await this.categoriesRepo.update(id, {
        name: dto.name?.trim() ?? category.name,
        slug,
        isActive: dto.isActive ?? category.isActive,
        color: dto.color === undefined ? category.color : (dto.color?.trim() ?? null),
        icon: dto.icon === undefined ? category.icon : (dto.icon?.trim() ?? null),
        imageUrl: dto.imageUrl === undefined ? category.imageUrl : (dto.imageUrl?.trim() ?? null),
        sortOrder: dto.sortOrder ?? category.sortOrder,
        updatedAt: new Date(),
      })

      return this.findById(id, businessId)
    } catch (error) {
      return this.handleServiceError('update', error, { id, businessId })
    }
  }

  async remove(id: string, businessId: string): Promise<void> {
    try {
      await this.findById(id, businessId)
      const productCount = await this.productsRepo
        .createQueryBuilder('product')
        .where('product.business_id = :businessId', { businessId })
        .andWhere('product.category_id = :id', { id })
        .andWhere('product.deleted_at IS NULL')
        .getCount()

      if (productCount > 0) {
        throw new AppConflictException(
          await this.i18n.translate('errors.category_has_products'),
          'CATEGORY_HAS_PRODUCTS',
          { productCount },
        )
      }

      await this.categoriesRepo.update(id, {
        isActive: false,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
    } catch (error) {
      return this.handleServiceError('remove', error, { id, businessId })
    }
  }

  async findById(id: string, businessId: string) {
    const category = await this.categoriesRepo.findOne({
      where: { id, businessId, deletedAt: IsNull() },
    })

    if (!category) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.category_not_found'),
        'CATEGORY_NOT_FOUND',
      )
    }

    return category
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('CategoriesService error', 'CategoriesService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    this.logger.error('CategoriesService unexpected error', 'CategoriesService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'CATEGORIES_SERVICE_ERROR',
      { action },
    )
  }
}
