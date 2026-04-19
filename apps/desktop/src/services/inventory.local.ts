'use client'

import {
  InventoryMovementType,
  StockAdjustmentType,
  UnitOfMeasureType,
  type AdjustInventoryRequest,
  type InventoryAlert,
  type InventoryAlertsQuery,
  type InventoryDetail,
  type InventoryListItem,
  type InventoryMovement,
  type InventoryMovementsQuery,
  type InventoryQuery,
  type InventoryProductSummary,
  type PaginatedResult,
  type RestockRequest,
  type RestockResponse,
  type SetInventoryThresholdRequest,
  type InventoryAdjustmentSyncPayload,
  type InventoryRestockSyncPayload,
  type InventoryThresholdSyncPayload,
} from '@biztrack/types'
import { compareValues, dbBatch, dbQuery, paginateResult, normalizeSortOrder } from './local-db'
import { assertBusinessId, fetchProductRowsForBusiness, type ProductRow } from './products.local'
import {
  buildOutboxEventOperation,
  buildOutboxUpsertOperation,
  requestBackgroundSync,
} from './sync.local'

export class InventoryLocalError extends Error {
  constructor(
    public readonly code:
      | 'INVENTORY_NOT_FOUND'
      | 'INVENTORY_LOW_STOCK_THRESHOLD_INVALID'
      | 'INVENTORY_REORDER_POINT_INVALID'
      | 'INVENTORY_ADJUSTMENT_QUANTITY_INVALID'
      | 'INVENTORY_ADJUSTMENT_NOTES_REQUIRED'
      | 'INVENTORY_INSUFFICIENT_STOCK'
      | 'INVENTORY_RESTOCK_ITEMS_REQUIRED'
      | 'INVENTORY_RESTOCK_PRODUCT_INVALID'
      | 'INVENTORY_RESTOCK_QUANTITY_INVALID'
      | 'INVENTORY_RESTOCK_UNIT_COST_INVALID'
      | 'INVENTORY_RESTOCK_TOTAL_COST_INVALID',
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'InventoryLocalError'
  }
}

type InventoryLevelRow = {
  id: string
  business_id: string
  product_id: string
  quantity: number
  low_stock_threshold: number | null
  reorder_point: number | null
  last_restock_at: string | null
  created_at: string
  updated_at: string
}

type MovementRow = {
  id: string
  business_id: string
  product_id: string
  type: string
  quantity_change: number
  quantity_before: number
  quantity_after: number
  reference_type: string | null
  reference_id: string | null
  notes: string | null
  performed_by_id: string | null
  performed_by_name: string | null
  created_at: string
}

export async function listInventoryLocal(
  businessId: string,
  query: InventoryQuery,
): Promise<PaginatedResult<InventoryListItem>> {
  const sortOrder = normalizeSortOrder(query.sortOrder)
  const items = (await fetchProductRowsForBusiness(assertBusinessId(businessId)))
    .filter((row) => Boolean(row.track_inventory))
    .filter((row) => !query.categoryId || row.category_id === query.categoryId)
    .map(mapInventoryListItem)
    .filter((item) => !query.lowStockOnly || item.isLowStock)

  items.sort((left, right) => {
    switch (query.sortBy) {
      case 'productName':
        return compareValues(left.productName, right.productName, sortOrder)
      case 'sku':
        return compareValues(left.sku, right.sku, sortOrder)
      case 'barcode':
        return compareValues(left.barcode, right.barcode, sortOrder)
      case 'categoryName':
        return compareValues(left.categoryName, right.categoryName, sortOrder)
      case 'quantity':
        return compareValues(left.quantity, right.quantity, sortOrder)
      case 'lowStockThreshold':
        return compareValues(left.lowStockThreshold, right.lowStockThreshold, sortOrder)
      case 'reorderPoint':
        return compareValues(left.reorderPoint, right.reorderPoint, sortOrder)
      case 'lastRestockAt':
      default:
        return compareValues(left.lastRestockAt, right.lastRestockAt, sortOrder)
    }
  })

  return paginateResult(items, query.page, query.limit)
}

