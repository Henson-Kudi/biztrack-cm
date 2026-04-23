'use client'

import {
  Currency,
  type CategoriesQuery,
  UnitOfMeasureType,
  type CreateCategoryRequest,
  type CreateProductRequest,
  type CreateUnitOfMeasureRequest,
  type UpdateProductRequest,
  type UpdateCategoryRequest,
  type UpdateUnitOfMeasureRequest,
  type LowStockProduct,
  type PaginatedResult,
  type Product,
  type ProductCategory,
  type ProductsQuery,
  type UnitOfMeasure,
  type UnitOfMeasuresQuery,
} from '@biztrack/types'
import { compareValues, dbBatch, dbQuery, paginateResult, normalizeSortOrder } from './local-db'
import { buildOutboxUpsertOperation, requestBackgroundSync } from './sync.local'

const SKU_PATTERN = /^[A-Z0-9\-_]{1,100}$/
const SKU_RANDOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export class ProductLocalError extends Error {
  constructor(
    public readonly code:
      | 'BUSINESS_REQUIRED'
      | 'PRODUCT_NOT_FOUND'
      | 'PRODUCT_NAME_REQUIRED'
      | 'PRODUCT_NAME_TOO_LONG'
      | 'PRODUCT_NAME_IN_USE'
      | 'PRODUCT_DESCRIPTION_TOO_LONG'
      | 'PRODUCT_PRICE_INVALID'
      | 'PRODUCT_COST_PRICE_INVALID'
      | 'PRODUCT_TAX_RATE_INVALID'
      | 'PRODUCT_OPENING_STOCK_INVALID'
      | 'PRODUCT_LOW_STOCK_THRESHOLD_INVALID'
      | 'PRODUCT_UNIT_REQUIRED'
      | 'PRODUCT_UNIT_INVALID'
      | 'PRODUCT_CATEGORY_REQUIRED'
      | 'PRODUCT_CATEGORY_INVALID'
      | 'PRODUCT_SKU_INVALID'
      | 'PRODUCT_SKU_IMMUTABLE'
      | 'PRODUCT_SKU_IN_USE'
      | 'PRODUCT_SKU_GENERATION_FAILED'
      | 'PRODUCT_BARCODE_INVALID'
      | 'PRODUCT_BARCODE_IN_USE'
      | 'PRODUCT_IMAGE_URL_TOO_LONG'
      | 'PRODUCT_SAVE_RELOAD_FAILED'
      | 'CATEGORY_NOT_FOUND'
      | 'CATEGORY_NAME_REQUIRED'
      | 'CATEGORY_NAME_TOO_LONG'
      | 'CATEGORY_NAME_IN_USE'
      | 'CATEGORY_COLOR_INVALID'
      | 'CATEGORY_ICON_TOO_LONG'
      | 'CATEGORY_IMAGE_URL_TOO_LONG'
      | 'CATEGORY_SORT_ORDER_INVALID'
      | 'CATEGORY_HAS_PRODUCTS'
      | 'CATEGORY_SAVE_RELOAD_FAILED'
      | 'UNIT_NOT_FOUND'
      | 'UNIT_NAME_REQUIRED'
      | 'UNIT_NAME_TOO_LONG'
      | 'UNIT_NAME_IN_USE'
      | 'UNIT_ABBREVIATION_REQUIRED'
      | 'UNIT_ABBREVIATION_TOO_LONG'
      | 'UNIT_TYPE_INVALID'
      | 'UNIT_SYSTEM_IMMUTABLE'
      | 'UNIT_HAS_PRODUCTS'
      | 'UNIT_SAVE_RELOAD_FAILED',
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'ProductLocalError'
  }
}

export type ProductRow = {
  id: string
  business_id: string
  name: string
  description: string | null
  sku: string | null
  barcode: string | null
  price: number
  cost_price: number | null
  currency: string | null
  tax_rate: number | null
  is_active: number
  is_service: number
  track_inventory: number
  category_id: string | null
  image_url: string | null
  created_at: string
  updated_at: string
  slug: string | null
  barcode_type: string | null
  is_barcode_generated: number | null
  reorder_point: number | null
  unit_of_measure_id: string | null
  created_by_id: string | null
  stock_quantity: number | null
  low_stock_threshold: number | null
  category_join_id: string | null
  category_business_id: string | null
  category_name: string | null
  category_slug: string | null
  category_color: string | null
  category_icon: string | null
  category_image_url: string | null
  category_sort_order: number | null
  category_created_at: string | null
  category_updated_at: string | null
  unit_join_id: string | null
  unit_name: string | null
  unit_abbreviation: string | null
  unit_business_id: string | null
  unit_type: string | null
  unit_is_default: number | null
  inventory_id: string | null
  inventory_quantity: number | null
  inventory_low_stock_threshold: number | null
  inventory_reorder_point: number | null
  inventory_last_restock_at: string | null
}

type CategoryRow = {
  id: string
  business_id: string
  name: string
  slug: string | null
  is_active: number
  is_deleted: number
  color: string | null
  icon: string | null
  image_url: string | null
  sort_order: number | null
  created_at: string
  updated_at: string
}

type UnitRow = {
  id: string
  name: string
  abbreviation: string | null
  business_id: string | null
  type: string | null
  is_active: number
  is_deleted: number
  is_default: number
  created_at: string
  updated_at: string
}

type LocalCategoriesQuery = CategoriesQuery & {
  includeInactive?: boolean
  includeDeleted?: boolean
}

type LocalUnitOfMeasuresQuery = UnitOfMeasuresQuery & {
  includeInactive?: boolean
  includeDeleted?: boolean
}

export function assertBusinessId(businessId: string | null | undefined) {
  if (!businessId) {
    throw new ProductLocalError('BUSINESS_REQUIRED')
  }

  return businessId
}

export function isValidProductSkuCandidate(sku: string) {
  return SKU_PATTERN.test(sku.trim().toUpperCase())
}

export function isValidProductBarcodeCandidate(barcode: string) {
  const normalized = barcode.trim()
  if (!normalized || normalized.length > 100) {
    return false
  }

  const type = detectBarcodeType(normalized)

  if (
    ['EAN13', 'EAN8', 'UPCA', 'INTERNAL'].includes(type) &&
    !validateBarcodeCheckDigit(normalized, type)
  ) {
    return false
  }

  return true
}

export type ProductCreateConflictCode =
  | 'PRODUCT_NAME_IN_USE'
  | 'PRODUCT_SKU_IN_USE'
  | 'PRODUCT_BARCODE_IN_USE'

export type ProductCreateConflicts = Partial<
  Record<'name' | 'sku' | 'barcode', ProductCreateConflictCode>
>

