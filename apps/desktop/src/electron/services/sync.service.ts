import { EventEmitter } from 'events'
import { app } from 'electron'
import { hostname } from 'os'
import type {
  ChangeSet,
  ContactSyncPayload,
  ContactSyncRecord,
  DebtPaymentSyncPayload,
  DebtSyncPayload,
  DebtSyncRecord,
  InventoryAdjustmentSyncPayload,
  InventoryLevelSyncRecord,
  InventoryMovementSyncRecord,
  InventoryRestockSyncPayload,
  InventoryThresholdSyncPayload,
  OpeningBalanceSyncPayload,
  OpeningBalanceSyncRecord,
  RoleSyncRecord,
  SaleItemSyncRecord,
  SalePaymentSyncRecord,
  SaleSyncPayload,
  SaleSyncRecord,
  ExpenseCategorySyncRecord,
  ExpenseSyncRecord,
  IssueSyncTokenRequest,
  IssueSyncTokenResponse,
  JwtPayload,
  NetworkQuality,
  NetworkSnapshot,
  RestockItemSyncRecord,
  RestockRecordSyncRecord,
  SavingsAccountSyncPayload,
  SavingsAccountSyncRecord,
  SavingsTransactionSyncPayload,
  SavingsTransactionSyncRecord,
  SyncBatchStatusResponse,
  SyncEntity,
  SyncOperationFailureDetails,
  SyncPullResponse,
  SyncPushOperation,
  SyncPushPayload,
  SyncPushRequest,
  SyncPushResponse,
  SyncRealtimeErrorEvent,
  SyncRealtimeStatus,
  SyncRecord,
  SyncSettings,
  SyncSnapshot,
  TeamMemberSyncRecord,
} from '@biztrack/types'
import { getSyncEntityDependencyTier, getSyncEntityStableOrder } from '@biztrack/types'
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
import { API_BASE_URL } from '../config/api-base-url'

type OutboxRow = {
  id: string
  entity:
    | 'contacts'
    | 'openingBalances'
    | 'products'
    | 'productCategories'
    | 'expenseCategories'
    | 'unitOfMeasures'
    | 'inventoryThresholds'
    | 'inventoryAdjustments'
    | 'inventoryRestocks'
    | 'debts'
    | 'sales'
    | 'expenses'
    | 'savings'
    | 'savingsTransactions'
  operation: string
  record_id: string
  payload: string | null
  status: 'pending' | 'failed'
  attempt_count: number
  last_error: string | null
  last_error_details: string | null
  created_at: string
  updated_at: string
}

