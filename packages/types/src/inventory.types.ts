import type { IsoDateString, ListQuery } from './http.types'
import type { ProductCategory, ProductUserSummary, UnitOfMeasure } from './product.types'

export enum InventoryMovementType {
  SALE = 'SALE',
  RESTOCK_IN = 'RESTOCK_IN',
  MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT',
  VOID_REVERSAL = 'VOID_REVERSAL',
  OPENING_STOCK = 'OPENING_STOCK',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
}

export enum StockAdjustmentType {
  ADD = 'ADD',
  REMOVE = 'REMOVE',
  SET = 'SET',
}

export interface InventoryListItem {
  productId: string
  productName: string | null
  sku: string | null
  barcode: string | null
  primaryImageUrl?: string | null
  categoryName: string | null
  unitAbbreviation: string | null
  quantity: number
  lowStockThreshold: number | null
  reorderPoint: number | null
  isLowStock: boolean
  lastRestockAt: IsoDateString | null
}

export interface InventoryAlert {
  productId: string
  productName: string | null
  sku: string | null
  primaryImageUrl?: string | null
  categoryName: string | null
  currentQuantity: number
  lowStockThreshold: number | null
  reorderPoint: number | null
  shortfall: number
}

export interface InventoryMovementPerformer extends ProductUserSummary {}

export interface InventoryMovement {
  id: string
  businessId: string
  productId: string
  type: InventoryMovementType
  quantityChange: number
  quantityBefore: number
  quantityAfter: number
  referenceType?: string | null
  referenceId?: string | null
  notes?: string | null
  performedBy?: InventoryMovementPerformer | null
  /** @deprecated Prefer `performedBy` */
  performedById?: string | null
  createdAt: IsoDateString
}

export interface InventoryProductSummary {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  slug: string
  imageUrl?: string | null
  category?: ProductCategory | null
  unitOfMeasure?: UnitOfMeasure | null
}

export interface InventoryDetail {
  id: string
  businessId: string
  productId: string
  quantity: number
  lowStockThreshold: number | null
  reorderPoint: number | null
  lastRestockAt: IsoDateString | null
  createdAt: IsoDateString
  updatedAt: IsoDateString
  product: InventoryProductSummary
  movements: InventoryMovement[]
}

export interface InventoryQuery extends ListQuery {
  categoryId?: string
  lowStockOnly?: boolean
}

export interface InventoryAlertsQuery extends ListQuery {}

export interface InventoryMovementsQuery extends ListQuery {
  productId?: string
  type?: InventoryMovementType
  dateFrom?: IsoDateString
  dateTo?: IsoDateString
}

export interface SetInventoryThresholdRequest {
  lowStockThreshold?: number | null
  reorderPoint?: number | null
}

export interface AdjustInventoryRequest {
  type: StockAdjustmentType
  quantity: number
  notes: string
}

export interface RestockItemRequest {
  productId: string
  quantity: number
  unitCost?: number
}

export interface RestockRequest {
  referenceNumber?: string
  supplierName?: string
  totalCost?: number
  notes?: string
  items: RestockItemRequest[]
}

export interface RestockProcessedItem {
  productId: string
  quantity: number
  newQuantity: number
}

export interface RestockResponse {
  id: string
  businessId: string
  referenceNumber?: string | null
  supplierName?: string | null
  totalCost?: number | null
  notes?: string | null
  performedById?: string | null
  createdAt: IsoDateString
  items: RestockProcessedItem[]
}