export async function findCreateProductConflictsLocal(
  businessId: string,
  payload: Pick<CreateProductRequest, 'name' | 'sku' | 'barcode'>,
  excludeProductId?: string,
) {
  const normalizedBusinessId = assertBusinessId(businessId)
  const conflicts: ProductCreateConflicts = {}
  const trimmedName = payload.name.trim()
  const trimmedSku = payload.sku?.trim()
  const trimmedBarcode = payload.barcode?.trim()

  if (trimmedName) {
    const [existingBySlug] = await dbQuery<{ id: string }>(
      `
        SELECT id
        FROM products
        WHERE business_id = ?
          AND slug = ?
          ${excludeProductId ? 'AND id <> ?' : ''}
        LIMIT 1
      `,
      excludeProductId
        ? [normalizedBusinessId, slugify(trimmedName), excludeProductId]
        : [normalizedBusinessId, slugify(trimmedName)],
    )

    if (existingBySlug) {
      conflicts.name = 'PRODUCT_NAME_IN_USE'
    }
  }

  if (trimmedSku && isValidProductSkuCandidate(trimmedSku)) {
    const [existingBySku] = await dbQuery<{ id: string }>(
      `
        SELECT id
        FROM products
        WHERE business_id = ?
          AND sku = ?
          ${excludeProductId ? 'AND id <> ?' : ''}
        LIMIT 1
      `,
      excludeProductId
        ? [normalizedBusinessId, trimmedSku.toUpperCase(), excludeProductId]
        : [normalizedBusinessId, trimmedSku.toUpperCase()],
    )

    if (existingBySku) {
      conflicts.sku = 'PRODUCT_SKU_IN_USE'
    }
  }

  if (trimmedBarcode && isValidProductBarcodeCandidate(trimmedBarcode)) {
    const [existingByBarcode] = await dbQuery<{ id: string }>(
      `
        SELECT id
        FROM products
        WHERE business_id = ?
          AND barcode = ?
          ${excludeProductId ? 'AND id <> ?' : ''}
        LIMIT 1
      `,
      excludeProductId
        ? [normalizedBusinessId, trimmedBarcode, excludeProductId]
        : [normalizedBusinessId, trimmedBarcode],
    )

    if (existingByBarcode) {
      conflicts.barcode = 'PRODUCT_BARCODE_IN_USE'
    }
  }

  return conflicts
}

