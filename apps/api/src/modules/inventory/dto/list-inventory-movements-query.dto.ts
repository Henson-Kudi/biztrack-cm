import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator'
import type { InventoryMovementsQuery } from '@biztrack/types'
import { InventoryMovementType } from '@biztrack/types'
import { ListQueryDto } from '@/common/dto/list-query.dto'

function toUndefined(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  return value
}

export class ListInventoryMovementsQueryDto
  extends ListQueryDto
  implements InventoryMovementsQuery
{
  @ApiPropertyOptional({ description: 'Filter by product id for cross-product movement history.' })
  @IsOptional()
  @IsUUID()
  productId?: string

  @ApiPropertyOptional({ enum: InventoryMovementType })
  @IsOptional()
  @Transform(({ value }) => toUndefined(value))
  @IsEnum(InventoryMovementType)
  type?: InventoryMovementType

  @ApiPropertyOptional({ description: 'Inclusive lower bound for movement creation date.' })
  @IsOptional()
  @Transform(({ value }) => toUndefined(value))
  @IsDateString()
  dateFrom?: string

  @ApiPropertyOptional({ description: 'Inclusive upper bound for movement creation date.' })
  @IsOptional()
  @Transform(({ value }) => toUndefined(value))
  @IsDateString()
  dateTo?: string
}
