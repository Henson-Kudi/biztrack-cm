import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator'
import type { RestockItemRequest, RestockRequest } from '@biztrack/types'

export class RestockItemDto implements RestockItemRequest {
  @ApiProperty()
  @IsUUID()
  productId!: string

  @ApiProperty({ example: 12 })
  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  quantity!: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitCost?: number
}

export class RestockDto implements RestockRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceNumber?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierName?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  totalCost?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string

  @ApiProperty({ type: [RestockItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RestockItemDto)
  items!: RestockItemDto[]
}
