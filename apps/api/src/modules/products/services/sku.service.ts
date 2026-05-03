import { Inject, Injectable } from '@nestjs/common'
import { Not } from 'typeorm'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import { ProductsRepository } from '../repositories/products.repository'
import { AppBadRequestException, AppConflictException } from '@/common/exceptions/app-exceptions'
import { I18nService } from 'nestjs-i18n'
import type { I18nTranslations } from '@/i18n/i18n.types'

@Injectable()
export class SkuService {
  constructor(
    private readonly productsRepo: ProductsRepository,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('SkuService')
  }

  async generate(businessId: string, categorySlug?: string): Promise<string> {
    const prefix = this.getCategoryPrefix(categorySlug)
    const timestamp = Date.now().toString(36).toUpperCase().slice(-6)

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const sku = `${prefix}-${timestamp}-${this.randomAlphanumeric(4)}`
      const exists = await this.productsRepo.findOne({ where: { businessId, sku } })
      if (!exists) return sku
    }

    throw new AppBadRequestException(
      await this.i18n.translate('errors.product_sku_generation_failed'),
      'PRODUCT_SKU_GENERATION_FAILED',
    )
  }

  async validateAndNormalize(businessId: string, sku: string, excludeProductId?: string) {
    const normalized = sku.trim().toUpperCase()

    if (!/^[A-Z0-9\-_]{1,100}$/.test(normalized)) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.invalid_sku_format'),
        'INVALID_SKU_FORMAT',
      )
    }

    const existing = await this.productsRepo.findOne({
      where: {
        businessId,
        sku: normalized,
        ...(excludeProductId ? { id: Not(excludeProductId) } : {}),
      },
      withDeleted: true,
    })

    if (existing) {
      throw new AppConflictException(
        await this.i18n.translate('errors.sku_in_use'),
        'SKU_IN_USE',
      )
    }

    return normalized
  }

  private getCategoryPrefix(categorySlug?: string) {
    if (!categorySlug) return 'GEN'

    return categorySlug
      .replace(/-/g, '')
      .toUpperCase()
      .slice(0, 3)
      .padEnd(3, 'X')
  }

  private randomAlphanumeric(length: number) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
  }
}