export async function listProductsLocal(
  businessId: string,
  query: ProductsQuery,
): Promise<PaginatedResult<Product>> {
  const rows = await fetchProductRowsForBusiness(assertBusinessId(businessId))
  const search = query.search?.trim().toLowerCase()
  const sortOrder = normalizeSortOrder(query.sortOrder)

  const filtered = rows
    .filter((row) => {
      if (query.categoryId && row.category_id !== query.categoryId) return false
      if (query.isActive !== undefined && Boolean(row.is_active) !== query.isActive) return false
      if (query.isService !== undefined && Boolean(row.is_service) !== query.isService) return false
      if (
        query.trackInventory !== undefined &&
        Boolean(row.track_inventory) !== query.trackInventory
      ) {
        return false
      }
      if (!search) return true

      const haystack = [row.name, row.sku, row.barcode, row.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(search)
    })
    .map(mapProductRow)

  filtered.sort((left, right) => {
    switch (query.sortBy) {
      case 'name':
        return compareValues(left.name, right.name, sortOrder)
      case 'sellingPrice':
        return compareValues(left.sellingPrice, right.sellingPrice, sortOrder)
      case 'currentStock':
        return compareValues(left.currentStock ?? null, right.currentStock ?? null, sortOrder)
      case 'createdAt':
        return compareValues(left.createdAt ?? null, right.createdAt ?? null, sortOrder)
      case 'updatedAt':
      default:
        return compareValues(left.updatedAt ?? null, right.updatedAt ?? null, sortOrder)
    }
  })

  return paginateResult(filtered, query.page, query.limit)
}

export async function createProductLocal(
  businessId: string,
  payload: CreateProductRequest,
): Promise<Product> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const trimmedName = payload.name.trim()
  const trimmedDescription = payload.description?.trim() || null
  const trimmedImageUrl = payload.imageUrl?.trim() || null

  if (!trimmedName) {
    throw new ProductLocalError('PRODUCT_NAME_REQUIRED')
  }

  if (trimmedName.length > 200) {
    throw new ProductLocalError('PRODUCT_NAME_TOO_LONG')
  }

  if (trimmedDescription && trimmedDescription.length > 2000) {
    throw new ProductLocalError('PRODUCT_DESCRIPTION_TOO_LONG')
  }

  if (trimmedImageUrl && trimmedImageUrl.length > 500) {
    throw new ProductLocalError('PRODUCT_IMAGE_URL_TOO_LONG')
  }

  if (!Number.isFinite(payload.sellingPrice) || payload.sellingPrice < 0) {
    throw new ProductLocalError('PRODUCT_PRICE_INVALID')
  }

  if (
    payload.costPrice !== undefined &&
    (!Number.isFinite(payload.costPrice) || payload.costPrice < 0)
  ) {
    throw new ProductLocalError('PRODUCT_COST_PRICE_INVALID')
  }

  if (payload.taxRate !== undefined && (!Number.isFinite(payload.taxRate) || payload.taxRate < 0)) {
    throw new ProductLocalError('PRODUCT_TAX_RATE_INVALID')
  }

  if (
    payload.openingStock !== undefined &&
    (!Number.isFinite(payload.openingStock) || payload.openingStock < 0)
  ) {
    throw new ProductLocalError('PRODUCT_OPENING_STOCK_INVALID')
  }

  if (
    payload.lowStockThreshold !== undefined &&
    (!Number.isFinite(payload.lowStockThreshold) || payload.lowStockThreshold < 0)
  ) {
    throw new ProductLocalError('PRODUCT_LOW_STOCK_THRESHOLD_INVALID')
  }

  if (!payload.unitOfMeasureId) {
    throw new ProductLocalError('PRODUCT_UNIT_REQUIRED')
  }

  const [unit] = await dbQuery<UnitRow>(
    `
      SELECT id, name, abbreviation, business_id, type, is_default
      FROM unit_of_measures
      WHERE id = ?
        AND (business_id IS NULL OR business_id = ?)
        AND is_active = 1
        AND is_deleted = 0
      LIMIT 1
    `,
    [payload.unitOfMeasureId, normalizedBusinessId],
  )

  if (!unit) {
    throw new ProductLocalError('PRODUCT_UNIT_INVALID')
  }

  const category = payload.categoryId
    ? (
        await dbQuery<{ id: string; slug: string | null }>(
          `
            SELECT id, slug
            FROM product_categories
            WHERE id = ?
              AND business_id = ?
              AND is_active = 1
              AND is_deleted = 0
            LIMIT 1
          `,
          [payload.categoryId, normalizedBusinessId],
        )
      )[0]
    : null

  if (!payload.categoryId) {
    throw new ProductLocalError('PRODUCT_CATEGORY_REQUIRED')
  }

  if (payload.categoryId) {
    if (!category) {
      throw new ProductLocalError('PRODUCT_CATEGORY_INVALID')
    }
  }

  const conflicts = await findCreateProductConflictsLocal(normalizedBusinessId, {
    name: trimmedName,
    sku: payload.sku,
    barcode: payload.barcode,
  })

  if (conflicts.name) {
    throw new ProductLocalError(conflicts.name)
  }
  if (conflicts.sku) {
    throw new ProductLocalError(conflicts.sku)
  }
  if (conflicts.barcode) {
    throw new ProductLocalError(conflicts.barcode)
  }

  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const baseSlug = slugify(trimmedName)
  const slug = await buildUniqueProductSlug(normalizedBusinessId, baseSlug)
  const resolvedSku = payload.sku
    ? await validateAndNormalizeSku(normalizedBusinessId, payload.sku)
    : await generateSku(normalizedBusinessId, category?.slug ?? null)
  const resolvedBarcode = payload.barcode
    ? await validateAndNormalizeBarcode(normalizedBusinessId, payload.barcode)
    : await generateUniqueBarcodeFromSku(normalizedBusinessId, resolvedSku)
  const isService = payload.isService ?? false
  const trackInventory =
    payload.trackInventory !== undefined ? payload.trackInventory : !isService
  const openingStock = trackInventory ? Math.max(payload.openingStock ?? 0, 0) : 0
  const lowStockThreshold = trackInventory ? payload.lowStockThreshold ?? 5 : null

  const operations = [
    {
      sql: `
        INSERT INTO products (
          id,
          business_id,
          name,
          description,
          sku,
          barcode,
          price,
          cost_price,
          stock_quantity,
          low_stock_threshold,
          unit,
          category_id,
          image_url,
          is_active,
          is_deleted,
          created_at,
          updated_at,
          currency,
          tax_rate,
          is_service,
          track_inventory,
          slug,
          barcode_type,
          is_barcode_generated,
          reorder_point,
          unit_of_measure_id,
          created_by_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        id,
        normalizedBusinessId,
        trimmedName,
        trimmedDescription,
        resolvedSku,
        resolvedBarcode.value,
        payload.sellingPrice,
        payload.costPrice ?? null,
        openingStock,
        lowStockThreshold,
        unit.abbreviation ?? unit.name,
        payload.categoryId ?? null,
        trimmedImageUrl,
        payload.isActive === false ? 0 : 1,
        now,
        now,
        Currency.XAF,
        payload.taxRate ?? 0,
        isService ? 1 : 0,
        trackInventory ? 1 : 0,
        slug,
        resolvedBarcode.type,
        resolvedBarcode.isGenerated ? 1 : 0,
        null,
        unit.id,
        null,
      ],
    },
    buildOutboxUpsertOperation('products', id),
  ]

  if (trackInventory) {
    const inventoryId = crypto.randomUUID()
    operations.push({
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
        inventoryId,
        normalizedBusinessId,
        id,
        openingStock,
        lowStockThreshold,
        null,
        null,
        now,
        now,
      ],
    })

    if (openingStock > 0) {
      operations.push({
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
          id,
          normalizedBusinessId,
          id,
          'OPENING_STOCK',
          openingStock,
          0,
          openingStock,
          'product',
          id,
          'Opening stock recorded at product creation.',
          null,
          null,
          now,
        ],
      })
    }
  }

  await dbBatch(operations)
  requestBackgroundSync()

  const created = await getProductByIdLocal(normalizedBusinessId, id)
  if (!created) {
    throw new ProductLocalError('PRODUCT_SAVE_RELOAD_FAILED')
  }

  return created
}

export async function updateProductLocal(
  businessId: string,
  productId: string,
  payload: UpdateProductRequest,
): Promise<Product> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const existing = await getProductByIdLocal(normalizedBusinessId, productId)

  if (!existing) {
    throw new ProductLocalError('PRODUCT_NOT_FOUND')
  }

  if (
    payload.sku !== undefined &&
    payload.sku.trim().toUpperCase() !== (existing.sku?.trim().toUpperCase() ?? '')
  ) {
    throw new ProductLocalError('PRODUCT_SKU_IMMUTABLE')
  }

  const trimmedName = payload.name?.trim() ?? existing.name
  const trimmedDescription =
    payload.description !== undefined
      ? payload.description.trim() || null
      : (existing.description?.trim() ?? null)
  const trimmedImageUrl =
    payload.imageUrl !== undefined
      ? payload.imageUrl.trim() || null
      : (existing.primaryImageUrl ?? existing.imageUrl ?? null)

  if (!trimmedName) {
    throw new ProductLocalError('PRODUCT_NAME_REQUIRED')
  }

  if (trimmedName.length > 200) {
    throw new ProductLocalError('PRODUCT_NAME_TOO_LONG')
  }

  if (trimmedDescription && trimmedDescription.length > 2000) {
    throw new ProductLocalError('PRODUCT_DESCRIPTION_TOO_LONG')
  }

  if (trimmedImageUrl && trimmedImageUrl.length > 500) {
    throw new ProductLocalError('PRODUCT_IMAGE_URL_TOO_LONG')
  }

  const sellingPrice = payload.sellingPrice ?? existing.sellingPrice
  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
    throw new ProductLocalError('PRODUCT_PRICE_INVALID')
  }

  const costPrice =
    payload.costPrice !== undefined ? payload.costPrice ?? null : (existing.costPrice ?? null)
  if (costPrice !== null && (!Number.isFinite(costPrice) || costPrice < 0)) {
    throw new ProductLocalError('PRODUCT_COST_PRICE_INVALID')
  }

  const taxRate = payload.taxRate ?? existing.taxRate
  if (!Number.isFinite(taxRate) || taxRate < 0) {
    throw new ProductLocalError('PRODUCT_TAX_RATE_INVALID')
  }

  const resolvedUnitId = payload.unitOfMeasureId ?? existing.unitOfMeasure?.id
  if (!resolvedUnitId) {
    throw new ProductLocalError('PRODUCT_UNIT_REQUIRED')
  }

  const [unit] = await dbQuery<UnitRow>(
    `
      SELECT id, name, abbreviation, business_id, type, is_default
      FROM unit_of_measures
      WHERE id = ?
        AND (business_id IS NULL OR business_id = ?)
        AND is_active = 1
        AND is_deleted = 0
      LIMIT 1
    `,
    [resolvedUnitId, normalizedBusinessId],
  )

  if (!unit) {
    throw new ProductLocalError('PRODUCT_UNIT_INVALID')
  }

  const resolvedCategoryId = payload.categoryId ?? existing.category?.id ?? existing.categoryId ?? null
  if (!resolvedCategoryId) {
    throw new ProductLocalError('PRODUCT_CATEGORY_REQUIRED')
  }

  const [category] = await dbQuery<{ id: string; slug: string | null }>(
    `
      SELECT id, slug
      FROM product_categories
      WHERE id = ?
        AND business_id = ?
        AND is_active = 1
        AND is_deleted = 0
      LIMIT 1
    `,
    [resolvedCategoryId, normalizedBusinessId],
  )

  if (!category) {
    throw new ProductLocalError('PRODUCT_CATEGORY_INVALID')
  }

  const conflicts = await findCreateProductConflictsLocal(
    normalizedBusinessId,
    {
      name: trimmedName,
      sku: existing.sku ?? undefined,
      barcode: payload.barcode !== undefined ? payload.barcode : (existing.barcode ?? undefined),
    },
    productId,
  )

  if (conflicts.name) {
    throw new ProductLocalError(conflicts.name)
  }
  if (conflicts.barcode) {
    throw new ProductLocalError(conflicts.barcode)
  }

  const resolvedBarcode = (() => {
    if (payload.barcode === undefined) {
      return {
        value: existing.barcode ?? null,
        type: existing.barcodeType ?? null,
        isGenerated: existing.isBarcodeGenerated,
      }
    }

    const trimmedBarcode = payload.barcode.trim()
    if (!trimmedBarcode) {
      return { value: null, type: null, isGenerated: false }
    }

    return validateAndNormalizeBarcode(normalizedBusinessId, trimmedBarcode, productId)
  })()

  const barcode = resolvedBarcode instanceof Promise ? await resolvedBarcode : resolvedBarcode
  const isService = payload.isService ?? existing.isService
  const trackInventory =
    payload.trackInventory !== undefined
      ? payload.trackInventory
      : payload.isService === true
        ? false
        : existing.trackInventory
  const isActive = payload.isActive ?? existing.isActive
  const lowStockThreshold =
    payload.lowStockThreshold !== undefined
      ? payload.lowStockThreshold ?? null
      : (existing.lowStockThreshold ?? null)

  if (
    lowStockThreshold !== null &&
    (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0)
  ) {
    throw new ProductLocalError('PRODUCT_LOW_STOCK_THRESHOLD_INVALID')
  }

  const nextSlug =
    trimmedName !== existing.name
      ? await buildUniqueProductSlug(normalizedBusinessId, slugify(trimmedName), productId)
      : existing.slug
  const now = new Date().toISOString()
  const inventoryRows = await dbQuery<{
    id: string
    quantity: number
    low_stock_threshold: number | null
    reorder_point: number | null
  }>(
    `
      SELECT id, quantity, low_stock_threshold, reorder_point
      FROM inventory_levels
      WHERE business_id = ?
        AND product_id = ?
      LIMIT 1
    `,
    [normalizedBusinessId, productId],
  )
  const inventoryLevel = inventoryRows[0] ?? null
  const operations: Array<{ sql: string; params?: unknown[] }> = [
    {
      sql: `
        UPDATE products
        SET name = ?,
            description = ?,
            barcode = ?,
            price = ?,
            cost_price = ?,
            tax_rate = ?,
            is_active = ?,
            is_service = ?,
            track_inventory = ?,
            category_id = ?,
            image_url = ?,
            updated_at = ?,
            slug = ?,
            barcode_type = ?,
            is_barcode_generated = ?,
            low_stock_threshold = ?,
            unit = ?,
            unit_of_measure_id = ?
        WHERE id = ?
      `,
      params: [
        trimmedName,
        trimmedDescription,
        barcode.value,
        sellingPrice,
        costPrice,
        taxRate,
        isActive ? 1 : 0,
        isService ? 1 : 0,
        trackInventory ? 1 : 0,
        category.id,
        trimmedImageUrl,
        now,
        nextSlug,
        barcode.type,
        barcode.isGenerated ? 1 : 0,
        lowStockThreshold,
        unit.abbreviation ?? unit.name,
        unit.id,
        productId,
      ],
    },
  ]

  if (trackInventory) {
    if (inventoryLevel) {
      operations.push({
        sql: `
          UPDATE inventory_levels
          SET low_stock_threshold = ?,
              updated_at = ?
          WHERE id = ?
        `,
        params: [lowStockThreshold, now, inventoryLevel.id],
      })
    } else {
      operations.push({
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
          crypto.randomUUID(),
          normalizedBusinessId,
          productId,
          existing.currentStock ?? 0,
          lowStockThreshold,
          existing.reorderPoint ?? null,
          null,
          now,
          now,
        ],
      })
    }
  } else if (inventoryLevel) {
    operations.push({
      sql: `DELETE FROM inventory_levels WHERE id = ?`,
      params: [inventoryLevel.id],
    })
  }

  operations.push(buildOutboxUpsertOperation('products', productId))

  await dbBatch(operations)
  requestBackgroundSync()

  const updated = await getProductByIdLocal(normalizedBusinessId, productId)
  if (!updated) {
    throw new ProductLocalError('PRODUCT_SAVE_RELOAD_FAILED')
  }

  return updated
}

export async function setProductActiveStateLocal(
  businessId: string,
  productId: string,
  isActive: boolean,
): Promise<Product> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const existing = await getProductByIdLocal(normalizedBusinessId, productId)

  if (!existing) {
    throw new ProductLocalError('PRODUCT_NOT_FOUND')
  }

  const now = new Date().toISOString()

  await dbBatch([
    {
      sql: `
        UPDATE products
        SET is_active = ?,
            updated_at = ?
        WHERE id = ?
      `,
      params: [isActive ? 1 : 0, now, productId],
    },
    buildOutboxUpsertOperation('products', productId),
  ])
  requestBackgroundSync()

  const updated = await getProductByIdLocal(normalizedBusinessId, productId)
  if (!updated) {
    throw new ProductLocalError('PRODUCT_SAVE_RELOAD_FAILED')
  }

  return updated
}

export async function deleteProductLocal(businessId: string, productId: string): Promise<void> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const existing = await getProductByIdLocal(normalizedBusinessId, productId)

  if (!existing) {
    throw new ProductLocalError('PRODUCT_NOT_FOUND')
  }

  const now = new Date().toISOString()

  await dbBatch([
    {
      sql: `
        UPDATE products
        SET is_active = 0,
            is_deleted = 1,
            updated_at = ?
        WHERE id = ?
      `,
      params: [now, productId],
    },
    buildOutboxUpsertOperation('products', productId),
  ])
  requestBackgroundSync()
}

export async function listCategoriesLocal(
  businessId: string,
  query: LocalCategoriesQuery = {
    page: 1,
    limit: 100,
    sortBy: 'sortOrder',
    sortOrder: 'ASC',
  },
): Promise<PaginatedResult<ProductCategory>> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const search = query.search?.trim().toLowerCase()
  const sortOrder = normalizeSortOrder(query.sortOrder)
  const rows = await dbQuery<CategoryRow>(
    `
      SELECT
        id,
        business_id,
        name,
        slug,
        is_active,
        is_deleted,
        color,
        icon,
        image_url,
        sort_order,
        created_at,
        updated_at
      FROM product_categories
      WHERE business_id = ?
        ${query.includeDeleted ? '' : 'AND is_deleted = 0'}
        ${query.includeInactive ? '' : 'AND is_active = 1'}
        ${search ? 'AND (LOWER(name) LIKE ? OR LOWER(COALESCE(icon, \'\')) LIKE ?)' : ''}
    `,
    search
      ? [normalizedBusinessId, `%${search}%`, `%${search}%`]
      : [normalizedBusinessId],
  )

  const filtered = rows.map(mapCategoryRow)

  filtered.sort((left, right) => {
    switch (query.sortBy) {
      case 'name':
        return compareValues(left.name, right.name, sortOrder)
      case 'createdAt':
        return compareValues(left.createdAt, right.createdAt, sortOrder)
      case 'updatedAt':
        return compareValues(left.updatedAt, right.updatedAt, sortOrder)
      case 'sortOrder':
      default:
        return (
          compareValues(left.sortOrder ?? null, right.sortOrder ?? null, sortOrder) ||
          compareValues(left.name, right.name, 'ASC')
        )
    }
  })

  return paginateResult(filtered, query.page, query.limit)
}

export async function listUnitOfMeasuresLocal(
  businessId: string,
  query: LocalUnitOfMeasuresQuery = { page: 1, limit: 100 },
): Promise<PaginatedResult<UnitOfMeasure>> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const search = query.search?.trim().toLowerCase()
  const sortOrder = normalizeSortOrder(query.sortOrder)
  const rows = await dbQuery<UnitRow>(
    `
      SELECT
        id,
        name,
        abbreviation,
        business_id,
        type,
        is_active,
        is_deleted,
        is_default,
        created_at,
        updated_at
      FROM unit_of_measures
      WHERE (business_id IS NULL OR business_id = ?)
        ${query.includeDeleted ? '' : 'AND is_deleted = 0'}
        ${query.includeInactive ? '' : 'AND is_active = 1'}
        ${search ? 'AND (LOWER(name) LIKE ? OR LOWER(COALESCE(abbreviation, \'\')) LIKE ?)' : ''}
    `,
    search
      ? [normalizedBusinessId, `%${search}%`, `%${search}%`]
      : [normalizedBusinessId],
  )

  const filtered = rows.map(mapUnitRow)

  filtered.sort((left, right) => {
    switch (query.sortBy) {
      case 'abbreviation':
        return compareValues(left.abbreviation ?? null, right.abbreviation ?? null, sortOrder)
      case 'type':
        return compareValues(left.type ?? null, right.type ?? null, sortOrder)
      case 'isDefault':
        return compareValues(left.isDefault, right.isDefault, sortOrder)
      case 'name':
      default:
        return (
          compareValues(left.isDefault, right.isDefault, 'DESC') ||
          compareValues(left.name, right.name, sortOrder)
        )
    }
  })

  return paginateResult(filtered, query.page, query.limit)
}

export async function createCategoryLocal(
  businessId: string,
  payload: CreateCategoryRequest,
): Promise<ProductCategory> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const normalized = normalizeCategoryInput(payload)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const slug = await buildUniqueCategorySlug(normalizedBusinessId, slugify(normalized.name))

  await dbBatch([
    {
      sql: `
        INSERT INTO product_categories (
          id,
          business_id,
          name,
          is_active,
          is_deleted,
          created_at,
          updated_at,
          slug,
          color,
          icon,
          image_url,
          sort_order
        ) VALUES (?, ?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        id,
        normalizedBusinessId,
        normalized.name,
        now,
        now,
        slug,
        normalized.color,
        normalized.icon,
        normalized.imageUrl,
        normalized.sortOrder,
      ],
    },
    buildOutboxUpsertOperation('productCategories', id),
  ])
  requestBackgroundSync()

  const created = await getCategoryByIdLocal(normalizedBusinessId, id, {
    includeInactive: true,
    includeDeleted: true,
  })
  if (!created) {
    throw new ProductLocalError('CATEGORY_SAVE_RELOAD_FAILED')
  }

  return created
}

