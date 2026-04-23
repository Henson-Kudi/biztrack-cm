import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Logger, LogMetadata } from '@biztrack/logger'
import {
  BusinessMemberRole,
  PaymentMethod,
  SaleStatus,
  type DailySalesSummary,
  type JwtPayload,
  type SaleSyncPayload,
  type SalesQuery,
} from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppForbiddenException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { Business } from '@/entities/business.entity'
import { Product } from '@/entities/product.entity'
import { Sale } from '@/entities/sale.entity'
import { SaleItem } from '@/entities/sale-item.entity'
import { SalePayment } from '@/entities/sale-payment.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import { InventoryService } from '@/modules/inventory/services/inventory.service'
import type { CreateSaleDto } from '../dto/create-sale.dto'
import type { VoidSaleDto } from '../dto/void-sale.dto'
import { DailySalesSummaryService } from './daily-sales-summary.service'
import { SaleNumberService } from './sale-number.service'

type ComputedSaleItem = {
  product: Product
  quantity: number
  unitPrice: number
  discountAmount: number
  lineTotal: number
  costPrice: number | null
}

@Injectable()
export class SalesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Business)
    private readonly businessesRepo: Repository<Business>,
    @InjectRepository(Sale)
    private readonly salesRepo: Repository<Sale>,
    private readonly inventoryService: InventoryService,
    private readonly saleNumberService: SaleNumberService,
    private readonly dailySummaryService: DailySalesSummaryService,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('SalesService')
  }

  async create(businessId: string, user: JwtPayload, dto: CreateSaleDto) {
    try {
      const existing = await this.salesRepo.findOne({
        where: {
          businessId,
          clientId: dto.clientId,
        },
      })

      if (existing) {
        return this.findById(existing.id, businessId)
      }

      let saleId: string | null = null

      await this.dataSource.transaction(async (manager) => {
        const saleRepo = manager.getRepository(Sale)
        const existingInTransaction = await saleRepo.findOne({
          where: {
            businessId,
            clientId: dto.clientId,
          },
        })

        if (existingInTransaction) {
          saleId = existingInTransaction.id
          return
        }

        const soldAt = this.normalizeDate(dto.soldAt)
        const saleDate = soldAt.toISOString().slice(0, 10)
        const products = await this.loadProductsForSale(manager, businessId, dto)
        const computed = this.computeSale(products, dto)
        const amountPaid = this.roundMoney(
          dto.payments.reduce((sum, payment) => sum + payment.amount, 0),
        )

        if (amountPaid < computed.totalAmount) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.underpayment', {
              args: {
                paid: amountPaid,
                total: computed.totalAmount,
              },
            }),
            'UNDERPAYMENT',
            {
              paid: amountPaid,
              total: computed.totalAmount,
            },
          )
        }

        const changeGiven = this.roundMoney(amountPaid - computed.totalAmount)
        const saleNumber = await this.saleNumberService.generate(businessId, saleDate, manager)
        const now = new Date()

        const sale = await saleRepo.save(
          saleRepo.create({
            businessId,
            clientId: dto.clientId,
            cashierId: user.sub,
            saleNumber,
            status: SaleStatus.COMPLETED,
            subtotal: computed.subtotal,
            discountAmount: computed.saleDiscountAmount,
            taxAmount: 0,
            totalAmount: computed.totalAmount,
            amountPaid,
            changeGiven,
            customerName: dto.customerName?.trim() || null,
            customerPhone: dto.customerPhone?.trim() || null,
            notes: dto.notes?.trim() || null,
            priceDriftWarning: computed.priceDriftWarning,
            saleDate,
            soldAt,
            syncedAt: now,
          }),
        )

        const itemRepo = manager.getRepository(SaleItem)
        const saleItems = await itemRepo.save(
          computed.items.map((item) =>
            itemRepo.create({
              saleId: sale.id,
              businessId,
              productId: item.product.id,
              productName: item.product.name,
              productSku: item.product.sku ?? null,
              unitOfMeasure: item.product.unitOfMeasure?.abbreviation ?? null,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountAmount: item.discountAmount,
              lineTotal: item.lineTotal,
              costPrice: item.costPrice,
            }),
          ),
        )

        const paymentRepo = manager.getRepository(SalePayment)
        const salePayments = await paymentRepo.save(
          dto.payments.map((payment) =>
            paymentRepo.create({
              saleId: sale.id,
              businessId,
              method: payment.method,
              amount: this.roundMoney(payment.amount),
              mobileMoneyReference: payment.mobileMoneyReference?.trim() || null,
            }),
          ),
        )

        await this.inventoryService.deductForSale(
          businessId,
          sale.id,
          sale.saleNumber,
          user.sub,
          saleItems.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
          })),
          manager,
        )

        await this.dailySummaryService.incrementForSale(sale, saleItems, salePayments, manager)
        saleId = sale.id
      })

      if (!saleId) {
        throw new AppInternalServerException('Sale creation failed.', 'SALE_CREATE_FAILED')
      }

      return this.findById(saleId, businessId)
    } catch (error) {
      if (this.isUniqueConstraintViolation(error, 'unq_sales_business_id_client_id')) {
        const existing = await this.salesRepo.findOne({
          where: {
            businessId,
            clientId: dto.clientId,
          },
        })

        if (existing) {
          return this.findById(existing.id, businessId)
        }
      }

      return this.handleServiceError('create', error, {
        businessId,
        userId: user.sub,
        clientId: dto.clientId,
      })
    }
  }

  async createFromSync(businessId: string, payload: SaleSyncPayload) {
    try {
      const existing = await this.salesRepo.findOne({
        where: {
          businessId,
          clientId: payload.clientId,
        },
      })

      if (existing) {
        return this.findById(existing.id, businessId)
      }

      let saleId: string | null = null

      await this.dataSource.transaction(async (manager) => {
        const saleRepo = manager.getRepository(Sale)
        const existingInTransaction = await saleRepo.findOne({
          where: {
            businessId,
            clientId: payload.clientId,
          },
        })

        if (existingInTransaction) {
          saleId = existingInTransaction.id
          return
        }

        const soldAt = this.normalizeDate(payload.soldAt)
        const saleDate = soldAt.toISOString().slice(0, 10)
        const products = await this.loadProductsForSale(manager, businessId, payload)
        const computed = this.computeSale(products, payload)
        const amountPaid = this.roundMoney(
          payload.payments.reduce((sum, payment) => sum + payment.amount, 0),
        )

        if (amountPaid < computed.totalAmount) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.underpayment', {
              args: {
                paid: amountPaid,
                total: computed.totalAmount,
              },
            }),
            'UNDERPAYMENT',
            {
              paid: amountPaid,
              total: computed.totalAmount,
            },
          )
        }

        const cashierId = this.resolveSyncCashierId(payload)
        const changeGiven = this.roundMoney(amountPaid - computed.totalAmount)
        let saleNumber = payload.saleNumber?.trim() || null

        if (!saleNumber) {
          saleNumber = await this.saleNumberService.generate(businessId, saleDate, manager)
        } else {
          const existingByNumber = await saleRepo.findOne({
            where: {
              businessId,
              saleNumber,
            },
          })

          if (existingByNumber && existingByNumber.clientId !== payload.clientId) {
            saleNumber = await this.saleNumberService.generate(businessId, saleDate, manager)
          }
        }

        const now = new Date()

        const sale = await saleRepo.save(
          saleRepo.create({
            id: payload.saleId,
            businessId,
            clientId: payload.clientId,
            cashierId,
            saleNumber,
            status: SaleStatus.COMPLETED,
            subtotal: computed.subtotal,
            discountAmount: computed.saleDiscountAmount,
            taxAmount: 0,
            totalAmount: computed.totalAmount,
            amountPaid,
            changeGiven,
            customerName: payload.customerName?.trim() || null,
            customerPhone: payload.customerPhone?.trim() || null,
            notes: payload.notes?.trim() || null,
            priceDriftWarning: computed.priceDriftWarning,
            saleDate,
            soldAt,
            syncedAt: now,
          }),
        )

        const itemRepo = manager.getRepository(SaleItem)
        const saleItems = await itemRepo.save(
          computed.items.map((item, index) =>
            itemRepo.create({
              id: payload.items[index]?.id ?? undefined,
              saleId: sale.id,
              businessId,
              productId: item.product.id,
              productName: item.product.name,
              productSku: item.product.sku ?? null,
              unitOfMeasure: item.product.unitOfMeasure?.abbreviation ?? null,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountAmount: item.discountAmount,
              lineTotal: item.lineTotal,
              costPrice: item.costPrice,
            }),
          ),
        )

        const paymentRepo = manager.getRepository(SalePayment)
        const salePayments = await paymentRepo.save(
          payload.payments.map((payment) =>
            paymentRepo.create({
              id: payment.id,
              saleId: sale.id,
              businessId,
              method: payment.method,
              amount: this.roundMoney(payment.amount),
              mobileMoneyReference: payment.mobileMoneyReference?.trim() || null,
            }),
          ),
        )

        await this.inventoryService.deductForSale(
          businessId,
          sale.id,
          sale.saleNumber,
          cashierId,
          saleItems.map((item, index) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            movementId: payload.items[index]?.movementId ?? null,
          })),
          manager,
        )

        await this.dailySummaryService.incrementForSale(sale, saleItems, salePayments, manager)
        saleId = sale.id
      })

      if (!saleId) {
        throw new AppInternalServerException('Sale sync creation failed.', 'SALE_SYNC_CREATE_FAILED')
      }

      return this.findById(saleId, businessId)
    } catch (error) {
      if (this.isUniqueConstraintViolation(error, 'unq_sales_business_id_client_id')) {
        const existing = await this.salesRepo.findOne({
          where: {
            businessId,
            clientId: payload.clientId,
          },
        })

        if (existing) {
          return this.findById(existing.id, businessId)
        }
      }

      return this.handleServiceError('createFromSync', error, {
        businessId,
        saleId: payload.saleId,
        clientId: payload.clientId,
      })
    }
  }

  async findAll(businessId: string, query: SalesQuery) {
    try {
      const qb = this.salesRepo
        .createQueryBuilder('sale')
        .leftJoinAndSelect('sale.cashier', 'cashier')
        .leftJoinAndSelect('sale.business', 'business')
        .leftJoinAndSelect('sale.payments', 'payments')
        .loadRelationCountAndMap('sale.itemCount', 'sale.items')
        .where('sale.business_id = :businessId', { businessId })
        .distinct(true)

      if (query.dateFrom) {
        qb.andWhere('sale.sale_date >= :dateFrom', { dateFrom: query.dateFrom })
      }

      if (query.dateTo) {
        qb.andWhere('sale.sale_date <= :dateTo', { dateTo: query.dateTo })
      }

      if (query.status) {
        qb.andWhere('sale.status = :status', { status: query.status })
      }

      if (query.cashierId) {
        qb.andWhere('sale.cashier_id = :cashierId', { cashierId: query.cashierId })
      }

      if (query.search?.trim()) {
        qb.andWhere(
          '(LOWER(sale.sale_number) LIKE :search OR LOWER(COALESCE(sale.customer_name, \'\')) LIKE :search)',
          { search: `%${query.search.trim().toLowerCase()}%` },
        )
      }

      if (query.paymentMethod) {
        if (query.paymentMethod === PaymentMethod.MIXED) {
          qb.andWhere(`
            sale.id IN (
              SELECT sp.sale_id
              FROM sale_payments sp
              GROUP BY sp.sale_id
              HAVING COUNT(DISTINCT sp.method) > 1
            )
          `)
        } else {
          qb.andWhere(`
            EXISTS (
              SELECT 1
              FROM sale_payments sp
              WHERE sp.sale_id = sale.id
                AND sp.method = :paymentMethod
            )
          `, { paymentMethod: query.paymentMethod })
        }
      }

      const sort = this.resolveSortField(query.sortBy)
      const sortOrder = query.sortOrder ?? 'DESC'
      const page = Math.max(query.page ?? 1, 1)
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
      const skip = (page - 1) * limit
      const [rows, total] = await qb.orderBy(sort, sortOrder).skip(skip).take(limit).getManyAndCount()

      return {
        data: rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    } catch (error) {
      return this.handleServiceError('findAll', error, { businessId })
    }
  }

  async findById(id: string, businessId: string) {
    try {
      const sale = await this.findSaleDetailBy('sale.id = :id', { id, businessId })

      if (!sale) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.sale_not_found'),
          'SALE_NOT_FOUND',
        )
      }

      return sale
    } catch (error) {
      return this.handleServiceError('findById', error, { id, businessId })
    }
  }

  async findByNumber(saleNumber: string, businessId: string) {
    try {
      const sale = await this.findSaleDetailBy('sale.sale_number = :saleNumber', {
        saleNumber,
        businessId,
      })

      if (!sale) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.sale_not_found'),
          'SALE_NOT_FOUND',
        )
      }

      return sale
    } catch (error) {
      return this.handleServiceError('findByNumber', error, { saleNumber, businessId })
    }
  }

  async void(id: string, businessId: string, user: JwtPayload, dto: VoidSaleDto) {
    try {
      if (![BusinessMemberRole.OWNER, BusinessMemberRole.MANAGER].includes(user.role as BusinessMemberRole)) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.sales_void_forbidden'),
          'FORBIDDEN',
        )
      }

      await this.dataSource.transaction(async (manager) => {
        const sale = await this.findSaleDetailBy(
          'sale.id = :id',
          { id, businessId },
          manager,
        )

        if (!sale) {
          throw new AppNotFoundException(
            await this.i18n.translate('errors.sale_not_found'),
            'SALE_NOT_FOUND',
          )
        }

        if (sale.status === SaleStatus.VOIDED) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.already_voided', {
              args: { saleNumber: sale.saleNumber },
            }),
            'ALREADY_VOIDED',
          )
        }

        const saleRepo = manager.getRepository(Sale)
        await saleRepo.update(sale.id, {
          status: SaleStatus.VOIDED,
          voidedAt: new Date(),
          voidedById: user.sub,
          voidReason: dto.reason.trim(),
        })

        await this.inventoryService.reverseForVoidedSale(
          businessId,
          sale.id,
          sale.saleNumber,
          user.sub,
          (sale.items ?? []).map((item) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
          })),
          manager,
        )

        await this.dailySummaryService.decrementForVoid(
          sale,
          sale.items ?? [],
          sale.payments ?? [],
          manager,
        )
      })

      return this.findById(id, businessId)
    } catch (error) {
      return this.handleServiceError('void', error, { id, businessId, userId: user.sub })
    }
  }

  async getDailySummary(businessId: string, date?: string): Promise<DailySalesSummary> {
    try {
      const targetDate = date ?? new Date().toISOString().slice(0, 10)
      const summary = await this.dailySummaryService.findByDate(businessId, targetDate)

      if (!summary) {
        return {
          date: targetDate,
          totalSales: 0,
          totalRevenue: 0,
          totalCost: 0,
          grossProfit: 0,
          grossMarginPercent: 0,
          totalDiscounts: 0,
          cashCollected: 0,
          mtnMomoCollected: 0,
          orangeMoneyCollected: 0,
          cardCollected: 0,
          voidedSales: 0,
          voidedAmount: 0,
        }
      }

      return {
        date: summary.summaryDate,
        totalSales: summary.totalSales,
        totalRevenue: summary.totalRevenue,
        totalCost: summary.totalCost,
        grossProfit: summary.grossProfit,
        grossMarginPercent:
          summary.totalRevenue > 0
            ? this.roundMoney((summary.grossProfit / summary.totalRevenue) * 100)
            : 0,
        totalDiscounts: summary.totalDiscounts,
        cashCollected: summary.cashCollected,
        mtnMomoCollected: summary.mtnMomoCollected,
        orangeMoneyCollected: summary.orangeMoneyCollected,
        cardCollected: summary.cardCollected,
        voidedSales: summary.voidedSales,
        voidedAmount: summary.voidedAmount,
      }
    } catch (error) {
      return this.handleServiceError('getDailySummary', error, { businessId, date })
    }
  }

  async getReceipt(id: string, businessId: string) {
    try {
      const [sale, business] = await Promise.all([
        this.findById(id, businessId),
        this.businessesRepo.findOne({ where: { id: businessId } }),
      ])

      if (!business) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.business_not_found'),
          'BUSINESS_NOT_FOUND',
        )
      }

      return {
        sale,
        business,
      }
    } catch (error) {
      return this.handleServiceError('getReceipt', error, { id, businessId })
    }
  }

  private async loadProductsForSale(
    manager: EntityManager,
    businessId: string,
    dto: CreateSaleDto,
  ) {
    const ids = [...new Set(dto.items.map((item) => item.productId))]
    const products = await manager.getRepository(Product).find({
      where: ids.map((id) => ({
        id,
        businessId,
        deletedAt: IsNull(),
      })),
      relations: ['unitOfMeasure'],
    })

    if (products.length !== ids.length) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.product_not_found'),
        'PRODUCT_NOT_FOUND',
      )
    }

    for (const product of products) {
      if (!product.isActive) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.product_inactive', {
            args: { name: product.name },
          }),
          'PRODUCT_INACTIVE',
        )
      }
    }

    return products
  }

  private computeSale(products: Product[], dto: CreateSaleDto) {
    const productsById = new Map(products.map((product) => [product.id, product]))
    const items: ComputedSaleItem[] = []
    let subtotal = 0
    let priceDriftWarning = false

    for (const input of dto.items) {
      const product = productsById.get(input.productId)

      if (!product) {
        throw new AppBadRequestException(
          'Product not found in sale payload.',
          'PRODUCT_NOT_FOUND',
          { productId: input.productId },
        )
      }

      const quantity = this.roundQuantity(input.quantity)
      const unitPrice = this.roundMoney(input.unitPrice)
      const discountAmount = this.roundMoney(input.discountAmount ?? 0)
      const lineTotal = Math.max(0, this.roundMoney(unitPrice * quantity - discountAmount))
      const costPrice =
        input.costPrice !== undefined ? this.roundMoney(input.costPrice) : (product.costPrice ?? null)

      if (this.hasPriceDrift(unitPrice, product.sellingPrice)) {
        priceDriftWarning = true
      }

      subtotal = this.roundMoney(subtotal + lineTotal)
      items.push({
        product,
        quantity,
        unitPrice,
        discountAmount,
        lineTotal,
        costPrice,
      })
    }

    const saleDiscountAmount = Math.min(this.roundMoney(dto.discountAmount ?? 0), subtotal)
    const totalAmount = Math.max(0, this.roundMoney(subtotal - saleDiscountAmount))

    return {
      items,
      subtotal,
      saleDiscountAmount,
      totalAmount,
      priceDriftWarning,
    }
  }

  private hasPriceDrift(unitPrice: number, currentSellingPrice: number) {
    if (currentSellingPrice <= 0) {
      return unitPrice > 0
    }

    return Math.abs(unitPrice - currentSellingPrice) / currentSellingPrice > 0.1
  }

  private async findSaleDetailBy(
    predicate: string,
    params: Record<string, unknown>,
    manager?: EntityManager,
  ) {
    const repo = manager?.getRepository(Sale) ?? this.salesRepo

    return repo
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.cashier', 'cashier')
      .leftJoinAndSelect('sale.business', 'business')
      .leftJoinAndSelect('sale.items', 'items')
      .leftJoinAndSelect('sale.payments', 'payments')
      .where('sale.business_id = :businessId', { businessId: params.businessId })
      .andWhere(predicate, params)
      .orderBy('items.created_at', 'ASC')
      .addOrderBy('payments.created_at', 'ASC')
      .getOne()
  }

  private resolveSortField(sortBy?: string) {
    const sortMap: Record<string, string> = {
      saleDate: 'sale.sale_date',
      soldAt: 'sale.sold_at',
      createdAt: 'sale.created_at',
      totalAmount: 'sale.total_amount',
      saleNumber: 'sale.sale_number',
      customerName: 'sale.customer_name',
      status: 'sale.status',
    }

    return sortMap[sortBy ?? ''] ?? 'sale.sold_at'
  }

  private normalizeDate(value: string) {
    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
      throw new AppBadRequestException('Invalid sale date.', 'INVALID_SALE_DATE')
    }

    return date
  }

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100
  }

  private roundQuantity(value: number) {
    return Math.round(value * 1000) / 1000
  }

  private resolveSyncCashierId(payload: SaleSyncPayload) {
    if (this.isUuid(payload.cashierId)) {
      return payload.cashierId
    }

    if (this.isUuid(payload.fallbackCashierId)) {
      return payload.fallbackCashierId
    }

    throw new AppBadRequestException('Sale cashier is required.', 'SALE_CASHIER_REQUIRED')
  }

  private isUniqueConstraintViolation(error: unknown, constraint: string) {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === '23505' &&
      'constraint' in error &&
      (error as { constraint?: string }).constraint === constraint,
    )
  }

  private isUuid(value: string | null | undefined): value is string {
    return Boolean(
      value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
    )
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('SalesService error', 'SalesService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    this.logger.error('SalesService unexpected error', 'SalesService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'SALES_SERVICE_ERROR',
      { action },
    )
  }
}
