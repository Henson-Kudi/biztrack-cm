import type { InventoryMovementType, StockAdjustmentType } from './inventory.types'
import type {
  CreateSaleItemRequest,
  CreateSalePaymentRequest,
  PaymentMethod,
  SaleStatus,
} from './sale.types'

export type SyncEntity =
  | 'product'
  | 'product_category'
  | 'unit_of_measure'
  | 'inventory_threshold'
  | 'inventory_adjustment'
  | 'inventory_restock'
  | 'sale'

/**
 * Canonical push-processing dependency plan for sync entities.
 *
 * Treat edits here like a migration dependency change:
 * 1. Desktop uses this order when selecting bounded outbox batches.
 * 2. The API uses the same order when processing a persisted batch.
 *
 * Rules:
 * - Root reference data with no sync-time dependencies comes first.
 * - Catalog entities that reference root data come next.
 * - Transactional/product-scoped entities come last.
 * - Entities in the same dependency tier must be safe to process in timestamp order.
 *
 * Current dependency graph:
 * - `unit_of_measure`: root lookup for products
 * - `product_category`: root lookup for products
 * - `product`: depends on `unit_of_measure`, optionally `product_category`
 * - `inventory_threshold`: depends on `product`
 * - `inventory_restock`: depends on `product`
 * - `inventory_adjustment`: depends on `product`
 * - `sale`: depends on `product`
 *
 * Pull-only child records such as sale items, sale payments, inventory levels,
 * inventory movements, and restock items are not part of the push entity plan.
 *
 * When adding or removing sync entities, update:
 * - `SyncEntity`
 * - `SYNC_ENTITY_DEPENDENCY_TIER`
 * - `SYNC_ENTITY_STABLE_ORDER`
 * - every local outbox-entity to sync-entity mapper
 * - every backend entity handler switch
 */
export const SYNC_ENTITY_DEPENDENCY_TIER: Record<SyncEntity, number> = {
  unit_of_measure: 0,
  product_category: 0,
  product: 1,
  inventory_threshold: 2,
  inventory_restock: 2,
  inventory_adjustment: 2,
  sale: 2,
}

export const SYNC_ENTITY_STABLE_ORDER: Record<SyncEntity, number> = {
  unit_of_measure: 0,
  product_category: 1,
  product: 2,
  inventory_threshold: 3,
  inventory_restock: 4,
  inventory_adjustment: 5,
  sale: 6,
}

export function getSyncEntityDependencyTier(entity: SyncEntity): number {
  return SYNC_ENTITY_DEPENDENCY_TIER[entity]
}

export function getSyncEntityStableOrder(entity: SyncEntity): number {
  return SYNC_ENTITY_STABLE_ORDER[entity]
}

export function compareSyncEntityExecutionOrder(left: SyncEntity, right: SyncEntity): number {
  const tierDifference = getSyncEntityDependencyTier(left) - getSyncEntityDependencyTier(right)
  if (tierDifference !== 0) {
    return tierDifference
  }

  return getSyncEntityStableOrder(left) - getSyncEntityStableOrder(right)
}

export type SyncAction = 'UPSERT' | 'DELETE'

export type SyncBatchStatus =
  | 'pending_enqueue'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'enqueue_failed'
  | 'skipped'

export type SyncOperationStatus = 'pending' | 'applied' | 'conflict' | 'failed'

export type SyncRealtimeBatchEventName =
  | 'sync.batch.queued'
  | 'sync.batch.processing'
  | 'sync.batch.completed'
  | 'sync.batch.partial'
  | 'sync.batch.failed'
  | 'sync.batch.enqueue_failed'

export type SyncRealtimeServerEventName =
  | 'sync.connected'
  | SyncRealtimeBatchEventName
  | 'sync.changes.available'
  | 'sync.error'

export type SyncRealtimeClientEventName = 'auth.authenticate'

export interface SyncRecord {
  id: string
  updatedAt: string
  deletedAt?: string | null
  isDeleted: boolean
  [key: string]: unknown
}

export interface InventoryLevelSyncRecord extends SyncRecord {
  businessId: string
  productId: string
  quantity: number
  lowStockThreshold?: number | null
  reorderPoint?: number | null
  lastRestockAt?: string | null
  createdAt: string
}

export interface InventoryMovementSyncRecord extends SyncRecord {
  businessId: string
  productId: string
  type: InventoryMovementType
  quantityChange: number
  quantityBefore: number
  quantityAfter: number
  referenceType?: string | null
  referenceId?: string | null
  notes?: string | null
  performedById?: string | null
  performedByName?: string | null
  createdAt: string
}

export interface RestockRecordSyncRecord extends SyncRecord {
  businessId: string
  referenceNumber?: string | null
  supplierName?: string | null
  totalCost?: number | null
  notes?: string | null
  performedById?: string | null
  createdAt: string
}

export interface RestockItemSyncRecord extends SyncRecord {
  restockRecordId: string
  productId: string
  quantity: number
  unitCost?: number | null
  newQuantity?: number | null
  createdAt: string
}

export interface SaleSyncRecord extends SyncRecord {
  businessId: string
  clientId: string
  cashierId: string
  cashierName?: string | null
  saleNumber: string
  status: SaleStatus
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  amountPaid: number
  changeGiven: number
  customerName?: string | null
  customerPhone?: string | null
  notes?: string | null
  priceDriftWarning: boolean
  saleDate: string
  soldAt: string
  syncedAt?: string | null
  voidedAt?: string | null
  voidedById?: string | null
  voidReason?: string | null
  currency?: string | null
  paymentMethod?: PaymentMethod | null
  createdAt: string
}

