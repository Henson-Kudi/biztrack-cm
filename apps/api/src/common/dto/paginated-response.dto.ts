import { ApiProperty } from '@nestjs/swagger'
import type { PaginatedResult } from '@biztrack/types'

/**
 * Generic paginated response structure
 * Used to wrap list endpoint responses with pagination metadata
 *
 * @template T The type of items in the response
 *
 * @example
 * {
 *   "data": [...],
 *   "total": 156,
 *   "page": 1,
 *   "limit": 20,
 *   "totalPages": 8
 * }
 */
export class PaginatedResponseDto<T = unknown> implements PaginatedResult<T> {
  @ApiProperty({
    description: 'Array of items',
    isArray: true,
  })
  data: T[]

  @ApiProperty({
    description: 'Total number of records matching the query',
    example: 156,
  })
  total: number

  @ApiProperty({
    description: 'Current page number (1-indexed)',
    example: 1,
  })
  page: number

  @ApiProperty({
    description: 'Number of items per page',
    example: 20,
  })
  limit: number

  @ApiProperty({
    description: 'Total number of pages',
    example: 8,
  })
  totalPages: number

  constructor(data: T[], total: number, page: number, limit: number) {
    this.data = data
    this.total = total
    this.page = page
    this.limit = limit
    this.totalPages = Math.ceil(total / limit)
  }
}
