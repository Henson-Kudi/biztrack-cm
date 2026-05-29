import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Logger, LogMetadata } from '@biztrack/logger'
import {
  BusinessMemberRole,
  DebtDirection,
  DebtSource,
  PaymentMethod,
  SaleStatus,
  type CashierShiftSummary,
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
import { SaleCharge } from '@/entities/sale-charge.entity'
import { SaleDiscount } from '@/entities/sale-discount.entity'
import { SaleItem } from '@/entities/sale-item.entity'
import { SalePayment } from '@/entities/sale-payment.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import { DebtsService } from '@/modules/debts/services/debts.service'
import { InventoryService } from '@/modules/inventory/services/inventory.service'
import { SavingsService } from '@/modules/savings/services/savings.service'
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

type SaleComputationInput = {
  discountAmount?: number
  chargesAmount?: number
  items: Array<{
    productId: string
    quantity: number
    unitPrice: number
    discountAmount?: number
    costPrice?: number
  }>
}

@Injectable()
export class SalesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Business)
    private readonly businessesRepo: Repository<Business>,
    @InjectRepository(Sale)
    private readonly salesRepo: Repository<Sale>,
    private readonly debtsService: DebtsService,
    private readonly inventoryService: InventoryService,
    private readonly savingsService: SavingsService,
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
        const { customerId, creditAmount } = await this.resolveSaleCreditContext(
          manager,
          businessId,
          dto.customerId,
          computed.totalAmount,
          amountPaid,
        )
        const paymentMethod = this.deriveStoredPaymentMethod(dto.payments)
        const momoReference = this.firstMobileMoneyReference(dto.payments)

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
            chargesAmount: computed.saleChargesAmount,
            taxAmount: 0,
            totalAmount: computed.totalAmount,
            amountPaid,
            creditAmount,
            paymentMethod,
            momoReference,
            changeGiven,
            customerId,
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
              totalPrice: item.lineTotal,
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

        if (creditAmount > 0 && customerId) {
          await this.debtsService.createSourceDebt(manager, {
            businessId,
            contactId: customerId,
            direction: DebtDirection.RECEIVABLE,
            sourceType: DebtSource.SALE,
            sourceId: sale.id,
            sourceReference: sale.saleNumber,
            originalAmount: creditAmount,
            notes: dto.notes?.trim() || null,
            createdAt: soldAt,
          })
        }
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
      let saleId: string | null = null

      await this.dataSource.transaction(async (manager) => {
        const saleRepo = manager.getRepository(Sale)
        const targetStatus = this.normalizeSyncSaleStatus(payload.status)
        const existingInTransaction = await saleRepo.findOne({
          where: {
            businessId,
            clientId: payload.clientId,
          },
        })

        if (existingInTransaction) {
          saleId = existingInTransaction.id

          if (
            targetStatus === SaleStatus.VOIDED &&
            existingInTransaction.status !== SaleStatus.VOIDED
          ) {
            await this.applyVoidFromSync(manager, businessId, existingInTransaction.id, payload)
          }

          return
        }

        const soldAt = this.normalizeDate(payload.soldAt)
        const saleDate = soldAt.toISOString().slice(0, 10)
        const products = await this.loadProductsForSale(manager, businessId, payload)
        const computed = this.computeSale(products, payload)
        const amountPaid = this.roundMoney(
          payload.payments.reduce((sum, payment) => sum + payment.amount, 0),
        )
        const { customerId, creditAmount } = await this.resolveSaleCreditContext(
          manager,
          businessId,
          payload.customerId,
          computed.totalAmount,
          amountPaid,
          payload.creditAmount,
        )
        const paymentMethod = this.deriveStoredPaymentMethod(payload.payments)
        const momoReference = this.firstMobileMoneyReference(payload.payments)

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
            chargesAmount: computed.saleChargesAmount,
            taxAmount: 0,
            totalAmount: computed.totalAmount,
            amountPaid,
            creditAmount,
            paymentMethod,
            momoReference,
            changeGiven,
            customerId,
            customerName: payload.customerName?.trim() || null,
            customerPhone: payload.customerPhone?.trim() || null,
            notes: payload.notes?.trim() || null,
            priceDriftWarning: computed.priceDriftWarning,
            saleDate,
            soldAt,
            syncedAt: now,
            voidedAt: null,
            voidedById: null,
            voidReason: null,
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
              totalPrice: item.lineTotal,
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
              savingsAccountId: payment.savingsAccountId ?? null,
            }),
          ),
        )

        if (payload.charges && payload.charges.length > 0) {
          const chargeRepo = manager.getRepository(SaleCharge)
          for (const c of payload.charges) {
            const existing = await chargeRepo.findOne({ where: { id: c.id } })
            if (!existing) {
              await chargeRepo.save(
                chargeRepo.create({
                  id: c.id,
                  saleId: sale.id,
                  businessId,
                  chargeTypeId: c.chargeTypeId ?? null,
                  name: c.name,
                  rateType: c.rateType,
                  rateValue: c.rateValue,
                  amount: this.roundMoney(c.amount),
                }),
              )
            }
          }
        }

        if (payload.discounts && payload.discounts.length > 0) {
          const discountRepo = manager.getRepository(SaleDiscount)
          for (const d of payload.discounts) {
            const existing = await discountRepo.findOne({ where: { id: d.id } })
            if (!existing) {
              await discountRepo.save(
                discountRepo.create({
                  id: d.id,
                  saleId: sale.id,
                  businessId,
                  description: d.description,
                  discountType: d.discountType,
                  rate: d.rate ?? null,
                  amount: this.roundMoney(d.amount),
                }),
              )
            }
          }
        }

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

        if (creditAmount > 0 && customerId) {
          await this.debtsService.createSourceDebt(manager, {
            businessId,
            contactId: customerId,
            direction: DebtDirection.RECEIVABLE,
            sourceType: DebtSource.SALE,
            sourceId: sale.id,
            sourceReference: sale.saleNumber,
            originalAmount: creditAmount,
            notes: payload.notes?.trim() || null,
            createdAt: soldAt,
          })
        }

        if (targetStatus === SaleStatus.VOIDED) {
          await this.applyVoidFromSync(manager, businessId, sale.id, payload)
        }
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
          qb.andWhere(
            `(
              sale.payment_method = :mixedPaymentMethod
              OR sale.id IN (
                SELECT sp.sale_id
                FROM sale_payments sp
                GROUP BY sp.sale_id
                HAVING COUNT(DISTINCT sp.method) > 1
              )
            )`,
            { mixedPaymentMethod: PaymentMethod.MIXED },
          )
        } else {
          qb.andWhere(`
            (
              sale.payment_method = :paymentMethod
              OR EXISTS (
                SELECT 1
                FROM sale_payments sp
                WHERE sp.sale_id = sale.id
                  AND sp.method = :paymentMethod
              )
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

        await this.debtsService.writeOffSourceDebt(manager, {
          businessId,
          sourceType: DebtSource.SALE,
          sourceId: sale.id,
          reason: `Sale ${sale.saleNumber} was voided: ${dto.reason.trim()}`,
          writtenOffAt: new Date(),
          writtenOffById: user.sub,
        })
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
          creditIssued: 0,
          creditSales: 0,
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
        creditIssued: summary.creditIssued,
        creditSales: summary.creditSales,
        voidedSales: summary.voidedSales,
        voidedAmount: summary.voidedAmount,
      }
    } catch (error) {
      return this.handleServiceError('getDailySummary', error, { businessId, date })
    }
  }

  async getCashierShiftSummary(
    businessId: string,
    cashierId: string,
    date: string,
  ): Promise<CashierShiftSummary> {
    try {
      const sales = await this.salesRepo
        .createQueryBuilder('sale')
        .leftJoinAndSelect('sale.items', 'items')
        .leftJoinAndSelect('sale.payments', 'payments')
        .leftJoinAndSelect('sale.cashier', 'cashier')
        .where('sale.business_id = :businessId', { businessId })
        .andWhere('sale.cashier_id = :cashierId', { cashierId })
        .andWhere('sale.sale_date = :date', { date })
        .orderBy('sale.sold_at', 'DESC')
        .getMany()

      if (sales.length === 0) {
        return {
          cashierId,
          cashierName: null,
          date,
          shiftRevenue: 0,
          transactionCount: 0,
          avgOrderValue: 0,
          voidCount: 0,
          voidAmount: 0,
          hourlyCounts: [],
          topItems: [],
          paymentSplit: [],
          recentActivity: [],
        }
      }

      const cashierName = sales[0]?.cashier?.name ?? null
      let shiftRevenue = 0
      let transactionCount = 0
      let voidCount = 0
      let voidAmount = 0
      const hourlyMap = new Map<number, number>()
      const productMap = new Map<string, { productName: string; quantity: number }>()
      const paymentMap = new Map<string, number>()
      const recentActivity: CashierShiftSummary['recentActivity'] = []

      for (const sale of sales) {
        const saleTotal = sale.totalAmount
        const isVoid = sale.status === SaleStatus.VOIDED
        const isCompleted = sale.status === SaleStatus.COMPLETED

        if (isVoid) {
          voidCount += 1
          voidAmount = this.roundMoney(voidAmount + saleTotal)
        } else if (isCompleted) {
          transactionCount += 1
          shiftRevenue = this.roundMoney(shiftRevenue + saleTotal)

          const hour = new Date(sale.soldAt).getHours()
          hourlyMap.set(hour, (hourlyMap.get(hour) ?? 0) + 1)

          for (const item of sale.items ?? []) {
            const existing = productMap.get(item.productId)
            if (existing) {
              existing.quantity += item.quantity
            } else {
              productMap.set(item.productId, {
                productName: item.productName,
                quantity: item.quantity,
              })
            }
          }

          for (const payment of sale.payments ?? []) {
            paymentMap.set(
              payment.method,
              this.roundMoney((paymentMap.get(payment.method) ?? 0) + payment.amount),
            )
          }
        }

        if (recentActivity.length < 15) {
          const items = sale.items ?? []
          const parts = items.slice(0, 3).map((item) => {
            const qty = Number.isInteger(item.quantity)
              ? item.quantity
              : parseFloat(item.quantity.toFixed(2))
            return `${item.productName} × ${qty}`
          })
          if (items.length > 3) parts.push(`+${items.length - 3}`)

          recentActivity.push({
            id: sale.id,
            saleNumber: sale.saleNumber,
            type: isVoid ? 'void' : 'sale',
            totalAmount: this.roundMoney(saleTotal),
            soldAt: sale.soldAt.toISOString(),
            voidedAt: sale.voidedAt?.toISOString() ?? null,
            voidReason: sale.voidReason ?? null,
            itemSummary: parts.join(', '),
            customerName: sale.customerName ?? null,
          })
        }
      }

      const hourlyCounts = Array.from(hourlyMap.entries())
        .map(([hour, count]) => ({ hour, count }))
        .sort((a, b) => a.hour - b.hour)

      const topItems = Array.from(productMap.entries())
        .map(([productId, { productName, quantity }]) => ({ productId, productName, quantity }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5)

      const paymentSplit = Array.from(paymentMap.entries())
        .map(([method, amount]) => ({ method, amount }))
        .sort((a, b) => b.amount - a.amount)

      return {
        cashierId,
        cashierName,
        date,
        shiftRevenue,
        transactionCount,
        avgOrderValue: transactionCount > 0 ? this.roundMoney(shiftRevenue / transactionCount) : 0,
        voidCount,
        voidAmount,
        hourlyCounts,
        topItems,
        paymentSplit,
        recentActivity,
      }
    } catch (error) {
      return this.handleServiceError('getCashierShiftSummary', error, { businessId, cashierId, date })
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
    dto: Pick<SaleComputationInput, 'items'>,
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

  private computeSale(products: Product[], dto: SaleComputationInput) {
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
    const saleChargesAmount = this.roundMoney(Math.max(0, dto.chargesAmount ?? 0))
    const totalAmount = Math.max(0, this.roundMoney(subtotal - saleDiscountAmount + saleChargesAmount))

    return {
      items,
      subtotal,
      saleDiscountAmount,
      saleChargesAmount,
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

  private async applyVoidFromSync(
    manager: EntityManager,
    businessId: string,
    saleId: string,
    payload: SaleSyncPayload,
  ) {
    const sale = await this.findSaleDetailBy(
      'sale.id = :id',
      { id: saleId, businessId },
      manager,
    )

    if (!sale || sale.status === SaleStatus.VOIDED) {
      return
    }

    const voidedAt = this.parseOptionalDate(payload.voidedAt) ?? new Date()
    const voidedById = this.isUuid(payload.voidedById) ? payload.voidedById : null
    const voidReason = this.normalizeOptionalString(payload.voidReason) ?? 'Voided from sync'
    const saleRepo = manager.getRepository(Sale)

    await saleRepo.update(sale.id, {
      status: SaleStatus.VOIDED,
      syncedAt: new Date(),
      voidedAt,
      voidedById,
      voidReason,
    })

    await this.inventoryService.reverseForVoidedSale(
      businessId,
      sale.id,
      sale.saleNumber,
      voidedById ?? sale.cashierId,
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

    await this.debtsService.writeOffSourceDebt(manager, {
      businessId,
      sourceType: DebtSource.SALE,
      sourceId: sale.id,
      reason: `Sale ${sale.saleNumber} was voided from sync.`,
      writtenOffAt: voidedAt,
      writtenOffById: voidedById,
    })

    for (const payment of sale.payments ?? []) {
      if (payment.method === PaymentMethod.SAVINGS && payment.savingsAccountId) {
        await this.savingsService.createVoidedSaleTransaction(
          businessId,
          payment.savingsAccountId,
          sale.id,
          payment.amount,
          voidedAt,
        )
      }
    }
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

  private parseOptionalDate(value?: string | null) {
    if (!value) {
      return null
    }

    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  private normalizeOptionalString(value?: string | null) {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
  }

  private async resolveSaleCreditContext(
    manager: EntityManager,
    businessId: string,
    rawCustomerId: string | null | undefined,
    totalAmount: number,
    amountPaid: number,
    expectedCreditAmount?: number | null,
  ) {
    const customerId = this.normalizeOptionalUuid(rawCustomerId)
    const creditAmount = this.roundMoney(Math.max(0, totalAmount - amountPaid))

    if (
      expectedCreditAmount !== undefined &&
      expectedCreditAmount !== null &&
      this.roundMoney(expectedCreditAmount) !== creditAmount
    ) {
      throw new AppBadRequestException(
        'Sale credit amount does not match the unpaid balance.',
        'SALE_CREDIT_AMOUNT_MISMATCH',
        {
          expectedCreditAmount,
          computedCreditAmount: creditAmount,
        },
      )
    }

    if (creditAmount > 0 && !customerId) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.customer_contact_required_for_credit' as never),
        'CUSTOMER_CONTACT_REQUIRED_FOR_CREDIT',
        { totalAmount, amountPaid, creditAmount },
      )
    }

    if (customerId) {
      await this.debtsService.requireCreditContact(
        customerId,
        businessId,
        DebtDirection.RECEIVABLE,
        manager,
      )
    }

    return {
      customerId,
      creditAmount,
    }
  }

  private normalizeSyncSaleStatus(value?: SaleStatus | null) {
    return value === SaleStatus.VOIDED ? SaleStatus.VOIDED : SaleStatus.COMPLETED
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

  private deriveStoredPaymentMethod(
    payments: Array<{ method: PaymentMethod }>,
  ): PaymentMethod {
    const methods = [...new Set(payments.map((payment) => payment.method))]

    if (methods.length === 0) {
      return PaymentMethod.MIXED
    }

    if (methods.length === 1) {
      return methods[0]!
    }

    return PaymentMethod.MIXED
  }

  private firstMobileMoneyReference(
    payments: Array<{ mobileMoneyReference?: string | null }>,
  ): string | null {
    return payments.find((payment) => payment.mobileMoneyReference?.trim())?.mobileMoneyReference?.trim() ?? null
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

  private normalizeOptionalUuid(value: string | null | undefined) {
    const trimmed = value?.trim()
    if (!trimmed) {
      return null
    }

    if (!this.isUuid(trimmed)) {
      throw new AppBadRequestException('Sale customer id is invalid.', 'INVALID_SALE_CUSTOMER_ID')
    }

    return trimmed
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
