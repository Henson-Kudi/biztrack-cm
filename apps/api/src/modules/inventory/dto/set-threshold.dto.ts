import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsNumber, IsOptional, Min } from 'class-validator'
import type { SetInventoryThresholdRequest } from '@biztrack/types'

export class SetThresholdDto implements SetInventoryThresholdRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  lowStockThreshold?: number | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  reorderPoint?: number | null
}
