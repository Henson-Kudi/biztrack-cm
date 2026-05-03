import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsNumber, IsString, Min, MinLength } from 'class-validator'
import { StockAdjustmentType, type AdjustInventoryRequest } from '@biztrack/types'

export { StockAdjustmentType }

export class AdjustStockDto implements AdjustInventoryRequest {
  @ApiProperty({ enum: StockAdjustmentType })
  @IsEnum(StockAdjustmentType)
  type!: StockAdjustmentType

  @ApiProperty({ example: 5 })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  quantity!: number

  @ApiProperty({ example: 'Physical count correction' })
  @IsString()
  @MinLength(3)
  notes!: string
}
