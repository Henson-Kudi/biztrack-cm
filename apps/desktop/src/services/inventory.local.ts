'use client'

import {
  ContactType,
  DebtDirection,
  DebtStatus,
  InventoryMovementType,
  Resource,
  StockAdjustmentType,
  UnitOfMeasureType,
  type AdjustInventoryRequest,
  type InventoryAlert,
  type InventoryAlertsQuery,
  type InventoryBinSummary,
  type InventoryDetail,
  type InventoryListItem,
  type InventoryMovement,
  type InventoryMovementTrendPoint,
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
import { assertLocalPermissionAccess } from '@/lib/plan-access'
import { getContactByIdLocal } from './contacts.local'
import { listAllDebtsByDirectionLocal } from './debts.local'
import { compareValues, dbBatch, dbQuery, paginateResult, normalizeSortOrder } from './local-db'
import {
  assertBusinessId,
  fetchProductRowById,
  fetchProductRowsByIds,
  queryInventoryProductRows,
  type ProductRow,
} from './products.local'
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
      | 'INVENTORY_RESTOCK_TOTAL_COST_INVALID'
      | 'INVENTORY_RESTOCK_TOTAL_AMOUNT_INVALID'
      | 'INVENTORY_RESTOCK_TOTAL_AMOUNT_REQUIRED'
      | 'INVENTORY_RESTOCK_TOTAL_AMOUNT_MISMATCH'
      | 'INVENTORY_RESTOCK_PAYMENT_AMOUNT_INVALID'
      | 'INVENTORY_RESTOCK_PAYMENT_EXCEEDS_TOTAL'
      | 'INVENTORY_RESTOCK_SUPPLIER_REQUIRED_FOR_CREDIT'
      | 'INVENTORY_RESTOCK_SUPPLIER_NOT_FOUND'
      | 'INVENTORY_RESTOCK_SUPPLIER_INACTIVE'
      | 'INVENTORY_RESTOCK_SUPPLIER_TYPE_INVALID',
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

type MovementReferenceInfo = {
  label: string | null
  sourceName: string | null
}

type SaleReferenceRow = {
  id: string
  sale_number: string | null
  receipt_number: string | null
  customer_name: string | null
}

type RestockReferenceRow = {
  id: string
  reference_number: string | null
  supplier_name: string | null
}

export type LocalSupplierPayable = {
  id: string
  businessId: string
  reference: string
  supplierId: string | null
  supplierName: string
  supplierPhone: string | null
  status: DebtStatus
  totalAmount: number
  amountPaid: number
  outstandingAmount: number
  notes: string | null
  createdAt: string
}

export async function listInventoryLocal(
  businessId: string,
  query: InventoryQuery,
): Promise<PaginatedResult<InventoryListItem>> {
  const result = await queryInventoryProductRows(assertBusinessId(businessId), {
    trackInventory: true,
    categoryId: query.categoryId,
    lowStockOnly: query.lowStockOnly,
    sortBy: query.sortBy,
    sortOrder: normalizeSortOrder(query.sortOrder) as 'ASC' | 'DESC',
    page: query.page,
    limit: query.limit,
  })

  return {
    data: result.data.map(mapInventoryListItem),
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  }
}

export async function listInventoryAlertsLocal(
  businessId: string,
  query: InventoryAlertsQuery,
): Promise<PaginatedResult<InventoryAlert>> {
  const result = await queryInventoryProductRows(assertBusinessId(businessId), {
    isActive: true,
    trackInventory: true,
    lowStockOnly: true,
    sortBy: query.sortBy ?? 'shortfall',
    sortOrder: normalizeSortOrder(query.sortOrder) as 'ASC' | 'DESC',
    page: query.page,
    limit: query.limit,
  })

  return {
    data: result.data.map(mapInventoryAlert),
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  }
}

export async function getInventoryDetailLocal(
  businessId: string,
  productId: string,
): Promise<InventoryDetail> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const row = await fetchProductRowById(normalizedBusinessId, productId)

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
    `,
    [normalizedBusinessId, productId],
  )
  const referenceInfo = await loadMovementReferenceInfoLocal(normalizedBusinessId, movementRows)

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
    movements: movementRows.slice(0, 10).map((movement) =>
      mapMovementRow(
        movement,
        referenceInfo.get(getMovementReferenceLookupKey(movement.reference_type, movement.reference_id)),
      ),
    ),
    binSummary: buildInventoryBinSummary(
      movementRows,
      level.quantity,
      referenceInfo,
    ),
  }
}

export async function setInventoryThresholdLocal(
  businessId: string,
  productId: string,
  payload: SetInventoryThresholdRequest,
): Promise<InventoryDetail> {
  validateThresholds(payload)
  const normalizedBusinessId = assertBusinessId(businessId)
  await assertLocalPermissionAccess(normalizedBusinessId, Resource.INVENTORY_ADJUST)
  const row = await fetchProductRowById(normalizedBusinessId, productId)

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
  await assertLocalPermissionAccess(normalizedBusinessId, Resource.INVENTORY_ADJUST)
  const row = await fetchProductRowById(normalizedBusinessId, productId)

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
  await assertLocalPermissionAccess(normalizedBusinessId, Resource.INVENTORY_ADJUST)
  const productIds = payload.items.map((item) => item.productId)
  const fetchedRows = await fetchProductRowsByIds(normalizedBusinessId, productIds)
  const productMap = new Map(fetchedRows.map((row) => [row.id, row]))
  const now = new Date().toISOString()
  const restockId = crypto.randomUUID()
  const normalizedReferenceNumber = payload.referenceNumber?.trim() || null
  const normalizedNotes = payload.notes?.trim() || null
  const normalizedSupplierId = payload.supplierId?.trim() || null
  const normalizedManualSupplierName = payload.supplierName?.trim() || null
  const normalizedPayments =
    payload.payments?.map((payment) => ({
      method: payment.method,
      amount: roundMoney(payment.amount),
      mobileMoneyReference: payment.mobileMoneyReference?.trim() || undefined,
    })) ?? undefined
  const totalAmount = roundMoney(resolveRestockTotal(payload))
  const amountPaid =
    normalizedPayments === undefined
      ? totalAmount
      : roundMoney(normalizedPayments.reduce((sum, payment) => sum + payment.amount, 0))

  if (amountPaid > totalAmount) {
    throw new InventoryLocalError('INVENTORY_RESTOCK_PAYMENT_EXCEEDS_TOTAL')
  }

  const creditAmount = roundMoney(totalAmount - amountPaid)
  const supplierContact = await resolveRestockSupplier(
    normalizedBusinessId,
    normalizedSupplierId,
    creditAmount,
  )
  const supplierName = normalizedManualSupplierName || supplierContact?.name || null
  const operations: Array<{ sql: string; params?: unknown[] }> = [
    {
      sql: `
        INSERT INTO restock_records (
          id,
          business_id,
          reference_number,
          supplier_id,
          supplier_name,
          total_amount,
          total_cost,
          amount_paid,
          credit_amount,
          notes,
          performed_by_id,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        restockId,
        normalizedBusinessId,
        normalizedReferenceNumber,
        normalizedSupplierId,
        supplierName,
        totalAmount,
        totalAmount,
        amountPaid,
        creditAmount,
        normalizedNotes,
        null,
        now,
      ],
    },
  ]

  const processedItems: Array<{ productId: string; quantity: number; newQuantity: number }> = []
  const syncItems: InventoryRestockSyncPayload['items'] = []

  for (const item of payload.items) {
    const row = productMap.get(item.productId)
    if (!row) {
      throw new InventoryLocalError('INVENTORY_RESTOCK_PRODUCT_INVALID')
    }

    const itemId = crypto.randomUUID()
    const movementId = crypto.randomUUID()

    syncItems.push({
      id: itemId,
      productId: row.id,
      quantity: item.quantity,
      unitCost: item.unitCost ?? undefined,
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
          normalizedNotes,
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

  for (const payment of normalizedPayments ?? []) {
    operations.push({
      sql: `
        INSERT INTO restock_payments (
          id,
          restock_record_id,
          business_id,
          method,
          amount,
          mobile_money_reference,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        crypto.randomUUID(),
        restockId,
        normalizedBusinessId,
        payment.method,
        payment.amount,
        payment.mobileMoneyReference ?? null,
        now,
      ],
    })
  }

  const syncPayload: InventoryRestockSyncPayload = {
    referenceNumber: normalizedReferenceNumber,
    supplierId: normalizedSupplierId,
    supplierName,
    totalAmount,
    totalCost: totalAmount,
    notes: normalizedNotes,
    createdAt: now,
    payments: normalizedPayments?.map((payment) => ({
      method: payment.method,
      amount: payment.amount,
      ...(payment.mobileMoneyReference
        ? { mobileMoneyReference: payment.mobileMoneyReference }
        : {}),
    })),
    items: syncItems,
  }

  operations.push(buildOutboxEventOperation('inventoryRestocks', restockId, syncPayload))

  await dbBatch(operations)
  requestBackgroundSync()

  return {
    id: restockId,
    businessId: normalizedBusinessId,
    referenceNumber: normalizedReferenceNumber,
    supplierId: normalizedSupplierId,
    supplierName,
    totalAmount,
    amountPaid,
    creditAmount,
    totalCost: totalAmount,
    notes: normalizedNotes,
    performedById: null,
    createdAt: now,
    payments: normalizedPayments,
    items: processedItems,
  }
}

export async function listSupplierPayablesLocal(
  businessId: string,
): Promise<LocalSupplierPayable[]> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const debts = await listAllDebtsByDirectionLocal(normalizedBusinessId, DebtDirection.PAYABLE)

  return debts.map((debt) => ({
    id: debt.id,
    businessId: debt.businessId,
    reference: debt.sourceReference || debt.id,
    supplierId: debt.contactId || null,
    supplierName: debt.contact?.name || debt.sourceReference || debt.id,
    supplierPhone: debt.contact?.phone ?? null,
    status: debt.status,
    totalAmount: roundMoney(debt.originalAmount),
    amountPaid: roundMoney(debt.paidAmount),
    outstandingAmount: roundMoney(debt.outstandingAmount),
    notes: debt.notes ?? null,
    createdAt: debt.createdAt,
  }))
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

  const referenceInfo = await loadMovementReferenceInfoLocal(assertBusinessId(businessId), rows)
  const movements = rows.map((row) =>
    mapMovementRow(
      row,
      referenceInfo.get(getMovementReferenceLookupKey(row.reference_type, row.reference_id)),
    ),
  )
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

function mapMovementRow(
  row: MovementRow,
  referenceInfo?: MovementReferenceInfo | null,
): InventoryMovement {
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
    referenceLabel: referenceInfo?.label ?? null,
    createdAt: row.created_at,
  }
}

async function loadMovementReferenceInfoLocal(
  businessId: string,
  rows: MovementRow[],
): Promise<Map<string, MovementReferenceInfo>> {
  const info = new Map<string, MovementReferenceInfo>()
  const saleIds = [...new Set(rows
    .filter((row) => row.reference_id && (row.reference_type === 'sale' || row.reference_type === 'sale_void'))
    .map((row) => row.reference_id!)
  )]
  const restockIds = [...new Set(rows
    .filter((row) => row.reference_id && row.reference_type === 'restock')
    .map((row) => row.reference_id!)
  )]

  if (saleIds.length > 0) {
    const placeholders = buildSqlPlaceholders(saleIds.length)
    const saleRows = await dbQuery<SaleReferenceRow>(
      `
        SELECT
          id,
          sale_number,
          receipt_number,
          customer_name
        FROM sales
        WHERE business_id = ?
          AND id IN (${placeholders})
      `,
      [businessId, ...saleIds],
    )

    for (const sale of saleRows) {
      const label = sale.sale_number?.trim() || sale.receipt_number?.trim() || sale.id
      const sourceName = sale.customer_name?.trim() || null
      info.set(getMovementReferenceLookupKey('sale', sale.id), { label, sourceName })
      info.set(getMovementReferenceLookupKey('sale_void', sale.id), { label, sourceName })
    }
  }

  if (restockIds.length > 0) {
    const placeholders = buildSqlPlaceholders(restockIds.length)
    const restockRows = await dbQuery<RestockReferenceRow>(
      `
        SELECT
          id,
          reference_number,
          supplier_name
        FROM restock_records
        WHERE business_id = ?
          AND id IN (${placeholders})
      `,
      [businessId, ...restockIds],
    )

    for (const record of restockRows) {
      const label = record.reference_number?.trim() || record.id
      info.set(getMovementReferenceLookupKey('restock', record.id), {
        label,
        sourceName: record.supplier_name?.trim() || null,
      })
    }
  }

  return info
}

function buildInventoryBinSummary(
  rows: MovementRow[],
  currentBalance: number,
  referenceInfo: Map<string, MovementReferenceInfo>,
): InventoryBinSummary {
  let totalChange = 0
  let totalRestocked = 0
  let totalSold = 0
  let totalAdjusted = 0

  for (const row of rows) {
    totalChange += row.quantity_change

    if (row.type === InventoryMovementType.RESTOCK_IN) {
      totalRestocked += Math.abs(row.quantity_change)
      continue
    }

    if (row.type === InventoryMovementType.SALE) {
      totalSold += Math.abs(row.quantity_change)
      continue
    }

    if (row.type === InventoryMovementType.OPENING_STOCK) {
      continue
    }

    totalAdjusted += row.quantity_change
  }

  const lastRestock = rows.find((row) => row.type === InventoryMovementType.RESTOCK_IN) ?? null
  const lastRestockInfo =
    lastRestock === null
      ? null
      : referenceInfo.get(
          getMovementReferenceLookupKey(lastRestock.reference_type, lastRestock.reference_id),
        ) ?? null

  return {
    openingStock: roundQuantityValue(currentBalance - totalChange),
    totalRestocked: roundQuantityValue(totalRestocked),
    totalSold: roundQuantityValue(totalSold),
    totalAdjusted: roundQuantityValue(totalAdjusted),
    currentBalance: roundQuantityValue(currentBalance),
    lastRestockAt: lastRestock?.created_at ?? null,
    lastRestockQuantity:
      lastRestock === null ? null : roundQuantityValue(Math.abs(lastRestock.quantity_change)),
    lastRestockReferenceLabel: lastRestockInfo?.label ?? null,
    lastRestockSourceName: lastRestockInfo?.sourceName ?? null,
    movementWindowDays: 30,
    trend: buildMovementTrend(rows, 30),
  }
}

function buildMovementTrend(rows: MovementRow[], movementWindowDays: number): InventoryMovementTrendPoint[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const points = new Map<string, InventoryMovementTrendPoint>()

  for (let index = movementWindowDays - 1; index >= 0; index -= 1) {
    const date = new Date(today)
    date.setDate(today.getDate() - index)
    const key = toLocalDateKey(date)
    points.set(key, {
      date: key,
      stockIn: 0,
      stockOut: 0,
    })
  }

  for (const row of rows) {
    const key = toLocalDateKey(new Date(row.created_at))
    const point = points.get(key)
    if (!point) {
      continue
    }

    if (row.quantity_change > 0) {
      point.stockIn = roundQuantityValue(point.stockIn + row.quantity_change)
    } else if (row.quantity_change < 0) {
      point.stockOut = roundQuantityValue(point.stockOut + Math.abs(row.quantity_change))
    }
  }

  return Array.from(points.values())
}

function getMovementReferenceLookupKey(referenceType?: string | null, referenceId?: string | null) {
  return `${referenceType ?? 'none'}:${referenceId ?? 'none'}`
}

function buildSqlPlaceholders(count: number) {
  return Array.from({ length: count }, () => '?').join(', ')
}

function toLocalDateKey(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function roundQuantityValue(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000
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
    payload.totalAmount !== undefined &&
    (!Number.isFinite(payload.totalAmount) || payload.totalAmount < 0)
  ) {
    throw new InventoryLocalError('INVENTORY_RESTOCK_TOTAL_AMOUNT_INVALID')
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

  for (const payment of payload.payments ?? []) {
    if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
      throw new InventoryLocalError('INVENTORY_RESTOCK_PAYMENT_AMOUNT_INVALID')
    }
  }
}

function resolveRestockTotal(payload: RestockRequest) {
  const explicitTotal =
    payload.totalAmount !== undefined ? payload.totalAmount : payload.totalCost
  const normalizedExplicitTotal =
    explicitTotal === undefined ? null : roundMoney(explicitTotal)
  const allUnitCostsPresent = payload.items.every(
    (item) => item.unitCost !== undefined && item.unitCost !== null,
  )
  const computedTotal = allUnitCostsPresent
    ? roundMoney(
        payload.items.reduce(
          (sum, item) => sum + item.quantity * (item.unitCost ?? 0),
          0,
        ),
      )
    : null

  if (computedTotal === null && normalizedExplicitTotal === null) {
    throw new InventoryLocalError('INVENTORY_RESTOCK_TOTAL_AMOUNT_REQUIRED')
  }

  if (
    computedTotal !== null &&
    normalizedExplicitTotal !== null &&
    computedTotal !== normalizedExplicitTotal
  ) {
    throw new InventoryLocalError('INVENTORY_RESTOCK_TOTAL_AMOUNT_MISMATCH')
  }

  return normalizedExplicitTotal ?? computedTotal ?? 0
}

async function resolveRestockSupplier(
  businessId: string,
  supplierId: string | null,
  creditAmount: number,
) {
  if (!supplierId) {
    if (creditAmount > 0) {
      throw new InventoryLocalError('INVENTORY_RESTOCK_SUPPLIER_REQUIRED_FOR_CREDIT')
    }

    return null
  }

  const supplier = await getContactByIdLocal(businessId, supplierId)
  if (!supplier) {
    throw new InventoryLocalError('INVENTORY_RESTOCK_SUPPLIER_NOT_FOUND')
  }

  if (!supplier.isActive) {
    throw new InventoryLocalError('INVENTORY_RESTOCK_SUPPLIER_INACTIVE')
  }

  if (supplier.type !== ContactType.SUPPLIER && supplier.type !== ContactType.BOTH) {
    throw new InventoryLocalError('INVENTORY_RESTOCK_SUPPLIER_TYPE_INVALID')
  }

  return supplier
}

function roundMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}
