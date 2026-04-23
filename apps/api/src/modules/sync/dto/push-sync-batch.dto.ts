import { Type } from 'class-transformer'
import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
enum SyncEntityDto {
  PRODUCT = 'product',
  PRODUCT_CATEGORY = 'product_category',
  UNIT_OF_MEASURE = 'unit_of_measure',
  INVENTORY_THRESHOLD = 'inventory_threshold',
  INVENTORY_ADJUSTMENT = 'inventory_adjustment',
  INVENTORY_RESTOCK = 'inventory_restock',
  SALE = 'sale',
}

enum SyncActionDto {
  UPSERT = 'UPSERT',
  DELETE = 'DELETE',
}

export class SyncPushOperationDto {
  @ApiProperty()
  @IsUUID()
  operationId!: string

  @ApiProperty({ enum: SyncEntityDto })
  @IsEnum(SyncEntityDto)
  entity!: SyncEntityDto

  @ApiProperty({ enum: SyncActionDto })
  @IsEnum(SyncActionDto)
  action!: SyncActionDto

  @ApiProperty()
  @IsUUID()
  recordId!: string

  @ApiProperty()
  @IsISO8601()
  updatedAt!: string

  @ApiPropertyOptional({ type: 'object', nullable: true, additionalProperties: true })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown> | null
}

export class PushSyncBatchDto {
  @ApiProperty()
  @IsString()
  deviceId!: string

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601()
  baseCursor!: string | null

  @ApiProperty({ type: [SyncPushOperationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncPushOperationDto)
  operations!: SyncPushOperationDto[]
}
