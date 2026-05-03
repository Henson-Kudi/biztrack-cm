import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsOptional, IsInt, Min, Max, IsString, IsIn } from 'class-validator'
import type { ListQuery } from '@biztrack/types'

/**
 * Base query DTO for all list endpoints
 * Provides consistent pagination, sorting, and search structure
 *
 * All modules should extend this DTO to add their own filters
 *
 * @example
 * // Simple usage
 * GET /api/products?page=1&limit=20
 *
 * // With sorting
 * GET /api/products?page=1&limit=20&sortBy=name&sortOrder=DESC
 *
 * // With search
 * GET /api/products?search=iPhone&page=1&limit=20
 */
export class ListQueryDto implements ListQuery {
  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    example: 1,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  @ApiPropertyOptional({
    description: 'Items per page (1-100, default: 20)',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20

  @ApiPropertyOptional({
    description: 'Field name to sort by. Must be defined by module-specific DTO.',
    example: 'name',
  })
  @IsOptional()
  @IsString()
  sortBy?: string

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['ASC', 'DESC'],
    default: 'ASC',
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC'

  @ApiPropertyOptional({
    description: 'Search term (full-text search across module-specific fields)',
    example: 'search term',
  })
  @IsOptional()
  @IsString()
  search?: string
}