export async function updateCategoryLocal(
  businessId: string,
  categoryId: string,
  payload: UpdateCategoryRequest,
): Promise<ProductCategory> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const existing = await getCategoryRowByIdLocal(normalizedBusinessId, categoryId, {
    includeInactive: true,
  })

  if (!existing) {
    throw new ProductLocalError('CATEGORY_NOT_FOUND')
  }

  const normalized = normalizeCategoryInput({
    name: payload.name ?? existing.name,
    color: payload.color === undefined ? existing.color ?? undefined : payload.color,
    icon: payload.icon === undefined ? existing.icon ?? undefined : payload.icon,
    imageUrl: payload.imageUrl === undefined ? existing.image_url ?? undefined : payload.imageUrl,
    sortOrder: payload.sortOrder ?? existing.sort_order ?? 0,
  })
  const now = new Date().toISOString()
  const slug =
    normalized.name === existing.name
      ? existing.slug
      : await buildUniqueCategorySlug(normalizedBusinessId, slugify(normalized.name), categoryId)

  await dbBatch([
    {
      sql: `
        UPDATE product_categories
        SET name = ?,
            updated_at = ?,
            slug = ?,
            color = ?,
            icon = ?,
            image_url = ?,
            sort_order = ?
        WHERE id = ?
      `,
      params: [
        normalized.name,
        now,
        slug,
        normalized.color,
        normalized.icon,
        normalized.imageUrl,
        normalized.sortOrder,
        categoryId,
      ],
    },
    buildOutboxUpsertOperation('productCategories', categoryId),
  ])
  requestBackgroundSync()

  const updated = await getCategoryByIdLocal(normalizedBusinessId, categoryId, {
    includeInactive: true,
    includeDeleted: true,
  })
  if (!updated) {
    throw new ProductLocalError('CATEGORY_SAVE_RELOAD_FAILED')
  }

  return updated
}

