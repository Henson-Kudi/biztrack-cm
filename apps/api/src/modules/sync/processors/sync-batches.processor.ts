import { Inject, Injectable } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import { SYNC_BATCHES_QUEUE, SYNC_PROCESS_BATCH_JOB, type SyncProcessBatchJobData } from '../constants/sync.constants'
import { SyncService } from '../sync.service'

@Injectable()
@Processor(SYNC_BATCHES_QUEUE)
export class SyncBatchesProcessor extends WorkerHost {
  constructor(
    private readonly syncService: SyncService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    super()
  }

  async process(job: Job<SyncProcessBatchJobData>): Promise<unknown> {
    if (job.name !== SYNC_PROCESS_BATCH_JOB) {
      this.logger.warn('Skipping unknown sync job', 'SyncBatchesProcessor', {
        jobId: job.id,
        jobName: job.name,
      })

      return {
        status: 'skipped',
        reason: 'unknown_job',
      }
    }

    this.logger.log('Processing sync batch job', 'SyncBatchesProcessor', {
      queue: SYNC_BATCHES_QUEUE,
      jobId: job.id,
      batchId: job.data.batchId,
      attemptsMade: job.attemptsMade,
    })

    await this.syncService.processBatch(job.data.batchId)

    return {
      status: 'processed',
      batchId: job.data.batchId,
    }
  }
}
