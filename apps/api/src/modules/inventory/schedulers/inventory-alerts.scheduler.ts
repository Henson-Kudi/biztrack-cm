import { Inject, Injectable, OnModuleInit } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import type { Logger } from '@biztrack/logger'
import type { Queue } from 'bullmq'
import { LOGGER } from '@/logger/logger.module'
import {
  INVENTORY_ALERTS_QUEUE,
  INVENTORY_LOW_STOCK_CRON_PATTERN,
  INVENTORY_LOW_STOCK_SCAN_JOB,
  INVENTORY_LOW_STOCK_TIMEZONE,
} from '../constants/inventory.constants'

@Injectable()
export class InventoryAlertsScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(INVENTORY_ALERTS_QUEUE)
    private readonly queue: Queue,
    @Inject(LOGGER) private readonly logger: Logger,
  ) { }

  async onModuleInit(): Promise<void> {
    // First, we clean up any existing repeatable jobs to avoid duplicates in case of restarts
    await this.queue.remove(INVENTORY_LOW_STOCK_SCAN_JOB);

    // Then we add the repeatable job for scanning low stock items daily at the specified time
    await this.queue.add(
      INVENTORY_LOW_STOCK_SCAN_JOB,
      {
        requestedAt: new Date().toISOString(),
        triggeredBy: 'scheduler',
      },
      {
        repeat: {
          pattern: INVENTORY_LOW_STOCK_CRON_PATTERN,
          tz: INVENTORY_LOW_STOCK_TIMEZONE,
        },
      },
    )

    this.logger.log('Registered inventory low-stock repeatable job', 'InventoryAlertsScheduler', {
      queue: INVENTORY_ALERTS_QUEUE,
      pattern: INVENTORY_LOW_STOCK_CRON_PATTERN,
      timeZone: INVENTORY_LOW_STOCK_TIMEZONE,
    })
  }
}
