import { Type } from 'class-transformer'
import { IsISO8601, IsInt, IsOptional, Max, Min } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class PullSyncQueryDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601()
  cursor?: string | null

  @ApiPropertyOptional({ default: 250 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number
}
