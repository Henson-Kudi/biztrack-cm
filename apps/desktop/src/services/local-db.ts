'use client'

import type { PaginatedResult, SortOrder } from '@biztrack/types'
import { ipc } from './ipc.bridge'

export type DbOperation = {
  sql: string
  params?: unknown[]
}

export async function dbQuery<T>(sql: string, params?: unknown[]) {
  return (await ipc.db.query(sql, params)) as T[]
}

export async function dbRun(sql: string, params?: unknown[]) {
  return ipc.db.run(sql, params)
}

export async function dbBatch(operations: DbOperation[]) {
  return ipc.db.batch(operations)
}

export function paginateResult<T>(
  items: T[],
  page = 1,
  limit = 20,
): PaginatedResult<T> {
  const safePage = Math.max(1, page || 1)
  const safeLimit = Math.max(1, limit || 20)
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / safeLimit))
  const start = (safePage - 1) * safeLimit

  return {
    data: items.slice(start, start + safeLimit),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages,
  }
}

export function normalizeSortOrder(order?: SortOrder): SortOrder {
  return order === 'ASC' ? 'ASC' : 'DESC'
}

export function compareValues(
  left: string | number | boolean | null | undefined,
  right: string | number | boolean | null | undefined,
  order: SortOrder,
) {
  const direction = order === 'ASC' ? 1 : -1

  if (left == null && right == null) return 0
  if (left == null) return 1
  if (right == null) return -1

  if (typeof left === 'string' && typeof right === 'string') {
    return left.localeCompare(right) * direction
  }

  if (left > right) return 1 * direction
  if (left < right) return -1 * direction
  return 0
}
