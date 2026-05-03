import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import type { CreateProductRequest } from '@biztrack/types'

export class CreateProductDto implements CreateProductRequest {
  @ApiProperty({ example: 'Coca-Cola 50cl' })
  @IsString()
  @MaxLength(200)
  name!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  @ApiPropertyOptional({ example: 'COKE-50CL' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string

  @ApiPropertyOptional({ example: '5449000000996' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string

  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  sellingPrice!: number

  @ApiPropertyOptional({ example: 350 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  costPrice?: number

  @ApiPropertyOptional({ example: 19.25, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  taxRate?: number

  @ApiPropertyOptional({ example: 100, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  openingStock?: number

  @ApiPropertyOptional({ example: 10, default: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  lowStockThreshold?: number

  @ApiProperty()
  @IsUUID()
  unitOfMeasureId!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isService?: boolean

  @ApiPropertyOptional({ description: 'Defaults to false for services and true for physical products.' })
  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
