import { Inject, Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import { plainToInstance } from 'class-transformer'
import { validate, type ValidationError } from 'class-validator'
import type {
  ChangeSet,
  InventoryAdjustmentSyncPayload,
  InventoryLevelSyncRecord,
  InventoryMovementSyncRecord,
  InventoryRestockSyncPayload,
  InventoryThresholdSyncPayload,
  SaleItemSyncRecord,
  SalePaymentSyncRecord,
  SaleSyncPayload,
  SaleSyncRecord,
  RestockItemSyncRecord,
  RestockRecordSyncRecord,
  SyncBatchStatus,
  SyncBatchStatusResponse,
  SyncEntity,
  SyncOperationResult,
  SyncPullResponse,
  SyncPushResponse,
  SyncRecord,
  JwtPayload,
} from '@biztrack/types'
import {
  getSyncEntityDependencyTier,
  getSyncEntityStableOrder,
  PaymentMethod,
  StockAdjustmentType,
  UnitOfMeasureType,
} from '@biztrack/types'
import type { Logger, LogMetadata } from '@biztrack/logger'
import type { Queue } from 'bullmq'
import { I18nService } from 'nestjs-i18n'
import { DataSource, IsNull, Repository } from 'typeorm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { Business } from '@/entities/business.entity'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { InventoryMovement, MovementType } from '@/entities/inventory-movement.entity'
import { ProductCategory } from '@/entities/product-category.entity'
import { Product } from '@/entities/product.entity'
import { RestockItem } from '@/entities/restock-item.entity'
import { RestockRecord } from '@/entities/restock-record.entity'
import { SaleItem } from '@/entities/sale-item.entity'
import { SalePayment } from '@/entities/sale-payment.entity'
import { Sale } from '@/entities/sale.entity'
import { SyncBatch } from '@/entities/sync-batch.entity'
import { SyncOperation } from '@/entities/sync-operation.entity'
import { UnitOfMeasure } from '@/entities/unit-of-measure.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import { RestockDto } from '@/modules/inventory/dto/restock.dto'
import { CreateCategoryDto } from '@/modules/products/dto/create-category.dto'
import { CreateProductDto } from '@/modules/products/dto/create-product.dto'
import { CreateUnitOfMeasureDto } from '@/modules/products/dto/create-unit-of-measure.dto'
import { ProductCategoriesRepository } from '@/modules/products/repositories/product-categories.repository'
import { ProductsRepository } from '@/modules/products/repositories/products.repository'
import { BarcodeService } from '@/modules/products/services/barcode.service'
import { SlugService } from '@/modules/products/services/slug.service'
import { SkuService } from '@/modules/products/services/sku.service'
import { SalesService } from '@/modules/sales/services/sales.service'
import {
  SYNC_BATCH_MAX_OPERATIONS,
  SYNC_BATCH_RECOVERY_STALE_AFTER_MS,
  SYNC_BATCHES_QUEUE,
  SYNC_PROCESS_BATCH_JOB,
} from './constants/sync.constants'
import { PushSyncBatchDto } from './dto/push-sync-batch.dto'
import { SyncRealtimeService } from './services/sync-realtime.service'

type BatchProcessingResult = {
  status: 'applied' | 'conflict' | 'failed'
  resolution?: 'server_wins' | 'client_wins' | null
  errorMessage?: string | null
}

type CategorySyncPayload = {
  name?: string
  isActive?: boolean
  color?: string | null
  icon?: string | null
  imageUrl?: string | null
  sortOrder?: number | null
  createdAt?: string
  updatedAt?: string
  deletedAt?: string | null
  isDeleted?: boolean
}

type UnitSyncPayload = {
  name?: string
  abbreviation?: string | null
  businessId?: string | null
  type?: string | null
  isDefault?: boolean
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
  deletedAt?: string | null
  isDeleted?: boolean
}

type ProductSyncPayload = {
  name?: string
  description?: string | null
  sku?: string | null
  barcode?: string | null
  sellingPrice?: number
  costPrice?: number | null
  taxRate?: number
  openingStock?: number | null
  currentStock?: number | null
  lowStockThreshold?: number | null
  unitOfMeasureId?: string | null
  categoryId?: string | null
  imageUrl?: string | null
  isService?: boolean
  trackInventory?: boolean
  isActive?: boolean
  createdById?: string | null
  createdAt?: string
  updatedAt?: string
  deletedAt?: string | null
  isDeleted?: boolean
}

type DefaultUnitDescriptor = {
  name: string
  abbreviation: string
  type: UnitOfMeasureType
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const PIECE_UNIT: DefaultUnitDescriptor = {
  name: 'Piece',
  abbreviation: 'pcs',
  type: UnitOfMeasureType.QUANTITY,
}

const DEFAULT_UNIT_ALIASES: Record<string, DefaultUnitDescriptor> = {
  'uom-piece': PIECE_UNIT,
  piece: PIECE_UNIT,
  pcs: PIECE_UNIT,
  pc: PIECE_UNIT,
  qty: PIECE_UNIT,
  quantity: PIECE_UNIT,
  'uom-kilogram': {
    name: 'Kilogram',
    abbreviation: 'kg',
    type: UnitOfMeasureType.WEIGHT,
  },
  kilogram: {
    name: 'Kilogram',
    abbreviation: 'kg',
    type: UnitOfMeasureType.WEIGHT,
  },
  kg: {
    name: 'Kilogram',
    abbreviation: 'kg',
    type: UnitOfMeasureType.WEIGHT,
  },
  'uom-liter': {
    name: 'Liter',
    abbreviation: 'L',
    type: UnitOfMeasureType.VOLUME,
  },
  liter: {
    name: 'Liter',
    abbreviation: 'L',
    type: UnitOfMeasureType.VOLUME,
  },
  litre: {
    name: 'Liter',
    abbreviation: 'L',
    type: UnitOfMeasureType.VOLUME,
  },
  l: {
    name: 'Liter',
    abbreviation: 'L',
    type: UnitOfMeasureType.VOLUME,
  },
  'uom-meter': {
    name: 'Meter',
    abbreviation: 'm',
    type: UnitOfMeasureType.LENGTH,
  },
  meter: {
    name: 'Meter',
    abbreviation: 'm',
    type: UnitOfMeasureType.LENGTH,
  },
  metre: {
    name: 'Meter',
    abbreviation: 'm',
    type: UnitOfMeasureType.LENGTH,
  },
  m: {
    name: 'Meter',
    abbreviation: 'm',
    type: UnitOfMeasureType.LENGTH,
  },
  'uom-service': {
    name: 'Service',
    abbreviation: 'svc',
    type: UnitOfMeasureType.CUSTOM,
  },
  service: {
    name: 'Service',
    abbreviation: 'svc',
    type: UnitOfMeasureType.CUSTOM,
  },
  svc: {
    name: 'Service',
    abbreviation: 'svc',
    type: UnitOfMeasureType.CUSTOM,
  },
}

const TERMINAL_BATCH_STATUSES = new Set<SyncBatchStatus>([
  'completed',
  'partial',
  'failed',
  'enqueue_failed',
  'skipped',
])

@Injectable()
export class SyncService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly productsRepo: ProductsRepository,
    private readonly categoriesRepo: ProductCategoriesRepository,
    @InjectRepository(Business)
    private readonly businessesRepo: Repository<Business>,
    @InjectRepository(InventoryLevel)
    private readonly inventoryLevelsRepo: Repository<InventoryLevel>,
    @InjectRepository(InventoryMovement)
    private readonly inventoryMovementsRepo: Repository<InventoryMovement>,
    @InjectRepository(RestockRecord)
    private readonly restockRecordsRepo: Repository<RestockRecord>,
    @InjectRepository(RestockItem)
    private readonly restockItemsRepo: Repository<RestockItem>,
    @InjectRepository(Sale)
    private readonly salesRepo: Repository<Sale>,
    @InjectRepository(SaleItem)
    private readonly saleItemsRepo: Repository<SaleItem>,
    @InjectRepository(SalePayment)
    private readonly salePaymentsRepo: Repository<SalePayment>,
    @InjectRepository(SyncBatch)
    private readonly syncBatchesRepo: Repository<SyncBatch>,
    @InjectRepository(SyncOperation)
    private readonly syncOperationsRepo: Repository<SyncOperation>,
    @InjectRepository(UnitOfMeasure)
    private readonly unitsRepo: Repository<UnitOfMeasure>,
    private readonly salesService: SalesService,
    private readonly slugService: SlugService,
    private readonly skuService: SkuService,
    private readonly barcodeService: BarcodeService,
    private readonly i18n: I18nService<I18nTranslations>,
    @InjectQueue(SYNC_BATCHES_QUEUE)
    private readonly queue: Queue,
    private readonly realtime: SyncRealtimeService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('SyncService')
  }

  async enqueueBatch(
    businessId: string,
    user: JwtPayload,
    dto: PushSyncBatchDto,
  ): Promise<SyncPushResponse> {
    try {
      if (dto.operations.length === 0) {
        return {
          batchId: null,
          status: 'skipped',
          acceptedCount: 0,
        }
      }

      if (dto.operations.length > SYNC_BATCH_MAX_OPERATIONS) {
        throw new AppBadRequestException(
          `Sync batch cannot exceed ${SYNC_BATCH_MAX_OPERATIONS} operations.`,
          'SYNC_BATCH_TOO_LARGE',
          { maxOperations: SYNC_BATCH_MAX_OPERATIONS },
        )
      }

      const batch = await this.dataSource.transaction(async (manager) => {
        const batchesRepo = manager.getRepository(SyncBatch)
        const operationsRepo = manager.getRepository(SyncOperation)

        const persistedBatch = await batchesRepo.save(
          batchesRepo.create({
            businessId,
            deviceId: dto.deviceId,
            baseCursor: dto.baseCursor ? new Date(dto.baseCursor) : null,
            status: 'pending_enqueue',
            bullJobId: null,
            acceptedCount: dto.operations.length,
            processedCount: 0,
            appliedCount: 0,
            conflictCount: 0,
            failedCount: 0,
            startedAt: null,
            completedAt: null,
            lastError: null,
          }),
        )

        await operationsRepo.save(
          dto.operations.map((operation) =>
            operationsRepo.create({
              batchId: persistedBatch.id,
              businessId,
              deviceId: dto.deviceId,
              clientOperationId: operation.operationId,
              entity: operation.entity,
              action: operation.action,
              recordId: operation.recordId,
              recordUpdatedAt: new Date(operation.updatedAt),
              payload: this.prepareOperationPayload(operation.entity, operation.payload ?? null, user),
              status: 'pending',
              resolution: null,
              errorMessage: null,
            }),
          ),
        )

        return persistedBatch
      })

      const queuedBatch = await this.enqueuePersistedBatch(batch.id)

      if (!queuedBatch) {
        throw new AppInternalServerException(
          await this.i18n.translate('errors.server_error'),
          'SYNC_BATCH_QUEUEING_ERROR',
          { batchId: batch.id },
        )
      }

      return {
        batchId: queuedBatch.id,
        status: queuedBatch.status as SyncBatchStatus,
        acceptedCount: queuedBatch.acceptedCount,
        lastError: queuedBatch.lastError ?? null,
      }
    } catch (error) {
      return this.handleServiceError('enqueueBatch', error, {
        businessId,
        userId: user.sub,
        deviceId: dto.deviceId,
      })
    }
  }

  async getBatchStatus(businessId: string, batchId: string): Promise<SyncBatchStatusResponse> {
    try {
      let batch = await this.findBatchWithOperations(batchId, businessId)

      if (!batch) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.server_error'),
          'SYNC_BATCH_NOT_FOUND',
          { batchId },
        )
      }

      batch = await this.reconcileBatchState(batch)

      return this.toBatchStatusResponse(batch)
    } catch (error) {
      return this.handleServiceError('getBatchStatus', error, { businessId, batchId })
    }
  }

  async pullChanges(
    businessId: string,
    cursor: string | null,
    _limit?: number,
  ): Promise<SyncPullResponse> {
    try {
      const since = cursor ? new Date(cursor) : new Date(0)
      const pulledAt = new Date()

      const [
        products,
        productCategories,
        unitOfMeasures,
        inventoryLevels,
        inventoryMovements,
        restockRecords,
        restockItems,
        sales,
        saleItems,
        salePayments,
      ] = await Promise.all([
        this.productsRepo
          .createQueryBuilder('product')
          .withDeleted()
          .where('product.business_id = :businessId', { businessId })
          .andWhere('product.updated_at > :since', { since })
          .andWhere('product.updated_at <= :pulledAt', { pulledAt })
          .orderBy('product.updated_at', 'ASC')
          .getMany(),
        this.categoriesRepo
          .createQueryBuilder('category')
          .withDeleted()
          .where('category.business_id = :businessId', { businessId })
          .andWhere('category.updated_at > :since', { since })
          .andWhere('category.updated_at <= :pulledAt', { pulledAt })
          .orderBy('category.updated_at', 'ASC')
          .getMany(),
        this.unitsRepo
          .createQueryBuilder('unit')
          .withDeleted()
          .where('(unit.business_id IS NULL OR unit.business_id = :businessId)', { businessId })
          .andWhere('unit.updated_at > :since', { since })
          .andWhere('unit.updated_at <= :pulledAt', { pulledAt })
          .orderBy('unit.updated_at', 'ASC')
          .getMany(),
        this.inventoryLevelsRepo
          .createQueryBuilder('inventory')
          .where('inventory.business_id = :businessId', { businessId })
          .andWhere('inventory.updated_at > :since', { since })
          .andWhere('inventory.updated_at <= :pulledAt', { pulledAt })
          .orderBy('inventory.updated_at', 'ASC')
          .getMany(),
        this.inventoryMovementsRepo
          .createQueryBuilder('movement')
          .leftJoinAndSelect('movement.performedBy', 'performedBy')
          .where('movement.business_id = :businessId', { businessId })
          .andWhere('movement.created_at > :since', { since })
          .andWhere('movement.created_at <= :pulledAt', { pulledAt })
          .orderBy('movement.created_at', 'ASC')
          .getMany(),
        this.restockRecordsRepo
          .createQueryBuilder('restock')
          .where('restock.business_id = :businessId', { businessId })
          .andWhere('restock.created_at > :since', { since })
          .andWhere('restock.created_at <= :pulledAt', { pulledAt })
          .orderBy('restock.created_at', 'ASC')
          .getMany(),
        this.restockItemsRepo
          .createQueryBuilder('item')
          .innerJoin('item.restockRecord', 'restockRecord')
          .where('restockRecord.business_id = :businessId', { businessId })
          .andWhere('item.created_at > :since', { since })
          .andWhere('item.created_at <= :pulledAt', { pulledAt })
          .orderBy('item.created_at', 'ASC')
          .getMany(),
        this.salesRepo
          .createQueryBuilder('sale')
          .leftJoinAndSelect('sale.cashier', 'cashier')
          .leftJoinAndSelect('sale.payments', 'payments')
          .where('sale.business_id = :businessId', { businessId })
          .andWhere('sale.updated_at > :since', { since })
          .andWhere('sale.updated_at <= :pulledAt', { pulledAt })
          .orderBy('sale.updated_at', 'ASC')
          .getMany(),
        this.saleItemsRepo
          .createQueryBuilder('saleItem')
          .where('saleItem.business_id = :businessId', { businessId })
          .andWhere('saleItem.updated_at > :since', { since })
          .andWhere('saleItem.updated_at <= :pulledAt', { pulledAt })
          .orderBy('saleItem.updated_at', 'ASC')
          .getMany(),
        this.salePaymentsRepo
          .createQueryBuilder('salePayment')
          .where('salePayment.business_id = :businessId', { businessId })
          .andWhere('salePayment.created_at > :since', { since })
          .andWhere('salePayment.created_at <= :pulledAt', { pulledAt })
          .orderBy('salePayment.created_at', 'ASC')
          .getMany(),
      ])

      const restockQuantityMap = new Map(
        inventoryMovements
          .filter((record) => record.referenceType === 'restock' && record.referenceId)
          .map((record) => [`${record.referenceId}:${record.productId}`, record.quantityAfter] as const),
      )

      const changes: ChangeSet = {
        products: products.map((record) => this.toProductSyncRecord(record)),
        productCategories: productCategories.map((record) => this.toCategorySyncRecord(record)),
        unitOfMeasures: unitOfMeasures.map((record) => this.toUnitSyncRecord(record)),
        inventoryLevels: inventoryLevels.map((record) => this.toInventoryLevelSyncRecord(record)),
        inventoryMovements: inventoryMovements.map((record) =>
          this.toInventoryMovementSyncRecord(record),
        ),
        restockRecords: restockRecords.map((record) => this.toRestockRecordSyncRecord(record)),
        restockItems: restockItems.map((record) =>
          this.toRestockItemSyncRecord(
            record,
            restockQuantityMap.get(`${record.restockRecordId}:${record.productId}`) ?? null,
          ),
        ),
        sales: sales.map((record) => this.toSaleSyncRecord(record)),
        saleItems: saleItems.map((record) => this.toSaleItemSyncRecord(record)),
        salePayments: salePayments.map((record) => this.toSalePaymentSyncRecord(record)),
      }

      return {
        changes,
        cursor: pulledAt.toISOString(),
      }
    } catch (error) {
      return this.handleServiceError('pullChanges', error, { businessId, cursor })
    }
  }

  async processBatch(batchId: string): Promise<void> {
    const batch = await this.findBatchWithOperations(batchId)
    if (!batch || TERMINAL_BATCH_STATUSES.has(batch.status as SyncBatchStatus)) {
      this.logger.warn('Batch not found or already in terminal status, skipping processing', 'SyncService', { batchId })
      return
    }

    await this.syncBatchesRepo.update(batch.id, {
      status: 'processing',
      startedAt: batch.startedAt ?? new Date(),
      lastError: null,
    })

    await this.emitBatchStatus(batch.id)

    const sortedOperations = [...(batch.operations ?? [])].sort((left, right) => {
      const leftEntity = left.entity as SyncEntity
      const rightEntity = right.entity as SyncEntity
      const tierOrder = getSyncEntityDependencyTier(leftEntity) - getSyncEntityDependencyTier(rightEntity)
      if (tierOrder !== 0) {
        return tierOrder
      }

      const recordUpdatedAtOrder = left.recordUpdatedAt.getTime() - right.recordUpdatedAt.getTime()
      if (recordUpdatedAtOrder !== 0) {
        return recordUpdatedAtOrder
      }

      const entityOrder = getSyncEntityStableOrder(leftEntity) - getSyncEntityStableOrder(rightEntity)
      if (entityOrder !== 0) {
        return entityOrder
      }

      const createdAtOrder = left.createdAt.getTime() - right.createdAt.getTime()
      if (createdAtOrder !== 0) {
        return createdAtOrder
      }

      return left.id.localeCompare(right.id)
    })

    let processedCount = 0
    let appliedCount = 0
    let conflictCount = 0
    let failedCount = 0
    let firstFailureMessage: string | null = null

    try {
      for (const operation of sortedOperations) {
        if (operation.status !== 'pending') {
          processedCount += 1
          if (operation.status === 'applied') appliedCount += 1
          if (operation.status === 'conflict') conflictCount += 1
          if (operation.status === 'failed') failedCount += 1
          continue
        }

        const result = await this.processOperation(batch.businessId, operation)
        processedCount += 1

        if (result.status === 'applied') {
          appliedCount += 1
        } else if (result.status === 'conflict') {
          conflictCount += 1
        } else {
          failedCount += 1
          firstFailureMessage ??= result.errorMessage ?? null
        }

        await this.syncOperationsRepo.update(operation.id, {
          status: result.status,
          resolution: result.resolution ?? null,
          errorMessage: result.errorMessage ?? null,
        })
      }

      const status = this.resolveBatchStatus(processedCount, appliedCount, failedCount)

      await this.syncBatchesRepo.update(batch.id, {
        status,
        processedCount,
        appliedCount,
        conflictCount,
        failedCount,
        completedAt: new Date(),
        lastError: firstFailureMessage,
      })

      await this.emitBatchStatus(batch.id)
    } catch (error) {
      console.log(error, 'batch error')
      const message = error instanceof Error ? error.message : 'Unexpected sync batch processing failure.'

      await this.markPendingOperationsFailed(batch.id, message)
      await this.finalizeBatchFromPersistedOperations(batch.id, message)
      await this.emitBatchStatus(batch.id)

      throw error
    }
  }

  async recoverNonTerminalBatches(limit = 25): Promise<void> {
    const staleBefore = new Date(Date.now() - SYNC_BATCH_RECOVERY_STALE_AFTER_MS)

    const batches = await this.syncBatchesRepo
      .createQueryBuilder('batch')
      .where('batch.status IN (:...statuses)', {
        statuses: ['pending_enqueue', 'queued', 'processing'],
      })
      .andWhere('batch.created_at <= :staleBefore', { staleBefore })
      .orderBy('batch.created_at', 'ASC')
      .limit(limit)
      .getMany()

    for (const batch of batches) {
      try {
        await this.reconcileBatchState(batch)
      } catch (error) {
        this.logger.warn('Unable to reconcile non-terminal sync batch', 'SyncService', {
          batchId: batch.id,
          businessId: batch.businessId,
          message: error instanceof Error ? error.message : 'Unknown recovery error',
        })
      }
    }
  }

  private async processOperation(businessId: string, operation: SyncOperation): Promise<BatchProcessingResult> {
    try {
      if (operation.entity === 'product_category') {
        return this.applyCategoryOperation(businessId, operation)
      }

      if (operation.entity === 'product') {
        return this.applyProductOperation(businessId, operation)
      }

      if (operation.entity === 'unit_of_measure') {
        return this.applyUnitOfMeasureOperation(businessId, operation)
      }

      if (operation.entity === 'inventory_threshold') {
        return this.applyInventoryThresholdOperation(businessId, operation)
      }

      if (operation.entity === 'inventory_adjustment') {
        return this.applyInventoryAdjustmentOperation(businessId, operation)
      }

      if (operation.entity === 'inventory_restock') {
        return this.applyInventoryRestockOperation(businessId, operation)
      }

      if (operation.entity === 'sale') {
        return this.applySaleOperation(businessId, operation)
      }

      return {
        status: 'failed',
        errorMessage: `Unsupported sync entity: ${operation.entity}`,
      }
    } catch (error) {
      if (error instanceof AppException) {
        return {
          status: 'failed',
          errorMessage: error.message,
        }
      }

      this.logger.error('Sync operation failed unexpectedly', 'SyncService', {
        businessId,
        operationId: operation.id,
        entity: operation.entity,
        message: error instanceof Error ? error.message : 'Unknown error',
      })

      return {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unexpected sync failure',
      }
    }
  }

  private async applyCategoryOperation(businessId: string, operation: SyncOperation): Promise<BatchProcessingResult> {
    const existing = await this.categoriesRepo.findOne({
      where: { id: operation.recordId, businessId },
      withDeleted: true,
    })

    if (existing && operation.recordUpdatedAt <= existing.updatedAt) {
      return {
        status: 'conflict',
        resolution: 'server_wins',
      }
    }

    if (operation.action === 'DELETE' || Boolean(operation.payload?.isDeleted)) {
      if (existing) {
        await this.categoriesRepo.update(operation.recordId, {
          isActive: false,
          deletedAt: operation.recordUpdatedAt,
          updatedAt: operation.recordUpdatedAt,
        })
      }

      return { status: 'applied' }
    }

    const payload = this.readCategoryPayload(operation.payload)
    const dto = plainToInstance(CreateCategoryDto, {
      name: payload.name,
      color: payload.color ?? undefined,
      icon: payload.icon ?? undefined,
      imageUrl: payload.imageUrl ?? undefined,
      sortOrder: payload.sortOrder ?? undefined,
    })
    await this.ensureValidDto(dto)

    const slug = await this.slugService.generateCategorySlug(payload.name!, businessId, existing?.id)

    if (existing) {
      await this.categoriesRepo.update(operation.recordId, {
        name: payload.name!.trim(),
        slug,
        isActive: payload.isActive ?? existing.isActive,
        color: this.normalizeOptionalString(payload.color),
        icon: this.normalizeOptionalString(payload.icon),
        imageUrl: this.normalizeOptionalString(payload.imageUrl),
        sortOrder: payload.sortOrder ?? 0,
        deletedAt: null,
        updatedAt: operation.recordUpdatedAt,
      })
      return { status: 'applied' }
    }

    await this.categoriesRepo.save(
      this.categoriesRepo.create({
        id: operation.recordId,
        businessId,
        name: payload.name!.trim(),
        slug,
        isActive: payload.isActive ?? true,
        color: this.normalizeOptionalString(payload.color),
        icon: this.normalizeOptionalString(payload.icon),
        imageUrl: this.normalizeOptionalString(payload.imageUrl),
        sortOrder: payload.sortOrder ?? 0,
        createdAt: this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt,
        updatedAt: operation.recordUpdatedAt,
      }),
    )

    return { status: 'applied' }
  }

  private async applyUnitOfMeasureOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const existing = await this.unitsRepo.findOne({
      where: { id: operation.recordId },
      withDeleted: true,
    })

    if (existing && operation.recordUpdatedAt <= existing.updatedAt) {
      return {
        status: 'conflict',
        resolution: 'server_wins',
      }
    }

    if (operation.action === 'DELETE' || Boolean(operation.payload?.isDeleted)) {
      if (existing) {
        await this.unitsRepo.update(operation.recordId, {
          isActive: false,
          deletedAt: operation.recordUpdatedAt,
          updatedAt: operation.recordUpdatedAt,
        })
      }

      return { status: 'applied' }
    }

    const payload = this.readUnitPayload(operation.payload)
    const dto = plainToInstance(CreateUnitOfMeasureDto, {
      name: payload.name,
      abbreviation: payload.abbreviation,
      type: payload.type,
    })
    await this.ensureValidDto(dto)

    if (existing) {
      await this.unitsRepo.update(operation.recordId, {
        name: payload.name!.trim().toUpperCase(),
        abbreviation: payload.abbreviation?.trim() ?? '',
        type: payload.type! as UnitOfMeasureType,
        businessId: payload.businessId ?? businessId,
        isDefault: Boolean(payload.isDefault),
        isActive: payload.isActive ?? true,
        deletedAt: null,
        updatedAt: operation.recordUpdatedAt,
      })
      return { status: 'applied' }
    }

    await this.unitsRepo.save(
      this.unitsRepo.create({
        id: operation.recordId,
        name: payload.name!.trim().toUpperCase(),
        abbreviation: payload.abbreviation?.trim() ?? '',
        businessId: payload.businessId ?? businessId,
        type: payload.type! as UnitOfMeasureType,
        isDefault: Boolean(payload.isDefault),
        isActive: payload.isActive ?? true,
        createdAt: this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt,
        updatedAt: operation.recordUpdatedAt,
      }),
    )

    return { status: 'applied' }
  }

  private async applyProductOperation(businessId: string, operation: SyncOperation): Promise<BatchProcessingResult> {
    const existing = await this.productsRepo.findOne({
      where: { id: operation.recordId, businessId },
      withDeleted: true,
    })

    if (existing && operation.recordUpdatedAt <= existing.updatedAt) {
      return {
        status: 'conflict',
        resolution: 'server_wins',
      }
    }

    if (operation.action === 'DELETE' || Boolean(operation.payload?.isDeleted)) {
      if (existing) {
        await this.productsRepo.update(operation.recordId, {
          isActive: false,
          deletedAt: operation.recordUpdatedAt,
          updatedAt: operation.recordUpdatedAt,
        })
      }

      return { status: 'applied' }
    }

    const payload = this.readProductPayload(operation.payload)
    const unitOfMeasure = await this.resolveProductUnitOfMeasure(payload.unitOfMeasureId, businessId)
    const dto = plainToInstance(CreateProductDto, {
      name: payload.name,
      description: payload.description ?? undefined,
      sku: payload.sku ?? undefined,
      barcode: payload.barcode ?? undefined,
      sellingPrice: payload.sellingPrice,
      costPrice: payload.costPrice ?? undefined,
      taxRate: payload.taxRate ?? undefined,
      openingStock: payload.openingStock ?? payload.currentStock ?? undefined,
      lowStockThreshold: payload.lowStockThreshold ?? undefined,
      unitOfMeasureId: unitOfMeasure.id,
      categoryId: payload.categoryId ?? undefined,
      imageUrl: payload.imageUrl ?? undefined,
      isService: payload.isService ?? undefined,
      trackInventory: payload.trackInventory ?? undefined,
      isActive: payload.isActive ?? undefined,
    })
    await this.ensureValidDto(dto)

    const [business, category] = await Promise.all([
      this.findBusiness(businessId),
      payload.categoryId ? this.findCategory(payload.categoryId, businessId) : Promise.resolve(null),
    ])

    const slug = await this.slugService.generateProductSlug(payload.name!, businessId, existing?.id)
    const sku = await this.resolveProductSku(businessId, category?.slug ?? null, payload, existing?.id, existing?.sku ?? null)
    const barcode = await this.resolveProductBarcode(businessId, payload, existing, sku)
    const isService = payload.isService ?? existing?.isService ?? false
    const trackInventory =
      payload.trackInventory !== undefined
        ? payload.trackInventory
        : payload.isService === true
          ? false
          : existing?.trackInventory ?? !isService

    if (existing) {
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(Product).update(operation.recordId, {
          categoryId: category?.id ?? null,
          unitOfMeasureId: unitOfMeasure.id,
          name: payload.name!.trim(),
          slug,
          description: this.normalizeOptionalString(payload.description),
          barcode: barcode.value,
          barcodeType: barcode.type,
          isBarcodeGenerated: barcode.isGenerated,
          sellingPrice: payload.sellingPrice!,
          costPrice: payload.costPrice ?? null,
          taxRate: payload.taxRate ?? existing.taxRate ?? 0,
          isActive: payload.isActive ?? existing.isActive,
          isService,
          trackInventory,
          imageUrl: this.normalizeOptionalString(payload.imageUrl),
          deletedAt: null,
          updatedAt: operation.recordUpdatedAt,
        })

        const inventoryRepo = manager.getRepository(InventoryLevel)
        const inventoryLevel = await inventoryRepo.findOne({
          where: { businessId, productId: operation.recordId },
        })

        if (trackInventory && !inventoryLevel) {
          await inventoryRepo.save(
            inventoryRepo.create({
              businessId,
              productId: operation.recordId,
              quantity: 0,
              lowStockThreshold: payload.lowStockThreshold ?? null,
            }),
          )
        } else if (trackInventory && inventoryLevel) {
          await inventoryRepo.update(inventoryLevel.id, {
            lowStockThreshold:
              payload.lowStockThreshold === undefined
                ? inventoryLevel.lowStockThreshold
                : payload.lowStockThreshold,
          })
        } else if (!trackInventory && inventoryLevel) {
          await inventoryRepo.delete({ id: inventoryLevel.id })
        }
      })

      return { status: 'applied' }
    }

    const openingStock = trackInventory
      ? Math.max(payload.currentStock ?? payload.openingStock ?? 0, 0)
      : 0

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Product).save(
        manager.getRepository(Product).create({
          id: operation.recordId,
          businessId,
          categoryId: category?.id ?? null,
          unitOfMeasureId: unitOfMeasure.id,
          name: payload.name!.trim(),
          slug,
          description: this.normalizeOptionalString(payload.description),
          sku,
          barcode: barcode.value,
          barcodeType: barcode.type,
          isBarcodeGenerated: barcode.isGenerated,
          sellingPrice: payload.sellingPrice!,
          costPrice: payload.costPrice ?? null,
          currency: business.currency,
          taxRate: payload.taxRate ?? 0,
          isActive: payload.isActive ?? true,
          isService,
          trackInventory,
          imageUrl: this.normalizeOptionalString(payload.imageUrl),
          createdById: payload.createdById ?? null,
          createdAt: this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt,
          updatedAt: operation.recordUpdatedAt,
        }),
      )

      if (trackInventory) {
        await manager.getRepository(InventoryLevel).save(
          manager.getRepository(InventoryLevel).create({
            businessId,
            productId: operation.recordId,
            quantity: openingStock,
            lowStockThreshold: payload.lowStockThreshold ?? null,
          }),
        )

        if (openingStock > 0) {
          await manager.getRepository(InventoryMovement).save(
            manager.getRepository(InventoryMovement).create({
              id: operation.recordId,
              businessId,
              productId: operation.recordId,
              type: MovementType.OPENING_STOCK,
              quantityChange: openingStock,
              quantityBefore: 0,
              quantityAfter: openingStock,
              referenceType: 'product',
              referenceId: operation.recordId,
              notes: 'Opening stock set during sync',
              performedById: payload.createdById ?? null,
            }),
          )
        }
      }
    })

    return { status: 'applied' }
  }

  private async applyInventoryThresholdOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const payload = this.readInventoryThresholdPayload(operation.payload)
    const product = await this.productsRepo.findOne({
      where: { id: payload.productId, businessId, deletedAt: IsNull() },
    })

    if (!product || !product.trackInventory) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.inventory_not_found'),
        'INVENTORY_NOT_FOUND',
      )
    }

    const existingLevel = await this.inventoryLevelsRepo.findOne({
      where: { businessId, productId: payload.productId },
    })

    if (existingLevel && operation.recordUpdatedAt <= existingLevel.updatedAt) {
      return {
        status: 'conflict',
        resolution: 'server_wins',
      }
    }

    if (existingLevel) {
      await this.inventoryLevelsRepo.update(existingLevel.id, {
        lowStockThreshold: payload.lowStockThreshold ?? null,
        reorderPoint: payload.reorderPoint ?? null,
        updatedAt: operation.recordUpdatedAt,
      })
      return { status: 'applied' }
    }

    await this.inventoryLevelsRepo.save(
      this.inventoryLevelsRepo.create({
        businessId,
        productId: payload.productId,
        quantity: 0,
        lowStockThreshold: payload.lowStockThreshold ?? null,
        reorderPoint: payload.reorderPoint ?? null,
        createdAt: operation.recordUpdatedAt,
        updatedAt: operation.recordUpdatedAt,
      }),
    )

    return { status: 'applied' }
  }

  private async applyInventoryAdjustmentOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const payload = this.readInventoryAdjustmentPayload(operation.payload)
    const product = await this.productsRepo.findOne({
      where: { id: payload.productId, businessId, deletedAt: IsNull() },
    })

    if (!product || !product.trackInventory) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.inventory_not_found'),
        'INVENTORY_NOT_FOUND',
      )
    }

    const existingMovement = await this.inventoryMovementsRepo.findOne({
      where: { id: operation.recordId, businessId },
    })

    if (existingMovement) {
      return { status: 'applied' }
    }

    return this.dataSource.transaction(async (manager) => {
      const inventoryRepo = manager.getRepository(InventoryLevel)
      const movementRepo = manager.getRepository(InventoryMovement)

      const level =
        (await inventoryRepo.findOne({
          where: { businessId, productId: payload.productId },
        })) ??
        (await inventoryRepo.save(
          inventoryRepo.create({
            businessId,
            productId: payload.productId,
            quantity: 0,
            createdAt: operation.recordUpdatedAt,
            updatedAt: operation.recordUpdatedAt,
          }),
        ))

      const quantityBefore = Number(level.quantity)
      const quantityAfter = this.calculateAdjustmentQuantity(quantityBefore, payload)

      if (quantityAfter < 0) {
        return {
          status: 'conflict',
          resolution: 'server_wins',
          errorMessage: 'Inventory quantity changed on another device. Unable to apply this adjustment.',
        }
      }

      await inventoryRepo.update(level.id, {
        quantity: quantityAfter,
        updatedAt: operation.recordUpdatedAt,
      })

      await movementRepo.save(
        movementRepo.create({
          id: operation.recordId,
          businessId,
          productId: payload.productId,
          type: MovementType.MANUAL_ADJUSTMENT,
          quantityChange: quantityAfter - quantityBefore,
          quantityBefore,
          quantityAfter,
          referenceType: 'adjustment',
          referenceId: payload.productId,
          notes: payload.notes.trim(),
          performedById: null,
          createdAt: this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt,
        }),
      )

      return { status: 'applied' }
    })
  }

  private async applyInventoryRestockOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const payload = this.readInventoryRestockPayload(operation.payload)
    const dto = plainToInstance(RestockDto, payload)
    await this.ensureValidDto(dto)
    const existingRecord = await this.restockRecordsRepo.findOne({
      where: { id: operation.recordId, businessId },
    })

    if (existingRecord) {
      return { status: 'applied' }
    }

    return this.dataSource.transaction(async (manager) => {
      const productRepo = manager.getRepository(Product)
      const inventoryRepo = manager.getRepository(InventoryLevel)
      const movementRepo = manager.getRepository(InventoryMovement)
      const recordRepo = manager.getRepository(RestockRecord)
      const itemRepo = manager.getRepository(RestockItem)
      const createdAt = this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt

      await recordRepo.save(
        recordRepo.create({
          id: operation.recordId,
          businessId,
          referenceNumber: payload.referenceNumber?.trim() ?? null,
          supplierName: payload.supplierName?.trim() ?? null,
          totalCost: payload.totalCost ?? null,
          notes: payload.notes?.trim() ?? null,
          performedById: null,
          createdAt,
        }),
      )

      for (const item of payload.items) {
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

        const level =
          (await inventoryRepo.findOne({
            where: { businessId, productId: item.productId },
          })) ??
          (await inventoryRepo.save(
            inventoryRepo.create({
              businessId,
              productId: item.productId,
              quantity: 0,
              createdAt,
              updatedAt: createdAt,
            }),
          ))

        const quantityBefore = Number(level.quantity)
        const quantityAfter = quantityBefore + item.quantity

        await inventoryRepo.update(level.id, {
          quantity: quantityAfter,
          lastRestockAt: createdAt,
          updatedAt: operation.recordUpdatedAt,
        })

        await itemRepo.save(
          itemRepo.create({
            id: item.id,
            restockRecordId: operation.recordId,
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost ?? null,
            createdAt,
          }),
        )

        await movementRepo.save(
          movementRepo.create({
            id: item.movementId,
            businessId,
            productId: item.productId,
            type: MovementType.RESTOCK_IN,
            quantityChange: item.quantity,
            quantityBefore,
            quantityAfter,
            referenceType: 'restock',
            referenceId: operation.recordId,
            notes: payload.notes?.trim() ?? null,
            performedById: null,
            createdAt,
          }),
        )
      }

      return { status: 'applied' }
    })
  }

  private async applySaleOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    if (operation.action === 'DELETE') {
      return {
        status: 'failed',
        errorMessage: 'Deleting synced sales is not supported.',
      }
    }

    const payload = this.readSalePayload(operation.payload)
    const existing = await this.salesRepo.findOne({
      where: [
        { id: payload.saleId, businessId },
        { businessId, clientId: payload.clientId },
      ],
    })

    if (existing) {
      return { status: 'applied' }
    }

    await this.salesService.createFromSync(businessId, payload)
    return { status: 'applied' }
  }

  private async resolveProductSku(
    businessId: string,
    categorySlug: string | null,
    payload: ProductSyncPayload,
    productId?: string,
    existingSku?: string | null,
  ) {
    if (existingSku) {
      const incomingSku = payload.sku?.trim().toUpperCase()
      if (incomingSku && incomingSku !== existingSku) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.product_sku_immutable'),
          'PRODUCT_SKU_IMMUTABLE',
        )
      }

      return existingSku
    }

    if (payload.sku) {
      return this.skuService.validateAndNormalize(businessId, payload.sku, productId)
    }

    return this.skuService.generate(businessId, categorySlug ?? undefined)
  }

  private async resolveProductBarcode(
    businessId: string,
    payload: ProductSyncPayload,
    existing: Product | null,
    sku: string,
  ) {
    if (payload.barcode) {
      return this.barcodeService.validateAndNormalize(businessId, payload.barcode, existing?.id)
    }

    if (existing?.barcode) {
      return {
        value: existing.barcode,
        type: existing.barcodeType,
        isGenerated: existing.isBarcodeGenerated,
      }
    }

    return this.barcodeService.generateFromSKU(sku)
  }

  private async findBusiness(businessId: string) {
    const business = await this.businessesRepo.findOne({ where: { id: businessId } })

    if (!business) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.business_not_found'),
        'BUSINESS_NOT_FOUND',
      )
    }

    return business
  }

  private async findCategory(categoryId: string, businessId: string) {
    const category = await this.categoriesRepo.findOne({
      where: { id: categoryId, businessId, deletedAt: IsNull() },
    })

    if (!category) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.category_not_found'),
        'CATEGORY_NOT_FOUND',
      )
    }

    return category
  }

  private async findUnitOfMeasure(unitOfMeasureId: string, businessId: string) {
    const unit = await this.unitsRepo.findOne({
      where: [
        { id: unitOfMeasureId, businessId: IsNull() },
        { id: unitOfMeasureId, businessId },
      ],
    })

    if (!unit) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.unit_of_measure_not_found'),
        'UNIT_OF_MEASURE_NOT_FOUND',
      )
    }

    return unit
  }

  private async resolveProductUnitOfMeasure(unitOfMeasureId: string | null | undefined, businessId: string) {
    const normalizedId = this.normalizeOptionalString(unitOfMeasureId)

    if (!normalizedId) {
      throw new AppBadRequestException(
        'unitOfMeasureId is required',
        'SYNC_PAYLOAD_INVALID',
      )
    }

    if (UUID_REGEX.test(normalizedId)) {
      return await this.findUnitOfMeasure(normalizedId, businessId)
    }

    const alias = DEFAULT_UNIT_ALIASES[normalizedId.toLowerCase()]

    if (alias) {
      const unit = await this.unitsRepo.findOne({
        where: {
          businessId: IsNull(),
          name: alias.name,
          type: alias.type,
          deletedAt: IsNull(),
        },
      })

      if (unit) {
        return unit
      }
    }

    const canonicalName = this.normalizeUnitNameCandidate(normalizedId)
    const normalizedAbbreviation = normalizedId.toLowerCase()

    const candidates = await this.unitsRepo.find({
      where: [
        { businessId: IsNull(), deletedAt: IsNull() },
        { businessId, deletedAt: IsNull() },
      ],
    })

    const match = candidates.find((candidate) => {
      const candidateName = candidate.name.trim().toLowerCase()
      const candidateAbbreviation = candidate.abbreviation.trim().toLowerCase()

      return candidateName === canonicalName || candidateAbbreviation === normalizedAbbreviation
    })

    if (match) {
      return match
    }

    throw new AppBadRequestException(
      'unitOfMeasureId must reference a known unit of measure',
      'SYNC_PAYLOAD_INVALID',
    )
  }

  private async findBatchWithOperations(batchId: string, businessId?: string) {
    const where = businessId ? { id: batchId, businessId } : { id: batchId }
    return this.syncBatchesRepo.findOne({
      where,
      relations: ['operations'],
    })
  }

  private async enqueuePersistedBatch(batchId: string) {
    const batch = await this.findBatchWithOperations(batchId)
    if (!batch || TERMINAL_BATCH_STATUSES.has(batch.status as SyncBatchStatus)) {
      return batch
    }

    try {
      const jobId = this.buildQueueJobId(batch.id)
      const job = await this.queue.add(
        SYNC_PROCESS_BATCH_JOB,
        { batchId: batch.id },
        { jobId },
      )

      await this.syncBatchesRepo.update(batch.id, {
        status: 'queued',
        bullJobId: String(job.id),
        completedAt: null,
        lastError: null,
      })

      const queuedBatch = await this.findBatchWithOperations(batch.id)
      if (queuedBatch) {
        this.logger.log('Queued sync batch job', 'SyncService', {
          queue: SYNC_BATCHES_QUEUE,
          batchId: queuedBatch.id,
          bullJobId: queuedBatch.bullJobId,
          acceptedCount: queuedBatch.acceptedCount,
          deviceId: queuedBatch.deviceId,
        })

        await this.emitBatchStatus(queuedBatch.id)
      }

      return queuedBatch
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync batch could not be queued.'

      await this.syncBatchesRepo.update(batch.id, {
        status: 'enqueue_failed',
        completedAt: new Date(),
        lastError: message,
      })

      const failedBatch = await this.findBatchWithOperations(batch.id)
      if (failedBatch) {
        await this.emitBatchStatus(failedBatch.id)
      }

      return failedBatch
    }
  }

  private async reconcileBatchState(batch: SyncBatch) {
    if (TERMINAL_BATCH_STATUSES.has(batch.status as SyncBatchStatus)) {
      return batch
    }

    if (batch.status === 'pending_enqueue') {
      const queuedBatch = await this.enqueuePersistedBatch(batch.id)
      return queuedBatch ?? batch
    }

    const job = await this.findQueueJob(batch)
    if (!job) {
      if (batch.status === 'queued') {
        const requeuedBatch = await this.enqueuePersistedBatch(batch.id)
        return requeuedBatch ?? batch
      }

      await this.markPendingOperationsFailed(batch.id, 'Sync batch job could not be found.')
      const finalizedBatch = await this.finalizeBatchFromPersistedOperations(
        batch.id,
        'Sync batch job could not be found.',
      )
      return finalizedBatch ?? batch
    }

    const jobState = await job.getState()

    if (jobState === 'active' && batch.status !== 'processing') {
      await this.syncBatchesRepo.update(batch.id, {
        status: 'processing',
        startedAt: batch.startedAt ?? new Date(),
        lastError: null,
      })

      const processingBatch = await this.findBatchWithOperations(batch.id)
      return processingBatch ?? batch
    }

    if (jobState === 'waiting' || jobState === 'delayed' || jobState === 'prioritized') {
      if (batch.status !== 'queued') {
        await this.syncBatchesRepo.update(batch.id, {
          status: 'queued',
          bullJobId: String(job.id),
          lastError: null,
        })
      }

      const queuedBatch = await this.findBatchWithOperations(batch.id)
      return queuedBatch ?? batch
    }

    if (jobState === 'completed') {
      const pendingMessage = 'Sync batch finished without marking every operation.'
      await this.markPendingOperationsFailed(batch.id, pendingMessage)
      const finalizedBatch = await this.finalizeBatchFromPersistedOperations(batch.id)
      if (finalizedBatch && !TERMINAL_BATCH_STATUSES.has(finalizedBatch.status as SyncBatchStatus)) {
        await this.syncBatchesRepo.update(batch.id, {
          status: 'failed',
          completedAt: new Date(),
          lastError: pendingMessage,
        })
      }

      const reconciledBatch = await this.findBatchWithOperations(batch.id)
      if (reconciledBatch) {
        await this.emitBatchStatus(reconciledBatch.id)
        return reconciledBatch
      }
    }

    if (jobState === 'failed') {
      const failedReason =
        job.failedReason?.trim() || batch.lastError || 'Sync batch failed while processing.'

      await this.markPendingOperationsFailed(batch.id, failedReason)
      const finalizedBatch = await this.finalizeBatchFromPersistedOperations(batch.id, failedReason)
      if (finalizedBatch) {
        await this.emitBatchStatus(finalizedBatch.id)
        return finalizedBatch
      }
    }

    return (await this.findBatchWithOperations(batch.id)) ?? batch
  }

  private buildQueueJobId(batchId: string) {
    return `${SYNC_PROCESS_BATCH_JOB}-${batchId}`
  }

  private async findQueueJob(batch: Pick<SyncBatch, 'id' | 'bullJobId'>) {
    const jobId = batch.bullJobId ?? this.buildQueueJobId(batch.id)
    return this.queue.getJob(jobId)
  }

  private async markPendingOperationsFailed(batchId: string, errorMessage: string) {
    await this.syncOperationsRepo
      .createQueryBuilder()
      .update(SyncOperation)
      .set({
        status: 'failed',
        errorMessage,
      })
      .where('batch_id = :batchId', { batchId })
      .andWhere('status = :status', { status: 'pending' })
      .execute()
  }

  private async finalizeBatchFromPersistedOperations(batchId: string, lastError?: string | null) {
    const batch = await this.findBatchWithOperations(batchId)
    if (!batch) {
      return null
    }

    const counts = this.countBatchResults(batch.operations ?? [])
    const status = this.resolveBatchStatus(
      counts.processedCount,
      counts.appliedCount,
      counts.failedCount,
    )

    await this.syncBatchesRepo.update(batch.id, {
      status,
      processedCount: counts.processedCount,
      appliedCount: counts.appliedCount,
      conflictCount: counts.conflictCount,
      failedCount: counts.failedCount,
      completedAt: new Date(),
      lastError: lastError ?? this.resolveFirstBatchError(batch.operations ?? []) ?? null,
    })

    return this.findBatchWithOperations(batch.id)
  }

  private countBatchResults(operations: SyncOperation[]) {
    let processedCount = 0
    let appliedCount = 0
    let conflictCount = 0
    let failedCount = 0

    for (const operation of operations) {
      if (operation.status === 'pending') {
        continue
      }

      processedCount += 1

      if (operation.status === 'applied') {
        appliedCount += 1
      } else if (operation.status === 'conflict') {
        conflictCount += 1
      } else if (operation.status === 'failed') {
        failedCount += 1
      }
    }

    return {
      processedCount,
      appliedCount,
      conflictCount,
      failedCount,
    }
  }

  private resolveFirstBatchError(operations: SyncOperation[]) {
    return operations.find((operation) => operation.status === 'failed' && operation.errorMessage)
      ?.errorMessage ?? null
  }

  private async emitBatchStatus(batchId: string) {
    const batch = await this.findBatchWithOperations(batchId)
    if (!batch) {
      this.logger.warn('Batch not found or already in terminal status, skipping processing', 'SyncService', { batchId })
      return
    }

    this.realtime.emitBatchStatus(
      batch.businessId,
      batch.deviceId,
      this.toBatchStatusResponse(batch),
    )
  }

  private toBatchStatusResponse(batch: SyncBatch): SyncBatchStatusResponse {
    return {
      batchId: batch.id,
      status: batch.status as SyncBatchStatus,
      acceptedCount: batch.acceptedCount,
      processedCount: batch.processedCount,
      appliedCount: batch.appliedCount,
      conflictCount: batch.conflictCount,
      failedCount: batch.failedCount,
      queuedAt: batch.createdAt.toISOString(),
      startedAt: batch.startedAt?.toISOString() ?? null,
      completedAt: batch.completedAt?.toISOString() ?? null,
      lastError: batch.lastError ?? null,
      results: [...(batch.operations ?? [])]
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
        .map((operation) => this.toOperationResult(operation)),
    }
  }

  private toOperationResult(operation: SyncOperation): SyncOperationResult {
    return {
      operationId: operation.clientOperationId,
      entity: operation.entity as SyncOperationResult['entity'],
      recordId: operation.recordId,
      status: operation.status as SyncOperationResult['status'],
      resolution:
        operation.resolution === 'server_wins' || operation.resolution === 'client_wins'
          ? operation.resolution
          : null,
      errorMessage: operation.errorMessage ?? null,
    }
  }

  private toProductSyncRecord(record: Product): SyncRecord {
    return {
      id: record.id,
      businessId: record.businessId,
      name: record.name,
      slug: record.slug,
      description: record.description ?? null,
      sku: record.sku,
      barcode: record.barcode,
      barcodeType: record.barcodeType ?? null,
      isBarcodeGenerated: record.isBarcodeGenerated,
      sellingPrice: record.sellingPrice,
      costPrice: record.costPrice ?? null,
      currency: record.currency,
      taxRate: record.taxRate,
      isService: record.isService,
      trackInventory: record.trackInventory,
      categoryId: record.categoryId ?? null,
      unitOfMeasureId: record.unitOfMeasureId,
      imageUrl: record.imageUrl ?? null,
      createdById: record.createdById ?? null,
      isActive: record.isActive,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      deletedAt: record.deletedAt?.toISOString() ?? null,
      isDeleted: Boolean(record.deletedAt),
    }
  }

  private toCategorySyncRecord(record: ProductCategory): SyncRecord {
    return {
      id: record.id,
      businessId: record.businessId,
      name: record.name,
      slug: record.slug,
      isActive: record.isActive,
      color: record.color ?? null,
      icon: record.icon ?? null,
      imageUrl: record.imageUrl ?? null,
      sortOrder: record.sortOrder,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      deletedAt: record.deletedAt?.toISOString() ?? null,
      isDeleted: Boolean(record.deletedAt),
    }
  }

  private toUnitSyncRecord(record: UnitOfMeasure): SyncRecord {
    return {
      id: record.id,
      name: record.name,
      abbreviation: record.abbreviation,
      businessId: record.businessId ?? null,
      type: record.type,
      isDefault: record.isDefault,
      isActive: record.isActive,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      deletedAt: record.deletedAt?.toISOString() ?? null,
      isDeleted: Boolean(record.deletedAt),
    }
  }

  private toInventoryLevelSyncRecord(record: InventoryLevel): InventoryLevelSyncRecord {
    return {
      id: record.id,
      businessId: record.businessId,
      productId: record.productId,
      quantity: record.quantity,
      lowStockThreshold: record.lowStockThreshold ?? null,
      reorderPoint: record.reorderPoint ?? null,
      lastRestockAt: record.lastRestockAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      deletedAt: null,
      isDeleted: false,
    }
  }

  private toInventoryMovementSyncRecord(record: InventoryMovement): InventoryMovementSyncRecord {
    return {
      id: record.id,
      businessId: record.businessId,
      productId: record.productId,
      type: record.type as unknown as InventoryMovementSyncRecord['type'],
      quantityChange: record.quantityChange,
      quantityBefore: record.quantityBefore,
      quantityAfter: record.quantityAfter,
      referenceType: record.referenceType ?? null,
      referenceId: record.referenceId ?? null,
      notes: record.notes ?? null,
      performedById: record.performedById ?? null,
      performedByName: record.performedBy?.name ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.createdAt.toISOString(),
      deletedAt: null,
      isDeleted: false,
    }
  }

  private toRestockRecordSyncRecord(record: RestockRecord): RestockRecordSyncRecord {
    return {
      id: record.id,
      businessId: record.businessId,
      referenceNumber: record.referenceNumber ?? null,
      supplierName: record.supplierName ?? null,
      totalCost: record.totalCost ?? null,
      notes: record.notes ?? null,
      performedById: record.performedById ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.createdAt.toISOString(),
      deletedAt: null,
      isDeleted: false,
    }
  }

  private toRestockItemSyncRecord(
    record: RestockItem,
    newQuantity: number | null,
  ): RestockItemSyncRecord {
    return {
      id: record.id,
      restockRecordId: record.restockRecordId,
      productId: record.productId,
      quantity: record.quantity,
      unitCost: record.unitCost ?? null,
      newQuantity,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.createdAt.toISOString(),
      deletedAt: null,
      isDeleted: false,
    }
  }

  private toSaleSyncRecord(record: Sale): SaleSyncRecord {
    const paymentMethods = [...new Set((record.payments ?? []).map((payment) => payment.method))]
    const paymentMethod =
      paymentMethods.length > 1
        ? PaymentMethod.MIXED
        : (paymentMethods[0] ?? null)

    return {
      id: record.id,
      businessId: record.businessId,
      clientId: record.clientId,
      cashierId: record.cashierId,
      cashierName: record.cashier?.name ?? null,
      saleNumber: record.saleNumber,
      status: record.status,
      subtotal: record.subtotal,
      discountAmount: record.discountAmount,
      taxAmount: record.taxAmount,
      totalAmount: record.totalAmount,
      amountPaid: record.amountPaid,
      changeGiven: record.changeGiven,
      customerName: record.customerName ?? null,
      customerPhone: record.customerPhone ?? null,
      notes: record.notes ?? null,
      priceDriftWarning: record.priceDriftWarning,
      saleDate: record.saleDate,
      soldAt: record.soldAt.toISOString(),
      syncedAt: record.syncedAt?.toISOString() ?? null,
      voidedAt: record.voidedAt?.toISOString() ?? null,
      voidedById: record.voidedById ?? null,
      voidReason: record.voidReason ?? null,
      currency: 'XAF',
      paymentMethod,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      deletedAt: record.deletedAt?.toISOString() ?? null,
      isDeleted: Boolean(record.deletedAt),
    }
  }

  private toSaleItemSyncRecord(record: SaleItem): SaleItemSyncRecord {
    return {
      id: record.id,
      saleId: record.saleId,
      businessId: record.businessId,
      productId: record.productId,
      productName: record.productName,
      productSku: record.productSku ?? null,
      unitOfMeasure: record.unitOfMeasure ?? null,
      quantity: record.quantity,
      unitPrice: record.unitPrice,
      discountAmount: record.discountAmount,
      lineTotal: record.lineTotal,
      costPrice: record.costPrice ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      deletedAt: record.deletedAt?.toISOString() ?? null,
      isDeleted: Boolean(record.deletedAt),
    }
  }

  private toSalePaymentSyncRecord(record: SalePayment): SalePaymentSyncRecord {
    return {
      id: record.id,
      saleId: record.saleId,
      businessId: record.businessId,
      method: record.method,
      amount: record.amount,
      mobileMoneyReference: record.mobileMoneyReference ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.createdAt.toISOString(),
      deletedAt: null,
      isDeleted: false,
    }
  }

  private resolveBatchStatus(
    processedCount: number,
    appliedCount: number,
    failedCount: number,
  ): SyncBatchStatus {
    if (processedCount === 0) {
      return 'queued'
    }

    if (appliedCount === processedCount) {
      return 'completed'
    }

    if (failedCount === processedCount) {
      return 'failed'
    }

    return 'partial'
  }

  private readCategoryPayload(payload: Record<string, unknown> | null): CategorySyncPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException('Category sync payload is required.', 'SYNC_CATEGORY_PAYLOAD_REQUIRED')
    }

    return payload as CategorySyncPayload
  }

  private readUnitPayload(payload: Record<string, unknown> | null): UnitSyncPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Unit of measure sync payload is required.',
        'SYNC_UNIT_OF_MEASURE_PAYLOAD_REQUIRED',
      )
    }

    return payload as UnitSyncPayload
  }

  private readProductPayload(payload: Record<string, unknown> | null): ProductSyncPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException('Product sync payload is required.', 'SYNC_PRODUCT_PAYLOAD_REQUIRED')
    }

    return payload as ProductSyncPayload
  }

  private readInventoryThresholdPayload(
    payload: Record<string, unknown> | null,
  ): InventoryThresholdSyncPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Inventory threshold sync payload is required.',
        'SYNC_INVENTORY_THRESHOLD_PAYLOAD_REQUIRED',
      )
    }

    return payload as unknown as InventoryThresholdSyncPayload
  }

  private readInventoryAdjustmentPayload(
    payload: Record<string, unknown> | null,
  ): InventoryAdjustmentSyncPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Inventory adjustment sync payload is required.',
        'SYNC_INVENTORY_ADJUSTMENT_PAYLOAD_REQUIRED',
      )
    }

    return payload as unknown as InventoryAdjustmentSyncPayload
  }

  private readInventoryRestockPayload(
    payload: Record<string, unknown> | null,
  ): InventoryRestockSyncPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Inventory restock sync payload is required.',
        'SYNC_INVENTORY_RESTOCK_PAYLOAD_REQUIRED',
      )
    }

    return payload as unknown as InventoryRestockSyncPayload
  }

  private readSalePayload(payload: Record<string, unknown> | null): SaleSyncPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Sale sync payload is required.',
        'SYNC_SALE_PAYLOAD_REQUIRED',
      )
    }

    return payload as unknown as SaleSyncPayload
  }

  private prepareOperationPayload(
    entity: string,
    payload: Record<string, unknown> | null,
    user: JwtPayload,
  ) {
    if (entity !== 'sale' || !payload || typeof payload !== 'object') {
      return payload
    }

    return {
      ...payload,
      fallbackCashierId:
        typeof payload.fallbackCashierId === 'string' && payload.fallbackCashierId.trim()
          ? payload.fallbackCashierId
          : user.sub,
    }
  }

  private normalizeOptionalString(value: string | null | undefined) {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
  }

  private normalizeUnitNameCandidate(value: string) {
    return value.trim().replace(/\s+/g, ' ').toLowerCase()
  }

  private parseOptionalDate(value?: string | null) {
    if (!value) {
      return null
    }

    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  private calculateAdjustmentQuantity(
    currentQuantity: number,
    payload: InventoryAdjustmentSyncPayload,
  ) {
    if (payload.type === StockAdjustmentType.ADD) {
      return currentQuantity + payload.quantity
    }

    if (payload.type === StockAdjustmentType.REMOVE) {
      return currentQuantity - payload.quantity
    }

    return payload.quantity
  }

  private async ensureValidDto(dto: object) {
    const errors = await validate(dto as never)

    if (errors.length === 0) {
      return
    }

    throw new AppBadRequestException(
      this.flattenValidationErrors(errors),
      'SYNC_PAYLOAD_INVALID',
    )
  }

  private flattenValidationErrors(errors: ValidationError[]): string {
    const messages: string[] = []

    for (const error of errors) {
      if (error.constraints) {
        messages.push(...Object.values(error.constraints))
      }

      if (error.children?.length) {
        messages.push(this.flattenValidationErrors(error.children))
      }
    }

    return messages.filter(Boolean).join(', ') || 'Sync payload validation failed.'
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('SyncService error', 'SyncService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    this.logger.error('SyncService unexpected error', 'SyncService', {
      action,
      message,
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'SYNC_SERVICE_ERROR',
      { action },
    )
  }
}
