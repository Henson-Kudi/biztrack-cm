/// <reference types="jest" />
import { AppBadRequestException } from '@/common/exceptions/app-exceptions'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { InventoryMovement, MovementType } from '@/entities/inventory-movement.entity'
import { ProductImage } from '@/entities/product-image.entity'
import { Product } from '@/entities/product.entity'
import { RestockItem } from '@/entities/restock-item.entity'
import { RestockRecord } from '@/entities/restock-record.entity'
import {
  InventoryMovementType,
  StockAdjustmentType,
} from '@biztrack/types'
import { InventoryService } from '../services/inventory.service'

const makeService = () => {
  const transactionProductRepo = { findOne: jest.fn() }
  const transactionInventoryRepo = {
    findOne: jest.fn(),
    findOneByOrFail: jest.fn(),
    create: jest.fn((input) => input),
    save: jest.fn(async (input) => input),
    update: jest.fn(),
  }
  const transactionMovementRepo = {
    create: jest.fn((input) => input),
    save: jest.fn(async (input) => input),
  }
  const transactionRestockRecordRepo = {
    create: jest.fn((input) => input),
    save: jest.fn(async (input) => ({
      id: 'restock-1',
      createdAt: new Date('2026-04-18T08:00:00.000Z'),
      ...input,
    })),
  }
  const transactionRestockItemRepo = {
    create: jest.fn((input) => input),
    save: jest.fn(async (input) => input),
  }
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === Product) return transactionProductRepo
      if (entity === InventoryLevel) return transactionInventoryRepo
      if (entity === InventoryMovement) return transactionMovementRepo
      if (entity === RestockRecord) return transactionRestockRecordRepo
      if (entity === RestockItem) return transactionRestockItemRepo
      throw new Error(`Unexpected repository request: ${entity}`)
    }),
  }
  const dataSource = {
    transaction: jest.fn(async (callback: (input: typeof manager) => unknown) => callback(manager)),
  }
  const businessesRepo = { findOne: jest.fn() }
  const productsRepo = { findOne: jest.fn() }
  const inventoryLevelsQb = {
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getManyAndCount: jest.fn(),
  }
  const inventoryLevelsRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => inventoryLevelsQb),
  }
  const movementsQb = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  }
  const inventoryMovementsRepo = {
    find: jest.fn(),
    createQueryBuilder: jest.fn(() => movementsQb),
  }
  const productImagesQb = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  }
  const productImagesRepo = {
    createQueryBuilder: jest.fn(() => productImagesQb),
  }
  const i18n = { translate: jest.fn(async (key: string) => key) }
  const logger = {
    setContext: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }

  const service = new InventoryService(
    dataSource as any,
    businessesRepo as any,
    productsRepo as any,
    inventoryLevelsRepo as any,
    inventoryMovementsRepo as any,
    productImagesRepo as any,
    i18n as any,
    logger as any,
  )

  return {
    service,
    inventoryLevelsQb,
    movementsQb,
    productImagesQb,
    transactionProductRepo,
    transactionInventoryRepo,
    transactionMovementRepo,
    transactionRestockRecordRepo,
  }
}

describe('InventoryService', () => {
  it('rejects zero-quantity ADD adjustments before touching storage', async () => {
    const { service } = makeService()

    await expect(
      service.adjust('product-1', 'business-1', 'user-1', {
        type: StockAdjustmentType.ADD,
        quantity: 0,
        notes: 'Counted stock',
      }),
    ).rejects.toBeInstanceOf(AppBadRequestException)
  })

  it('sets lastRestockAt when a restock creates a missing inventory row', async () => {
    const {
      service,
      transactionProductRepo,
      transactionInventoryRepo,
      transactionRestockRecordRepo,
    } = makeService()

    transactionRestockRecordRepo.save.mockResolvedValue({
      id: 'restock-1',
      businessId: 'business-1',
      createdAt: new Date('2026-04-18T08:00:00.000Z'),
    })
    transactionProductRepo.findOne.mockResolvedValue({
      id: 'product-1',
      businessId: 'business-1',
      trackInventory: true,
    })
    transactionInventoryRepo.findOne.mockResolvedValue(null)

    const result = await service.restock('business-1', 'user-1', {
      notes: 'Morning delivery',
      items: [{ productId: 'product-1', quantity: 2 }],
    })

    expect(transactionInventoryRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'business-1',
        productId: 'product-1',
        quantity: 2,
        lastRestockAt: expect.any(Date),
      }),
    )
    expect(result.items).toEqual([{ productId: 'product-1', quantity: 2, newQuantity: 2 }])
  })

  it('paginates and filters cross-product movement history', async () => {
    const { service, movementsQb } = makeService()
    movementsQb.getManyAndCount.mockResolvedValue([
      [
        {
          id: 'movement-1',
          businessId: 'business-1',
          productId: 'product-1',
          type: MovementType.RESTOCK_IN,
          quantityChange: 4,
          quantityBefore: 1,
          quantityAfter: 5,
          createdAt: new Date('2026-04-18T09:00:00.000Z'),
        },
      ],
      12,
    ])

    const result = await service.getAllMovements('business-1', {
      productId: 'product-1',
      type: InventoryMovementType.RESTOCK_IN,
      dateFrom: '2026-04-01T00:00:00.000Z',
      dateTo: '2026-04-30T23:59:59.999Z',
      page: 2,
      limit: 5,
      sortBy: 'createdAt',
      sortOrder: 'ASC',
    })

    expect(movementsQb.andWhere).toHaveBeenCalledWith('movement.product_id = :productId', {
      productId: 'product-1',
    })
    expect(movementsQb.andWhere).toHaveBeenCalledWith('movement.type = :type', {
      type: InventoryMovementType.RESTOCK_IN,
    })
    expect(result).toEqual({
      data: [
        expect.objectContaining({
          id: 'movement-1',
          type: MovementType.RESTOCK_IN,
        }),
      ],
      total: 12,
      page: 2,
      limit: 5,
      totalPages: 3,
    })
  })

  it('uses the first gallery image and falls back to product.imageUrl in alerts', async () => {
    const { service, inventoryLevelsQb, productImagesQb } = makeService()
    inventoryLevelsQb.getManyAndCount.mockResolvedValue([
      [
        {
          productId: 'product-1',
          quantity: 2,
          lowStockThreshold: 5,
          reorderPoint: 8,
          product: {
            name: 'Water Bottle',
            sku: 'WATER-1',
            imageUrl: 'https://fallback.example/product-1.png',
            category: { name: 'Drinks' },
          },
        },
        {
          productId: 'product-2',
          quantity: 1,
          lowStockThreshold: 3,
          reorderPoint: 5,
          product: {
            name: 'Rice',
            sku: 'RICE-1',
            imageUrl: 'https://fallback.example/product-2.png',
            category: { name: 'Food' },
          },
        },
      ],
      2,
    ])
    productImagesQb.getMany.mockResolvedValue([
      { productId: 'product-1', url: 'https://cdn.example/product-1-primary.png' } as ProductImage,
    ])

    const result = await service.getAlerts('business-1', { page: 1, limit: 10 })

    expect(result.data).toEqual([
      expect.objectContaining({
        productId: 'product-1',
        primaryImageUrl: 'https://cdn.example/product-1-primary.png',
      }),
      expect.objectContaining({
        productId: 'product-2',
        primaryImageUrl: 'https://fallback.example/product-2.png',
      }),
    ])
    expect(result.totalPages).toBe(1)
  })
})
