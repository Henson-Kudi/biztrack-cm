import { ApiProperty } from '@nestjs/swagger'
import { DebtDirection, type UpsertOpeningBalanceRequest } from '@biztrack/types'
import { IsEnum, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator'

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

export class UpsertOpeningBalanceDto implements UpsertOpeningBalanceRequest {
  @ApiProperty({ enum: DebtDirection })
  @IsEnum(DebtDirection)
  direction!: DebtDirection

  @ApiProperty({ example: 50000 })
  @IsNumber()
  @Min(0.01)
  amount!: number

  @ApiProperty({ example: '2026-01-01' })
  @Matches(DATE_ONLY_REGEX)
  asOfDate!: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string
}
