import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Logger, LogMetadata } from '@biztrack/logger'
import type {
  CreateProductImageRequest,
  ProductImagesQuery,
  UpdateProductImageRequest,
} from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import { Repository } from 'typeorm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { ProductImage } from '@/entities/product-image.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import { ProductsService } from './products.service'

@Injectable()
export class ProductImagesService {
  constructor(
    @InjectRepository(ProductImage)
    private readonly imagesRepo: Repository<ProductImage>,
    private readonly productsService: ProductsService,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('ProductImagesService')
  }

  async list(productId: string, businessId: string, query: ProductImagesQuery) {
    try {
      await this.productsService.findById(productId, businessId)

      const page = Math.max(query.page ?? 1, 1)
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
      const skip = (page - 1) * limit

      const [data, total] = await this.imagesRepo.findAndCount({
        where: { productId },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
        skip,
        take: limit,
      })

      return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    } catch (error) {
      return this.handleServiceError('list', error, { productId, businessId })
    }
  }

  async create(productId: string, businessId: string, dto: CreateProductImageRequest) {
    try {
      await this.productsService.findById(productId, businessId)
      const count = await this.imagesRepo.count({ where: { productId } })
      if (count >= 10) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.product_images_limit_reached'),
          'PRODUCT_IMAGES_LIMIT_REACHED',
        )
      }

      const image = this.imagesRepo.create({
        productId,
        url: dto.url.trim(),
        altText: dto.altText?.trim() ?? null,
        sortOrder: dto.sortOrder ?? count,
      })

      return this.imagesRepo.save(image)
    } catch (error) {
      return this.handleServiceError('create', error, { productId, businessId })
    }
  }

  async update(
    productId: string,
    imageId: string,
    businessId: string,
    dto: UpdateProductImageRequest,
  ) {
    try {
      await this.productsService.findById(productId, businessId)
      const image = await this.findImage(productId, imageId)
      await this.imagesRepo.update(image.id, {
        url: dto.url?.trim() ?? image.url,
        altText: dto.altText === undefined ? image.altText : (dto.altText?.trim() ?? null),
        sortOrder: dto.sortOrder ?? image.sortOrder,
      })
      return this.findImage(productId, imageId)
    } catch (error) {
      return this.handleServiceError('update', error, { productId, imageId, businessId })
    }
  }

  async remove(productId: string, imageId: string, businessId: string): Promise<void> {
    try {
      await this.productsService.findById(productId, businessId)
      const image = await this.findImage(productId, imageId)
      await this.imagesRepo.delete({ id: image.id })
    } catch (error) {
      return this.handleServiceError('remove', error, { productId, imageId, businessId })
    }
  }

  private async findImage(productId: string, imageId: string) {
    const image = await this.imagesRepo.findOne({ where: { id: imageId, productId } })
    if (!image) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.product_image_not_found'),
        'PRODUCT_IMAGE_NOT_FOUND',
      )
    }
    return image
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('ProductImagesService error', 'ProductImagesService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    this.logger.error('ProductImagesService unexpected error', 'ProductImagesService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'PRODUCT_IMAGES_SERVICE_ERROR',
      { action },
    )
  }
}
