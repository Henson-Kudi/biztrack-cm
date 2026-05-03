import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Logger, LogMetadata } from '@biztrack/logger'
import type {
  AssignBarcodeRequest,
  CreateProductRequest,
  ProductsQuery,
  UpdateProductRequest,
} from '@biztrack/types'
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
import { Product } from '@/entities/product.entity'
import { ProductImage } from '@/entities/product-image.entity'
import { UnitOfMeasure } from '@/entities/unit-of-measure.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import { ProductCategoriesRepository } from '../repositories/product-categories.repository'
import { ProductsRepository } from '../repositories/products.repository'
import { BarcodeService } from './barcode.service'
import { SlugService } from './slug.service'
import { SkuService } from './sku.service'

@Injectable()
export class ProductsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly productsRepo: ProductsRepository,
    private readonly categoriesRepo: ProductCategoriesRepository,
    @InjectRepository(Business)
    private readonly businessesRepo: Repository<Business>,
    @InjectRepository(UnitOfMeasure)
    private readonly unitsRepo: Repository<UnitOfMeasure>,
    @InjectRepository(InventoryLevel)
    private readonly inventoryLevelsRepo: Repository<InventoryLevel>,
    @InjectRepository(InventoryMovement)
    private readonly inventoryMovementsRepo: Repository<InventoryMovement>,
    @InjectRepository(ProductImage)
    private readonly imagesRepo: Repository<ProductImage>,
    private readonly slugService: SlugService,
    private readonly skuService: SkuService,
    private readonly barcodeService: BarcodeService,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('ProductsService')
  }

  async create(businessId: string, userId: string, dto: CreateProductRequest) {
    try {
      const [business, category, unitOfMeasure] = await Promise.all([
        this.findBusiness(businessId),
        dto.categoryId ? this.findCategory(dto.categoryId, businessId) : Promise.resolve(null),
        this.findUnitOfMeasure(dto.unitOfMeasureId, businessId),
      ])

      const slug = await this.slugService.generateProductSlug(dto.name, businessId)
      const sku = dto.sku
        ? await this.skuService.validateAndNormalize(businessId, dto.sku)
        : await this.skuService.generate(businessId, category?.slug)
      const barcode = dto.barcode
        ? await this.barcodeService.validateAndNormalize(businessId, dto.barcode)
        : this.barcodeService.generateFromSKU(sku)

      const isService = dto.isService ?? false
      const trackInventory = dto.trackInventory !== undefined ? dto.trackInventory : !isService

      const product = await this.dataSource.transaction(async (manager) => {
        const created = await manager.getRepository(Product).save(
          manager.getRepository(Product).create({
            businessId,
            categoryId: category?.id ?? null,
            unitOfMeasureId: unitOfMeasure.id,
            name: dto.name.trim(),
            slug,
            description: dto.description?.trim() ?? null,
            sku,
            barcode: barcode.value,
            barcodeType: barcode.type,
            isBarcodeGenerated: barcode.isGenerated,
            sellingPrice: dto.sellingPrice,
            costPrice: dto.costPrice ?? null,
            currency: business.currency,
            taxRate: dto.taxRate ?? 0,
            isActive: dto.isActive ?? true,
            isService,
            trackInventory,
            imageUrl: dto.imageUrl?.trim() ?? null,
            createdById: userId,
          }),
        )

        if (trackInventory) {
          const quantity = dto.openingStock ?? 0
          await manager.getRepository(InventoryLevel).save(
            manager.getRepository(InventoryLevel).create({
              businessId,
              productId: created.id,
              quantity,
              lowStockThreshold: dto.lowStockThreshold ?? null,
            }),
          )

          if (quantity > 0) {
            await manager.getRepository(InventoryMovement).save(
              manager.getRepository(InventoryMovement).create({
                businessId,
                productId: created.id,
                type: MovementType.OPENING_STOCK,
                quantityChange: quantity,
                quantityBefore: 0,
                quantityAfter: quantity,
                referenceType: 'product',
                referenceId: created.id,
                notes: 'Opening stock set during product creation',
                performedById: userId,
              }),
            )
          }
        }

        return created
      })

      return this.findById(product.id, businessId)
    } catch (error) {
      return this.handleServiceError('create', error, { businessId, userId, name: dto.name })
    }
  }

  async findAll(businessId: string, query: ProductsQuery) {
    try {
      const qb = this.productsRepo
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.category', 'category')
        .leftJoinAndSelect('product.unitOfMeasure', 'unitOfMeasure')
        .where('product.business_id = :businessId', { businessId })
        .andWhere('product.deleted_at IS NULL')

      // Apply filters
      if (query.categoryId) {
        qb.andWhere('product.category_id = :categoryId', { categoryId: query.categoryId })
      }

      if (query.isActive !== undefined) {
        qb.andWhere('product.is_active = :isActive', { isActive: query.isActive })
      }

      if (query.isService !== undefined) {
        qb.andWhere('product.is_service = :isService', { isService: query.isService })
      }

      if (query.trackInventory !== undefined) {
        qb.andWhere('product.track_inventory = :trackInventory', {
          trackInventory: query.trackInventory,
        })
      }

      // Apply search
      if (query.search) {
        qb.andWhere(
          '(LOWER(product.name) LIKE LOWER(:search) OR LOWER(product.sku) LIKE LOWER(:search) OR LOWER(product.barcode) LIKE LOWER(:search))',
          { search: `%${query.search}%` },
        )
      }

      // Apply sorting
      const sortField = this.validateSortField(query.sortBy)
      const sortOrder = query.sortOrder || 'ASC'
      qb.orderBy(`product.${sortField}`, sortOrder)

      // Calculate pagination
      const page = Math.max(query.page ?? 1, 1)
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
      const skip = (page - 1) * limit

      // Execute query with pagination
      const [products, total] = await qb.skip(skip).take(limit).getManyAndCount()

      const data = await this.attachInventoryAndImages(products, businessId)

      return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    } catch (error) {
      return this.handleServiceError('findAll', error, { businessId })
    }
  }

  private validateSortField(field?: string): string {
    const allowedFields = ['name', 'sku', 'createdAt', 'sellingPrice', 'costPrice', 'updatedAt']
    return allowedFields.includes(field ?? '') ? field! : 'name'
  }

  async findById(id: string, businessId: string) {
    try {
      const product = await this.productsRepo.findOne({
        where: { id, businessId, deletedAt: IsNull() },
        relations: ['category', 'unitOfMeasure', 'createdBy'],
      })

      if (!product) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.product_not_found'),
          'PRODUCT_NOT_FOUND',
        )
      }

      const [inventoryLevel, images] = await Promise.all([
        this.inventoryLevelsRepo.findOne({ where: { businessId, productId: id } }),
        this.imagesRepo.find({
          where: { productId: id },
          order: { sortOrder: 'ASC', createdAt: 'ASC' },
        }),
      ])

      return {
        ...product,
        currentStock: product.trackInventory ? (inventoryLevel?.quantity ?? 0) : null,
        lowStockThreshold: inventoryLevel?.lowStockThreshold ?? null,
        reorderPoint: inventoryLevel?.reorderPoint ?? null,
        primaryImageUrl: images[0]?.url ?? product.imageUrl ?? null,
        images,
      }
    } catch (error) {
      return this.handleServiceError('findById', error, { id, businessId })
    }
  }

  async findByBarcode(barcode: string, businessId: string) {
    try {
      const product = await this.productsRepo.findOne({
        where: { businessId, barcode, deletedAt: IsNull() },
      })
      if (!product) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.product_not_found'),
          'PRODUCT_NOT_FOUND',
        )
      }
      return this.findById(product.id, businessId)
    } catch (error) {
      return this.handleServiceError('findByBarcode', error, { businessId, barcode })
    }
  }

  async findBySku(sku: string, businessId: string) {
    try {
      const product = await this.productsRepo.findOne({
        where: { businessId, sku: sku.trim().toUpperCase(), deletedAt: IsNull() },
      })
      if (!product) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.product_not_found'),
          'PRODUCT_NOT_FOUND',
        )
      }
      return this.findById(product.id, businessId)
    } catch (error) {
      return this.handleServiceError('findBySku', error, { businessId, sku })
    }
  }

  async findBySlug(slug: string, businessId: string) {
    try {
      const product = await this.productsRepo.findOne({
        where: { businessId, slug, deletedAt: IsNull() },
      })
      if (!product) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.product_not_found'),
          'PRODUCT_NOT_FOUND',
        )
      }
      return this.findById(product.id, businessId)
    } catch (error) {
      return this.handleServiceError('findBySlug', error, { businessId, slug })
    }
  }

  async update(id: string, businessId: string, dto: UpdateProductRequest) {
    try {
      const product = await this.findById(id, businessId)

      if (dto.sku && dto.sku.trim().toUpperCase() !== product.sku) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.product_sku_immutable'),
          'PRODUCT_SKU_IMMUTABLE',
        )
      }

      const category = dto.categoryId
        ? await this.findCategory(dto.categoryId, businessId)
        : (product.category ?? null)
      const unitOfMeasure = dto.unitOfMeasureId
        ? await this.findUnitOfMeasure(dto.unitOfMeasureId, businessId)
        : product.unitOfMeasure

      const barcode = dto.barcode
        ? await this.barcodeService.validateAndNormalize(businessId, dto.barcode, id)
        : {
            value: product.barcode,
            type: product.barcodeType,
            isGenerated: product.isBarcodeGenerated,
          }

      const isService = dto.isService ?? product.isService
      const trackInventory =
        dto.trackInventory !== undefined
          ? dto.trackInventory
          : dto.isService === true
            ? false
            : product.trackInventory

      const slug = dto.name
        ? await this.slugService.generateProductSlug(dto.name, businessId, id)
        : product.slug

      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(Product).update(id, {
          categoryId: category?.id ?? null,
          unitOfMeasureId: unitOfMeasure.id,
          name: dto.name?.trim() ?? product.name,
          slug,
          description:
            dto.description === undefined ? product.description : (dto.description?.trim() ?? null),
          barcode: barcode.value ?? null,
          barcodeType: barcode.type ?? null,
          isBarcodeGenerated: barcode.isGenerated ?? false,
          sellingPrice: dto.sellingPrice ?? product.sellingPrice,
          costPrice: dto.costPrice === undefined ? product.costPrice : (dto.costPrice ?? null),
          taxRate: dto.taxRate ?? product.taxRate,
          isActive: dto.isActive ?? product.isActive,
          isService,
          trackInventory,
          imageUrl: dto.imageUrl === undefined ? product.imageUrl : (dto.imageUrl?.trim() ?? null),
          updatedAt: new Date(),
        })

        const inventoryRepo = manager.getRepository(InventoryLevel)
        const inventoryLevel = await inventoryRepo.findOne({ where: { businessId, productId: id } })

        if (trackInventory && !inventoryLevel) {
          await inventoryRepo.save(
            inventoryRepo.create({
              businessId,
              productId: id,
              quantity: 0,
              lowStockThreshold: dto.lowStockThreshold ?? null,
            }),
          )
        } else if (trackInventory && inventoryLevel) {
          await inventoryRepo.update(inventoryLevel.id, {
            lowStockThreshold:
              dto.lowStockThreshold === undefined
                ? inventoryLevel.lowStockThreshold
                : dto.lowStockThreshold,
          })
        } else if (!trackInventory && inventoryLevel) {
          await inventoryRepo.delete({ id: inventoryLevel.id })
        }
      })

      return this.findById(id, businessId)
    } catch (error) {
      return this.handleServiceError('update', error, { id, businessId })
    }
  }

  async assignBarcode(id: string, businessId: string, dto: AssignBarcodeRequest) {
    try {
      await this.findById(id, businessId)
      const barcode = await this.barcodeService.validateAndNormalize(businessId, dto.barcode, id)
      await this.productsRepo.update(id, {
        barcode: barcode.value,
        barcodeType: barcode.type,
        isBarcodeGenerated: false,
        updatedAt: new Date(),
      })
      return this.findById(id, businessId)
    } catch (error) {
      return this.handleServiceError('assignBarcode', error, { id, businessId })
    }
  }

  async softDelete(id: string, businessId: string): Promise<void> {
    try {
      await this.findById(id, businessId)
      await this.productsRepo.update(id, {
        isActive: false,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
    } catch (error) {
      return this.handleServiceError('softDelete', error, { id, businessId })
    }
  }

  async getLowStockProducts(businessId: string) {
    try {
      const levels = await this.inventoryLevelsRepo
        .createQueryBuilder('inventory')
        .innerJoinAndSelect('inventory.product', 'product')
        .leftJoinAndSelect('product.category', 'category')
        .leftJoinAndSelect('product.unitOfMeasure', 'unitOfMeasure')
        .where('inventory.business_id = :businessId', { businessId })
        .andWhere('product.deleted_at IS NULL')
        .andWhere('product.is_active = true')
        .andWhere('product.track_inventory = true')
        .andWhere('inventory.low_stock_threshold IS NOT NULL')
        .andWhere('inventory.quantity <= inventory.low_stock_threshold')
        .orderBy('inventory.quantity', 'ASC')
        .getMany()

      return levels.map((level) => ({
        productId: level.productId,
        productName: level.product?.name ?? null,
        currentQuantity: level.quantity,
        lowStockThreshold: level.lowStockThreshold,
        reorderPoint: level.reorderPoint,
        unitOfMeasure: level.product?.unitOfMeasure?.abbreviation ?? null,
        categoryName: level.product?.category?.name ?? null,
      }))
    } catch (error) {
      return this.handleServiceError('getLowStockProducts', error, { businessId })
    }
  }

  private async attachInventoryAndImages(products: Product[], businessId: string) {
    const productIds = products.map((product) => product.id)
    if (productIds.length === 0) return []

    const [levels, images] = await Promise.all([
      this.inventoryLevelsRepo.find({
        where: productIds.map((productId) => ({ businessId, productId })),
      }),
      this.imagesRepo
        .createQueryBuilder('image')
        .where('image.product_id IN (:...productIds)', { productIds })
        .orderBy('image.sort_order', 'ASC')
        .addOrderBy('image.created_at', 'ASC')
        .getMany(),
    ])

    const levelsByProductId = new Map(levels.map((level) => [level.productId, level]))
    const primaryImagesByProductId = new Map<string, ProductImage>()
    for (const image of images) {
      if (!primaryImagesByProductId.has(image.productId)) {
        primaryImagesByProductId.set(image.productId, image)
      }
    }

    return products.map((product) => {
      const inventory = levelsByProductId.get(product.id)
      const primaryImage = primaryImagesByProductId.get(product.id)

      return {
        ...product,
        currentStock: product.trackInventory ? (inventory?.quantity ?? 0) : null,
        lowStockThreshold: inventory?.lowStockThreshold ?? null,
        reorderPoint: inventory?.reorderPoint ?? null,
        primaryImageUrl: primaryImage?.url ?? product.imageUrl ?? null,
      }
    })
  }

  private async findBusiness(id: string) {
    const business = await this.businessesRepo.findOne({ where: { id } })
    if (!business) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.business_not_found'),
        'BUSINESS_NOT_FOUND',
      )
    }
    return business
  }

  private async findCategory(id: string, businessId: string) {
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

  private async findUnitOfMeasure(id: string, businessId: string) {
    const unit = await this.unitsRepo.findOne({
      where: [
        { id, businessId: IsNull() },
        { id, businessId },
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

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('ProductsService error', 'ProductsService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    this.logger.error('ProductsService unexpected error', 'ProductsService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'PRODUCTS_SERVICE_ERROR',
      { action },
    )
  }
}
