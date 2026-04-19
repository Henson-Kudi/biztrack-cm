import type { InventoryMovementType, StockAdjustmentType } from './inventory.types'

export type SyncEntity =
  | 'product'
  | 'product_category'
  | 'unit_of_measure'
  | 'inventory_threshold'
  | 'inventory_adjustment'
  | 'inventory_restock'

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

export interface ChangeSet {
  products?: SyncRecord[]
  productCategories?: SyncRecord[]
  unitOfMeasures?: SyncRecord[]
  inventoryLevels?: InventoryLevelSyncRecord[]
  inventoryMovements?: InventoryMovementSyncRecord[]
  restockRecords?: RestockRecordSyncRecord[]
  restockItems?: RestockItemSyncRecord[]
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

export type SyncPushPayload =
  | SyncRecord
  | InventoryThresholdSyncPayload
  | InventoryAdjustmentSyncPayload
  | InventoryRestockSyncPayload
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
