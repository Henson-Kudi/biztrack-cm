export type IsoDateString = string

export interface ApiResponse<T> {
  success: boolean
  data?: T
  message?: string
  requestId: string
  timestamp: IsoDateString
}

export interface ApiErrorResponse {
  success: false
  message: string
  error: {
    code: string
    details?: unknown
  }
  requestId: string
  timestamp: IsoDateString
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export type SortOrder = 'ASC' | 'DESC'

export interface ListQuery {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: SortOrder
  search?: string
}
