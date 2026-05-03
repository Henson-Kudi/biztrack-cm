import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator'
import { PaymentMethod, SaleStatus, type SalesQuery } from '@biztrack/types'
import { ListQueryDto } from '@/common/dto/list-query.dto'

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

export class ListSalesQueryDto extends ListQueryDto implements SalesQuery {
  @ApiPropertyOptional({ example: '2026-04-23' })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX)
  dateFrom?: string

  @ApiPropertyOptional({ example: '2026-04-23' })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX)
  dateTo?: string

  @ApiPropertyOptional({ enum: SaleStatus })
  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  cashierId?: string

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod
}
