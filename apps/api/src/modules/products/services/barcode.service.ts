import { Inject, Injectable } from '@nestjs/common'
import { Not } from 'typeorm'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import { AppBadRequestException, AppConflictException } from '@/common/exceptions/app-exceptions'
import { I18nService } from 'nestjs-i18n'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { ProductsRepository } from '../repositories/products.repository'

export enum BarcodeType {
  EAN13 = 'EAN13',
  EAN8 = 'EAN8',
  UPCA = 'UPCA',
  CODE128 = 'CODE128',
  QR = 'QR',
  INTERNAL = 'INTERNAL',
}

@Injectable()
export class BarcodeService {
  constructor(
    private readonly productsRepo: ProductsRepository,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('BarcodeService')
  }

  generateFromSKU(sku: string) {
    const hash = this.hashToNineDigits(sku)
    const base = `200${hash.toString().padStart(9, '0')}`
    const checkDigit = this.ean13CheckDigit(base)

    return {
      value: `${base}${checkDigit}`,
      type: BarcodeType.INTERNAL,
      isGenerated: true,
    }
  }

  detectType(value: string): BarcodeType {
    if (/^\d{13}$/.test(value)) return value.startsWith('200') ? BarcodeType.INTERNAL : BarcodeType.EAN13
    if (/^\d{8}$/.test(value)) return BarcodeType.EAN8
    if (/^\d{12}$/.test(value)) return BarcodeType.UPCA
    if (/^https?:\/\//.test(value) || /\s/.test(value)) return BarcodeType.QR
    return BarcodeType.CODE128
  }

  async validateAndNormalize(businessId: string, barcode: string, excludeProductId?: string) {
    const normalized = barcode.trim()
    const type = this.detectType(normalized)

    if (
      [BarcodeType.EAN13, BarcodeType.EAN8, BarcodeType.UPCA, BarcodeType.INTERNAL].includes(type) &&
      !this.validateCheckDigit(normalized, type)
    ) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.invalid_barcode_check_digit'),
        'INVALID_BARCODE_CHECK_DIGIT',
      )
    }

    const existing = await this.productsRepo.findOne({
      where: {
        businessId,
        barcode: normalized,
        ...(excludeProductId ? { id: Not(excludeProductId) } : {}),
      },
      withDeleted: true,
    })

    if (existing) {
      throw new AppConflictException(
        await this.i18n.translate('errors.barcode_in_use'),
        'BARCODE_IN_USE',
      )
    }

    return {
      value: normalized,
      type,
      isGenerated: false,
    }
  }

  private validateCheckDigit(value: string, type: BarcodeType) {
    if (type === BarcodeType.EAN8) {
      const base = value.slice(0, 7)
      return this.ean8CheckDigit(base) === Number.parseInt(value.at(-1) ?? '0', 10)
    }

    if ([BarcodeType.EAN13, BarcodeType.UPCA, BarcodeType.INTERNAL].includes(type)) {
      const base = value.slice(0, 12)
      return this.ean13CheckDigit(base) === Number.parseInt(value.at(-1) ?? '0', 10)
    }

    return true
  }

  private hashToNineDigits(input: string) {
    let hash = 0
    for (let index = 0; index < input.length; index += 1) {
      hash = (hash << 5) - hash + input.charCodeAt(index)
      hash |= 0
    }
    return Math.abs(hash) % 1_000_000_000
  }

  private ean13CheckDigit(twelveDigits: string) {
    let sum = 0
    for (let index = 0; index < 12; index += 1) {
      sum += Number.parseInt(twelveDigits[index] ?? '0', 10) * (index % 2 === 0 ? 1 : 3)
    }
    return (10 - (sum % 10)) % 10
  }

  private ean8CheckDigit(sevenDigits: string) {
    let sum = 0
    for (let index = 0; index < 7; index += 1) {
      sum += Number.parseInt(sevenDigits[index] ?? '0', 10) * (index % 2 === 0 ? 3 : 1)
    }
    return (10 - (sum % 10)) % 10
  }
}
