'use client'

import type { ApiErrorResponse, ApiResponse } from '@biztrack/types'

export type ApiEnvelope<T> = ApiResponse<T>

export function unwrapApiResponse<T>(payload: ApiEnvelope<T> | T): T {
  if (payload && typeof payload === 'object' && 'success' in (payload as object)) {
    return (payload as ApiEnvelope<T>).data as T
  }

  return payload as T
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  return (
    getApiErrorResponse(error)?.message ??
    (error instanceof Error ? error.message : undefined) ??
    fallback
  )
}

export function getApiErrorDetails<T>(error: unknown): T | undefined {
  return getApiErrorResponse(error)?.error.details as T | undefined
}

function getApiErrorResponse(error: unknown): ApiErrorResponse | undefined {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return undefined
  }

  const response = (error as { response?: { data?: unknown } }).response?.data
  if (!response || typeof response !== 'object' || !('success' in response)) {
    return undefined
  }

  return response as ApiErrorResponse
}