export interface SaleItemSyncRecord extends SyncRecord {
  saleId: string
  businessId: string
  productId: string
  productName: string
  productSku?: string | null
  unitOfMeasure?: string | null
  quantity: number
  unitPrice: number
  discountAmount: number
  lineTotal: number
  costPrice?: number | null
  createdAt: string
}

export interface SalePaymentSyncRecord extends SyncRecord {
  saleId: string
  businessId: string
  method: PaymentMethod
  amount: number
  mobileMoneyReference?: string | null
  createdAt: string
}

export interface ChangeSet {
  products?: SyncRecord[]
  productCategories?: SyncRecord[]
  unitOfMeasures?: SyncRecord[]
  inventoryLevels?: InventoryLevelSyncRecord[]
  inventoryMovements?: InventoryMovementSyncRecord[]
  restockRecords?: RestockRecordSyncRecord[]
  restockItems?: RestockItemSyncRecord[]
  sales?: SaleSyncRecord[]
  saleItems?: SaleItemSyncRecord[]
  salePayments?: SalePaymentSyncRecord[]
}

export interface InventoryThresholdSyncPayload {
  productId: string
  lowStockThreshold?: number | null
  reorderPoint?: number | null
}

export interface InventoryAdjustmentSyncPayload {
  productId: string
  type: StockAdjustmentType
  quantity: number
  notes: string
  createdAt: string
}

export interface InventoryRestockSyncItemPayload {
  id: string
  productId: string
  quantity: number
  unitCost?: number
  movementId: string
}

export interface InventoryRestockSyncPayload {
  referenceNumber?: string | null
  supplierName?: string | null
  totalCost?: number | null
  notes?: string | null
  createdAt: string
  items: InventoryRestockSyncItemPayload[]
}

export interface SaleSyncItemPayload extends CreateSaleItemRequest {
  id: string
  movementId?: string | null
}

export interface SaleSyncPaymentPayload extends CreateSalePaymentRequest {
  id: string
}

export interface SaleSyncPayload {
  saleId: string
  clientId: string
  saleNumber: string
  soldAt: string
  cashierId?: string | null
  cashierName?: string | null
  fallbackCashierId?: string | null
  customerName?: string
  customerPhone?: string
  notes?: string
  discountAmount?: number
  payments: SaleSyncPaymentPayload[]
  items: SaleSyncItemPayload[]
}

export type SyncPushPayload =
  | SyncRecord
  | InventoryThresholdSyncPayload
  | InventoryAdjustmentSyncPayload
  | InventoryRestockSyncPayload
  | SaleSyncPayload
  | null

export interface SyncPushOperation {
  operationId: string
  entity: SyncEntity
  action: SyncAction
  recordId: string
  updatedAt: string
  payload?: SyncPushPayload
}

export interface SyncPushRequest {
  deviceId: string
  baseCursor: string | null
  operations: SyncPushOperation[]
}

export interface SyncPushResponse {
  batchId: string | null
  status: SyncBatchStatus
  acceptedCount: number
  lastError?: string | null
}

export interface SyncOperationResult {
  operationId: string
  entity: SyncEntity
  recordId: string
  status: SyncOperationStatus
  resolution?: 'server_wins' | 'client_wins' | null
  errorMessage?: string | null
}

export interface SyncBatchStatusResponse {
  batchId: string
  status: SyncBatchStatus
  acceptedCount: number
  processedCount: number
  appliedCount: number
  conflictCount: number
  failedCount: number
  queuedAt: string
  startedAt?: string | null
  completedAt?: string | null
  lastError?: string | null
  results: SyncOperationResult[]
}

export interface SyncPullResponse {
  changes: ChangeSet
  cursor: string
}

export interface SyncRealtimeAuthPayload {
  accessToken: string
  deviceId: string
}

export interface SyncRealtimeConnectionPayload {
  businessId: string
  deviceId: string
  connectedAt: string
}

export interface SyncChangesAvailableEvent {
  businessId: string
  batchId: string
  availableAt: string
  appliedCount: number
  conflictCount: number
  failedCount: number
}

export interface SyncRealtimeErrorEvent {
  code: string
  message: string
  batchId?: string | null
}

export interface SyncRealtimeClientMessage<T = unknown> {
  type: SyncRealtimeClientEventName
  payload: T
}

export interface SyncRealtimeServerMessage<T = unknown> {
  type: SyncRealtimeServerEventName
  payload: T
}

export interface SyncMetadata {
  id: string
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date | null
}

export type NetworkQuality = 'offline' | 'weak' | 'fair' | 'strong' | 'very_strong'

export interface NetworkSnapshot {
  online: boolean
  quality: NetworkQuality
  latencyMs: number | null
  lastCheckedAt: string | null
}

export type SyncRunStatus =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'error'
  | 'paused'
  | 'disabled'

export type SyncRealtimeStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export type SyncTransportMode = 'disabled' | 'fallback' | 'realtime'

export interface SyncRealtimeSnapshot {
  mode: SyncTransportMode
  status: SyncRealtimeStatus
}

export interface SyncSettings {
  autoSyncEnabled: boolean
  minQuality: Exclude<NetworkQuality, 'offline'>
}

export interface SyncSnapshot {
  status: SyncRunStatus
  pendingCount: number
  lastSyncedAt: string | null
  lastError: string | null
  network: NetworkSnapshot
  settings: SyncSettings
  realtime: SyncRealtimeSnapshot
}
