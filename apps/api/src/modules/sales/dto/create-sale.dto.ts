import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { PaymentMethod, type CreateSaleItemRequest, type CreateSalePaymentRequest, type CreateSaleRequest } from '@biztrack/types'

const CREATE_SALE_PAYMENT_METHODS = [
  PaymentMethod.CASH,
  PaymentMethod.MTN_MOMO,
  PaymentMethod.ORANGE_MONEY,
  PaymentMethod.CARD,
] as const

export class CreateSalePaymentDto implements CreateSalePaymentRequest {
  @ApiProperty({ enum: CREATE_SALE_PAYMENT_METHODS })
  @IsIn(CREATE_SALE_PAYMENT_METHODS)
  method!: PaymentMethod

  @ApiProperty({ example: 5000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mobileMoneyReference?: string
}

export class CreateSaleItemDto implements CreateSaleItemRequest {
  @ApiProperty()
  @IsUUID()
  productId!: string

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number

  @ApiProperty({ example: 500 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number

  @ApiPropertyOptional({ example: 250 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPrice?: number
}

export class CreateSaleDto implements CreateSaleRequest {
  @ApiProperty()
  @IsUUID()
  clientId!: string

  @ApiProperty({ example: '2026-04-23T13:45:00.000Z' })
  @IsDateString()
  soldAt!: string

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string

  @ApiPropertyOptional({ maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerPhone?: string

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number

  @ApiProperty({ type: [CreateSalePaymentDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalePaymentDto)
  payments!: CreateSalePaymentDto[]

  @ApiProperty({ type: [CreateSaleItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[]
}