export async function setCategoryActiveStateLocal(
  businessId: string,
  categoryId: string,
  isActive: boolean,
): Promise<ProductCategory> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const existing = await getCategoryRowByIdLocal(normalizedBusinessId, categoryId, {
    includeInactive: true,
  })

  if (!existing) {
    throw new ProductLocalError('CATEGORY_NOT_FOUND')
  }

  const now = new Date().toISOString()
  await dbBatch([
    {
      sql: `
        UPDATE product_categories
        SET is_active = ?,
            updated_at = ?
        WHERE id = ?
      `,
      params: [isActive ? 1 : 0, now, categoryId],
    },
    buildOutboxUpsertOperation('productCategories', categoryId),
  ])
  requestBackgroundSync()

  const updated = await getCategoryByIdLocal(normalizedBusinessId, categoryId, {
    includeInactive: true,
    includeDeleted: true,
  })
  if (!updated) {
    throw new ProductLocalError('CATEGORY_SAVE_RELOAD_FAILED')
  }

  return updated
}

export async function deleteCategoryLocal(businessId: string, categoryId: string): Promise<void> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const existing = await getCategoryRowByIdLocal(normalizedBusinessId, categoryId, {
    includeInactive: true,
  })

  if (!existing) {
    throw new ProductLocalError('CATEGORY_NOT_FOUND')
  }

  const productCount = (await fetchProductRowsForBusiness(normalizedBusinessId)).filter(
    (row) => row.category_id === categoryId,
  ).length

  if (productCount > 0) {
    throw new ProductLocalError('CATEGORY_HAS_PRODUCTS')
  }

  const now = new Date().toISOString()
  await dbBatch([
    {
      sql: `
        UPDATE product_categories
        SET is_active = 0,
            is_deleted = 1,
            updated_at = ?
        WHERE id = ?
      `,
      params: [now, categoryId],
    },
    buildOutboxUpsertOperation('productCategories', categoryId),
  ])
  requestBackgroundSync()
}

export async function restoreCategoryLocal(
  businessId: string,
  categoryId: string,
): Promise<ProductCategory> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const existing = await getCategoryRowByIdLocal(normalizedBusinessId, categoryId, {
    includeInactive: true,
    includeDeleted: true,
  })

  if (!existing) {
    throw new ProductLocalError('CATEGORY_NOT_FOUND')
  }

  const now = new Date().toISOString()
  await dbBatch([
    {
      sql: `
        UPDATE product_categories
        SET is_active = 1,
            is_deleted = 0,
            updated_at = ?
        WHERE id = ?
      `,
      params: [now, categoryId],
    },
    buildOutboxUpsertOperation('productCategories', categoryId),
  ])
  requestBackgroundSync()

  const restored = await getCategoryByIdLocal(normalizedBusinessId, categoryId, {
    includeInactive: true,
    includeDeleted: true,
  })
  if (!restored) {
    throw new ProductLocalError('CATEGORY_SAVE_RELOAD_FAILED')
  }

  return restored
}

export async function createUnitOfMeasureLocal(
  businessId: string,
  payload: CreateUnitOfMeasureRequest,
): Promise<UnitOfMeasure> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const normalized = await normalizeUnitInput(normalizedBusinessId, payload)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await dbBatch([
    {
      sql: `
        INSERT INTO unit_of_measures (
          id,
          name,
          abbreviation,
          business_id,
          type,
          is_active,
          is_deleted,
          is_default,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, 0, 0, ?, ?)
      `,
      params: [
        id,
        normalized.name,
        normalized.abbreviation,
        normalizedBusinessId,
        normalized.type,
        now,
        now,
      ],
    },
    buildOutboxUpsertOperation('unitOfMeasures', id),
  ])
  requestBackgroundSync()

  const created = await getUnitOfMeasureByIdLocal(normalizedBusinessId, id, {
    includeInactive: true,
    includeDeleted: true,
  })
  if (!created) {
    throw new ProductLocalError('UNIT_SAVE_RELOAD_FAILED')
  }

  return created
}

export async function updateUnitOfMeasureLocal(
  businessId: string,
  unitId: string,
  payload: UpdateUnitOfMeasureRequest,
): Promise<UnitOfMeasure> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const existing = await getUnitRowByIdLocal(normalizedBusinessId, unitId, {
    includeInactive: true,
    includeDeleted: true,
  })

  if (!existing) {
    throw new ProductLocalError('UNIT_NOT_FOUND')
  }

  ensureCustomBusinessUnit(normalizedBusinessId, existing)
  const normalized = await normalizeUnitInput(normalizedBusinessId, {
    name: payload.name ?? existing.name,
    abbreviation: payload.abbreviation ?? existing.abbreviation ?? '',
    type: (payload.type ?? existing.type ?? null) as UnitOfMeasureType | null,
  }, unitId)
  const now = new Date().toISOString()

  await dbBatch([
    {
      sql: `
        UPDATE unit_of_measures
        SET name = ?,
            abbreviation = ?,
            type = ?,
            updated_at = ?
        WHERE id = ?
      `,
      params: [
        normalized.name,
        normalized.abbreviation,
        normalized.type,
        now,
        unitId,
      ],
    },
    buildOutboxUpsertOperation('unitOfMeasures', unitId),
  ])
  requestBackgroundSync()

  const updated = await getUnitOfMeasureByIdLocal(normalizedBusinessId, unitId, {
    includeInactive: true,
    includeDeleted: true,
  })
  if (!updated) {
    throw new ProductLocalError('UNIT_SAVE_RELOAD_FAILED')
  }

  return updated
}

