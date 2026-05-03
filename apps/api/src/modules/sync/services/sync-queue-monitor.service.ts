import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import type { Logger } from '@biztrack/logger'
import type { Queue } from 'bullmq'
import { LOGGER } from '@/logger/logger.module'
import { RedisService } from '@/common/redis/redis.service'
import {
  SYNC_BATCHES_QUEUE,
  SYNC_BATCH_RECOVERY_INTERVAL_MS,
} from '../constants/sync.constants'
import { SyncService } from '../sync.service'

@Injectable()
export class SyncQueueMonitorService implements OnModuleInit, OnModuleDestroy {
  private recoveryInterval: NodeJS.Timeout | null = null

  constructor(
    @InjectQueue(SYNC_BATCHES_QUEUE)
    private readonly queue: Queue,
    private readonly redis: RedisService,
    private readonly syncService: SyncService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const client = await this.queue.client
      this.logger.log('Sync Bull queue is ready', 'SyncQueueMonitorService', {
        queue: this.queue.name,
        redisConfigured: this.redis.getConnectionState().configured,
        redisStatus: this.redis.getConnectionState().status,
        bullClientStatus: (client as { status?: string }).status ?? 'unknown',
      })

      this.recoveryInterval = setInterval(() => {
        void this.runRecoverySweep()
      }, SYNC_BATCH_RECOVERY_INTERVAL_MS)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error('Sync Bull queue failed to initialize', 'SyncQueueMonitorService', {
        queue: this.queue.name,
        redisConfigured: this.redis.getConnectionState().configured,
        redisStatus: this.redis.getConnectionState().status,
        message,
      })
    }
  }

  onModuleDestroy(): void {
    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval)
      this.recoveryInterval = null
    }
  }

  private async runRecoverySweep(): Promise<void> {
    try {
      await this.syncService.recoverNonTerminalBatches()
    } catch (error) {
      this.logger.warn('Sync batch recovery sweep failed', 'SyncQueueMonitorService', {
        queue: this.queue.name,
        message: error instanceof Error ? error.message : 'Unknown recovery error',
      })
    }
  }
}
