/// <reference types="jest" />
import { Product } from '@/entities/product.entity'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { InventoryMovement, MovementType } from '@/entities/inventory-movement.entity'
import { ProductsService } from '../services/products.service'

const makeService = () => {
  const transactionProductRepo = {
    create: jest.fn((input) => input),
    save: jest.fn(async (input) => ({ id: 'product-1', ...input })),
  }
  const transactionInventoryRepo = {
    create: jest.fn((input) => input),
    save: jest.fn(async (input) => input),
  }
  const transactionMovementRepo = {
    create: jest.fn((input) => input),
    save: jest.fn(async (input) => input),
  }
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === Product) return transactionProductRepo
      if (entity === InventoryLevel) return transactionInventoryRepo
      if (entity === InventoryMovement) return transactionMovementRepo
      throw new Error(`Unexpected repository request: ${entity}`)
    }),
  }
  const dataSource = {
    transaction: jest.fn(async (callback: (input: typeof manager) => unknown) => callback(manager)),
  }
  const productsRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  }
  const categoriesRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  }
  const businessesRepo = { findOne: jest.fn() }
  const unitsRepo = { findOne: jest.fn() }
  const inventoryLevelsRepo = { findOne: jest.fn(), find: jest.fn() }
  const inventoryMovementsRepo = { find: jest.fn() }
  const imagesRepo = { find: jest.fn(), createQueryBuilder: jest.fn() }
  const slugService = { generateProductSlug: jest.fn() }
  const skuService = { generate: jest.fn(), validateAndNormalize: jest.fn() }
  const barcodeService = { generateFromSKU: jest.fn(), validateAndNormalize: jest.fn() }
  const quotaService = { assertWithinQuota: jest.fn() }
  const i18n = { translate: jest.fn(async (key: string) => key) }
  const logger = {
    setContext: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }

  const service = new ProductsService(
    dataSource as any,
    productsRepo as any,
    categoriesRepo as any,
    businessesRepo as any,
    unitsRepo as any,
    inventoryLevelsRepo as any,
    inventoryMovementsRepo as any,
    imagesRepo as any,
    slugService as any,
    skuService as any,
    barcodeService as any,
    quotaService as any,
    i18n as any,
    logger as any,
  )

  return {
    service,
    businessesRepo,
    unitsRepo,
    slugService,
    skuService,
    barcodeService,
    transactionProductRepo,
    transactionInventoryRepo,
    transactionMovementRepo,
  }
}

describe('ProductsService', () => {
  it('respects an explicit trackInventory=true override when creating a service product', async () => {
    const {
      service,
      businessesRepo,
      unitsRepo,
      slugService,
      skuService,
      barcodeService,
      transactionProductRepo,
      transactionInventoryRepo,
      transactionMovementRepo,
    } = makeService()

    businessesRepo.findOne.mockResolvedValue({ id: 'business-1', currency: 'XAF' })
    unitsRepo.findOne.mockResolvedValue({ id: 'uom-1', businessId: null })
    slugService.generateProductSlug.mockResolvedValue('consultation-pack')
    skuService.generate.mockResolvedValue('GEN-ABC123')
    barcodeService.generateFromSKU.mockReturnValue({
      value: '2000000000001',
      type: 'INTERNAL',
      isGenerated: true,
    })

    jest.spyOn(service, 'findById').mockResolvedValue({
      id: 'product-1',
      businessId: 'business-1',
      name: 'Consultation Pack',
      slug: 'consultation-pack',
      sku: 'GEN-ABC123',
      barcode: '2000000000001',
      barcodeType: 'INTERNAL',
      isBarcodeGenerated: true,
      sellingPrice: 12000,
      costPrice: null,
      currency: 'XAF',
      taxRate: 0,
      isActive: true,
      isService: true,
      trackInventory: true,
      categoryId: null,
      category: null,
      unitOfMeasure: { id: 'uom-1', name: 'Piece', type: 'QUANTITY', isDefault: true },
      imageUrl: null,
      createdById: 'user-1',
      createdBy: null,
      description: null,
      images: [],
      currentStock: 4,
      lowStockThreshold: 1,
      reorderPoint: null,
      primaryImageUrl: null,
    } as any)

    await service.create('business-1', 'user-1', {
      name: 'Consultation Pack',
      unitOfMeasureId: 'uom-1',
      sellingPrice: 12000,
      isService: true,
      trackInventory: true,
      openingStock: 4,
      lowStockThreshold: 1,
    })

    expect(transactionProductRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        isService: true,
        trackInventory: true,
      }),
    )
    expect(transactionInventoryRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'business-1',
        productId: 'product-1',
        quantity: 4,
        lowStockThreshold: 1,
      }),
    )
    expect(transactionMovementRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MovementType.OPENING_STOCK,
        quantityAfter: 4,
      }),
    )
  })
})
