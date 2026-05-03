import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsUUID, IsBoolean } from 'class-validator'
import { Transform } from 'class-transformer'
import type { ProductsQuery } from '@biztrack/types'
import { ListQueryDto } from '@/common/dto/list-query.dto'

function toBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return value as boolean
}

/**
 * Query DTO for listing products
 * Extends ListQueryDto with product-specific filters
 *
 * @example
 * GET /api/products?categoryId=uuid&isActive=true&page=1&limit=20&sortBy=name&search=iPhone
 */
export class ListProductsQueryDto extends ListQueryDto implements ProductsQuery {
  @ApiPropertyOptional({
    description: 'Filter by product category ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string

  @ApiPropertyOptional({
    description: 'Filter by active status',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  isActive?: boolean

  @ApiPropertyOptional({
    description: 'Filter by service flag (service vs product)',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  isService?: boolean

  @ApiPropertyOptional({
    description: 'Filter by inventory tracking status',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  trackInventory?: boolean
}
