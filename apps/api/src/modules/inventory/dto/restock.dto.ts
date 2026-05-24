import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { PaymentMethod, type RestockItemRequest, type RestockPaymentRequest, type RestockRequest } from '@biztrack/types'

const RESTOCK_PAYMENT_METHODS = [
  PaymentMethod.CASH,
  PaymentMethod.MTN_MOMO,
  PaymentMethod.ORANGE_MONEY,
  PaymentMethod.CARD,
] as const

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

export class RestockPaymentDto implements RestockPaymentRequest {
  @ApiProperty({ enum: RESTOCK_PAYMENT_METHODS })
  @IsIn(RESTOCK_PAYMENT_METHODS)
  method!: PaymentMethod

  @ApiProperty({ example: 5000 })
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount!: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mobileMoneyReference?: string
}

export class RestockDto implements RestockRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierName?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  totalAmount?: number

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

  @ApiPropertyOptional({ type: [RestockPaymentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RestockPaymentDto)
  payments?: RestockPaymentDto[]

  @ApiProperty({ type: [RestockItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RestockItemDto)
  items!: RestockItemDto[]
}