export async function listInventoryAlertsLocal(
  businessId: string,
  query: InventoryAlertsQuery,
): Promise<PaginatedResult<InventoryAlert>> {
  const sortOrder = normalizeSortOrder(query.sortOrder)
  const items = (await fetchProductRowsForBusiness(assertBusinessId(businessId)))
    .filter((row) => Boolean(row.is_active) && Boolean(row.track_inventory))
    .map(mapInventoryAlert)
    .filter((item) => item.lowStockThreshold !== null && item.currentQuantity <= item.lowStockThreshold)

  items.sort((left, right) => {
    switch (query.sortBy) {
      case 'productName':
        return compareValues(left.productName, right.productName, sortOrder)
      case 'currentQuantity':
        return compareValues(left.currentQuantity, right.currentQuantity, sortOrder)
      case 'shortfall':
      default:
        return compareValues(left.shortfall, right.shortfall, sortOrder)
    }
  })

  return paginateResult(items, query.page, query.limit)
}

export async function getInventoryDetailLocal(
  businessId: string,
  productId: string,
): Promise<InventoryDetail> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const row = (await fetchProductRowsForBusiness(normalizedBusinessId)).find(
    (item) => item.id === productId,
  )

  if (!row || !row.track_inventory) {
    throw new InventoryLocalError('INVENTORY_NOT_FOUND')
  }

  const level = await ensureInventoryLevel(normalizedBusinessId, row)
  const movementRows = await dbQuery<MovementRow>(
    `
      SELECT
        id,
        business_id,
        product_id,
        type,
        quantity_change,
        quantity_before,
        quantity_after,
        reference_type,
        reference_id,
        notes,
        performed_by_id,
        performed_by_name,
        created_at
      FROM inventory_movements
      WHERE business_id = ?
        AND product_id = ?
      ORDER BY created_at DESC
      LIMIT 12
    `,
    [normalizedBusinessId, productId],
  )

  return {
    id: level.id,
    businessId: normalizedBusinessId,
    productId: row.id,
    quantity: level.quantity,
    lowStockThreshold: level.low_stock_threshold ?? null,
    reorderPoint: level.reorder_point ?? null,
    lastRestockAt: level.last_restock_at ?? null,
    createdAt: level.created_at,
    updatedAt: level.updated_at,
    product: mapInventoryProductSummary(row),
    movements: movementRows.map(mapMovementRow),
  }
}

export async function setInventoryThresholdLocal(
  businessId: string,
  productId: string,
  payload: SetInventoryThresholdRequest,
): Promise<InventoryDetail> {
  validateThresholds(payload)
  const normalizedBusinessId = assertBusinessId(businessId)
  const row = (await fetchProductRowsForBusiness(normalizedBusinessId)).find(
    (item) => item.id === productId,
  )

  if (!row || !row.track_inventory) {
    throw new InventoryLocalError('INVENTORY_NOT_FOUND')
  }

  const level = await ensureInventoryLevel(normalizedBusinessId, row)
  const now = new Date().toISOString()
  const syncPayload: InventoryThresholdSyncPayload = {
    productId,
    lowStockThreshold: payload.lowStockThreshold ?? null,
    reorderPoint: payload.reorderPoint ?? null,
  }

  await dbBatch([
    {
      sql: `
        UPDATE inventory_levels
        SET low_stock_threshold = ?,
            reorder_point = ?,
            updated_at = ?
        WHERE id = ?
      `,
      params: [
        payload.lowStockThreshold ?? null,
        payload.reorderPoint ?? null,
        now,
        level.id,
      ],
    },
    {
      sql: `
        UPDATE products
        SET low_stock_threshold = ?,
            reorder_point = ?,
            updated_at = ?
        WHERE id = ?
      `,
      params: [
        payload.lowStockThreshold ?? null,
        payload.reorderPoint ?? null,
        now,
        productId,
      ],
    },
    buildOutboxUpsertOperation('inventoryThresholds', productId, syncPayload),
  ])
  requestBackgroundSync()

  return getInventoryDetailLocal(normalizedBusinessId, productId)
}

