import { EventEmitter } from 'events'
import type {
  ChangeSet,
  InventoryAdjustmentSyncPayload,
  InventoryLevelSyncRecord,
  InventoryMovementSyncRecord,
  InventoryRestockSyncPayload,
  InventoryThresholdSyncPayload,
  NetworkQuality,
  NetworkSnapshot,
  RestockItemSyncRecord,
  RestockRecordSyncRecord,
  SyncBatchStatusResponse,
  SyncChangesAvailableEvent,
  SyncPullResponse,
  SyncPushOperation,
  SyncPushPayload,
  SyncPushRequest,
  SyncPushResponse,
  SyncRealtimeConnectionPayload,
  SyncRealtimeErrorEvent,
  SyncRealtimeStatus,
  SyncRecord,
  SyncSettings,
  SyncSnapshot,
} from '@biztrack/types'
import {
  createHttpClient,
  HttpError,
  type HttpClient,
  type HttpMethod,
} from '@biztrack/http-client'
import { io, Socket } from 'socket.io-client'
import { DatabaseService } from './database.service'
import { NetworkService } from './network.service'
import { SecureStoreService } from './secure-store.service'

type OutboxRow = {
  id: string
  entity:
    | 'products'
    | 'productCategories'
    | 'unitOfMeasures'
    | 'inventoryThresholds'
    | 'inventoryAdjustments'
    | 'inventoryRestocks'
  record_id: string
  payload: string | null
  status: 'pending' | 'failed'
  attempt_count: number
  updated_at: string
}

type LocalProductRow = {
  id: string
  business_id: string
  name: string
  slug: string | null
  description: string | null
  sku: string | null
  barcode: string | null
  barcode_type: string | null
  is_barcode_generated: number
  price: number
  cost_price: number | null
  currency: string
  tax_rate: number
  is_service: number
  track_inventory: number
  category_id: string | null
  unit_of_measure_id: string
  image_url: string | null
  created_by_id: string | null
  is_active: number
  is_deleted: number
  created_at: string
  updated_at: string
  stock_quantity: number | null
  low_stock_threshold: number | null
  inventory_quantity: number | null
  inventory_low_stock_threshold: number | null
}

type LocalCategoryRow = {
  id: string
  business_id: string
  name: string
  slug: string | null
  is_active: number
  color: string | null
  icon: string | null
  image_url: string | null
  sort_order: number | null
  is_deleted: number
  created_at: string
  updated_at: string
}

