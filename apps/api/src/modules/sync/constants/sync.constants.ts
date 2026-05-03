export const SYNC_BATCHES_QUEUE = 'sync-batches'
export const SYNC_PROCESS_BATCH_JOB = 'sync-process-batch'
export const SYNC_BATCH_MAX_OPERATIONS = 100
export const SYNC_REALTIME_PATH = '/api/v1/sync/events'
export const SYNC_BATCH_RECOVERY_INTERVAL_MS = 60_000
export const SYNC_BATCH_RECOVERY_STALE_AFTER_MS = 30_000

export interface SyncProcessBatchJobData {
  batchId: string
}
