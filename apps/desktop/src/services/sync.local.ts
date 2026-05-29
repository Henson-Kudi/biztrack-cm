'use client'

import type { DbOperation } from './local-db'
import { hasDesktopIpc, ipc } from './ipc.bridge'

export type SyncEntity =
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

export function buildOutboxUpsertOperation(
  entity: SyncEntity,
  recordId: string,
  payload?: unknown,
): DbOperation {
  const now = new Date().toISOString()

  return {
    sql: `
      INSERT INTO sync_outbox (
        id,
        entity,
        record_id,
        operation,
        payload,
        status,
        attempt_count,
        last_attempt_at,
        last_error,
        last_error_details,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, 'UPSERT', ?, 'pending', 0, NULL, NULL, NULL, ?, ?)
      ON CONFLICT(entity, record_id) DO UPDATE SET
        payload = excluded.payload,
        status = 'pending',
        last_error = NULL,
        last_error_details = NULL,
        updated_at = excluded.updated_at
    `,
    params: [
      crypto.randomUUID(),
      entity,
      recordId,
      payload ? JSON.stringify(payload) : null,
      now,
      now,
    ],
  }
}

export function buildOutboxEventOperation(
  entity: Extract<
    SyncEntity,
    | 'contacts'
    | 'openingBalances'
    | 'inventoryAdjustments'
    | 'inventoryRestocks'
    | 'debts'
    | 'sales'
    | 'savings'
    | 'savingsTransactions'
  >,
  recordId: string,
  payload: unknown,
): DbOperation {
  return buildOutboxUpsertOperation(entity, recordId, payload)
}

export function buildOutboxDeleteOperation(
  entity: SyncEntity,
  recordId: string,
): DbOperation {
  const now = new Date().toISOString()
  return {
    sql: `
      INSERT INTO sync_outbox (
        id, entity, record_id, operation, payload, status, attempt_count, last_attempt_at, last_error, last_error_details, created_at, updated_at
      ) VALUES (?, ?, ?, 'DELETE', NULL, 'pending', 0, NULL, NULL, NULL, ?, ?)
      ON CONFLICT(entity, record_id) DO UPDATE SET
        operation = 'DELETE',
        payload = NULL,
        status = 'pending',
        last_error = NULL,
        last_error_details = NULL,
        updated_at = excluded.updated_at
    `,
    params: [crypto.randomUUID(), entity, recordId, now, now],
  }
}

let backgroundSyncTimeout: ReturnType<typeof setTimeout> | null = null

export function requestBackgroundSync(delayMs = 600) {
  if (!hasDesktopIpc()) {
    return
  }

  if (backgroundSyncTimeout) {
    clearTimeout(backgroundSyncTimeout)
  }

  backgroundSyncTimeout = setTimeout(() => {
    backgroundSyncTimeout = null
    const nudge = (ipc.sync as { nudge?: () => Promise<unknown> }).nudge
    if (typeof nudge !== 'function') {
      return
    }

    void nudge().catch(() => {
      // Best-effort hint only. Fallback polling will retry if realtime sync is unavailable.
    })
  }, delayMs)
}