export async function setUnitOfMeasureActiveStateLocal(
  businessId: string,
  unitId: string,
  isActive: boolean,
): Promise<UnitOfMeasure> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const existing = await getUnitRowByIdLocal(normalizedBusinessId, unitId, {
    includeInactive: true,
    includeDeleted: true,
  })

  if (!existing) {
    throw new ProductLocalError('UNIT_NOT_FOUND')
  }

  ensureCustomBusinessUnit(normalizedBusinessId, existing)
  const now = new Date().toISOString()

  await dbBatch([
    {
      sql: `
        UPDATE unit_of_measures
        SET is_active = ?,
            updated_at = ?
        WHERE id = ?
      `,
      params: [isActive ? 1 : 0, now, unitId],
    },
    buildOutboxUpsertOperation('unitOfMeasures', unitId),
  ])
  requestBackgroundSync()

  const updated = await getUnitOfMeasureByIdLocal(normalizedBusinessId, unitId, {
    includeInactive: true,
    includeDeleted: true,
  })
  if (!updated) {
    throw new ProductLocalError('UNIT_SAVE_RELOAD_FAILED')
  }

  return updated
}

export async function deleteUnitOfMeasureLocal(businessId: string, unitId: string): Promise<void> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const existing = await getUnitRowByIdLocal(normalizedBusinessId, unitId, {
    includeInactive: true,
    includeDeleted: true,
  })

  if (!existing) {
    throw new ProductLocalError('UNIT_NOT_FOUND')
  }

  ensureCustomBusinessUnit(normalizedBusinessId, existing)

  const productCount = (await fetchProductRowsForBusiness(normalizedBusinessId)).filter(
    (row) => row.unit_of_measure_id === unitId,
  ).length

  if (productCount > 0) {
    throw new ProductLocalError('UNIT_HAS_PRODUCTS')
  }

  const now = new Date().toISOString()
  await dbBatch([
    {
      sql: `
        UPDATE unit_of_measures
        SET is_active = 0,
            is_deleted = 1,
            updated_at = ?
        WHERE id = ?
      `,
      params: [now, unitId],
    },
    buildOutboxUpsertOperation('unitOfMeasures', unitId),
  ])
  requestBackgroundSync()
}

export async function restoreUnitOfMeasureLocal(
  businessId: string,
  unitId: string,
): Promise<UnitOfMeasure> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const existing = await getUnitRowByIdLocal(normalizedBusinessId, unitId, {
    includeInactive: true,
    includeDeleted: true,
  })

  if (!existing) {
    throw new ProductLocalError('UNIT_NOT_FOUND')
  }

  ensureCustomBusinessUnit(normalizedBusinessId, existing)
  const now = new Date().toISOString()

  await dbBatch([
    {
      sql: `
        UPDATE unit_of_measures
        SET is_active = 1,
            is_deleted = 0,
            updated_at = ?
        WHERE id = ?
      `,
      params: [now, unitId],
    },
    buildOutboxUpsertOperation('unitOfMeasures', unitId),
  ])
  requestBackgroundSync()

  const restored = await getUnitOfMeasureByIdLocal(normalizedBusinessId, unitId, {
    includeInactive: true,
    includeDeleted: true,
  })
  if (!restored) {
    throw new ProductLocalError('UNIT_SAVE_RELOAD_FAILED')
  }

  return restored
}

export async function listLowStockProductsLocal(
  businessId: string,
): Promise<LowStockProduct[]> {
  return (await fetchProductRowsForBusiness(assertBusinessId(businessId)))
    .filter((row) => {
      if (!row.is_active || !row.track_inventory) return false
      const quantity = row.inventory_quantity ?? row.stock_quantity ?? 0
      const threshold = row.inventory_low_stock_threshold ?? row.low_stock_threshold
      return threshold !== null && threshold !== undefined && quantity <= threshold
    })
    .sort(
      (left, right) =>
        (left.inventory_quantity ?? left.stock_quantity ?? 0) -
        (right.inventory_quantity ?? right.stock_quantity ?? 0),
    )
    .map((row) => ({
      productId: row.id,
      productName: row.name,
      currentQuantity: row.inventory_quantity ?? row.stock_quantity ?? 0,
      lowStockThreshold: row.inventory_low_stock_threshold ?? row.low_stock_threshold ?? null,
      reorderPoint: row.inventory_reorder_point ?? row.reorder_point ?? null,
      unitOfMeasure: row.unit_abbreviation ?? row.unit_name ?? null,
      categoryName: row.category_name,
    }))
}

export async function getCategoryByIdLocal(
  businessId: string,
  categoryId: string,
  query: Pick<LocalCategoriesQuery, 'includeInactive' | 'includeDeleted'> = {},
) {
  const row = await getCategoryRowByIdLocal(businessId, categoryId, query)
  return row ? mapCategoryRow(row) : null
}

export async function getUnitOfMeasureByIdLocal(
  businessId: string,
  unitId: string,
  query: Pick<LocalUnitOfMeasuresQuery, 'includeInactive' | 'includeDeleted'> = {},
) {
  const row = await getUnitRowByIdLocal(businessId, unitId, query)
  return row ? mapUnitRow(row) : null
}

export async function getProductByIdLocal(businessId: string, productId: string) {
  const rows = await fetchProductRowsForBusiness(assertBusinessId(businessId))
  const row = rows.find((item) => item.id === productId)
  return row ? mapProductRow(row) : null
}

export async function getProductByBarcodeLocal(businessId: string, barcode: string) {
  const normalizedBusinessId = assertBusinessId(businessId)
  const normalizedBarcode = barcode.trim()
  if (!normalizedBarcode) return null

  const rows = await fetchProductRowsForBusiness(normalizedBusinessId)
  const row = rows.find((item) => item.barcode?.trim() === normalizedBarcode)

  return row ? mapProductRow(row) : null
}

export async function fetchProductRowsForBusiness(businessId: string) {
  return dbQuery<ProductRow>(
    `
      SELECT
        p.id,
        p.business_id,
        p.name,
        p.description,
        p.sku,
        p.barcode,
        p.price,
        p.cost_price,
        p.currency,
        p.tax_rate,
        p.is_active,
        p.is_service,
        p.track_inventory,
        p.category_id,
        p.image_url,
        p.created_at,
        p.updated_at,
        p.slug,
        p.barcode_type,
        p.is_barcode_generated,
        p.reorder_point,
        p.unit_of_measure_id,
        p.created_by_id,
        p.stock_quantity,
        p.low_stock_threshold,
        c.id AS category_join_id,
        c.business_id AS category_business_id,
        c.name AS category_name,
        c.slug AS category_slug,
        c.color AS category_color,
        c.icon AS category_icon,
        c.image_url AS category_image_url,
        c.sort_order AS category_sort_order,
        c.created_at AS category_created_at,
        c.updated_at AS category_updated_at,
        u.id AS unit_join_id,
        u.name AS unit_name,
        u.abbreviation AS unit_abbreviation,
        u.business_id AS unit_business_id,
        u.type AS unit_type,
        u.is_default AS unit_is_default,
        il.id AS inventory_id,
        il.quantity AS inventory_quantity,
        il.low_stock_threshold AS inventory_low_stock_threshold,
        il.reorder_point AS inventory_reorder_point,
        il.last_restock_at AS inventory_last_restock_at
      FROM products p
      LEFT JOIN product_categories c
        ON c.id = p.category_id
       AND c.is_deleted = 0
      LEFT JOIN unit_of_measures u
        ON u.id = p.unit_of_measure_id
      LEFT JOIN inventory_levels il
        ON il.product_id = p.id
      WHERE p.business_id = ?
        AND p.is_deleted = 0
    `,
    [businessId],
  )
}

