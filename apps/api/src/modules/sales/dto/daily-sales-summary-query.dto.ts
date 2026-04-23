import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, Matches } from 'class-validator'

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

export class DailySalesSummaryQueryDto {
  @ApiPropertyOptional({ example: '2026-04-23' })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX)
  date?: string
}