type LocalUnitRow = {
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

type SettingRow = {
  key: string
  value: string
}

type Tokens = {
  accessToken: string
  refreshToken: string
}

type SyncResult = {
  success: boolean
  message: string
}

type AuthenticatedResponse<T> = {
  data: T
  tokens: Tokens
}

const DEFAULT_API_URL = 'http://localhost:3001/api/v1'
const AUTH_TOKENS_KEY = 'auth.tokens'
const LAST_BUSINESS_KEY = 'auth.lastBusinessId'
const AUTO_SYNC_KEY = 'sync.autoSyncEnabled'
const MIN_QUALITY_KEY = 'sync.minQuality'
const DEVICE_ID_KEY = 'sync.deviceId'
const LAST_SYNCED_AT_KEY = 'sync.lastSyncedAt'
const OUTBOX_BATCH_LIMIT = 100
const BATCH_STATUS_POLL_ATTEMPTS = 20
const BATCH_STATUS_POLL_DELAY_MS = 500
const BATCH_STATUS_REALTIME_TIMEOUT_MS = 15_000
const FALLBACK_SYNC_INTERVAL_MS = 45_000
const SOCKET_AUTH_TIMEOUT_MS = 10_000
const REALTIME_RECONNECT_BASE_DELAY_MS = 2_000
const REALTIME_RECONNECT_MAX_DELAY_MS = 30_000
const REALTIME_CONNECTED_SYNC_DEBOUNCE_MS = 5_000

const DEFAULT_SETTINGS: SyncSettings = {
  autoSyncEnabled: true,
  minQuality: 'fair',
}

const QUALITY_RANK: Record<NetworkQuality, number> = {
  offline: 0,
  weak: 1,
  fair: 2,
  strong: 3,
  very_strong: 4,
}

export class SyncService extends EventEmitter {
  private isSyncing = false
  private fallbackSyncInterval: NodeJS.Timeout | null = null
  private snapshot: SyncSnapshot
  private readonly httpClient: HttpClient
  private realtimeSocket: Socket | null = null
  private realtimeAuthenticated = false
  private realtimeStatus: SyncRealtimeStatus = 'disconnected'
  private reconnectTimeout: NodeJS.Timeout | null = null
  private reconnectAttempt = 0
  private stopRequested = false
  private pendingRealtimeSync = false
  private lastAutoSyncStartedAt = 0
  private readonly batchStatusCache = new Map<string, SyncBatchStatusResponse>()
  private readonly batchWaiters = new Map<
    string,
    {
      resolve: (response: SyncBatchStatusResponse) => void
      reject: (error: Error) => void
      timeout: NodeJS.Timeout
    }
  >()

  constructor(
    private readonly network: NetworkService,
    private readonly db: DatabaseService,
    private readonly secureStore: SecureStoreService,
    private readonly apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL,
  ) {
    super()

    this.httpClient = createHttpClient({
      baseURL: this.apiBaseUrl.replace(/\/+$/, ''),
      timeout: 15_000,
    })

    this.snapshot = {
      status: 'idle',
      pendingCount: 0,
      lastSyncedAt: null,
      lastError: null,
      network: this.network.snapshot,
      settings: DEFAULT_SETTINGS,
      realtime: {
        mode: 'disabled',
        status: 'disconnected',
      },
    }

    this.network.on('snapshot', (networkSnapshot: NetworkSnapshot) => {
      const previousNetwork = this.snapshot.network
      this.snapshot = { ...this.snapshot, network: networkSnapshot }
      this.emitSnapshot()
      void this.refreshRealtimeConnection()

      if (this.shouldAutoSyncOnNetworkChange(previousNetwork, networkSnapshot)) {
        void this.maybeAutoSync('network')
      }
    })
  }

  async start() {
    this.stopRequested = false
    await this.ensureDefaults()
    await this.refreshSnapshot()
    await this.refreshRealtimeConnection()

    this.fallbackSyncInterval = setInterval(() => {
      void this.maybeAutoSync('fallback-timer')
    }, FALLBACK_SYNC_INTERVAL_MS)

    void this.maybeAutoSync('startup')
  }

  stop() {
    this.stopRequested = true
    if (this.fallbackSyncInterval) {
      clearInterval(this.fallbackSyncInterval)
      this.fallbackSyncInterval = null
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    for (const waiter of this.batchWaiters.values()) {
      clearTimeout(waiter.timeout)
      waiter.reject(new Error('Realtime sync connection stopped.'))
    }
    this.batchWaiters.clear()

    this.realtimeAuthenticated = false

    if (this.realtimeSocket) {
      this.realtimeSocket.disconnect()
      this.realtimeSocket = null
    }
  }

  getSnapshot(): SyncSnapshot {
    return {
      ...this.snapshot,
      network: { ...this.snapshot.network },
      settings: { ...this.snapshot.settings },
      realtime: { ...this.snapshot.realtime },
    }
  }

  async getSettings(): Promise<SyncSettings> {
    return this.readSettings()
  }

  async updateSettings(next: Partial<SyncSettings>): Promise<SyncSnapshot> {
    const current = await this.readSettings()
    const updated: SyncSettings = {
      autoSyncEnabled: next.autoSyncEnabled ?? current.autoSyncEnabled,
      minQuality: next.minQuality ?? current.minQuality,
    }

    await this.writeSetting(AUTO_SYNC_KEY, JSON.stringify(updated.autoSyncEnabled))
    await this.writeSetting(MIN_QUALITY_KEY, updated.minQuality)
    await this.refreshSnapshot()
    await this.refreshRealtimeConnection()
    void this.maybeAutoSync('settings')
    return this.getSnapshot()
  }

  async nudge(): Promise<SyncSnapshot> {
    await this.refreshSnapshot()
    await this.refreshRealtimeConnection()
    void this.maybeAutoSync('nudge')
    return this.getSnapshot()
  }

  async sync(force = false): Promise<SyncResult> {
    if (this.isSyncing) {
      return { success: false, message: 'already_syncing' }
    }

    const settings = await this.readSettings()
    const pendingCount = this.getPendingCount()
    const canUseNetwork = this.network.snapshot.quality !== 'offline'

    if (!force && !settings.autoSyncEnabled) {
      await this.refreshSnapshot('disabled')
      return { success: false, message: 'disabled' }
    }

    if (!canUseNetwork) {
      await this.refreshSnapshot('paused')
      return { success: false, message: 'offline' }
    }

    if (!force && !this.meetsMinimumQuality(this.network.snapshot.quality, settings.minQuality)) {
      await this.refreshSnapshot('paused')
      return { success: false, message: 'quality_too_low' }
    }

    const tokens = this.getStoredTokens()
    const businessId = this.secureStore.get(LAST_BUSINESS_KEY)
    const deviceId = await this.ensureDeviceId()

    if (!tokens || !businessId) {
      await this.refreshSnapshot('paused')
      await this.refreshRealtimeConnection()
      return { success: false, message: 'missing_auth_context' }
    }

    await this.refreshRealtimeConnection()

    this.isSyncing = true
    this.snapshot = {
      ...this.snapshot,
      status: 'syncing',
      pendingCount,
      lastError: null,
      settings,
    }
    this.emitSnapshot()

    let activeTokens = tokens
    let baseCursor = (await this.readSetting(LAST_SYNCED_AT_KEY)) ?? null
    let finalCursor = baseCursor
    let pulledCount = 0
    let pushedCount = 0
    let conflictCount = 0

    try {
      const initialPull = await this.pullChanges(activeTokens, baseCursor)
      activeTokens = initialPull.tokens
      await this.applyPulledChanges(initialPull.data)
      pulledCount += countChanges(initialPull.data.changes)
      finalCursor = initialPull.data.cursor

      let batchError: string | null = null
      const pendingRows = this.getOutboxRows(
        OUTBOX_BATCH_LIMIT,
        force ? ['pending', 'failed'] : ['pending'],
      )

      if (pendingRows.length > 0) {
        const payload = await this.buildPushPayload(deviceId, baseCursor, pendingRows)

        if (payload.operations.length > 0) {
          const pushResponse = await this.pushBatch(activeTokens, payload)
          activeTokens = pushResponse.tokens

          if (pushResponse.data.status === 'enqueue_failed') {
            batchError = pushResponse.data.lastError ?? 'Sync batch could not be queued.'
            this.markOutboxAttempt(pendingRows, batchError)
          } else if (pushResponse.data.batchId) {
            const batchStatus = await this.waitForBatch(activeTokens, pushResponse.data.batchId)
            activeTokens = batchStatus.tokens

            const batchOutcome = this.applyBatchResults(batchStatus.data, pendingRows)
            pushedCount = batchStatus.data.acceptedCount
            conflictCount += batchStatus.data.conflictCount
            batchError = batchOutcome.firstError

            const followUpPull = await this.pullChanges(activeTokens, baseCursor)
            activeTokens = followUpPull.tokens
            await this.applyPulledChanges(followUpPull.data)
            pulledCount = countChanges(followUpPull.data.changes)
            finalCursor = followUpPull.data.cursor
          }
        }
      }

      if (finalCursor) {
        await this.writeSetting(LAST_SYNCED_AT_KEY, finalCursor)
      }

      this.writeSyncLog(deviceId, finalCursor ?? new Date().toISOString(), pushedCount, pulledCount, conflictCount)

      if (batchError) {
        await this.refreshSnapshot('error')
        this.snapshot = {
          ...this.snapshot,
          status: 'error',
          lastError: batchError,
        }
        this.emitSnapshot()
        return { success: false, message: batchError }
      }

      await this.refreshSnapshot('synced')
      return { success: true, message: 'synced' }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed'
      const retryableRows = this.getOutboxRows(
        OUTBOX_BATCH_LIMIT,
        force ? ['pending', 'failed'] : ['pending'],
      )
      this.markOutboxAttempt(retryableRows, message)
      this.snapshot = {
        ...this.snapshot,
        status: 'error',
        lastError: message,
      }
      this.emitSnapshot()
      return { success: false, message }
    } finally {
      this.isSyncing = false

      if (this.pendingRealtimeSync) {
        this.pendingRealtimeSync = false
        void this.maybeAutoSync('realtime-change')
      }
    }
  }

  private async maybeAutoSync(
    reason:
      | 'startup'
      | 'settings'
      | 'nudge'
      | 'network'
      | 'realtime-change'
      | 'realtime-connected'
      | 'fallback-timer',
  ) {
    if (this.isSyncing) {
      return
    }

    const settings = await this.readSettings()
    if (!settings.autoSyncEnabled) {
      await this.refreshRealtimeConnection()
      await this.refreshSnapshot('disabled')
      return
    }

    if (!this.meetsMinimumQuality(this.network.snapshot.quality, settings.minQuality)) {
      await this.refreshRealtimeConnection()
      await this.refreshSnapshot('paused')
      return
    }

    await this.refreshRealtimeConnection()

    if (reason === 'fallback-timer' && this.realtimeAuthenticated) {
      await this.refreshSnapshot()
      return
    }

    if (
      reason === 'realtime-connected' &&
      Date.now() - this.lastAutoSyncStartedAt < REALTIME_CONNECTED_SYNC_DEBOUNCE_MS
    ) {
      await this.refreshSnapshot()
      return
    }

    this.lastAutoSyncStartedAt = Date.now()
    void this.sync(false)
  }

  private async buildPushPayload(
    deviceId: string,
    baseCursor: string | null,
    outboxRows: OutboxRow[],
  ): Promise<SyncPushRequest> {
    const operations: SyncPushOperation[] = []

    for (const row of outboxRows) {
      if (row.entity === 'products') {
        const product = this.loadProductSyncRecord(row.record_id)
        operations.push({
          operationId: row.id,
          entity: 'product',
          action: !product || product.isDeleted ? 'DELETE' : 'UPSERT',
          recordId: row.record_id,
          updatedAt: product?.updatedAt ?? row.updated_at,
          payload: product,
        })
      }

      if (row.entity === 'productCategories') {
        const category = this.loadCategorySyncRecord(row.record_id)
        operations.push({
          operationId: row.id,
          entity: 'product_category',
          action: !category || category.isDeleted ? 'DELETE' : 'UPSERT',
          recordId: row.record_id,
          updatedAt: category?.updatedAt ?? row.updated_at,
          payload: category,
        })
      }

      if (row.entity === 'unitOfMeasures') {
        const unit = this.loadUnitSyncRecord(row.record_id)
        operations.push({
          operationId: row.id,
          entity: 'unit_of_measure',
          action: !unit || unit.isDeleted ? 'DELETE' : 'UPSERT',
          recordId: row.record_id,
          updatedAt: unit?.updatedAt ?? row.updated_at,
          payload: unit,
        })
      }

      if (row.entity === 'inventoryThresholds') {
        const payload = this.parseOutboxPayload<InventoryThresholdSyncPayload>(row.payload)
        operations.push({
          operationId: row.id,
          entity: 'inventory_threshold',
          action: 'UPSERT',
          recordId: row.record_id,
          updatedAt: row.updated_at,
          payload,
        })
      }

      if (row.entity === 'inventoryAdjustments') {
        const payload = this.parseOutboxPayload<InventoryAdjustmentSyncPayload>(row.payload)
        operations.push({
          operationId: row.id,
          entity: 'inventory_adjustment',
          action: 'UPSERT',
          recordId: row.record_id,
          updatedAt: payload?.createdAt ?? row.updated_at,
          payload,
        })
      }

      if (row.entity === 'inventoryRestocks') {
        const payload = this.parseOutboxPayload<InventoryRestockSyncPayload>(row.payload)
        operations.push({
          operationId: row.id,
          entity: 'inventory_restock',
          action: 'UPSERT',
          recordId: row.record_id,
          updatedAt: payload?.createdAt ?? row.updated_at,
          payload,
        })
      }
    }

    return {
      deviceId,
      baseCursor,
      operations,
    }
  }

  private loadProductSyncRecord(recordId: string): SyncRecord | null {
    const [row] = this.db.query(
      `
        SELECT
          p.id,
          p.business_id,
          p.name,
          p.slug,
          p.description,
          p.sku,
          p.barcode,
          p.barcode_type,
          p.is_barcode_generated,
          p.price,
          p.cost_price,
          p.currency,
          p.tax_rate,
          p.is_service,
          p.track_inventory,
          p.category_id,
          p.unit_of_measure_id,
          p.image_url,
          p.created_by_id,
          p.is_active,
          p.is_deleted,
          p.created_at,
          p.updated_at,
          p.stock_quantity,
          p.low_stock_threshold,
          il.quantity AS inventory_quantity,
          il.low_stock_threshold AS inventory_low_stock_threshold
        FROM products p
        LEFT JOIN inventory_levels il
          ON il.product_id = p.id
        WHERE p.id = ?
        LIMIT 1
      `,
      [recordId],
    ) as LocalProductRow[]

    if (!row) {
      return null
    }

    const currentStock = row.track_inventory
      ? row.inventory_quantity ?? row.stock_quantity ?? 0
      : null
    const lowStockThreshold = row.track_inventory
      ? row.inventory_low_stock_threshold ?? row.low_stock_threshold ?? null
      : null

    return {
      id: row.id,
      businessId: row.business_id,
      name: row.name,
      slug: row.slug ?? row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: row.description,
      sku: row.sku,
      barcode: row.barcode,
      barcodeType: row.barcode_type,
      isBarcodeGenerated: Boolean(row.is_barcode_generated),
      sellingPrice: row.price,
      costPrice: row.cost_price,
      currency: row.currency,
      taxRate: row.tax_rate,
      isService: Boolean(row.is_service),
      trackInventory: Boolean(row.track_inventory),
      categoryId: row.category_id,
      unitOfMeasureId: row.unit_of_measure_id,
      imageUrl: row.image_url,
      createdById: row.created_by_id,
      isActive: Boolean(row.is_active),
      currentStock,
      openingStock: currentStock,
      lowStockThreshold,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.is_deleted ? row.updated_at : null,
      isDeleted: Boolean(row.is_deleted),
    }
  }

  private loadCategorySyncRecord(recordId: string): SyncRecord | null {
    const [row] = this.db.query(
      `
        SELECT
          id,
          business_id,
          name,
          slug,
          is_active,
          color,
          icon,
          image_url,
          sort_order,
          is_deleted,
          created_at,
          updated_at
        FROM product_categories
        WHERE id = ?
        LIMIT 1
      `,
      [recordId],
    ) as LocalCategoryRow[]

    if (!row) {
      return null
    }

    return {
      id: row.id,
      businessId: row.business_id,
      name: row.name,
      slug: row.slug ?? row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      isActive: Boolean(row.is_active),
      color: row.color,
      icon: row.icon,
      imageUrl: row.image_url,
      sortOrder: row.sort_order ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.is_deleted ? row.updated_at : null,
      isDeleted: Boolean(row.is_deleted),
    }
  }

  private loadUnitSyncRecord(recordId: string): SyncRecord | null {
    const [row] = this.db.query(
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
        LIMIT 1
      `,
      [recordId],
    ) as LocalUnitRow[]

    if (!row) {
      return null
    }

    return {
      id: row.id,
      name: row.name,
      abbreviation: row.abbreviation,
      businessId: row.business_id ?? null,
      type: row.type,
      isDefault: Boolean(row.is_default),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.is_deleted ? row.updated_at : null,
      isDeleted: Boolean(row.is_deleted),
    }
  }

  private parseOutboxPayload<T extends SyncPushPayload>(payload: string | null): T | null {
    if (!payload) {
      return null
    }

    try {
      return JSON.parse(payload) as T
    } catch {
      return null
    }
  }

  private async pushBatch(tokens: Tokens, payload: SyncPushRequest): Promise<AuthenticatedResponse<SyncPushResponse>> {
    return this.authenticatedRequest<SyncPushResponse>('/sync/batches', {
      method: 'POST',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      data: payload,
    })
  }

  private async waitForBatch(
    tokens: Tokens,
    batchId: string,
  ): Promise<AuthenticatedResponse<SyncBatchStatusResponse>> {
    if (this.realtimeAuthenticated) {
      try {
        const response = await this.waitForBatchRealtime(batchId)
        return {
          data: response,
          tokens,
        }
      } catch {
        // Fall back to HTTP polling if the realtime channel is unavailable or slow.
      }
    }

    return this.waitForBatchByPolling(tokens, batchId)
  }

  private async waitForBatchByPolling(
    tokens: Tokens,
    batchId: string,
  ): Promise<AuthenticatedResponse<SyncBatchStatusResponse>> {
    let activeTokens = tokens

    for (let attempt = 0; attempt < BATCH_STATUS_POLL_ATTEMPTS; attempt += 1) {
      const response = await this.authenticatedRequest<SyncBatchStatusResponse>(`/sync/batches/${batchId}`, {
        method: 'GET',
        accessToken: activeTokens.accessToken,
        refreshToken: activeTokens.refreshToken,
      })
      activeTokens = response.tokens

      if (isTerminalBatchStatus(response.data.status)) {
        return response
      }

      await sleep(BATCH_STATUS_POLL_DELAY_MS)
    }

    throw new Error('Sync batch is still processing. Please try again shortly.')
  }

  private async pullChanges(
    tokens: Tokens,
    cursor: string | null,
  ): Promise<AuthenticatedResponse<SyncPullResponse>> {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
    return this.authenticatedRequest<SyncPullResponse>(`/sync/pull${query}`, {
      method: 'GET',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    })
  }

  private async applyPulledChanges(response: SyncPullResponse) {
    const operations: Array<{ sql: string; params?: unknown[] }> = []
    const serverUnits = response.changes.unitOfMeasures ?? []
    const serverProductCategories = response.changes.productCategories ?? []
    const serverProducts = response.changes.products ?? []
    const serverInventoryLevels = response.changes.inventoryLevels ?? []
    const serverInventoryMovements = response.changes.inventoryMovements ?? []
    const serverRestockRecords = response.changes.restockRecords ?? []
    const serverRestockItems = response.changes.restockItems ?? []

    if (serverUnits.length > 0) {
      this.applyUnitOfMeasureChanges(serverUnits)
    }

    for (const record of serverProductCategories) {
      operations.push(this.buildCategoryUpsertOperation(record))
    }

    for (const record of serverProducts) {
      operations.push(this.buildProductUpsertOperation(record))
    }

    for (const record of serverInventoryLevels) {
      operations.push(...this.buildInventoryLevelUpsertOperations(record))
    }

    for (const record of serverInventoryMovements) {
      operations.push(this.buildInventoryMovementUpsertOperation(record))
    }

    for (const record of serverRestockRecords) {
      operations.push(this.buildRestockRecordUpsertOperation(record))
    }

    for (const record of serverRestockItems) {
      operations.push(this.buildRestockItemUpsertOperation(record))
    }

    if (operations.length > 0) {
      this.db.batch(operations)
    }
  }

  private applyUnitOfMeasureChanges(records: SyncRecord[]) {
    const operations: Array<{ sql: string; params?: unknown[] }> = []
    const now = new Date().toISOString()
    const localUnits = this.db.query(
      `
        SELECT
          id,
          name,
          abbreviation,
          business_id,
          type,
          is_default
        FROM unit_of_measures
      `,
    ) as Array<{
      id: string
      name: string
      abbreviation: string | null
      business_id: string | null
      type: string | null
      is_active: number
      is_deleted: number
      is_default: number
    }>

    for (const record of records) {
      const unit = record as SyncRecord & {
        id: string
        name?: string
        abbreviation?: string | null
        businessId?: string | null
        type?: string | null
        isDefault?: boolean
        createdAt?: string
      }

      const localMatch = localUnits.find((candidate) => {
        return (
          candidate.name.toLowerCase() === (unit.name ?? '').toLowerCase() &&
          (candidate.business_id ?? null) === (unit.businessId ?? null) &&
          (candidate.type ?? null) === (unit.type ?? null)
        )
      })

      if (localMatch && localMatch.id !== unit.id) {
        operations.push(
          {
            sql: `
              UPDATE products
              SET unit_of_measure_id = ?
              WHERE unit_of_measure_id = ?
            `,
            params: [unit.id, localMatch.id],
          },
          {
            sql: `
              DELETE FROM unit_of_measures
              WHERE id = ?
            `,
            params: [localMatch.id],
          },
        )
      }

      operations.push({
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            abbreviation = excluded.abbreviation,
            business_id = excluded.business_id,
            type = excluded.type,
            is_active = excluded.is_active,
            is_deleted = excluded.is_deleted,
            is_default = excluded.is_default,
            updated_at = excluded.updated_at
        `,
        params: [
          unit.id,
          unit.name ?? '',
          unit.abbreviation ?? null,
          unit.businessId ?? null,
          unit.type ?? null,
          unit.isDeleted ? 0 : unit.isActive === false ? 0 : 1,
          unit.isDeleted ? 1 : 0,
          unit.isDefault ? 1 : 0,
          unit.createdAt ?? now,
          unit.updatedAt ?? now,
        ],
      })
    }

    if (operations.length > 0) {
      this.db.batch(operations)
    }
  }

  private applyBatchResults(response: SyncBatchStatusResponse, outboxRows: OutboxRow[]) {
    const now = new Date().toISOString()
    const operations: Array<{ sql: string; params?: unknown[] }> = []
    const failedResults = response.results.filter((result) => result.status === 'failed')
    const outboxByOperationId = new Map(outboxRows.map((row) => [row.id, row]))

    for (const result of response.results) {
      const outboxRow = outboxByOperationId.get(result.operationId)

      if (result.status === 'applied' || result.status === 'conflict') {
        if (result.status === 'conflict' && outboxRow) {
          operations.push(...this.buildLocalConflictCleanupOperations(outboxRow))
        }

        operations.push({
          sql: `DELETE FROM sync_outbox WHERE id = ?`,
          params: [result.operationId],
        })
        continue
      }

      if (result.status === 'failed') {
        if (outboxRow) {
          operations.push(...this.buildLocalConflictCleanupOperations(outboxRow))
        }

        operations.push({
          sql: `
            UPDATE sync_outbox
            SET status = 'failed',
                attempt_count = attempt_count + 1,
                last_attempt_at = ?,
                last_error = ?,
                updated_at = ?
            WHERE id = ?
          `,
          params: [now, result.errorMessage ?? 'Sync operation failed.', now, result.operationId],
        })
      }
    }

    if (operations.length > 0) {
      this.db.batch(operations)
    }

    return {
      firstError: failedResults[0]?.errorMessage ?? null,
    }
  }

  private buildLocalConflictCleanupOperations(row: OutboxRow) {
    if (row.entity === 'inventoryAdjustments') {
      return [
        {
          sql: `DELETE FROM inventory_movements WHERE id = ?`,
          params: [row.record_id],
        },
      ]
    }

    if (row.entity === 'inventoryRestocks') {
      const payload = this.parseOutboxPayload<InventoryRestockSyncPayload>(row.payload)
      const operations: Array<{ sql: string; params?: unknown[] }> = []

      for (const item of payload?.items ?? []) {
        operations.push(
          {
            sql: `DELETE FROM inventory_movements WHERE id = ?`,
            params: [item.movementId],
          },
          {
            sql: `DELETE FROM restock_items WHERE id = ?`,
            params: [item.id],
          },
        )
      }

      operations.push({
        sql: `DELETE FROM restock_records WHERE id = ?`,
        params: [row.record_id],
      })

      return operations
    }

    return []
  }

  private buildProductUpsertOperation(record: SyncRecord) {
    const data = record as SyncRecord & {
      businessId?: string
      name?: string
      slug?: string
      description?: string | null
      sku?: string | null
      barcode?: string | null
      barcodeType?: string | null
      isBarcodeGenerated?: boolean
      sellingPrice?: number
      costPrice?: number | null
      currency?: string
      taxRate?: number
      isService?: boolean
      trackInventory?: boolean
      categoryId?: string | null
      unitOfMeasureId?: string | null
      imageUrl?: string | null
      createdById?: string | null
      isActive?: boolean
      createdAt?: string
    }

    const deleted = Boolean(data.isDeleted)

    return {
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 5, 'qty', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          business_id = excluded.business_id,
          name = excluded.name,
          description = excluded.description,
          sku = excluded.sku,
          barcode = excluded.barcode,
          price = excluded.price,
          cost_price = excluded.cost_price,
          category_id = excluded.category_id,
          image_url = excluded.image_url,
          is_active = excluded.is_active,
          is_deleted = excluded.is_deleted,
          updated_at = excluded.updated_at,
          currency = excluded.currency,
          tax_rate = excluded.tax_rate,
          is_service = excluded.is_service,
          track_inventory = excluded.track_inventory,
          slug = excluded.slug,
          barcode_type = excluded.barcode_type,
          is_barcode_generated = excluded.is_barcode_generated,
          unit_of_measure_id = excluded.unit_of_measure_id,
          created_by_id = excluded.created_by_id
      `,
      params: [
        data.id,
        data.businessId ?? '',
        data.name ?? '',
        data.description ?? null,
        data.sku ?? null,
        data.barcode ?? null,
        data.sellingPrice ?? 0,
        data.costPrice ?? null,
        data.categoryId ?? null,
        data.imageUrl ?? null,
        deleted ? 0 : data.isActive === false ? 0 : 1,
        deleted ? 1 : 0,
        data.createdAt ?? data.updatedAt,
        data.updatedAt,
        data.currency ?? 'XAF',
        data.taxRate ?? 0,
        data.isService ? 1 : 0,
        data.trackInventory === false ? 0 : 1,
        data.slug ?? '',
        data.barcodeType ?? null,
        data.isBarcodeGenerated ? 1 : 0,
        data.unitOfMeasureId ?? null,
        data.createdById ?? null,
      ],
    }
  }

  private buildCategoryUpsertOperation(record: SyncRecord) {
    const data = record as SyncRecord & {
      businessId?: string
      name?: string
      slug?: string
      isActive?: boolean
      color?: string | null
      icon?: string | null
      imageUrl?: string | null
      sortOrder?: number
      createdAt?: string
    }

    const deleted = Boolean(data.isDeleted)

    return {
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          business_id = excluded.business_id,
          name = excluded.name,
          is_active = excluded.is_active,
          is_deleted = excluded.is_deleted,
          updated_at = excluded.updated_at,
          slug = excluded.slug,
          color = excluded.color,
          icon = excluded.icon,
          image_url = excluded.image_url,
          sort_order = excluded.sort_order
      `,
      params: [
        data.id,
        data.businessId ?? '',
        data.name ?? '',
        deleted ? 0 : data.isActive === false ? 0 : 1,
        deleted ? 1 : 0,
        data.createdAt ?? data.updatedAt,
        data.updatedAt,
        data.slug ?? '',
        data.color ?? null,
        data.icon ?? null,
        data.imageUrl ?? null,
        data.sortOrder ?? 0,
      ],
    }
  }

  private buildInventoryLevelUpsertOperations(record: InventoryLevelSyncRecord) {
    return [
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
          ON CONFLICT(product_id) DO UPDATE SET
            id = excluded.id,
            business_id = excluded.business_id,
            quantity = excluded.quantity,
            low_stock_threshold = excluded.low_stock_threshold,
            reorder_point = excluded.reorder_point,
            last_restock_at = excluded.last_restock_at,
            updated_at = excluded.updated_at
        `,
        params: [
          record.id,
          record.businessId,
          record.productId,
          record.quantity,
          record.lowStockThreshold ?? null,
          record.reorderPoint ?? null,
          record.lastRestockAt ?? null,
          record.createdAt,
          record.updatedAt,
        ],
      },
      {
        sql: `
          UPDATE products
          SET stock_quantity = ?,
              low_stock_threshold = ?,
              reorder_point = ?
          WHERE id = ?
        `,
        params: [
          record.quantity,
          record.lowStockThreshold ?? null,
          record.reorderPoint ?? null,
          record.productId,
        ],
      },
    ]
  }

  private buildInventoryMovementUpsertOperation(record: InventoryMovementSyncRecord) {
    return {
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
        ON CONFLICT(id) DO UPDATE SET
          business_id = excluded.business_id,
          product_id = excluded.product_id,
          type = excluded.type,
          quantity_change = excluded.quantity_change,
          quantity_before = excluded.quantity_before,
          quantity_after = excluded.quantity_after,
          reference_type = excluded.reference_type,
          reference_id = excluded.reference_id,
          notes = excluded.notes,
          performed_by_id = excluded.performed_by_id,
          performed_by_name = excluded.performed_by_name,
          created_at = excluded.created_at
      `,
      params: [
        record.id,
        record.businessId,
        record.productId,
        record.type,
        record.quantityChange,
        record.quantityBefore,
        record.quantityAfter,
        record.referenceType ?? null,
        record.referenceId ?? null,
        record.notes ?? null,
        record.performedById ?? null,
        record.performedByName ?? null,
        record.createdAt,
      ],
    }
  }

  private buildRestockRecordUpsertOperation(record: RestockRecordSyncRecord) {
    return {
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
        ON CONFLICT(id) DO UPDATE SET
          business_id = excluded.business_id,
          reference_number = excluded.reference_number,
          supplier_name = excluded.supplier_name,
          total_cost = excluded.total_cost,
          notes = excluded.notes,
          performed_by_id = excluded.performed_by_id,
          created_at = excluded.created_at
      `,
      params: [
        record.id,
        record.businessId,
        record.referenceNumber ?? null,
        record.supplierName ?? null,
        record.totalCost ?? null,
        record.notes ?? null,
        record.performedById ?? null,
        record.createdAt,
      ],
    }
  }

  private buildRestockItemUpsertOperation(record: RestockItemSyncRecord) {
    return {
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
        ON CONFLICT(id) DO UPDATE SET
          restock_record_id = excluded.restock_record_id,
          product_id = excluded.product_id,
          quantity = excluded.quantity,
          unit_cost = excluded.unit_cost,
          new_quantity = excluded.new_quantity,
          created_at = excluded.created_at
      `,
      params: [
        record.id,
        record.restockRecordId,
        record.productId,
        record.quantity,
        record.unitCost ?? null,
        record.newQuantity ?? 0,
        record.createdAt,
      ],
    }
  }

  private async refreshRealtimeConnection(forceReconnect = false) {
    const settings = await this.readSettings()
    const tokens = this.getStoredTokens()
    const businessId = this.secureStore.get(LAST_BUSINESS_KEY)
    const deviceId = await this.ensureDeviceId()

    const shouldConnect =
      !this.stopRequested &&
      settings.autoSyncEnabled &&
      Boolean(tokens?.accessToken) &&
      Boolean(businessId) &&
      this.meetsMinimumQuality(this.network.snapshot.quality, settings.minQuality)

    if (!shouldConnect) {
      this.disconnectRealtimeSocket()
      await this.refreshSnapshot()
      return
    }

    if (
      !forceReconnect &&
      this.realtimeSocket &&
      (this.realtimeSocket.connected || this.realtimeSocket.active)
    ) {
      return
    }

    if (forceReconnect) {
      this.disconnectRealtimeSocket()
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    this.realtimeStatus = this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting'
    await this.refreshSnapshot()

    const realtime = getRealtimeSocketConfig(this.apiBaseUrl)
    const socket = io(realtime.origin, {
      path: realtime.path,
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      timeout: SOCKET_AUTH_TIMEOUT_MS,
    })
    this.realtimeSocket = socket
    this.realtimeAuthenticated = false

    socket.on('connect', () => {
      this.reconnectAttempt = 0

      socket.emit('auth.authenticate', {
        accessToken: tokens!.accessToken,
        deviceId,
      })
    })

    socket.on('sync.connected', (_payload: SyncRealtimeConnectionPayload) => {
      this.realtimeAuthenticated = true
      this.realtimeStatus = 'connected'
      this.reconnectAttempt = 0
      void this.refreshSnapshot()
      void this.maybeAutoSync('realtime-connected')
    })

    socket.on('sync.batch.queued', (batch: SyncBatchStatusResponse) => {
      this.handleRealtimeBatchEvent(batch)
    })
    socket.on('sync.batch.processing', (batch: SyncBatchStatusResponse) => {
      this.handleRealtimeBatchEvent(batch)
    })
    socket.on('sync.batch.completed', (batch: SyncBatchStatusResponse) => {
      this.handleRealtimeBatchEvent(batch)
    })
    socket.on('sync.batch.partial', (batch: SyncBatchStatusResponse) => {
      this.handleRealtimeBatchEvent(batch)
    })
    socket.on('sync.batch.failed', (batch: SyncBatchStatusResponse) => {
      this.handleRealtimeBatchEvent(batch)
    })
    socket.on('sync.batch.enqueue_failed', (batch: SyncBatchStatusResponse) => {
      this.handleRealtimeBatchEvent(batch)
    })

    socket.on('sync.changes.available', (_payload: SyncChangesAvailableEvent) => {
      if (this.isSyncing) {
        this.pendingRealtimeSync = true
        return
      }

      void this.maybeAutoSync('realtime-change')
    })

    socket.on('sync.error', (payload: SyncRealtimeErrorEvent) => {
      void this.handleRealtimeError(payload)
    })

    socket.on('disconnect', () => {
      void this.handleRealtimeDisconnect(socket)
    })

    socket.on('connect_error', () => {
      void this.handleRealtimeDisconnect(socket)
    })
  }

  private disconnectRealtimeSocket() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (!this.realtimeSocket) {
      this.realtimeAuthenticated = false
      this.realtimeStatus = 'disconnected'
      return
    }

    const socket = this.realtimeSocket
    this.realtimeSocket = null
    this.realtimeAuthenticated = false
    this.realtimeStatus = 'disconnected'

    socket.disconnect()
  }

  private handleRealtimeBatchEvent(batch: SyncBatchStatusResponse) {
    this.batchStatusCache.set(batch.batchId, batch)

    if (!isTerminalBatchStatus(batch.status)) {
      return
    }

    const waiter = this.batchWaiters.get(batch.batchId)
    if (waiter) {
      clearTimeout(waiter.timeout)
      this.batchWaiters.delete(batch.batchId)
      waiter.resolve(batch)
    }
  }

  private async handleRealtimeError(payload: SyncRealtimeErrorEvent) {
    if (payload.code === 'SYNC_SOCKET_UNAUTHORIZED') {
      const tokens = this.getStoredTokens()
      if (tokens?.refreshToken) {
        try {
          await this.refreshTokens(tokens.refreshToken)
          return
        } catch {
          // Let reconnect backoff handle future attempts when auth refresh is unavailable.
        }
      }
    }
  }

  private async handleRealtimeDisconnect(socket: Socket) {
    if (this.realtimeSocket !== socket) {
      return
    }

    this.realtimeSocket = null
    this.realtimeAuthenticated = false

    if (this.stopRequested || this.reconnectTimeout) {
      this.realtimeStatus = 'disconnected'
      await this.refreshSnapshot()
      return
    }

    this.realtimeStatus = 'reconnecting'
    await this.refreshSnapshot()

    const delay = Math.min(
      REALTIME_RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempt,
      REALTIME_RECONNECT_MAX_DELAY_MS,
    )
    this.reconnectAttempt += 1

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null
      void this.refreshRealtimeConnection()
    }, delay)
  }

  private waitForBatchRealtime(batchId: string): Promise<SyncBatchStatusResponse> {
    const cached = this.batchStatusCache.get(batchId)
    if (cached && isTerminalBatchStatus(cached.status)) {
      return Promise.resolve(cached)
    }

    return new Promise<SyncBatchStatusResponse>((resolve, reject) => {
      const existing = this.batchWaiters.get(batchId)
      if (existing) {
        clearTimeout(existing.timeout)
        existing.reject(new Error('Realtime batch waiter was replaced.'))
      }

      const timeout = setTimeout(() => {
        this.batchWaiters.delete(batchId)
        reject(new Error('Timed out waiting for realtime batch status.'))
      }, BATCH_STATUS_REALTIME_TIMEOUT_MS)

      this.batchWaiters.set(batchId, {
        resolve: (response) => {
          clearTimeout(timeout)
          this.batchWaiters.delete(batchId)
          resolve(response)
        },
        reject: (error) => {
          clearTimeout(timeout)
          this.batchWaiters.delete(batchId)
          reject(error)
        },
        timeout,
      })
    })
  }

  private async authenticatedRequest<T>(
    path: string,
    options: {
      method: HttpMethod
      accessToken: string
      refreshToken: string
      data?: unknown
    },
  ): Promise<AuthenticatedResponse<T>> {
    try {
      const data = await this.requestWithAccessToken<T>(
        path,
        options.accessToken,
        options.method,
        options.data,
      )
      return {
        data,
        tokens: {
          accessToken: options.accessToken,
          refreshToken: options.refreshToken,
        },
      }
    } catch (error) {
      if (!this.isUnauthorizedError(error)) {
        throw error
      }

      const refreshed = await this.refreshTokens(options.refreshToken)
      const data = await this.requestWithAccessToken<T>(
        path,
        refreshed.accessToken,
        options.method,
        options.data,
      )
      return {
        data,
        tokens: refreshed,
      }
    }
  }

  private async requestWithAccessToken<T>(
    path: string,
    accessToken: string,
    method: HttpMethod = 'GET',
    data?: unknown,
  ): Promise<T> {
    try {
      const response = await this.httpClient.request<unknown>({
        url: path,
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        data,
      })

      return unwrapApiEnvelope<T>(response.data)
    } catch (error) {
      if (this.isUnauthorizedError(error)) {
        throw error
      }

      throw new Error(this.readHttpErrorMessage(error, 'Desktop sync request failed.'))
    }
  }

  private async refreshTokens(refreshToken: string): Promise<Tokens> {
    let payload: { tokens: Tokens }

    try {
      const response = await this.httpClient.post<unknown>(
        '/auth/refresh',
        { refreshToken },
        {
          headers: {
            'x-skip-auth-refresh': '1',
          },
        },
      )
      payload = unwrapApiEnvelope<{ tokens: Tokens }>(response.data)
    } catch (error) {
      throw new Error(this.readHttpErrorMessage(error, 'Unable to refresh tokens for desktop sync.'))
    }

    this.secureStore.set(AUTH_TOKENS_KEY, JSON.stringify(payload.tokens))
    this.emit('tokens-updated')
    void this.refreshRealtimeConnection(true)
    return payload.tokens
  }

  private isUnauthorizedError(error: unknown) {
    return error instanceof HttpError && error.status === 401
  }

  private readHttpErrorMessage(error: unknown, fallback: string) {
    if (error instanceof HttpError) {
      const responseData = error.response?.data

      if (
        responseData &&
        typeof responseData === 'object' &&
        'message' in responseData &&
        typeof (responseData as { message?: unknown }).message === 'string'
      ) {
        return String((responseData as { message?: string }).message)
      }

      if (error.status) {
        return `Request failed with status ${error.status}`
      }
    }

    return error instanceof Error ? error.message : fallback
  }

  private getStoredTokens(): Tokens | null {
    const raw = this.secureStore.get(AUTH_TOKENS_KEY)
    if (!raw) {
      return null
    }

    try {
      return JSON.parse(raw) as Tokens
    } catch {
      return null
    }
  }

  private getPendingCount() {
    const [row] = this.db.query(
      `
        SELECT COUNT(*) AS total
        FROM sync_outbox
        WHERE status = 'pending'
      `,
    ) as Array<{ total: number }>

    return row?.total ?? 0
  }

  private getOutboxRows(
    limit = OUTBOX_BATCH_LIMIT,
    statuses: Array<OutboxRow['status']> = ['pending'],
  ) {
    const placeholders = statuses.map(() => '?').join(', ')

    return this.db.query(
      `
        SELECT
          id,
          entity,
          record_id,
          payload,
          status,
          attempt_count,
          updated_at
        FROM sync_outbox
        WHERE status IN (${placeholders})
        ORDER BY created_at ASC
        LIMIT ?
      `,
      [...statuses, limit],
    ) as OutboxRow[]
  }

  private markOutboxAttempt(rows: OutboxRow[], message: string) {
    if (rows.length === 0) {
      return
    }

    const now = new Date().toISOString()
    this.db.batch(
      rows.map((row) => ({
        sql: `
          UPDATE sync_outbox
          SET attempt_count = attempt_count + 1,
              last_attempt_at = ?,
              last_error = ?,
              updated_at = ?
          WHERE id = ?
        `,
        params: [now, message, now, row.id],
      })),
    )
  }

  private writeSyncLog(
    deviceId: string,
    syncedAt: string,
    pushedCount: number,
    pulledCount: number,
    conflictCount: number,
  ) {
    this.db.run(
      `
        INSERT INTO sync_log (
          id,
          device_id,
          synced_at,
          pushed_count,
          pulled_count,
          conflict_count
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        crypto.randomUUID(),
        deviceId,
        syncedAt,
        pushedCount,
        pulledCount,
        conflictCount,
      ],
    )
  }

  private async ensureDefaults() {
    const deviceId = await this.ensureDeviceId()
    const autoSync = await this.readSetting(AUTO_SYNC_KEY)
    const minQuality = await this.readSetting(MIN_QUALITY_KEY)

    if (autoSync === null) {
      await this.writeSetting(AUTO_SYNC_KEY, JSON.stringify(DEFAULT_SETTINGS.autoSyncEnabled))
    }

    if (minQuality === null) {
      await this.writeSetting(MIN_QUALITY_KEY, DEFAULT_SETTINGS.minQuality)
    }

    if (!deviceId) {
      await this.writeSetting(DEVICE_ID_KEY, crypto.randomUUID())
    }
  }

  private async ensureDeviceId() {
    const existing = await this.readSetting(DEVICE_ID_KEY)
    if (existing) {
      return existing
    }

    const deviceId = crypto.randomUUID()
    await this.writeSetting(DEVICE_ID_KEY, deviceId)
    return deviceId
  }

  private async refreshSnapshot(nextStatus?: SyncSnapshot['status']) {
    const settings = await this.readSettings()
    const lastSyncedAt = await this.readSetting(LAST_SYNCED_AT_KEY)
    this.snapshot = {
      ...this.snapshot,
      status: nextStatus ?? this.deriveStatus(settings),
      pendingCount: this.getPendingCount(),
      lastSyncedAt,
      network: this.network.snapshot,
      settings,
      realtime: this.resolveRealtimeSnapshot(settings),
    }
    this.emitSnapshot()
  }

  private resolveRealtimeSnapshot(settings: SyncSettings): SyncSnapshot['realtime'] {
    const tokens = this.getStoredTokens()
    const businessId = this.secureStore.get(LAST_BUSINESS_KEY)
    const canUseRealtime =
      !this.stopRequested &&
      settings.autoSyncEnabled &&
      Boolean(tokens?.accessToken) &&
      Boolean(businessId) &&
      this.meetsMinimumQuality(this.network.snapshot.quality, settings.minQuality)

    if (!canUseRealtime) {
      return {
        mode: 'disabled',
        status: 'disconnected',
      }
    }

    if (this.realtimeAuthenticated) {
      return {
        mode: 'realtime',
        status: 'connected',
      }
    }

    return {
      mode: 'fallback',
      status: this.realtimeStatus,
    }
  }

  private deriveStatus(settings: SyncSettings): SyncSnapshot['status'] {
    if (!settings.autoSyncEnabled) {
      return 'disabled'
    }

    if (!this.meetsMinimumQuality(this.network.snapshot.quality, settings.minQuality)) {
      return 'paused'
    }

    return this.snapshot.status === 'error' ? 'error' : 'idle'
  }

  private async readSettings(): Promise<SyncSettings> {
    const [autoSyncRaw, minQualityRaw] = await Promise.all([
      this.readSetting(AUTO_SYNC_KEY),
      this.readSetting(MIN_QUALITY_KEY),
    ])

    return {
      autoSyncEnabled:
        autoSyncRaw === null ? DEFAULT_SETTINGS.autoSyncEnabled : JSON.parse(autoSyncRaw),
      minQuality: isSyncQuality(minQualityRaw) ? minQualityRaw : DEFAULT_SETTINGS.minQuality,
    }
  }

  private async readSetting(key: string) {
    const [row] = this.db.query(
      `
        SELECT key, value
        FROM app_settings
        WHERE key = ?
        LIMIT 1
      `,
      [key],
    ) as SettingRow[]

    return row?.value ?? null
  }

  private async writeSetting(key: string, value: string) {
    const now = new Date().toISOString()
    this.db.run(
      `
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `,
      [key, value, now],
    )
  }

  private meetsMinimumQuality(current: NetworkQuality, minimum: SyncSettings['minQuality']) {
    return QUALITY_RANK[current] >= QUALITY_RANK[minimum]
  }

  private shouldAutoSyncOnNetworkChange(previous: NetworkSnapshot, next: NetworkSnapshot) {
    const minimumQuality = this.snapshot.settings.minQuality
    const previouslyEligible = this.meetsMinimumQuality(previous.quality, minimumQuality)
    const currentlyEligible = this.meetsMinimumQuality(next.quality, minimumQuality)

    return !previouslyEligible && currentlyEligible
  }

  private emitSnapshot() {
    const snapshot = this.getSnapshot()
    this.emit('status', snapshot.status)
    this.emit('snapshot', snapshot)
  }
}

function unwrapApiEnvelope<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'success' in raw) {
    return (raw as unknown as { data: T }).data
  }

  return raw as T
}

function isSyncQuality(value: string | null): value is SyncSettings['minQuality'] {
  return value === 'weak' || value === 'fair' || value === 'strong' || value === 'very_strong'
}

function countChanges(changes: ChangeSet) {
  return Object.values(changes).reduce((total, records) => total + (records?.length ?? 0), 0)
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isTerminalBatchStatus(status: SyncBatchStatusResponse['status']) {
  return (
    status === 'completed' ||
    status === 'partial' ||
    status === 'failed' ||
    status === 'enqueue_failed'
  )
}

function getRealtimeSocketConfig(apiBaseUrl: string) {
  const normalized = apiBaseUrl.replace(/\/+$/, '')
  const url = new URL(normalized)

  return {
    origin: url.origin,
    path: `${url.pathname}/sync/events`.replace(/\/+/g, '/'),
  }
}
