import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { JwtPayload, SyncBatchStatusResponse, SyncPullResponse, SyncPushResponse } from '@biztrack/types'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '../auth/guards/phase2.guard'
import { PullSyncQueryDto } from './dto/pull-sync-query.dto'
import { PushSyncBatchDto } from './dto/push-sync-batch.dto'
import { SyncService } from './sync.service'

@ApiTags('Sync')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('batches')
  @ApiOperation({
    summary: 'Queue a sync push batch',
    description: 'Stores client sync operations and queues background processing.',
  })
  pushBatch(@CurrentUser() user: JwtPayload, @Body() dto: PushSyncBatchDto): Promise<SyncPushResponse> {
    return this.syncService.enqueueBatch(user.businessId as string, user, dto)
  }

  @Get('batches/:batchId')
  @ApiOperation({ summary: 'Get sync batch processing status' })
  async getBatchStatus(
    @CurrentUser() user: JwtPayload,
    @Param('batchId') batchId: string,
  ): Promise<SyncBatchStatusResponse> {
    return await this.syncService.getBatchStatus(user.businessId as string, batchId)
  }

  @Get('pull')
  @ApiOperation({
    summary: 'Pull server-side catalog changes',
    description: 'Returns products, categories, and units changed since the provided cursor.',
  })
  pullChanges(
    @CurrentUser() user: JwtPayload,
    @Query() query: PullSyncQueryDto,
  ): Promise<SyncPullResponse> {
    return this.syncService.pullChanges(user.businessId as string, query.cursor ?? null, query.limit)
  }
}