export async function adjustInventoryLocal(
  businessId: string,
  productId: string,
  payload: AdjustInventoryRequest,
): Promise<InventoryDetail> {
  validateAdjustment(payload)
  const normalizedBusinessId = assertBusinessId(businessId)
  const row = (await fetchProductRowsForBusiness(normalizedBusinessId)).find(
    (item) => item.id === productId,
  )

  if (!row || !row.track_inventory) {
    throw new InventoryLocalError('INVENTORY_NOT_FOUND')
  }

  const level = await ensureInventoryLevel(normalizedBusinessId, row)
  const quantityBefore = level.quantity
  const quantityAfter = calculateAdjustedQuantity(quantityBefore, payload)

  if (quantityAfter < 0) {
    throw new InventoryLocalError('INVENTORY_INSUFFICIENT_STOCK')
  }

  const now = new Date().toISOString()
  const movementId = crypto.randomUUID()
  const syncPayload: InventoryAdjustmentSyncPayload = {
    productId,
    type: payload.type,
    quantity: payload.quantity,
    notes: payload.notes.trim(),
    createdAt: now,
  }

  await dbBatch([
    {
      sql: `
        UPDATE inventory_levels
        SET quantity = ?,
            updated_at = ?
        WHERE id = ?
      `,
      params: [quantityAfter, now, level.id],
    },
    {
      sql: `
        UPDATE products
        SET stock_quantity = ?,
            updated_at = ?
        WHERE id = ?
      `,
      params: [quantityAfter, now, productId],
    },
    {
      sql: `
        INSERT INTO inventory_movements (
          id,
          business_id,
          product_id,
          type,
          quantity_change,
          quantity_before,
          quantity_after,
          reference_type,
          reference_id,
          notes,
          performed_by_id,
          performed_by_name,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        movementId,
        normalizedBusinessId,
        productId,
        InventoryMovementType.MANUAL_ADJUSTMENT,
        quantityAfter - quantityBefore,
        quantityBefore,
        quantityAfter,
        'adjustment',
        productId,
        payload.notes.trim(),
        null,
        'Local user',
        now,
      ],
    },
    buildOutboxEventOperation('inventoryAdjustments', movementId, syncPayload),
  ])
  requestBackgroundSync()

  return getInventoryDetailLocal(normalizedBusinessId, productId)
}

export async function restockInventoryLocal(
  businessId: string,
  payload: RestockRequest,
): Promise<RestockResponse> {
  validateRestock(payload)
  const normalizedBusinessId = assertBusinessId(businessId)
  const rows = await fetchProductRowsForBusiness(normalizedBusinessId)
  const now = new Date().toISOString()
  const restockId = crypto.randomUUID()
  const operations: Array<{ sql: string; params?: unknown[] }> = [
    {
      sql: `
        INSERT INTO restock_records (
          id,
          business_id,
          reference_number,
          supplier_name,
          total_cost,
          notes,
          performed_by_id,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        restockId,
        normalizedBusinessId,
        payload.referenceNumber?.trim() || null,
        payload.supplierName?.trim() || null,
        payload.totalCost ?? null,
        payload.notes?.trim() || null,
        null,
        now,
      ],
    },
  ]

  const processedItems: Array<{ productId: string; quantity: number; newQuantity: number }> = []
  const syncItems: InventoryRestockSyncPayload['items'] = []

  for (const item of payload.items) {
    const row = rows.find((candidate) => candidate.id === item.productId)
    if (!row) {
      throw new InventoryLocalError('INVENTORY_RESTOCK_PRODUCT_INVALID')
    }

    const itemId = crypto.randomUUID()
    const movementId = crypto.randomUUID()

    syncItems.push({
      id: itemId,
      productId: row.id,
      quantity: item.quantity,
      unitCost: item.unitCost,
      movementId,
    })

    if (!row.track_inventory) {
      continue
    }

    const level = await ensureInventoryLevel(normalizedBusinessId, row)
    const quantityBefore = level.quantity
    const quantityAfter = quantityBefore + item.quantity

    operations.push(
      {
        sql: `
          UPDATE inventory_levels
          SET quantity = ?,
              last_restock_at = ?,
              updated_at = ?
          WHERE id = ?
        `,
        params: [quantityAfter, now, now, level.id],
      },
      {
        sql: `
          UPDATE products
          SET stock_quantity = ?,
              updated_at = ?
          WHERE id = ?
        `,
        params: [quantityAfter, now, row.id],
      },
      {
        sql: `
          INSERT INTO restock_items (
            id,
            restock_record_id,
            product_id,
            quantity,
            unit_cost,
            new_quantity,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        params: [
          itemId,
          restockId,
          row.id,
          item.quantity,
          item.unitCost ?? null,
          quantityAfter,
          now,
        ],
      },
      {
        sql: `
          INSERT INTO inventory_movements (
            id,
            business_id,
            product_id,
            type,
            quantity_change,
            quantity_before,
            quantity_after,
            reference_type,
            reference_id,
            notes,
            performed_by_id,
            performed_by_name,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      params: [
          movementId,
          normalizedBusinessId,
          row.id,
          InventoryMovementType.RESTOCK_IN,
          item.quantity,
          quantityBefore,
          quantityAfter,
          'restock',
          restockId,
          payload.notes?.trim() || null,
          null,
          'Local user',
          now,
        ],
      },
    )

    processedItems.push({
      productId: row.id,
      quantity: item.quantity,
      newQuantity: quantityAfter,
    })
  }

  const syncPayload: InventoryRestockSyncPayload = {
    referenceNumber: payload.referenceNumber?.trim() || null,
    supplierName: payload.supplierName?.trim() || null,
    totalCost: payload.totalCost ?? null,
    notes: payload.notes?.trim() || null,
    createdAt: now,
    items: syncItems,
  }

  operations.push(buildOutboxEventOperation('inventoryRestocks', restockId, syncPayload))

  await dbBatch(operations)
  requestBackgroundSync()

  return {
    id: restockId,
    businessId: normalizedBusinessId,
    referenceNumber: payload.referenceNumber?.trim() || null,
    supplierName: payload.supplierName?.trim() || null,
    totalCost: payload.totalCost ?? null,
    notes: payload.notes?.trim() || null,
    performedById: null,
    createdAt: now,
    items: processedItems,
  }
}

export async function listInventoryMovementsLocal(
  businessId: string,
  query: InventoryMovementsQuery,
): Promise<PaginatedResult<InventoryMovement>> {
  const sortOrder = normalizeSortOrder(query.sortOrder)
  let rows = await dbQuery<MovementRow>(
    `
      SELECT
        id,
        business_id,
        product_id,
        type,
        quantity_change,
        quantity_before,
        quantity_after,
        reference_type,
        reference_id,
        notes,
        performed_by_id,
        performed_by_name,
        created_at
      FROM inventory_movements
      WHERE business_id = ?
    `,
    [assertBusinessId(businessId)],
  )

  if (query.productId) {
    rows = rows.filter((row) => row.product_id === query.productId)
  }
  if (query.type) {
    rows = rows.filter((row) => row.type === query.type)
  }
  const dateFrom = query.dateFrom
  const dateTo = query.dateTo

  if (dateFrom) {
    rows = rows.filter((row) => row.created_at >= dateFrom)
  }
  if (dateTo) {
    rows = rows.filter((row) => row.created_at <= dateTo)
  }

  const movements = rows.map(mapMovementRow)
  movements.sort((left, right) => {
    switch (query.sortBy) {
      case 'type':
        return compareValues(left.type, right.type, sortOrder)
      case 'quantityAfter':
        return compareValues(left.quantityAfter, right.quantityAfter, sortOrder)
      case 'createdAt':
      default:
        return compareValues(left.createdAt, right.createdAt, sortOrder)
    }
  })

  return paginateResult(movements, query.page, query.limit)
}

function mapInventoryListItem(row: ProductRow): InventoryListItem {
  const quantity = row.inventory_quantity ?? row.stock_quantity ?? 0
  const lowStockThreshold = row.inventory_low_stock_threshold ?? row.low_stock_threshold ?? null

  return {
    productId: row.id,
    productName: row.name,
    sku: row.sku,
    barcode: row.barcode,
    primaryImageUrl: row.image_url ?? null,
    categoryName: row.category_name,
    unitAbbreviation: row.unit_abbreviation ?? row.unit_name ?? null,
    quantity,
    lowStockThreshold,
    reorderPoint: row.inventory_reorder_point ?? row.reorder_point ?? null,
    isLowStock: lowStockThreshold !== null ? quantity <= lowStockThreshold : false,
    lastRestockAt: row.inventory_last_restock_at ?? null,
  }
}

function mapInventoryAlert(row: ProductRow): InventoryAlert {
  const quantity = row.inventory_quantity ?? row.stock_quantity ?? 0
  const lowStockThreshold = row.inventory_low_stock_threshold ?? row.low_stock_threshold ?? null

  return {
    productId: row.id,
    productName: row.name,
    sku: row.sku,
    primaryImageUrl: row.image_url ?? null,
    categoryName: row.category_name,
    currentQuantity: quantity,
    lowStockThreshold,
    reorderPoint: row.inventory_reorder_point ?? row.reorder_point ?? null,
    shortfall: lowStockThreshold !== null ? lowStockThreshold - quantity : 0,
  }
}

function mapInventoryProductSummary(row: ProductRow): InventoryProductSummary {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    slug: row.slug ?? row.id,
    imageUrl: row.image_url ?? null,
    category:
      row.category_join_id && row.category_business_id && row.category_created_at && row.category_updated_at
        ? {
            id: row.category_join_id,
            businessId: row.category_business_id,
            name: row.category_name ?? '',
            slug: row.category_slug ?? undefined,
            color: row.category_color ?? null,
            icon: row.category_icon ?? null,
            imageUrl: row.category_image_url ?? null,
            sortOrder: row.category_sort_order ?? undefined,
            createdAt: row.category_created_at,
            updatedAt: row.category_updated_at,
          }
        : null,
    unitOfMeasure:
      row.unit_join_id && row.unit_name
        ? {
            id: row.unit_join_id,
            name: row.unit_name,
            abbreviation: row.unit_abbreviation ?? undefined,
            businessId: row.unit_business_id ?? null,
            type: (row.unit_type as UnitOfMeasureType | null) ?? null,
            isDefault: Boolean(row.unit_is_default),
          }
        : null,
  }
}

function mapMovementRow(row: MovementRow): InventoryMovement {
  return {
    id: row.id,
    businessId: row.business_id,
    productId: row.product_id,
    type: row.type as InventoryMovementType,
    quantityChange: row.quantity_change,
    quantityBefore: row.quantity_before,
    quantityAfter: row.quantity_after,
    referenceType: row.reference_type ?? null,
    referenceId: row.reference_id ?? null,
    notes: row.notes ?? null,
    performedBy: row.performed_by_name
      ? {
          id: row.performed_by_id ?? 'local-user',
          name: row.performed_by_name,
        }
      : null,
    performedById: row.performed_by_id ?? null,
    createdAt: row.created_at,
  }
}

async function ensureInventoryLevel(businessId: string, row: ProductRow) {
  const existing = await dbQuery<InventoryLevelRow>(
    `
      SELECT
        id,
        business_id,
        product_id,
        quantity,
        low_stock_threshold,
        reorder_point,
        last_restock_at,
        created_at,
        updated_at
      FROM inventory_levels
      WHERE business_id = ?
        AND product_id = ?
      LIMIT 1
    `,
    [businessId, row.id],
  )

  if (existing[0]) {
    return existing[0]
  }

  const now = new Date().toISOString()
  const created: InventoryLevelRow = {
    id: crypto.randomUUID(),
    business_id: businessId,
    product_id: row.id,
    quantity: row.stock_quantity ?? 0,
    low_stock_threshold: row.low_stock_threshold ?? null,
    reorder_point: row.reorder_point ?? null,
    last_restock_at: null,
    created_at: now,
    updated_at: now,
  }

  await dbBatch([
    {
      sql: `
        INSERT INTO inventory_levels (
          id,
          business_id,
          product_id,
          quantity,
          low_stock_threshold,
          reorder_point,
          last_restock_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        created.id,
        created.business_id,
        created.product_id,
        created.quantity,
        created.low_stock_threshold,
        created.reorder_point,
        created.last_restock_at,
        created.created_at,
        created.updated_at,
      ],
    },
  ])

  return created
}

function validateAdjustment(payload: AdjustInventoryRequest) {
  if (!Number.isFinite(payload.quantity)) {
    throw new InventoryLocalError('INVENTORY_ADJUSTMENT_QUANTITY_INVALID')
  }

  if (
    (payload.type === StockAdjustmentType.ADD || payload.type === StockAdjustmentType.REMOVE) &&
    payload.quantity <= 0
  ) {
    throw new InventoryLocalError('INVENTORY_ADJUSTMENT_QUANTITY_INVALID')
  }

  if (payload.type === StockAdjustmentType.SET && payload.quantity < 0) {
    throw new InventoryLocalError('INVENTORY_ADJUSTMENT_QUANTITY_INVALID')
  }

  if (payload.notes.trim().length < 3) {
    throw new InventoryLocalError('INVENTORY_ADJUSTMENT_NOTES_REQUIRED')
  }
}

function calculateAdjustedQuantity(currentQuantity: number, payload: AdjustInventoryRequest) {
  if (payload.type === StockAdjustmentType.ADD) {
    return currentQuantity + payload.quantity
  }
  if (payload.type === StockAdjustmentType.REMOVE) {
    return currentQuantity - payload.quantity
  }
  return payload.quantity
}

function validateThresholds(payload: SetInventoryThresholdRequest) {
  if (
    payload.lowStockThreshold !== undefined &&
    payload.lowStockThreshold !== null &&
    (!Number.isFinite(payload.lowStockThreshold) || payload.lowStockThreshold < 0)
  ) {
    throw new InventoryLocalError('INVENTORY_LOW_STOCK_THRESHOLD_INVALID')
  }

  if (
    payload.reorderPoint !== undefined &&
    payload.reorderPoint !== null &&
    (!Number.isFinite(payload.reorderPoint) || payload.reorderPoint < 0)
  ) {
    throw new InventoryLocalError('INVENTORY_REORDER_POINT_INVALID')
  }
}

function validateRestock(payload: RestockRequest) {
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new InventoryLocalError('INVENTORY_RESTOCK_ITEMS_REQUIRED')
  }

  if (
    payload.totalCost !== undefined &&
    (!Number.isFinite(payload.totalCost) || payload.totalCost < 0)
  ) {
    throw new InventoryLocalError('INVENTORY_RESTOCK_TOTAL_COST_INVALID')
  }

  for (const item of payload.items) {
    if (!item.productId) {
      throw new InventoryLocalError('INVENTORY_RESTOCK_PRODUCT_INVALID')
    }

    if (!Number.isFinite(item.quantity) || item.quantity < 0.001) {
      throw new InventoryLocalError('INVENTORY_RESTOCK_QUANTITY_INVALID')
    }

    if (
      item.unitCost !== undefined &&
      (!Number.isFinite(item.unitCost) || item.unitCost < 0)
    ) {
      throw new InventoryLocalError('INVENTORY_RESTOCK_UNIT_COST_INVALID')
    }
  }
}
