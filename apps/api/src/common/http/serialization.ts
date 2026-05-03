import type { PaginatedResult } from '@biztrack/types'
import { instanceToPlain } from 'class-transformer'

export function toIsoString(value?: Date | string | number | null): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number') return new Date(value).toISOString()
  return value.toISOString()
}

export function mapPaginatedResult<TInput, TOutput>(
  result: {
    data: TInput[]
    total: number
    page: number
    limit: number
    totalPages?: number
  },
  mapper: (item: TInput) => TOutput,
): PaginatedResult<TOutput> {
  return {
    data: result.data.map(mapper),
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages ?? Math.ceil(result.total / result.limit),
  }
}

export function serializeDto<T>(dto: T): T {
  return instanceToPlain(dto, {
    exposeUnsetFields: false,
  }) as T
}

export function serializeDtos<TInput, TOutput>(
  items: TInput[],
  mapper: (item: TInput) => TOutput,
): TOutput[] {
  return items.map((item) => serializeDto(mapper(item)))
}

export function serializePaginatedResult<TInput, TOutput>(
  result: {
    data: TInput[]
    total: number
    page: number
    limit: number
    totalPages?: number
  },
  mapper: (item: TInput) => TOutput,
): PaginatedResult<TOutput> {
  return mapPaginatedResult(result, (item) => serializeDto(mapper(item)))
}
