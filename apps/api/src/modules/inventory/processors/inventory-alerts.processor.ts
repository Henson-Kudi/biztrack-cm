import { Inject, Injectable } from '@nestjs/common'
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq'
import type { Logger } from '@biztrack/logger'
import type { Job, Queue } from 'bullmq'
import { RedisService } from '@/common/redis/redis.service'
import { LOGGER } from '@/logger/logger.module'
import {
  INVENTORY_ALERTS_QUEUE,
  INVENTORY_LOW_STOCK_ALERT_CACHE_TTL_SECONDS,
  INVENTORY_LOW_STOCK_DISPATCH_JOB,
  INVENTORY_LOW_STOCK_SCAN_JOB,
  INVENTORY_LOW_STOCK_TIMEZONE,
  type InventoryLowStockDispatchJobData,
  type InventoryLowStockScanJobData,
} from '../constants/inventory.constants'
import { InventoryService } from '../services/inventory.service'

type InventoryAlertsJobData = InventoryLowStockScanJobData | InventoryLowStockDispatchJobData

@Injectable()
@Processor(INVENTORY_ALERTS_QUEUE)
export class InventoryAlertsProcessor extends WorkerHost {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly redis: RedisService,
    @InjectQueue(INVENTORY_ALERTS_QUEUE)
    private readonly queue: Queue,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    super()
  }

  async process(job: Job<InventoryAlertsJobData>): Promise<unknown> {
    if (job.name === INVENTORY_LOW_STOCK_SCAN_JOB) {
      return this.processDailyScan(job as Job<InventoryLowStockScanJobData>)
    }

    if (job.name === INVENTORY_LOW_STOCK_DISPATCH_JOB) {
      return this.processBusinessDispatch(job as Job<InventoryLowStockDispatchJobData>)
    }

    this.logger.warn('Skipping unknown inventory alerts job', 'InventoryAlertsProcessor', {
      jobId: job.id,
      jobName: job.name,
    })

    return {
      status: 'skipped',
      reason: 'unknown_job',
      jobName: job.name,
    }
  }

  private async processDailyScan(job: Job<InventoryLowStockScanJobData>) {
    const businessIds = await this.inventoryService.findBusinessIdsWithLowStockAlerts()
    const dayKey = this.formatDayKey(new Date())

    for (const businessId of businessIds) {
      await this.queue.add(
        INVENTORY_LOW_STOCK_DISPATCH_JOB,
        {
          businessId,
          requestedAt: new Date().toISOString(),
          sourceJobId: job.id ?? null,
        },
        {
          jobId: `${INVENTORY_LOW_STOCK_DISPATCH_JOB}-${businessId}-${dayKey}`,
        },
      )
    }

    this.logger.log('Queued low-stock business alert jobs', 'InventoryAlertsProcessor', {
      sourceJobId: job.id,
      businessCount: businessIds.length,
    })

    return {
      status: 'queued',
      businessCount: businessIds.length,
    }
  }

  private async processBusinessDispatch(job: Job<InventoryLowStockDispatchJobData>) {
    const digest = await this.inventoryService.buildLowStockAlertDigest(job.data.businessId)

    if (!digest) {
      return {
        status: 'skipped',
        businessId: job.data.businessId,
        reason: 'no_low_stock_alerts',
      }
    }

    await this.redis.setex(
      `inventory:low-stock:last-run:${digest.businessId}`,
      INVENTORY_LOW_STOCK_ALERT_CACHE_TTL_SECONDS,
      JSON.stringify(digest),
    )

    this.logger.warn('Prepared low-stock alert digest', 'InventoryAlertsProcessor', {
      businessId: digest.businessId,
      businessName: digest.businessName,
      ownerId: digest.owner?.userId ?? null,
      alertCount: digest.alerts.length,
    })

    return {
      status: 'prepared',
      businessId: digest.businessId,
      alertCount: digest.alerts.length,
      ownerId: digest.owner?.userId ?? null,
    }
  }

  private formatDayKey(date: Date): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: INVENTORY_LOW_STOCK_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })

    return formatter.format(date)
  }
}
