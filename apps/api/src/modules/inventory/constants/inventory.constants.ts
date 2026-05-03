import type { InventoryAlert } from '@biztrack/types'

export const INVENTORY_ALERTS_QUEUE = 'inventory-alerts'
export const INVENTORY_LOW_STOCK_SCAN_JOB = 'inventory-low-stock-daily-scan'
export const INVENTORY_LOW_STOCK_DISPATCH_JOB = 'inventory-low-stock-business-dispatch'
export const INVENTORY_LOW_STOCK_CRON_PATTERN = '0 8 * * *'
export const INVENTORY_LOW_STOCK_TIMEZONE = 'Africa/Douala'
export const INVENTORY_LOW_STOCK_ALERT_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60

export interface InventoryLowStockScanJobData {
  requestedAt: string
  triggeredBy: 'scheduler'
}

export interface InventoryLowStockDispatchJobData {
  businessId: string
  requestedAt: string
  sourceJobId?: string | null
}

export interface InventoryLowStockAlertDigest {
  generatedAt: string
  businessId: string
  businessName: string
  owner: {
    userId: string
    name: string
    email: string | null
    phone: string | null
  } | null
  alerts: InventoryAlert[]
}