type FailedOutboxRow = {
  last_error: string | null
  last_error_details: string | null
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
  unit_name: string | null
  unit_abbreviation: string | null
  unit_business_id: string | null
  unit_type: string | null
  unit_is_default: number | null
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

type LocalExpenseCategoryRow = {
  id: string
  business_id: string | null
  name: string
  slug: string | null
  color: string | null
  icon: string | null
  sort_order: number | null
  is_active: number
  is_deleted: number
  created_at: string
  updated_at: string
}

type LocalExpenseRow = {
  id: string
  business_id: string
  recorded_by_id: string
  category_id: string | null
  description: string
  amount: number
  currency: string | null
  payment_method: string | null
  receipt_url: string | null
  vendor: string | null
  notes: string | null
  is_recurring: number
  date: string
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

type SyncCredential = {
  syncToken: string
  userId: string
  businessId: string
  deviceId: string
  issuedAt: string
}

type SyncAuthenticatedResponse<T> = {
  data: T
  credential: SyncCredential
  authTokens: Tokens | null
}

const AUTH_TOKENS_KEY = 'auth.tokens'
const LAST_BUSINESS_KEY = 'auth.lastBusinessId'
const SYNC_CREDENTIAL_KEY = 'sync.deviceCredential'
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

// Keep this mapper aligned with the canonical execution plan in
// `packages/types/src/sync.types.ts`. Desktop batches are capped, so the
// selection order here decides which dependencies are shipped before their
// dependents when a device comes back online with a large backlog.
const OUTBOX_ENTITY_TO_SYNC_ENTITY: Record<OutboxRow['entity'], SyncEntity> = {
  contacts: 'contact',
  openingBalances: 'opening_balance',
  unitOfMeasures: 'unit_of_measure',
  productCategories: 'product_category',
  expenseCategories: 'expense_category',
  products: 'product',
  inventoryThresholds: 'inventory_threshold',
  inventoryRestocks: 'inventory_restock',
  inventoryAdjustments: 'inventory_adjustment',
  debts: 'debt',
  sales: 'sale',
  expenses: 'expense',
  savings: 'savings',
  savingsTransactions: 'savings_transaction',
}

const DEFAULT_UNIT_SYNC_ALIASES = {
  piece: 'uom-piece',
  kilogram: 'uom-kilogram',
  liter: 'uom-liter',
  meter: 'uom-meter',
  service: 'uom-service',
} as const

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
  private lastRuntimeFailureDetails: SyncOperationFailureDetails | null = null
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
    private readonly apiBaseUrl = API_BASE_URL,
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
      lastFailureDetails: null,
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

    if (!businessId) {
      await this.refreshSnapshot('paused')
      await this.refreshRealtimeConnection()
      return { success: false, message: 'missing_business_context' }
    }

    let syncCredential: SyncCredential
    let activeAuthTokens = tokens

    try {
      const bootstrap = await this.ensureSyncCredential(tokens, businessId, deviceId)
      syncCredential = bootstrap.credential
      activeAuthTokens = bootstrap.authTokens
    } catch (error) {
      await this.refreshSnapshot('paused')
      await this.refreshRealtimeConnection()
      return {
        success: false,
        message: error instanceof Error ? error.message : 'missing_sync_auth_context',
      }
    }

    await this.refreshRealtimeConnection()

    this.isSyncing = true
    this.lastRuntimeFailureDetails = null
    this.snapshot = {
      ...this.snapshot,
      status: 'syncing',
      pendingCount,
      lastError: null,
      lastFailureDetails: null,
      settings,
    }
    this.emitSnapshot()

    const baseCursor = (await this.readSetting(LAST_SYNCED_AT_KEY)) ?? null
    let finalCursor = baseCursor
    let pulledCount = 0
    let pushedCount = 0
    let conflictCount = 0

    try {
      const initialPull = await this.pullChanges(syncCredential, activeAuthTokens, baseCursor)
      syncCredential = initialPull.credential
      activeAuthTokens = initialPull.authTokens
      await this.applyPulledChanges(initialPull.data)
      pulledCount += countChanges(initialPull.data.changes)
      finalCursor = initialPull.data.cursor

      let batchError: string | null = null

      while (!batchError) {
        const pendingRows = this.getOutboxRows(
          OUTBOX_BATCH_LIMIT,
          force ? ['pending', 'failed'] : ['pending'],
        )

        if (pendingRows.length === 0) {
          break
        }

        const payload = await this.buildPushPayload(deviceId, baseCursor, pendingRows)
        if (payload.operations.length === 0) {
          break
        }

        const pushResponse = await this.pushBatch(syncCredential, activeAuthTokens, payload)
        syncCredential = pushResponse.credential
        activeAuthTokens = pushResponse.authTokens

        if (pushResponse.data.status === 'enqueue_failed') {
          batchError = pushResponse.data.lastError ?? 'Sync batch could not be queued.'
          this.markOutboxAttempt(pendingRows, batchError)
          break
        }

        if (!pushResponse.data.batchId) {
          break
        }

        const batchStatus = await this.waitForBatch(
          syncCredential,
          activeAuthTokens,
          pushResponse.data.batchId,
        )
        syncCredential = batchStatus.credential
        activeAuthTokens = batchStatus.authTokens

        const batchOutcome = this.applyBatchResults(batchStatus.data, pendingRows)
        pushedCount += batchStatus.data.acceptedCount
        conflictCount += batchStatus.data.conflictCount
        batchError = batchOutcome.firstError
        this.lastRuntimeFailureDetails = batchOutcome.firstFailureDetails

        const followUpPull = await this.pullChanges(syncCredential, activeAuthTokens, baseCursor)
        syncCredential = followUpPull.credential
        activeAuthTokens = followUpPull.authTokens
        await this.applyPulledChanges(followUpPull.data)
        pulledCount = countChanges(followUpPull.data.changes)
        finalCursor = followUpPull.data.cursor
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
          lastFailureDetails: this.lastRuntimeFailureDetails,
        }
        this.emitSnapshot()
        return { success: false, message: batchError }
      }

      this.lastRuntimeFailureDetails = null
      await this.refreshSnapshot('synced')
      return { success: true, message: 'synced' }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed'
      const retryableRows = this.getOutboxRows(
        OUTBOX_BATCH_LIMIT,
        force ? ['pending', 'failed'] : ['pending'],
      )
      this.markOutboxAttempt(retryableRows, message)
      this.lastRuntimeFailureDetails = null
      this.snapshot = {
        ...this.snapshot,
        status: 'error',
        lastError: message,
        lastFailureDetails: null,
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
    const sortedRows = [...outboxRows].sort((left, right) => this.compareOutboxRowsForPush(left, right))

    for (const row of sortedRows) {
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

      if (row.entity === 'expenseCategories') {
        const category = this.loadExpenseCategorySyncRecord(row.record_id)
        operations.push({
          operationId: row.id,
          entity: 'expense_category',
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

      if (row.entity === 'contacts') {
        const payload = this.parseOutboxPayload<ContactSyncPayload>(row.payload)
        if (!payload) {
          continue
        }

        operations.push({
          operationId: row.id,
          entity: 'contact',
          action: 'UPSERT',
          recordId: row.record_id,
          updatedAt: row.updated_at,
          payload,
        })
      }

      if (row.entity === 'openingBalances') {
        const isDelete = row.operation === 'DELETE' || !row.payload
        if (isDelete) {
          operations.push({
            operationId: row.id,
            entity: 'opening_balance',
            action: 'DELETE',
            recordId: row.record_id,
            updatedAt: row.updated_at,
            payload: null,
          })
        } else {
          const payload = this.parseOutboxPayload<OpeningBalanceSyncPayload>(row.payload)
          if (!payload) {
            continue
          }
          operations.push({
            operationId: row.id,
            entity: 'opening_balance',
            action: 'UPSERT',
            recordId: row.record_id,
            updatedAt: payload.createdAt ?? row.updated_at,
            payload,
          })
        }
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

      if (row.entity === 'sales') {
        const payload = this.parseOutboxPayload<SaleSyncPayload>(row.payload)
        if (!payload) {
          continue
        }

        operations.push({
          operationId: row.id,
          entity: 'sale',
          action: 'UPSERT',
          recordId: row.record_id,
          updatedAt: row.updated_at,
          payload,
        })
      }

      if (row.entity === 'debts') {
        const payload = this.parseOutboxPayload<DebtSyncPayload>(row.payload)
        if (!payload) {
          continue
        }

        operations.push({
          operationId: row.id,
          entity: 'debt',
          action: 'UPSERT',
          recordId: row.record_id,
          updatedAt: payload.updatedAt ?? row.updated_at,
          payload,
        })
      }

      if (row.entity === 'expenses') {
        const expense = this.loadExpenseSyncRecord(row.record_id)
        operations.push({
          operationId: row.id,
          entity: 'expense',
          action: !expense || expense.isDeleted ? 'DELETE' : 'UPSERT',
          recordId: row.record_id,
          updatedAt: expense?.updatedAt ?? row.updated_at,
          payload: expense,
        })
      }

      if (row.entity === 'savings') {
        const payload = this.parseOutboxPayload<SavingsAccountSyncPayload>(row.payload)
        if (!payload) {
          continue
        }
        operations.push({
          operationId: row.id,
          entity: 'savings',
          action: 'UPSERT',
          recordId: row.record_id,
          updatedAt: payload.updatedAt ?? row.updated_at,
          payload,
        })
      }

      if (row.entity === 'savingsTransactions') {
        const payload = this.parseOutboxPayload<SavingsTransactionSyncPayload>(row.payload)
        if (!payload) {
          continue
        }
        operations.push({
          operationId: row.id,
          entity: 'savings_transaction',
          action: 'UPSERT',
          recordId: row.record_id,
          updatedAt: payload.createdAt ?? row.updated_at,
          payload,
        })
      }

    }

    operations.sort((left, right) => {
      const tierOrder = getSyncEntityDependencyTier(left.entity) - getSyncEntityDependencyTier(right.entity)
      if (tierOrder !== 0) {
        return tierOrder
      }

      const updatedAtOrder = new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime()
      if (updatedAtOrder !== 0) {
        return updatedAtOrder
      }

      const entityOrder = getSyncEntityStableOrder(left.entity) - getSyncEntityStableOrder(right.entity)
      if (entityOrder !== 0) {
        return entityOrder
      }

      return left.operationId.localeCompare(right.operationId)
    })

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
          il.low_stock_threshold AS inventory_low_stock_threshold,
          u.name AS unit_name,
          u.abbreviation AS unit_abbreviation,
          u.business_id AS unit_business_id,
          u.type AS unit_type,
          u.is_default AS unit_is_default
        FROM products p
        LEFT JOIN inventory_levels il
          ON il.product_id = p.id
        LEFT JOIN unit_of_measures u
          ON u.id = p.unit_of_measure_id
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
      unitOfMeasureId: this.normalizeUnitOfMeasureIdForSync(row),
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

  private normalizeUnitOfMeasureIdForSync(row: LocalProductRow) {
    const rawId = row.unit_of_measure_id

    if (!rawId) {
      return rawId
    }

    const normalizedRawId = rawId.trim().toLowerCase()

    if (normalizedRawId in DEFAULT_UNIT_SYNC_ALIASES) {
      return DEFAULT_UNIT_SYNC_ALIASES[normalizedRawId as keyof typeof DEFAULT_UNIT_SYNC_ALIASES]
    }

    if (row.unit_business_id) {
      return rawId
    }

    const normalizedName = row.unit_name?.trim().toLowerCase() ?? ''
    const normalizedAbbreviation = row.unit_abbreviation?.trim().toLowerCase() ?? ''
    const normalizedType = row.unit_type?.trim().toLowerCase() ?? ''

    if (
      normalizedType === 'quantity' &&
      ['piece', 'qty', 'quantity'].includes(normalizedName)
    ) {
      return DEFAULT_UNIT_SYNC_ALIASES.piece
    }

    if (
      normalizedType === 'quantity' &&
      ['pcs', 'qty', 'pc'].includes(normalizedAbbreviation)
    ) {
      return DEFAULT_UNIT_SYNC_ALIASES.piece
    }

    if (
      normalizedType === 'weight' &&
      (normalizedName === 'kilogram' || normalizedAbbreviation === 'kg')
    ) {
      return DEFAULT_UNIT_SYNC_ALIASES.kilogram
    }

    if (
      normalizedType === 'volume' &&
      (normalizedName === 'liter' || normalizedName === 'litre' || normalizedAbbreviation === 'l')
    ) {
      return DEFAULT_UNIT_SYNC_ALIASES.liter
    }

    if (
      normalizedType === 'length' &&
      (normalizedName === 'meter' || normalizedName === 'metre' || normalizedAbbreviation === 'm')
    ) {
      return DEFAULT_UNIT_SYNC_ALIASES.meter
    }

    if (
      normalizedName === 'service' ||
      normalizedAbbreviation === 'svc' ||
      normalizedRawId === 'uom-service'
    ) {
      return DEFAULT_UNIT_SYNC_ALIASES.service
    }

    return rawId
  }

  private loadExpenseCategorySyncRecord(recordId: string): ExpenseCategorySyncRecord | null {
    const [row] = this.db.query(
      `
        SELECT
          id,
          business_id,
          name,
          slug,
          color,
          icon,
          sort_order,
          is_active,
          is_deleted,
          created_at,
          updated_at
        FROM expense_categories
        WHERE id = ?
        LIMIT 1
      `,
      [recordId],
    ) as LocalExpenseCategoryRow[]

    if (!row) {
      return null
    }

    return {
      id: row.id,
      businessId: row.business_id,
      name: row.name,
      slug: row.slug ?? row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      color: row.color ?? '#888780',
      icon: row.icon,
      sortOrder: row.sort_order ?? 0,
      isSystem: !row.business_id,
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

  private loadExpenseSyncRecord(recordId: string): ExpenseSyncRecord | null {
    const [row] = this.db.query(
      `
        SELECT
          id,
          business_id,
          recorded_by_id,
          category_id,
          description,
          amount,
          currency,
          payment_method,
          receipt_url,
          vendor,
          notes,
          is_recurring,
          date,
          is_deleted,
          created_at,
          updated_at
        FROM expenses
        WHERE id = ?
        LIMIT 1
      `,
      [recordId],
    ) as LocalExpenseRow[]

    if (!row || !row.category_id) {
      return null
    }

    return {
      id: row.id,
      businessId: row.business_id,
      categoryId: row.category_id,
      recordedById: row.recorded_by_id,
      description: row.description,
      amount: row.amount,
      currency: row.currency ?? 'XAF',
      expenseDate: row.date,
      vendor: row.vendor,
      notes: row.notes,
      isRecurring: Boolean(row.is_recurring),
      paymentMethod: row.payment_method ?? 'CASH',
      receiptUrl: row.receipt_url,
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

  private async pushBatch(
    credential: SyncCredential,
    authTokens: Tokens | null,
    payload: SyncPushRequest,
  ): Promise<SyncAuthenticatedResponse<SyncPushResponse>> {
    return this.syncAuthenticatedRequest<SyncPushResponse>('/sync/batches', {
      method: 'POST',
      credential,
      authTokens,
      data: payload,
    })
  }

  private async waitForBatch(
    credential: SyncCredential,
    authTokens: Tokens | null,
    batchId: string,
  ): Promise<SyncAuthenticatedResponse<SyncBatchStatusResponse>> {
    if (this.realtimeAuthenticated) {
      try {
        const response = await this.waitForBatchRealtime(batchId)
        return {
          data: response,
          credential,
          authTokens,
        }
      } catch {
        // Fall back to HTTP polling if the realtime channel is unavailable or slow.
      }
    }

    return this.waitForBatchByPolling(credential, authTokens, batchId)
  }

  private async waitForBatchByPolling(
    credential: SyncCredential,
    authTokens: Tokens | null,
    batchId: string,
  ): Promise<SyncAuthenticatedResponse<SyncBatchStatusResponse>> {
    let activeCredential = credential
    let activeAuthTokens = authTokens

    for (let attempt = 0; attempt < BATCH_STATUS_POLL_ATTEMPTS; attempt += 1) {
      const response = await this.syncAuthenticatedRequest<SyncBatchStatusResponse>(`/sync/batches/${batchId}`, {
        method: 'GET',
        credential: activeCredential,
        authTokens: activeAuthTokens,
      })
      activeCredential = response.credential
      activeAuthTokens = response.authTokens

      if (isTerminalBatchStatus(response.data.status)) {
        return response
      }

      await sleep(BATCH_STATUS_POLL_DELAY_MS)
    }

    throw new Error('Sync batch is still processing. Please try again shortly.')
  }

  private async pullChanges(
    credential: SyncCredential,
    authTokens: Tokens | null,
    cursor: string | null,
  ): Promise<SyncAuthenticatedResponse<SyncPullResponse>> {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
    return this.syncAuthenticatedRequest<SyncPullResponse>(`/sync/pull${query}`, {
      method: 'GET',
      credential,
      authTokens,
    })
  }

  private async applyPulledChanges(response: SyncPullResponse) {
    const operations: Array<{ sql: string; params?: unknown[] }> = []
    const serverContacts = response.changes.contacts ?? []
    const serverOpeningBalances = (response.changes.openingBalances ?? []) as OpeningBalanceSyncRecord[]
    const serverUnits = response.changes.unitOfMeasures ?? []
    const serverProductCategories = response.changes.productCategories ?? []
    const serverExpenseCategories = response.changes.expenseCategories ?? []
    const serverProducts = response.changes.products ?? []
    const serverInventoryLevels = response.changes.inventoryLevels ?? []
    const serverInventoryMovements = response.changes.inventoryMovements ?? []
    const serverRestockRecords = response.changes.restockRecords ?? []
    const serverRestockItems = response.changes.restockItems ?? []
    const serverSales = response.changes.sales ?? []
    const serverSaleItems = response.changes.saleItems ?? []
    const serverSalePayments = response.changes.salePayments ?? []
    const serverDebts = response.changes.debts ?? []
    const serverExpenses = response.changes.expenses ?? []
    const serverTeamMembers = response.changes.teamMembers ?? []
    const serverRoles = response.changes.roles ?? []
    const serverSavingsAccounts = (response.changes.savingsAccounts ?? []) as SavingsAccountSyncRecord[]
    const serverSavingsTransactions = (response.changes.savingsTransactions ?? []) as SavingsTransactionSyncRecord[]

    if (serverUnits.length > 0) {
      this.applyUnitOfMeasureChanges(serverUnits)
    }

    for (const record of serverContacts) {
      operations.push(this.buildContactUpsertOperation(record))
    }

    for (const record of serverOpeningBalances) {
      operations.push(this.buildOpeningBalanceUpsertOperation(record))
    }

    for (const record of serverProductCategories) {
      operations.push(this.buildCategoryUpsertOperation(record))
    }

    for (const record of serverExpenseCategories) {
      operations.push(this.buildExpenseCategoryUpsertOperation(record))
    }

    for (const record of serverProducts) {
      operations.push(this.buildProductUpsertOperation(record))
    }

    for (const record of serverSales) {
      const saleSequenceOperation = this.buildSaleNumberSequenceUpsertOperation(record)
      if (saleSequenceOperation) {
        operations.push(saleSequenceOperation)
      }
      operations.push(this.buildSaleUpsertOperation(record))
    }

    for (const record of serverSaleItems) {
      operations.push(this.buildSaleItemUpsertOperation(record))
    }

    for (const record of serverSalePayments) {
      operations.push(this.buildSalePaymentUpsertOperation(record))
    }

    for (const record of serverDebts) {
      operations.push(this.buildDebtUpsertOperation(record))
      operations.push(this.buildDebtPaymentsDeleteOperation(record.id))
      for (const payment of record.payments ?? []) {
        operations.push(this.buildDebtPaymentUpsertOperation(record.id, record.businessId, payment))
      }
    }

    for (const record of serverExpenses) {
      operations.push(this.buildExpenseUpsertOperation(record))
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

    for (const record of serverTeamMembers) {
      operations.push(this.buildTeamMemberUpsertOperation(record))
    }

    for (const record of serverRoles) {
      operations.push(this.buildRoleUpsertOperation(record))
    }

    for (const record of serverSavingsAccounts) {
      operations.push(this.buildSavingsAccountUpsertOperation(record))
    }

    for (const record of serverSavingsTransactions) {
      operations.push(this.buildSavingsTransactionUpsertOperation(record))
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
                last_error_details = ?,
                updated_at = ?
            WHERE id = ?
          `,
          params: [
            now,
            this.formatSyncFailureMessage(result.errorMessage ?? 'Sync operation failed.', result.errorDetails ?? null),
            result.errorDetails ? JSON.stringify(result.errorDetails) : null,
            now,
            result.operationId,
          ],
        })
      }
    }

    if (operations.length > 0) {
      this.db.batch(operations)
    }

    return {
      firstError:
        failedResults[0]
          ? this.formatSyncFailureMessage(
              failedResults[0].errorMessage ?? 'Sync operation failed.',
              failedResults[0].errorDetails ?? null,
            )
          : null,
      firstFailureDetails: failedResults[0]?.errorDetails ?? null,
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
        sql: `DELETE FROM restock_payments WHERE restock_record_id = ?`,
        params: [row.record_id],
      })

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

  private buildContactUpsertOperation(record: ContactSyncRecord) {
    return {
      sql: `
        INSERT INTO contacts (
          id,
          business_id,
          type,
          name,
          phone,
          phone_alt,
          address,
          notes,
          is_active,
          created_by_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          business_id = excluded.business_id,
          type = excluded.type,
          name = excluded.name,
          phone = excluded.phone,
          phone_alt = excluded.phone_alt,
          address = excluded.address,
          notes = excluded.notes,
          is_active = excluded.is_active,
          created_by_id = excluded.created_by_id,
          updated_at = excluded.updated_at
      `,
      params: [
        record.id,
        record.businessId,
        record.type,
        record.name,
        record.phone ?? null,
        record.phoneAlt ?? null,
        record.address ?? null,
        record.notes ?? null,
        record.isActive ? 1 : 0,
        record.createdById ?? null,
        record.createdAt,
        record.updatedAt,
      ],
    }
  }

  private buildOpeningBalanceUpsertOperation(record: OpeningBalanceSyncRecord) {
    return {
      sql: `
        INSERT INTO contact_opening_balances (
          id,
          business_id,
          contact_id,
          direction,
          amount,
          as_of_date,
          notes,
          recorded_by_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          business_id = excluded.business_id,
          contact_id = excluded.contact_id,
          direction = excluded.direction,
          amount = excluded.amount,
          as_of_date = excluded.as_of_date,
          notes = excluded.notes,
          recorded_by_id = excluded.recorded_by_id,
          updated_at = excluded.updated_at
        WHERE excluded.updated_at >= contact_opening_balances.updated_at
      `,
      params: [
        record.id,
        record.businessId,
        record.contactId,
        record.direction,
        record.amount,
        record.asOfDate,
        record.notes ?? null,
        record.recordedById ?? null,
        record.createdAt,
        record.updatedAt,
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

  private buildExpenseCategoryUpsertOperation(record: ExpenseCategorySyncRecord) {
    const deleted = Boolean(record.isDeleted)

    return {
      sql: `
        INSERT INTO expense_categories (
          id,
          business_id,
          name,
          slug,
          color,
          icon,
          sort_order,
          is_active,
          is_deleted,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          business_id = excluded.business_id,
          name = excluded.name,
          slug = excluded.slug,
          color = excluded.color,
          icon = excluded.icon,
          sort_order = excluded.sort_order,
          is_active = excluded.is_active,
          is_deleted = excluded.is_deleted,
          updated_at = excluded.updated_at
      `,
      params: [
        record.id,
        record.businessId ?? null,
        record.name,
        record.slug,
        record.color,
        record.icon ?? null,
        record.sortOrder ?? 0,
        deleted ? 0 : 1,
        deleted ? 1 : 0,
        record.createdAt,
        record.updatedAt,
      ],
    }
  }

  private buildSaleUpsertOperation(record: SaleSyncRecord) {
    const saleNumber = record.saleNumber?.trim() || record.id
    const createdAt = record.createdAt ?? record.updatedAt

    return {
      sql: `
        INSERT INTO sales (
          id,
          business_id,
          client_id,
          cashier_id,
          cashier_name,
          sale_number,
          receipt_number,
          subtotal,
          total_amount,
          discount_amount,
          charges_amount,
          tax_amount,
          net_amount,
          amount_paid,
          credit_amount,
          change_given,
          payment_method,
          momo_reference,
          customer_id,
          customer_name,
          customer_phone,
          notes,
          price_drift_warning,
          currency,
          sale_date,
          sold_at,
          synced_at,
          voided_at,
          voided_by,
          void_reason,
          status,
          is_deleted,
          created_at,
          updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
          business_id = excluded.business_id,
          client_id = excluded.client_id,
          cashier_id = excluded.cashier_id,
          cashier_name = excluded.cashier_name,
          sale_number = excluded.sale_number,
          receipt_number = excluded.receipt_number,
          subtotal = excluded.subtotal,
          total_amount = excluded.total_amount,
          discount_amount = excluded.discount_amount,
          charges_amount = excluded.charges_amount,
          tax_amount = excluded.tax_amount,
          net_amount = excluded.net_amount,
          amount_paid = excluded.amount_paid,
          credit_amount = excluded.credit_amount,
          change_given = excluded.change_given,
          payment_method = excluded.payment_method,
          momo_reference = excluded.momo_reference,
          customer_id = excluded.customer_id,
          customer_name = excluded.customer_name,
          customer_phone = excluded.customer_phone,
          notes = excluded.notes,
          price_drift_warning = excluded.price_drift_warning,
          currency = excluded.currency,
          sale_date = excluded.sale_date,
          sold_at = excluded.sold_at,
          synced_at = excluded.synced_at,
          voided_at = excluded.voided_at,
          voided_by = excluded.voided_by,
          void_reason = excluded.void_reason,
          status = excluded.status,
          is_deleted = excluded.is_deleted,
          updated_at = excluded.updated_at
      `,
      params: [
        record.id,
        record.businessId,
        record.clientId,
        record.cashierId,
        record.cashierName ?? null,
        saleNumber,
        saleNumber,
        record.subtotal,
        record.totalAmount,
        record.discountAmount,
        record.chargesAmount ?? 0,
        record.taxAmount,
        record.totalAmount,
        record.amountPaid,
        record.creditAmount ?? 0,
        record.changeGiven,
        record.paymentMethod ?? null,
        null,
        record.customerId ?? null,
        record.customerName ?? null,
        record.customerPhone ?? null,
        record.notes ?? null,
        record.priceDriftWarning ? 1 : 0,
        record.currency ?? 'XAF',
        record.saleDate,
        record.soldAt,
        record.syncedAt ?? record.updatedAt,
        record.voidedAt ?? null,
        record.voidedById ?? null,
        record.voidReason ?? null,
        record.status,
        record.isDeleted ? 1 : 0,
        createdAt,
        record.updatedAt,
      ],
    }
  }

  private buildSaleNumberSequenceUpsertOperation(record: SaleSyncRecord) {
    const sequence = this.extractSaleNumberSequence(record.saleNumber, record.saleDate)

    if (sequence === null) {
      return null
    }

    return {
      sql: `
        INSERT INTO sale_number_sequences (
          business_id,
          sale_date,
          last_sequence
        ) VALUES (?, ?, ?)
        ON CONFLICT(business_id, sale_date) DO UPDATE SET
          last_sequence = CASE
            WHEN excluded.last_sequence > sale_number_sequences.last_sequence
              THEN excluded.last_sequence
            ELSE sale_number_sequences.last_sequence
          END
      `,
      params: [record.businessId, record.saleDate, sequence],
    }
  }

  private buildSaleItemUpsertOperation(record: SaleItemSyncRecord) {
    return {
      sql: `
        INSERT INTO sale_items (
          id,
          sale_id,
          business_id,
          product_id,
          product_name,
          product_sku,
          unit_of_measure,
          quantity,
          unit_price,
          discount_amount,
          line_total,
          total_price,
          cost_price,
          is_deleted,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          sale_id = excluded.sale_id,
          business_id = excluded.business_id,
          product_id = excluded.product_id,
          product_name = excluded.product_name,
          product_sku = excluded.product_sku,
          unit_of_measure = excluded.unit_of_measure,
          quantity = excluded.quantity,
          unit_price = excluded.unit_price,
          discount_amount = excluded.discount_amount,
          line_total = excluded.line_total,
          total_price = excluded.total_price,
          cost_price = excluded.cost_price,
          is_deleted = excluded.is_deleted,
          updated_at = excluded.updated_at
      `,
      params: [
        record.id,
        record.saleId,
        record.businessId,
        record.productId,
        record.productName,
        record.productSku ?? null,
        record.unitOfMeasure ?? null,
        record.quantity,
        record.unitPrice,
        record.discountAmount,
        record.lineTotal,
        record.lineTotal,
        record.costPrice ?? null,
        record.isDeleted ? 1 : 0,
        record.createdAt,
        record.updatedAt,
      ],
    }
  }

  private buildSalePaymentUpsertOperation(record: SalePaymentSyncRecord) {
    return {
      sql: `
        INSERT INTO sale_payments (
          id,
          sale_id,
          business_id,
          method,
          amount,
          mobile_money_reference,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          sale_id = excluded.sale_id,
          business_id = excluded.business_id,
          method = excluded.method,
          amount = excluded.amount,
          mobile_money_reference = excluded.mobile_money_reference,
          created_at = excluded.created_at
      `,
      params: [
        record.id,
        record.saleId,
        record.businessId,
        record.method,
        record.amount,
        record.mobileMoneyReference ?? null,
        record.createdAt,
      ],
    }
  }

  private buildDebtUpsertOperation(record: DebtSyncRecord) {
    return {
      sql: `
        INSERT INTO debts (
          id,
          business_id,
          contact_id,
          direction,
          source_type,
          source_id,
          source_reference,
          original_amount,
          status,
          due_date,
          notes,
          created_at,
          settled_at,
          written_off_at,
          written_off_by,
          written_off_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          business_id = excluded.business_id,
          contact_id = excluded.contact_id,
          direction = excluded.direction,
          source_type = excluded.source_type,
          source_id = excluded.source_id,
          source_reference = excluded.source_reference,
          original_amount = excluded.original_amount,
          status = excluded.status,
          due_date = excluded.due_date,
          notes = excluded.notes,
          created_at = excluded.created_at,
          settled_at = excluded.settled_at,
          written_off_at = excluded.written_off_at,
          written_off_by = excluded.written_off_by,
          written_off_reason = excluded.written_off_reason
      `,
      params: [
        record.id,
        record.businessId,
        record.contactId,
        record.direction,
        record.sourceType,
        record.sourceId,
        record.sourceReference,
        record.originalAmount,
        record.status,
        record.dueDate ?? null,
        record.notes ?? null,
        record.createdAt,
        record.settledAt ?? null,
        record.writtenOffAt ?? null,
        record.writtenOffById ?? null,
        record.writtenOffReason ?? null,
      ],
    }
  }

  private buildDebtPaymentsDeleteOperation(debtId: string) {
    return {
      sql: `
        DELETE FROM debt_payments
        WHERE debt_id = ?
      `,
      params: [debtId],
    }
  }

  private buildDebtPaymentUpsertOperation(
    debtId: string,
    businessId: string,
    payment: DebtPaymentSyncPayload,
  ) {
    return {
      sql: `
        INSERT INTO debt_payments (
          id,
          business_id,
          debt_id,
          amount,
          method,
          mobile_money_reference,
          payment_date,
          notes,
          recorded_by,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          business_id = excluded.business_id,
          debt_id = excluded.debt_id,
          amount = excluded.amount,
          method = excluded.method,
          mobile_money_reference = excluded.mobile_money_reference,
          payment_date = excluded.payment_date,
          notes = excluded.notes,
          recorded_by = excluded.recorded_by,
          created_at = excluded.created_at
      `,
      params: [
        payment.id,
        businessId,
        debtId,
        payment.amount,
        payment.method,
        payment.mobileMoneyReference ?? null,
        payment.paymentDate,
        payment.notes ?? null,
        payment.recordedById ?? 'sync-user',
        payment.createdAt,
      ],
    }
  }

  private buildExpenseUpsertOperation(record: ExpenseSyncRecord) {
    return {
      sql: `
        INSERT INTO expenses (
          id,
          business_id,
          recorded_by_id,
          category_id,
          category,
          description,
          amount,
          currency,
          payment_method,
          receipt_url,
          vendor,
          notes,
          is_recurring,
          date,
          is_deleted,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          business_id = excluded.business_id,
          recorded_by_id = excluded.recorded_by_id,
          category_id = excluded.category_id,
          description = excluded.description,
          amount = excluded.amount,
          currency = excluded.currency,
          payment_method = excluded.payment_method,
          receipt_url = excluded.receipt_url,
          vendor = excluded.vendor,
          notes = excluded.notes,
          is_recurring = excluded.is_recurring,
          date = excluded.date,
          is_deleted = excluded.is_deleted,
          updated_at = excluded.updated_at
      `,
      params: [
        record.id,
        record.businessId,
        record.recordedById,
        record.categoryId,
        record.description,
        record.amount,
        record.currency ?? 'XAF',
        record.paymentMethod ?? 'CASH',
        record.receiptUrl ?? null,
        record.vendor ?? null,
        record.notes ?? null,
        record.isRecurring ? 1 : 0,
        record.expenseDate,
        record.isDeleted ? 1 : 0,
        record.createdAt,
        record.updatedAt,
      ],
    }
  }

  private extractSaleNumberSequence(saleNumber: string | null | undefined, saleDate: string | null | undefined) {
    if (!saleNumber || !saleDate) {
      return null
    }

    const prefix = `VTE-${saleDate.replace(/-/g, '')}-`
    if (!saleNumber.startsWith(prefix)) {
      return null
    }

    const rawSequence = Number.parseInt(saleNumber.slice(prefix.length), 10)
    return Number.isFinite(rawSequence) && rawSequence > 0 ? rawSequence : null
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
        ON CONFLICT(id) DO UPDATE SET
          business_id = excluded.business_id,
          reference_number = excluded.reference_number,
          supplier_id = excluded.supplier_id,
          supplier_name = excluded.supplier_name,
          total_amount = excluded.total_amount,
          total_cost = excluded.total_cost,
          amount_paid = excluded.amount_paid,
          credit_amount = excluded.credit_amount,
          notes = excluded.notes,
          performed_by_id = excluded.performed_by_id,
          created_at = excluded.created_at
      `,
      params: [
        record.id,
        record.businessId,
        record.referenceNumber ?? null,
        record.supplierId ?? null,
        record.supplierName ?? null,
        record.totalAmount ?? record.totalCost ?? null,
        record.totalCost ?? null,
        record.amountPaid ?? record.totalAmount ?? record.totalCost ?? null,
        record.creditAmount ?? 0,
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

  private buildTeamMemberUpsertOperation(record: TeamMemberSyncRecord) {
    const now = new Date().toISOString()
    return {
      sql: `
        INSERT INTO business_members (
          id,
          business_id,
          user_id,
          role_id,
          role,
          status,
          name,
          email,
          phone,
          is_deleted,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          role_id = excluded.role_id,
          role = excluded.role,
          status = excluded.status,
          name = excluded.name,
          email = excluded.email,
          phone = excluded.phone,
          is_deleted = excluded.is_deleted,
          updated_at = excluded.updated_at
      `,
      params: [
        record.id,
        record.businessId,
        record.userId,
        record.roleId ?? null,
        record.role,
        record.status,
        record.name ?? null,
        record.email ?? null,
        record.phone ?? null,
        record.isDeleted ? 1 : 0,
        record.createdAt ?? now,
        record.updatedAt ?? now,
      ],
    }
  }

  private buildRoleUpsertOperation(record: RoleSyncRecord) {
    const now = new Date().toISOString()
    return {
      sql: `
        INSERT INTO roles (
          id,
          business_id,
          name,
          description,
          is_system,
          is_owner_role,
          colour,
          is_deleted,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name        = excluded.name,
          description = excluded.description,
          colour      = excluded.colour,
          is_deleted  = excluded.is_deleted,
          updated_at  = excluded.updated_at
      `,
      params: [
        record.id,
        record.businessId,
        record.name,
        record.description ?? null,
        record.isSystem ? 1 : 0,
        record.isOwnerRole ? 1 : 0,
        record.colour ?? null,
        record.isDeleted ? 1 : 0,
        record.createdAt ?? now,
        record.updatedAt ?? now,
      ],
    }
  }

  private buildSavingsAccountUpsertOperation(record: SavingsAccountSyncRecord) {
    const now = new Date().toISOString()
    const taggedProductsJson = record.taggedProducts ? JSON.stringify(record.taggedProducts) : null

    return {
      sql: `
        INSERT INTO savings_accounts (
          id,
          business_id,
          customer_id,
          customer_name,
          customer_phone,
          account_number,
          balance,
          total_deposited,
          total_refunded,
          total_used,
          tagged_products,
          is_deleted,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          customer_name = excluded.customer_name,
          customer_phone = excluded.customer_phone,
          account_number = excluded.account_number,
          balance = excluded.balance,
          total_deposited = excluded.total_deposited,
          total_refunded = excluded.total_refunded,
          total_used = excluded.total_used,
          tagged_products = excluded.tagged_products,
          is_deleted = excluded.is_deleted,
          updated_at = excluded.updated_at
      `,
      params: [
        record.id,
        record.businessId,
        record.customerId,
        record.customerName ?? null,
        record.customerPhone ?? null,
        record.accountNumber,
        record.balance ?? 0,
        record.totalDeposited ?? 0,
        record.totalRefunded ?? 0,
        record.totalUsed ?? 0,
        taggedProductsJson,
        record.isDeleted ? 1 : 0,
        record.createdAt ?? now,
        record.updatedAt ?? now,
      ],
    }
  }

  private buildSavingsTransactionUpsertOperation(record: SavingsTransactionSyncRecord) {
    const now = new Date().toISOString()

    return {
      sql: `
        INSERT INTO savings_transactions (
          id, savings_id, business_id, type, direction, amount, method,
          mobile_money_reference, sale_id, notes, recorded_by_id, occurred_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          savings_id = excluded.savings_id,
          business_id = excluded.business_id,
          type = excluded.type,
          direction = excluded.direction,
          amount = excluded.amount,
          method = excluded.method,
          mobile_money_reference = excluded.mobile_money_reference,
          sale_id = excluded.sale_id,
          notes = excluded.notes,
          recorded_by_id = excluded.recorded_by_id,
          occurred_at = excluded.occurred_at
      `,
      params: [
        record.id,
        record.savingsId,
        record.businessId,
        record.type,
        record.direction,
        record.amount,
        record.method ?? null,
        record.mobileMoneyReference ?? null,
        record.saleId ?? null,
        record.notes ?? null,
        record.recordedById ?? null,
        record.occurredAt,
        record.createdAt ?? now,
      ],
    }
  }

  private async refreshRealtimeConnection(forceReconnect = false) {
    const settings = await this.readSettings()
    const authTokens = this.getStoredTokens()
    const businessId = this.secureStore.get(LAST_BUSINESS_KEY)
    const deviceId = await this.ensureDeviceId()

    const shouldConnect =
      !this.stopRequested &&
      settings.autoSyncEnabled &&
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

    let syncCredential: SyncCredential
    try {
      // Realtime shares the same sync-only credential as HTTP sync so both
      // transports survive expired auth tokens in the same offline-first way.
      const bootstrap = await this.ensureSyncCredential(authTokens, businessId as string, deviceId)
      syncCredential = bootstrap.credential
    } catch {
      this.disconnectRealtimeSocket()
      await this.refreshSnapshot()
      return
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
        syncToken: syncCredential.syncToken,
        deviceId,
      })
    })

    socket.on('sync.connected', () => {
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

    socket.on('sync.changes.available', () => {
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
      this.clearStoredSyncCredential()
      this.disconnectRealtimeSocket()
      void this.refreshRealtimeConnection(true)
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
      const data = await this.requestWithBearerToken<T>(
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
      const data = await this.requestWithBearerToken<T>(
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

  private async syncAuthenticatedRequest<T>(
    path: string,
    options: {
      method: HttpMethod
      credential: SyncCredential
      authTokens: Tokens | null
      data?: unknown
    },
  ): Promise<SyncAuthenticatedResponse<T>> {
    try {
      const data = await this.requestWithBearerToken<T>(
        path,
        options.credential.syncToken,
        options.method,
        options.data,
      )
      return {
        data,
        credential: options.credential,
        authTokens: options.authTokens,
      }
    } catch (error) {
      if (!this.isUnauthorizedError(error)) {
        throw error
      }

      // A revoked sync token should not get retried forever. We clear the local
      // credential first, then attempt a one-time online re-issuance using the
      // normal auth session if that session is still recoverable.
      this.clearStoredSyncCredential()

      if (!options.authTokens) {
        throw new Error(
          'The saved sync token is no longer valid and no online session is available to renew it.',
        )
      }

      const refreshed = await this.ensureSyncCredential(
        options.authTokens,
        options.credential.businessId,
        options.credential.deviceId,
      )
      const data = await this.requestWithBearerToken<T>(
        path,
        refreshed.credential.syncToken,
        options.method,
        options.data,
      )

      return {
        data,
        credential: refreshed.credential,
        authTokens: refreshed.authTokens,
      }
    }
  }

  private async requestWithBearerToken<T>(
    path: string,
    bearerToken: string,
    method: HttpMethod = 'GET',
    data?: unknown,
  ): Promise<T> {
    try {
      const response = await this.httpClient.request<unknown>({
        url: path,
        method,
        headers: {
          Authorization: `Bearer ${bearerToken}`,
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

  private async refreshTokens(refreshToken: string, reconnectRealtime = false): Promise<Tokens> {
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
    if (reconnectRealtime) {
      void this.refreshRealtimeConnection(true)
    }
    return payload.tokens
  }

  private async ensureSyncCredential(
    authTokens: Tokens | null,
    businessId: string,
    deviceId: string,
  ): Promise<{ credential: SyncCredential; authTokens: Tokens | null }> {
    const storedCredential = this.getStoredSyncCredential()
    const authContext = authTokens ? decodeJwtPayload<JwtPayload>(authTokens.accessToken) : null
    if (
      storedCredential &&
      storedCredential.businessId === businessId &&
      storedCredential.deviceId === deviceId &&
      (!authContext?.sub || storedCredential.userId === authContext.sub)
    ) {
      return {
        credential: storedCredential,
        authTokens,
      }
    }

    if (storedCredential) {
      this.clearStoredSyncCredential()
    }

    if (!authTokens) {
      throw new Error(
        'Sync needs an existing device credential or a valid online session to mint one.',
      )
    }

    if (
      !authContext?.sub ||
      authContext.type !== 'phase2' ||
      !authContext.businessId ||
      authContext.businessId !== businessId
    ) {
      throw new Error('Sync token issuance requires a valid phase2 business session.')
    }

    const deviceIdentity: IssueSyncTokenRequest = {
      deviceId,
      deviceName: hostname(),
      platform: `${process.platform}/${process.arch}`,
      appVersion: app.getVersion(),
    }

    const response = await this.authenticatedRequest<IssueSyncTokenResponse>('/sync/token', {
      method: 'POST',
      accessToken: authTokens.accessToken,
      refreshToken: authTokens.refreshToken,
      data: deviceIdentity,
    })

    const nextCredential: SyncCredential = {
      syncToken: response.data.syncToken,
      userId: authContext.sub,
      businessId,
      deviceId: response.data.deviceId,
      issuedAt: response.data.issuedAt,
    }

    this.secureStore.set(SYNC_CREDENTIAL_KEY, JSON.stringify(nextCredential))

    return {
      credential: nextCredential,
      authTokens: response.tokens,
    }
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

  private getStoredSyncCredential(): SyncCredential | null {
    const raw = this.secureStore.get(SYNC_CREDENTIAL_KEY)
    if (!raw) {
      return null
    }

    try {
      return JSON.parse(raw) as SyncCredential
    } catch {
      this.clearStoredSyncCredential()
      return null
    }
  }

  private clearStoredSyncCredential() {
    this.secureStore.delete(SYNC_CREDENTIAL_KEY)
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

    const rows = this.db.query(
      `
        SELECT
          id,
          entity,
          operation,
          record_id,
          payload,
          status,
          attempt_count,
          created_at,
          updated_at
        FROM sync_outbox
        WHERE status IN (${placeholders})
        ORDER BY updated_at ASC, created_at ASC, id ASC
      `,
      statuses,
    ) as OutboxRow[]

    return rows
      .sort((left, right) => this.compareOutboxRowsForPush(left, right))
      .slice(0, limit)
  }

  private compareOutboxRowsForPush(left: OutboxRow, right: OutboxRow) {
    const leftEntity = OUTBOX_ENTITY_TO_SYNC_ENTITY[left.entity]
    const rightEntity = OUTBOX_ENTITY_TO_SYNC_ENTITY[right.entity]
    const tierOrder = getSyncEntityDependencyTier(leftEntity) - getSyncEntityDependencyTier(rightEntity)

    if (tierOrder !== 0) {
      return tierOrder
    }

    const updatedAtOrder = new Date(left.updated_at).getTime() - new Date(right.updated_at).getTime()
    if (updatedAtOrder !== 0) {
      return updatedAtOrder
    }

    const entityOrder = getSyncEntityStableOrder(leftEntity) - getSyncEntityStableOrder(rightEntity)
    if (entityOrder !== 0) {
      return entityOrder
    }

    const createdAtOrder = new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
    if (createdAtOrder !== 0) {
      return createdAtOrder
    }

    return left.id.localeCompare(right.id)
  }

  private readLatestFailedOutbox(): FailedOutboxRow | null {
    const [row] = this.db.query(
      `
        SELECT last_error, last_error_details
        FROM sync_outbox
        WHERE status = 'failed'
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      `,
    ) as FailedOutboxRow[]

    return row ?? null
  }

  private parseFailureDetails(raw: string | null): SyncOperationFailureDetails | null {
    if (!raw) {
      return null
    }

    try {
      return JSON.parse(raw) as SyncOperationFailureDetails
    } catch {
      return null
    }
  }

  private formatSyncFailureMessage(
    fallbackMessage: string,
    details: SyncOperationFailureDetails | null,
  ) {
    if (!details) {
      return fallbackMessage
    }

    if (details.code === 'QUOTA_EXCEEDED' && details.quota) {
      const requiredPlan = details.requiredPlan ? `${details.requiredPlan} or higher` : 'a higher plan'
      return `Sync needs a plan upgrade: ${details.quota.resource} is at ${details.quota.used}/${details.quota.limit ?? 'unlimited'}. Reconnect and move this business to ${requiredPlan} before retrying.`
    }

    if (details.code === 'PLAN_UPGRADE_REQUIRED') {
      const requiredPlan = details.requiredPlan ? `${details.requiredPlan} or higher` : 'a higher plan'
      return `Sync needs a plan upgrade before this action can be applied. Reconnect and move this business to ${requiredPlan}.`
    }

    return fallbackMessage
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
              last_error_details = NULL,
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
    const latestFailure = this.readLatestFailedOutbox()
    const status = nextStatus ?? this.deriveStatus(settings)
    const parsedFailureDetails = this.parseFailureDetails(latestFailure?.last_error_details ?? null)
    this.snapshot = {
      ...this.snapshot,
      status,
      pendingCount: this.getPendingCount(),
      lastSyncedAt,
      lastError: latestFailure?.last_error ?? (status === 'error' ? this.snapshot.lastError : null),
      lastFailureDetails:
        parsedFailureDetails ?? (status === 'error' ? this.lastRuntimeFailureDetails : null),
      network: this.network.snapshot,
      settings,
      realtime: this.resolveRealtimeSnapshot(settings),
    }
    this.emitSnapshot()
  }

  private resolveRealtimeSnapshot(settings: SyncSettings): SyncSnapshot['realtime'] {
    const tokens = this.getStoredTokens()
    const syncCredential = this.getStoredSyncCredential()
    const businessId = this.secureStore.get(LAST_BUSINESS_KEY)
    const hasMatchingSyncCredential =
      Boolean(syncCredential) && syncCredential?.businessId === businessId
    const canUseRealtime =
      !this.stopRequested &&
      settings.autoSyncEnabled &&
      Boolean(hasMatchingSyncCredential || tokens?.accessToken) &&
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

function decodeJwtPayload<T = Record<string, unknown>>(token: string): T | null {
  try {
    const [, payload] = token.split('.')
    if (!payload) {
      return null
    }

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8')) as T
  } catch {
    return null
  }
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
