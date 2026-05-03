import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Logger, LogMetadata } from '@biztrack/logger'
import type {
  AdjustInventoryRequest,
  InventoryAlert,
  InventoryAlertsQuery,
  InventoryMovementsQuery,
  InventoryQuery,
  RestockRequest,
  SetInventoryThresholdRequest,
} from '@biztrack/types'
import { StockAdjustmentType } from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { Business } from '@/entities/business.entity'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { InventoryMovement, MovementType } from '@/entities/inventory-movement.entity'
import { ProductImage } from '@/entities/product-image.entity'
import { Product } from '@/entities/product.entity'
import { RestockItem } from '@/entities/restock-item.entity'
import { RestockRecord } from '@/entities/restock-record.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import type { InventoryLowStockAlertDigest } from '../constants/inventory.constants'

type SaleInventoryItemInput = {
  productId: string
  productName: string
  quantity: number
  movementId?: string | null
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Business)
    private readonly businessesRepo: Repository<Business>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(InventoryLevel)
    private readonly inventoryLevelsRepo: Repository<InventoryLevel>,
    @InjectRepository(InventoryMovement)
    private readonly inventoryMovementsRepo: Repository<InventoryMovement>,
    @InjectRepository(ProductImage)
    private readonly productImagesRepo: Repository<ProductImage>,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('InventoryService')
  }

  async findAll(businessId: string, filters?: InventoryQuery) {
    try {
      const query = this.inventoryLevelsRepo
        .createQueryBuilder('inventory')
        .innerJoinAndSelect('inventory.product', 'product')
        .leftJoinAndSelect('product.category', 'category')
        .leftJoinAndSelect('product.unitOfMeasure', 'unitOfMeasure')
        .where('inventory.business_id = :businessId', { businessId })
        .andWhere('product.deleted_at IS NULL')
        .andWhere('product.track_inventory = true')

      if (filters?.categoryId) {
        query.andWhere('product.category_id = :categoryId', { categoryId: filters.categoryId })
      }
      if (filters?.lowStockOnly) {
        query.andWhere('inventory.low_stock_threshold IS NOT NULL')
        query.andWhere('inventory.quantity <= inventory.low_stock_threshold')
      }

      const sort = this.resolveSort(filters?.sortBy)
      const sortOrder = filters?.sortOrder ?? 'ASC'
      const page = Math.max(filters?.page ?? 1, 1)
      const limit = Math.min(Math.max(filters?.limit ?? 20, 1), 100)
      const skip = (page - 1) * limit

      query.orderBy(sort, sortOrder).skip(skip).take(limit)

      const [rows, total] = await query.getManyAndCount()
      const primaryImageUrls = await this.loadPrimaryImageUrls(rows.map((row) => row.productId))

      return {
        data: rows.map((row) => ({
          productId: row.productId,
          productName: row.product?.name ?? null,
          sku: row.product?.sku ?? null,
          barcode: row.product?.barcode ?? null,
          primaryImageUrl: primaryImageUrls.get(row.productId) ?? row.product?.imageUrl ?? null,
          categoryName: row.product?.category?.name ?? null,
          unitAbbreviation: row.product?.unitOfMeasure?.abbreviation ?? null,
          quantity: row.quantity,
          lowStockThreshold: row.lowStockThreshold,
          reorderPoint: row.reorderPoint,
          isLowStock:
            row.lowStockThreshold !== null && row.lowStockThreshold !== undefined
              ? row.quantity <= row.lowStockThreshold
              : false,
          lastRestockAt: row.lastRestockAt,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    } catch (error) {
      return this.handleServiceError('findAll', error, { businessId })
    }
  }

  private resolveSort(field?: string): string {
    const sortMap: Record<string, string> = {
      productName: 'product.name',
      sku: 'product.sku',
      barcode: 'product.barcode',
      categoryName: 'category.name',
      quantity: 'inventory.quantity',
      lowStockThreshold: 'inventory.low_stock_threshold',
      reorderPoint: 'inventory.reorder_point',
      lastRestockAt: 'inventory.last_restock_at',
    }

    return sortMap[field ?? ''] ?? 'product.name'
  }

  async findOne(productId: string, businessId: string) {
    try {
      const level = await this.requireTrackedProduct(productId, businessId)
      const movements = await this.inventoryMovementsRepo.find({
        where: { businessId, productId },
        relations: ['performedBy'],
        order: { createdAt: 'DESC' },
        take: 10,
      })

      return {
        ...level,
        movements,
      }
    } catch (error) {
      return this.handleServiceError('findOne', error, { productId, businessId })
    }
  }

  async getMovements(productId: string, businessId: string, query: InventoryMovementsQuery) {
    try {
      await this.requireTrackedProduct(productId, businessId)
      return this.findMovements(businessId, { ...query, productId })
    } catch (error) {
      return this.handleServiceError('getMovements', error, { productId, businessId })
    }
  }

  async getAllMovements(businessId: string, query: InventoryMovementsQuery) {
    try {
      return this.findMovements(businessId, query)
    } catch (error) {
      return this.handleServiceError('getAllMovements', error, { businessId })
    }
  }

  async setThreshold(productId: string, businessId: string, dto: SetInventoryThresholdRequest) {
    try {
      const level = await this.requireTrackedProduct(productId, businessId)
      await this.inventoryLevelsRepo.update(level.id, {
        lowStockThreshold: dto.lowStockThreshold ?? null,
        reorderPoint: dto.reorderPoint ?? null,
      })
      return this.requireTrackedProduct(productId, businessId)
    } catch (error) {
      return this.handleServiceError('setThreshold', error, { productId, businessId })
    }
  }

  async adjust(productId: string, businessId: string, userId: string, dto: AdjustInventoryRequest) {
    try {
      this.validateAdjustment(dto)
      const level = await this.requireTrackedProduct(productId, businessId)

      return this.dataSource.transaction(async (manager) => {
        const inventoryRepo = manager.getRepository(InventoryLevel)
        const movementRepo = manager.getRepository(InventoryMovement)
        const current = await inventoryRepo.findOneByOrFail({ id: level.id })

        const quantityBefore = Number(current.quantity)
        const quantityAfter = this.calculateAdjustedQuantity(quantityBefore, dto)

        if (quantityAfter < 0) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.inventory_insufficient_stock'),
            'INVENTORY_INSUFFICIENT_STOCK',
            { currentQuantity: quantityBefore, requested: dto.quantity },
          )
        }

        await inventoryRepo.update(current.id, { quantity: quantityAfter })
        await movementRepo.save(
          movementRepo.create({
            businessId,
            productId,
            type: MovementType.MANUAL_ADJUSTMENT,
            quantityChange: quantityAfter - quantityBefore,
            quantityBefore,
            quantityAfter,
            referenceType: 'adjustment',
            notes: dto.notes.trim(),
            performedById: userId,
          }),
        )

        return this.findOne(productId, businessId)
      })
    } catch (error) {
      return this.handleServiceError('adjust', error, { productId, businessId, userId })
    }
  }

  async restock(businessId: string, userId: string, dto: RestockRequest) {
    try {
      return this.dataSource.transaction(async (manager) => {
        const productRepo = manager.getRepository(Product)
        const inventoryRepo = manager.getRepository(InventoryLevel)
        const movementRepo = manager.getRepository(InventoryMovement)
        const recordRepo = manager.getRepository(RestockRecord)
        const itemRepo = manager.getRepository(RestockItem)

        const record = await recordRepo.save(
          recordRepo.create({
            businessId,
            referenceNumber: dto.referenceNumber?.trim() ?? null,
            supplierName: dto.supplierName?.trim() ?? null,
            totalCost: dto.totalCost ?? null,
            notes: dto.notes?.trim() ?? null,
            performedById: userId,
          }),
        )

        const processedItems: Array<{ productId: string; quantity: number; newQuantity: number }> =
          []

        for (const item of dto.items) {
          const lastRestockAt = new Date()
          const product = await productRepo.findOne({
            where: { id: item.productId, businessId, deletedAt: IsNull() },
          })

          if (!product) {
            throw new AppNotFoundException(
              await this.i18n.translate('errors.product_not_found'),
              'PRODUCT_NOT_FOUND',
            )
          }

          if (!product.trackInventory) {
            this.logger.warn('Skipping restock for untracked product', 'InventoryService', {
              businessId,
              productId: item.productId,
            })
            continue
          }

          const level = await inventoryRepo.findOne({
            where: { businessId, productId: product.id },
          })
          const quantityBefore = Number(level?.quantity ?? 0)
          const quantityAfter = quantityBefore + item.quantity

          if (!level) {
            await inventoryRepo.save(
              inventoryRepo.create({
                businessId,
                productId: product.id,
                quantity: quantityAfter,
                lastRestockAt,
              }),
            )
          } else {
            await inventoryRepo.update(level.id, {
              quantity: quantityAfter,
              lastRestockAt,
            })
          }

          await itemRepo.save(
            itemRepo.create({
              restockRecordId: record.id,
              productId: product.id,
              quantity: item.quantity,
              unitCost: item.unitCost ?? null,
            }),
          )

          await movementRepo.save(
            movementRepo.create({
              businessId,
              productId: product.id,
              type: MovementType.RESTOCK_IN,
              quantityChange: item.quantity,
              quantityBefore,
              quantityAfter,
              referenceType: 'restock',
              referenceId: record.id,
              notes: dto.notes?.trim() ?? null,
              performedById: userId,
            }),
          )

          processedItems.push({
            productId: product.id,
            quantity: item.quantity,
            newQuantity: quantityAfter,
          })
        }

        return {
          ...record,
          items: processedItems,
        }
      })
    } catch (error) {
      return this.handleServiceError('restock', error, { businessId, userId })
    }
  }

  async getAlerts(businessId: string, query: InventoryAlertsQuery) {
    try {
      const qb = this.createAlertsQueryBuilder(businessId)
      const sort = this.resolveAlertSort(query.sortBy)
      const sortOrder = query.sortBy ? (query.sortOrder ?? 'ASC') : 'DESC'
      const page = Math.max(query.page ?? 1, 1)
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
      const skip = (page - 1) * limit

      qb.orderBy(sort, sortOrder).skip(skip).take(limit)

      const [rows, total] = await qb.getManyAndCount()
      return {
        data: await this.mapAlertRows(rows),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    } catch (error) {
      return this.handleServiceError('getAlerts', error, { businessId })
    }
  }

  async findBusinessIdsWithLowStockAlerts(): Promise<string[]> {
    const rows = await this.inventoryLevelsRepo
      .createQueryBuilder('inventory')
      .select('inventory.business_id', 'businessId')
      .innerJoin('inventory.product', 'product')
      .where('inventory.low_stock_threshold IS NOT NULL')
      .andWhere('inventory.quantity <= inventory.low_stock_threshold')
      .andWhere('product.deleted_at IS NULL')
      .andWhere('product.is_active = true')
      .andWhere('product.track_inventory = true')
      .distinct(true)
      .getRawMany<{ businessId: string }>()

    return rows.map((row) => row.businessId)
  }

  async buildLowStockAlertDigest(businessId: string): Promise<InventoryLowStockAlertDigest | null> {
    const business = await this.businessesRepo.findOne({
      where: { id: businessId },
      relations: ['owner'],
    })

    if (!business) {
      return null
    }

    const rows = await this.createAlertsQueryBuilder(businessId)
      .orderBy(this.resolveAlertSort(), 'DESC')
      .getMany()
    const alerts = await this.mapAlertRows(rows)

    if (alerts.length === 0) {
      return null
    }

    return {
      generatedAt: new Date().toISOString(),
      businessId: business.id,
      businessName: business.name,
      owner: business.owner
        ? {
          userId: business.owner.id,
          name: business.owner.name,
          email: business.owner.email ?? null,
          phone: business.owner.phone ?? null,
        }
        : null,
      alerts,
    }
  }

  async deductForSale(
    businessId: string,
    saleId: string,
    saleNumber: string,
    userId: string,
    items: SaleInventoryItemInput[],
    manager?: EntityManager,
  ): Promise<void> {
    try {
      const inventoryRepo = this.getInventoryRepo(manager)
      const movementRepo = this.getMovementRepo(manager)
      const productRepo = this.getProductRepo(manager)

      for (const item of items) {
        const product = await productRepo.findOne({
          where: { id: item.productId, businessId, deletedAt: IsNull() },
        })

        if (!product) {
          throw new AppNotFoundException(
            await this.i18n.translate('errors.product_not_found'),
            'PRODUCT_NOT_FOUND',
          )
        }

        if (!product.trackInventory) {
          continue
        }

        const level = await this.findInventoryLevelForUpdate(inventoryRepo, businessId, item.productId)
        const quantityBefore = Number(level?.quantity ?? 0)
        const quantityAfter = quantityBefore - item.quantity

        if (quantityAfter < 0) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.insufficient_stock', {
              args: {
                name: item.productName,
                available: quantityBefore,
                requested: item.quantity,
              },
            }),
            'INSUFFICIENT_STOCK',
            {
              productId: item.productId,
              productName: item.productName,
              available: quantityBefore,
              requested: item.quantity,
            },
          )
        }

        if (!level) {
          await inventoryRepo.save(
            inventoryRepo.create({
              businessId,
              productId: item.productId,
              quantity: quantityAfter,
            }),
          )
        } else {
          await inventoryRepo.update(level.id, { quantity: quantityAfter })
        }

        await movementRepo.save(
          movementRepo.create({
            id: item.movementId ?? undefined,
            businessId,
            productId: item.productId,
            type: MovementType.SALE,
            quantityChange: -item.quantity,
            quantityBefore,
            quantityAfter,
            referenceType: 'sale',
            referenceId: saleId,
            notes: `Sale ${saleNumber}`,
            performedById: userId,
          }),
        )
      }
    } catch (error) {
      return this.handleServiceError('deductForSale', error, { businessId, saleId, saleNumber, userId })
    }
  }

  async reverseForVoidedSale(
    businessId: string,
    saleId: string,
    saleNumber: string,
    userId: string,
    items: SaleInventoryItemInput[],
    manager?: EntityManager,
  ): Promise<void> {
    try {
      const inventoryRepo = this.getInventoryRepo(manager)
      const movementRepo = this.getMovementRepo(manager)
      const productRepo = this.getProductRepo(manager)

      for (const item of items) {
        const product = await productRepo.findOne({
          where: { id: item.productId, businessId, deletedAt: IsNull() },
        })

        if (!product) {
          throw new AppNotFoundException(
            await this.i18n.translate('errors.product_not_found'),
            'PRODUCT_NOT_FOUND',
          )
        }

        if (!product.trackInventory) {
          continue
        }

        const level = await this.findInventoryLevelForUpdate(inventoryRepo, businessId, item.productId)
        const quantityBefore = Number(level?.quantity ?? 0)
        const quantityAfter = quantityBefore + item.quantity

        if (!level) {
          await inventoryRepo.save(
            inventoryRepo.create({
              businessId,
              productId: item.productId,
              quantity: quantityAfter,
            }),
          )
        } else {
          await inventoryRepo.update(level.id, { quantity: quantityAfter })
        }

        await movementRepo.save(
          movementRepo.create({
            businessId,
            productId: item.productId,
            type: MovementType.VOID_REVERSAL,
            quantityChange: item.quantity,
            quantityBefore,
            quantityAfter,
            referenceType: 'sale_void',
            referenceId: saleId,
            notes: `Void ${saleNumber}`,
            performedById: userId,
          }),
        )
      }
    } catch (error) {
      return this.handleServiceError('reverseForVoidedSale', error, {
        businessId,
        saleId,
        saleNumber,
        userId,
      })
    }
  }

  private calculateAdjustedQuantity(currentQuantity: number, dto: AdjustInventoryRequest) {
    if (dto.type === StockAdjustmentType.ADD) return currentQuantity + dto.quantity
    if (dto.type === StockAdjustmentType.REMOVE) return currentQuantity - dto.quantity
    return dto.quantity
  }

  private validateAdjustment(dto: AdjustInventoryRequest) {
    const isAddOrRemove = dto.type === StockAdjustmentType.ADD || dto.type === StockAdjustmentType.REMOVE
    const isValid =
      (isAddOrRemove && dto.quantity > 0) ||
      (dto.type === StockAdjustmentType.SET && dto.quantity >= 0)

    if (!isValid) {
      throw new AppBadRequestException('Invalid adjustment quantity.', 'INVALID_INVENTORY_ADJUSTMENT_QUANTITY', {
        type: dto.type,
        quantity: dto.quantity,
      })
    }
  }

  private async findMovements(businessId: string, query: InventoryMovementsQuery) {
    const qb = this.inventoryMovementsRepo
      .createQueryBuilder('movement')
      .leftJoinAndSelect('movement.performedBy', 'performedBy')
      .where('movement.business_id = :businessId', { businessId })

    if (query.productId) {
      qb.andWhere('movement.product_id = :productId', { productId: query.productId })
    }

    if (query.type) {
      qb.andWhere('movement.type = :type', { type: query.type })
    }

    if (query.dateFrom) {
      qb.andWhere('movement.created_at >= :dateFrom', { dateFrom: query.dateFrom })
    }

    if (query.dateTo) {
      qb.andWhere('movement.created_at <= :dateTo', { dateTo: query.dateTo })
    }

    const sort = this.resolveMovementSort(query.sortBy)
    const sortOrder = query.sortOrder ?? 'DESC'
    const page = Math.max(query.page ?? 1, 1)
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
    const skip = (page - 1) * limit
    const [data, total] = await qb.orderBy(sort, sortOrder).skip(skip).take(limit).getManyAndCount()

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  private resolveMovementSort(field?: string) {
    const sortMap: Record<string, string> = {
      createdAt: 'movement.created_at',
      type: 'movement.type',
      quantityChange: 'movement.quantity_change',
      quantityBefore: 'movement.quantity_before',
      quantityAfter: 'movement.quantity_after',
    }

    return sortMap[field ?? ''] ?? 'movement.created_at'
  }

  private resolveAlertSort(field?: string) {
    const sortMap: Record<string, string> = {
      productName: 'product.name',
      sku: 'product.sku',
      currentQuantity: 'inventory.quantity',
      lowStockThreshold: 'inventory.low_stock_threshold',
      reorderPoint: 'inventory.reorder_point',
      shortfall: '(inventory.low_stock_threshold - inventory.quantity)',
    }

    return sortMap[field ?? ''] ?? '(inventory.low_stock_threshold - inventory.quantity)'
  }

  private createAlertsQueryBuilder(businessId: string) {
    return this.inventoryLevelsRepo
      .createQueryBuilder('inventory')
      .innerJoinAndSelect('inventory.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .where('inventory.business_id = :businessId', { businessId })
      .andWhere('product.deleted_at IS NULL')
      .andWhere('product.is_active = true')
      .andWhere('product.track_inventory = true')
      .andWhere('inventory.low_stock_threshold IS NOT NULL')
      .andWhere('inventory.quantity <= inventory.low_stock_threshold')
  }

  private async mapAlertRows(rows: InventoryLevel[]): Promise<InventoryAlert[]> {
    const primaryImageUrls = await this.loadPrimaryImageUrls(rows.map((row) => row.productId))

    return rows.map((row) => ({
      productId: row.productId,
      productName: row.product?.name ?? null,
      sku: row.product?.sku ?? null,
      primaryImageUrl: primaryImageUrls.get(row.productId) ?? row.product?.imageUrl ?? null,
      categoryName: row.product?.category?.name ?? null,
      currentQuantity: row.quantity,
      lowStockThreshold: row.lowStockThreshold ?? null,
      reorderPoint: row.reorderPoint ?? null,
      shortfall:
        row.lowStockThreshold !== null && row.lowStockThreshold !== undefined
          ? row.lowStockThreshold - row.quantity
          : 0,
    }))
  }

  private async loadPrimaryImageUrls(productIds: string[]) {
    const normalizedIds = [...new Set(productIds.filter(Boolean))]

    if (normalizedIds.length === 0) {
      return new Map<string, string>()
    }

    const images = await this.productImagesRepo
      .createQueryBuilder('image')
      .where('image.product_id IN (:...productIds)', { productIds: normalizedIds })
      .orderBy('image.sort_order', 'ASC')
      .addOrderBy('image.created_at', 'ASC')
      .getMany()

    const primaryImageUrls = new Map<string, string>()
    for (const image of images) {
      if (!primaryImageUrls.has(image.productId)) {
        primaryImageUrls.set(image.productId, image.url)
      }
    }

    return primaryImageUrls
  }

  private async requireTrackedProduct(productId: string, businessId: string) {
    const level = await this.inventoryLevelsRepo.findOne({
      where: { businessId, productId },
      relations: ['product', 'product.category', 'product.unitOfMeasure'],
    })

    if (!level || !level.product?.trackInventory) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.inventory_not_found'),
        'INVENTORY_NOT_FOUND',
      )
    }

    return level
  }

  private getInventoryRepo(manager?: EntityManager) {
    return manager?.getRepository(InventoryLevel) ?? this.inventoryLevelsRepo
  }

  private getMovementRepo(manager?: EntityManager) {
    return manager?.getRepository(InventoryMovement) ?? this.inventoryMovementsRepo
  }

  private getProductRepo(manager?: EntityManager) {
    return manager?.getRepository(Product) ?? this.productsRepo
  }

  private async findInventoryLevelForUpdate(
    inventoryRepo: Repository<InventoryLevel>,
    businessId: string,
    productId: string,
  ) {
    const qb = inventoryRepo
      .createQueryBuilder('inventory')
      .where('inventory.business_id = :businessId', { businessId })
      .andWhere('inventory.product_id = :productId', { productId })

    if (inventoryRepo.manager.queryRunner?.isTransactionActive) {
      qb.setLock('pessimistic_write')
    }

    return qb.getOne()
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('InventoryService error', 'InventoryService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    this.logger.error('InventoryService unexpected error', 'InventoryService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'INVENTORY_SERVICE_ERROR',
      { action },
    )
  }
}