export function mapCategoryRow(row: CategoryRow): ProductCategory {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    slug: row.slug ?? undefined,
    isActive: Boolean(row.is_active),
    color: row.color ?? null,
    icon: row.icon ?? null,
    imageUrl: row.image_url ?? null,
    sortOrder: row.sort_order ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapUnitRow(row: UnitRow): UnitOfMeasure {
  return {
    id: row.id,
    name: row.name,
    abbreviation: row.abbreviation ?? undefined,
    businessId: row.business_id ?? null,
    type: (row.type as UnitOfMeasureType | null) ?? null,
    isDefault: Boolean(row.is_default),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.is_deleted ? row.updated_at : null,
  }
}

export function mapProductRow(row: ProductRow): Product {
  const category =
    row.category_join_id && row.category_business_id && row.category_created_at && row.category_updated_at
      ? mapCategoryRow({
          id: row.category_join_id,
          business_id: row.category_business_id,
          name: row.category_name ?? '',
          slug: row.category_slug,
          is_active: 1,
          is_deleted: 0,
          color: row.category_color,
          icon: row.category_icon,
          image_url: row.category_image_url,
          sort_order: row.category_sort_order,
          created_at: row.category_created_at,
          updated_at: row.category_updated_at,
        })
      : null

  const unit =
    row.unit_join_id && row.unit_name
      ? mapUnitRow({
          id: row.unit_join_id,
          name: row.unit_name,
          abbreviation: row.unit_abbreviation,
          business_id: row.unit_business_id,
          type: row.unit_type,
          is_active: 1,
          is_deleted: 0,
          is_default: row.unit_is_default ?? 0,
          created_at: row.updated_at,
          updated_at: row.updated_at,
        })
      : undefined

  const currentStock = row.track_inventory
    ? row.inventory_quantity ?? row.stock_quantity ?? 0
    : null

  const lowStockThreshold = row.track_inventory
    ? row.inventory_low_stock_threshold ?? row.low_stock_threshold ?? null
    : null

  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    sellingPrice: row.price,
    costPrice: row.cost_price ?? null,
    currency: row.currency ?? Currency.XAF,
    taxRate: row.tax_rate ?? 0,
    isActive: Boolean(row.is_active),
    isService: Boolean(row.is_service),
    trackInventory: Boolean(row.track_inventory),
    category,
    unitOfMeasure: unit,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    businessId: row.business_id,
    slug: row.slug ?? slugify(row.name),
    description: row.description ?? null,
    barcodeType: row.barcode_type ?? null,
    isBarcodeGenerated: Boolean(row.is_barcode_generated),
    categoryId: row.category_id ?? null,
    imageUrl: row.image_url ?? null,
    createdById: row.created_by_id ?? null,
    createdBy: null,
    images: row.image_url
      ? [
          {
            id: `${row.id}-image`,
            productId: row.id,
            url: row.image_url,
            altText: row.name,
            sortOrder: 0,
            createdAt: row.created_at,
          },
        ]
      : [],
    currentStock,
    lowStockThreshold,
    reorderPoint: row.track_inventory
      ? row.inventory_reorder_point ?? row.reorder_point ?? null
      : null,
    primaryImageUrl: row.image_url ?? null,
  }
}

async function getCategoryRowByIdLocal(
  businessId: string,
  categoryId: string,
  query: Pick<LocalCategoriesQuery, 'includeInactive' | 'includeDeleted'> = {},
) {
  const normalizedBusinessId = assertBusinessId(businessId)
  const rows = await dbQuery<CategoryRow>(
    `
      SELECT
        id,
        business_id,
        name,
        slug,
        is_active,
        is_deleted,
        color,
        icon,
        image_url,
        sort_order,
        created_at,
        updated_at
      FROM product_categories
      WHERE business_id = ?
        AND id = ?
        ${query.includeDeleted ? '' : 'AND is_deleted = 0'}
        ${query.includeInactive ? '' : 'AND is_active = 1'}
      LIMIT 1
    `,
    [normalizedBusinessId, categoryId],
  )

  return rows[0] ?? null
}

async function getUnitRowByIdLocal(
  businessId: string,
  unitId: string,
  query: Pick<LocalUnitOfMeasuresQuery, 'includeInactive' | 'includeDeleted'> = {},
) {
  const normalizedBusinessId = assertBusinessId(businessId)
  const rows = await dbQuery<UnitRow>(
    `
      SELECT
        id,
        name,
        abbreviation,
        business_id,
        type,
        is_active,
        is_deleted,
        is_default,
        created_at,
        updated_at
      FROM unit_of_measures
      WHERE id = ?
        AND (business_id IS NULL OR business_id = ?)
        ${query.includeDeleted ? '' : 'AND is_deleted = 0'}
        ${query.includeInactive ? '' : 'AND is_active = 1'}
      LIMIT 1
    `,
    [unitId, normalizedBusinessId],
  )

  return rows[0] ?? null
}

function normalizeCategoryInput(payload: CreateCategoryRequest) {
  const name = payload.name.trim()
  const color = payload.color?.trim() || null
  const icon = payload.icon?.trim() || null
  const imageUrl = payload.imageUrl?.trim() || null
  const sortOrder = payload.sortOrder ?? 0

  if (!name) {
    throw new ProductLocalError('CATEGORY_NAME_REQUIRED')
  }
  if (name.length > 100) {
    throw new ProductLocalError('CATEGORY_NAME_TOO_LONG')
  }
  if (color && color.length > 7) {
    throw new ProductLocalError('CATEGORY_COLOR_INVALID')
  }
  if (icon && icon.length > 50) {
    throw new ProductLocalError('CATEGORY_ICON_TOO_LONG')
  }
  if (imageUrl && imageUrl.length > 500) {
    throw new ProductLocalError('CATEGORY_IMAGE_URL_TOO_LONG')
  }
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    throw new ProductLocalError('CATEGORY_SORT_ORDER_INVALID')
  }

  return {
    name,
    color,
    icon,
    imageUrl,
    sortOrder,
  }
}

async function normalizeUnitInput(
  businessId: string,
  payload: CreateUnitOfMeasureRequest,
  excludeUnitId?: string,
) {
  const name = payload.name.trim()
  const abbreviation = payload.abbreviation.trim()
  const type = payload.type ?? null

  if (!name) {
    throw new ProductLocalError('UNIT_NAME_REQUIRED')
  }
  if (name.length > 50) {
    throw new ProductLocalError('UNIT_NAME_TOO_LONG')
  }
  if (!abbreviation) {
    throw new ProductLocalError('UNIT_ABBREVIATION_REQUIRED')
  }
  if (abbreviation.length > 10) {
    throw new ProductLocalError('UNIT_ABBREVIATION_TOO_LONG')
  }
  if (!type || !Object.values(UnitOfMeasureType).includes(type)) {
    throw new ProductLocalError('UNIT_TYPE_INVALID')
  }

  const existing = await dbQuery<{ id: string }>(
    `
      SELECT id
      FROM unit_of_measures
      WHERE business_id = ?
        AND LOWER(name) = LOWER(?)
        AND is_deleted = 0
        ${excludeUnitId ? 'AND id <> ?' : ''}
      LIMIT 1
    `,
    excludeUnitId ? [businessId, name, excludeUnitId] : [businessId, name],
  )

  if (existing[0]) {
    throw new ProductLocalError('UNIT_NAME_IN_USE')
  }

  return {
    name,
    abbreviation,
    type,
  }
}

