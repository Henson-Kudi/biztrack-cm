import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsUUID, Matches } from 'class-validator'

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

export class CashierSummaryQueryDto {
  @ApiPropertyOptional({ example: '2026-05-27' })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX)
  date?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  cashierId?: string
}