function ensureCustomBusinessUnit(businessId: string, unit: UnitRow) {
  if (unit.business_id !== businessId || unit.is_default) {
    throw new ProductLocalError('UNIT_SYSTEM_IMMUTABLE')
  }
}

async function ensureUniqueField(
  businessId: string,
  column: 'sku' | 'barcode',
  value: string,
  code: ProductLocalError['code'],
  excludeProductId?: string,
) {
  const rows = await dbQuery<{ id: string }>(
    `
      SELECT id
      FROM products
      WHERE business_id = ?
        AND ${column} = ?
        ${excludeProductId ? 'AND id <> ?' : ''}
      LIMIT 1
    `,
    excludeProductId ? [businessId, value, excludeProductId] : [businessId, value],
  )

  if (rows.length > 0) {
    throw new ProductLocalError(code)
  }
}

async function buildUniqueProductSlug(
  businessId: string,
  desiredSlug: string,
  excludeProductId?: string,
) {
  const base = desiredSlug || `product-${crypto.randomUUID().slice(0, 8)}`
  const rows = await dbQuery<{ slug: string | null }>(
    `
      SELECT slug
      FROM products
      WHERE business_id = ?
        AND slug LIKE ?
        ${excludeProductId ? 'AND id <> ?' : ''}
    `,
    excludeProductId ? [businessId, `${base}%`, excludeProductId] : [businessId, `${base}%`],
  )

  const existing = new Set(rows.map((row) => row.slug).filter(Boolean))
  if (!existing.has(base)) {
    return base
  }

  let attempt = 2
  let candidate = `${base}-${attempt}`
  while (existing.has(candidate)) {
    attempt += 1
    candidate = `${base}-${attempt}`
  }

  return candidate
}

async function buildUniqueCategorySlug(
  businessId: string,
  desiredSlug: string,
  excludeCategoryId?: string,
) {
  const base = desiredSlug || `category-${crypto.randomUUID().slice(0, 8)}`
  const rows = await dbQuery<{ slug: string | null }>(
    `
      SELECT slug
      FROM product_categories
      WHERE business_id = ?
        AND slug LIKE ?
        ${excludeCategoryId ? 'AND id <> ?' : ''}
    `,
    excludeCategoryId ? [businessId, `${base}%`, excludeCategoryId] : [businessId, `${base}%`],
  )

  const existing = new Set(rows.map((row) => row.slug).filter(Boolean))
  if (!existing.has(base)) {
    return base
  }

  let attempt = 2
  let candidate = `${base}-${attempt}`
  while (existing.has(candidate)) {
    attempt += 1
    candidate = `${base}-${attempt}`
  }

  return candidate
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function validateAndNormalizeSku(businessId: string, sku: string) {
  const normalized = sku.trim().toUpperCase()

  if (!isValidProductSkuCandidate(normalized)) {
    throw new ProductLocalError('PRODUCT_SKU_INVALID')
  }

  await ensureUniqueField(businessId, 'sku', normalized, 'PRODUCT_SKU_IN_USE')
  return normalized
}

async function generateSku(businessId: string, categorySlug?: string | null) {
  const prefix = getSkuPrefix(categorySlug)
  const timestamp = Date.now().toString(36).toUpperCase().slice(-6)

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const sku = `${prefix}-${timestamp}-${randomAlphanumeric(4)}`
    const rows = await dbQuery<{ id: string }>(
      `
        SELECT id
        FROM products
        WHERE business_id = ?
          AND sku = ?
        LIMIT 1
      `,
      [businessId, sku],
    )

    if (rows.length === 0) {
      return sku
    }
  }

  throw new ProductLocalError('PRODUCT_SKU_GENERATION_FAILED')
}

async function validateAndNormalizeBarcode(
  businessId: string,
  barcode: string,
  excludeProductId?: string,
) {
  const normalized = barcode.trim()
  if (!isValidProductBarcodeCandidate(normalized)) {
    throw new ProductLocalError('PRODUCT_BARCODE_INVALID')
  }
  const type = detectBarcodeType(normalized)

  await ensureUniqueField(
    businessId,
    'barcode',
    normalized,
    'PRODUCT_BARCODE_IN_USE',
    excludeProductId,
  )

  return {
    value: normalized,
    type,
    isGenerated: false,
  }
}

async function generateUniqueBarcodeFromSku(businessId: string, sku: string) {
  const generated = generateBarcodeFromSku(sku)
  await ensureUniqueField(businessId, 'barcode', generated.value, 'PRODUCT_BARCODE_IN_USE')
  return generated
}

function generateBarcodeFromSku(sku: string) {
  const hash = hashToNineDigits(sku)
  const base = `200${hash.toString().padStart(9, '0')}`
  const checkDigit = ean13CheckDigit(base)

  return {
    value: `${base}${checkDigit}`,
    type: 'INTERNAL',
    isGenerated: true,
  }
}

function detectBarcodeType(value: string) {
  if (/^\d{13}$/.test(value)) return value.startsWith('200') ? 'INTERNAL' : 'EAN13'
  if (/^\d{8}$/.test(value)) return 'EAN8'
  if (/^\d{12}$/.test(value)) return 'UPCA'
  if (/^https?:\/\//.test(value) || /\s/.test(value)) return 'QR'
  return 'CODE128'
}

function validateBarcodeCheckDigit(
  value: string,
  type: 'EAN13' | 'EAN8' | 'UPCA' | 'INTERNAL' | 'CODE128' | 'QR',
) {
  if (type === 'EAN8') {
    const base = value.slice(0, 7)
    return ean8CheckDigit(base) === Number.parseInt(value.at(-1) ?? '0', 10)
  }

  if (['EAN13', 'UPCA', 'INTERNAL'].includes(type)) {
    const base = value.slice(0, 12)
    return ean13CheckDigit(base) === Number.parseInt(value.at(-1) ?? '0', 10)
  }

  return true
}

function getSkuPrefix(categorySlug?: string | null) {
  if (!categorySlug) return 'GEN'

  return categorySlug
    .replace(/-/g, '')
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, 'X')
}

function randomAlphanumeric(length: number) {
  return Array.from({ length }, () => {
    const index = Math.floor(Math.random() * SKU_RANDOM_ALPHABET.length)
    return SKU_RANDOM_ALPHABET[index]
  }).join('')
}

function hashToNineDigits(input: string) {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash) % 1_000_000_000
}

function ean13CheckDigit(twelveDigits: string) {
  let sum = 0
  for (let index = 0; index < 12; index += 1) {
    sum += Number.parseInt(twelveDigits[index] ?? '0', 10) * (index % 2 === 0 ? 1 : 3)
  }
  return (10 - (sum % 10)) % 10
}

function ean8CheckDigit(sevenDigits: string) {
  let sum = 0
  for (let index = 0; index < 7; index += 1) {
    sum += Number.parseInt(sevenDigits[index] ?? '0', 10) * (index % 2 === 0 ? 3 : 1)
  }
  return (10 - (sum % 10)) % 10
}
