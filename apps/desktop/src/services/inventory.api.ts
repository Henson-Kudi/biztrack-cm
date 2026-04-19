'use client'

import { api } from './api'
import type {
  AdjustInventoryRequest,
  InventoryAlert,
  InventoryAlertsQuery,
  InventoryDetail,
  InventoryListItem,
  InventoryQuery,
  PaginatedResult,
  RestockRequest,
  RestockResponse,
  SetInventoryThresholdRequest,
} from '@biztrack/types'
import { type ApiEnvelope, unwrapApiResponse } from './api-response'

export async function listInventory(
  query: InventoryQuery,
): Promise<PaginatedResult<InventoryListItem>> {
  const { data } = await api.get<ApiEnvelope<PaginatedResult<InventoryListItem>>>('/inventory', {
    params: { ...query },
  })
  return unwrapApiResponse<PaginatedResult<InventoryListItem>>(data)
}

export async function listInventoryAlerts(
  query: InventoryAlertsQuery,
): Promise<PaginatedResult<InventoryAlert>> {
  const { data } = await api.get<ApiEnvelope<PaginatedResult<InventoryAlert>>>(
    '/inventory/alerts',
    {
      params: { ...query },
    },
  )
  return unwrapApiResponse<PaginatedResult<InventoryAlert>>(data)
}

export async function getInventoryDetail(productId: string): Promise<InventoryDetail> {
  const { data } = await api.get<ApiEnvelope<InventoryDetail>>(`/inventory/${productId}`)
  return unwrapApiResponse<InventoryDetail>(data)
}

export async function setInventoryThreshold(
  productId: string,
  payload: SetInventoryThresholdRequest,
): Promise<InventoryDetail> {
  const { data } = await api.patch<ApiEnvelope<InventoryDetail>>(
    `/inventory/${productId}/threshold`,
    payload,
  )
  return unwrapApiResponse<InventoryDetail>(data)
}

export async function adjustInventory(
  productId: string,
  payload: AdjustInventoryRequest,
): Promise<InventoryDetail> {
  const { data } = await api.post<ApiEnvelope<InventoryDetail>>(
    `/inventory/${productId}/adjust`,
    payload,
  )
  return unwrapApiResponse<InventoryDetail>(data)
}

export async function restockInventory(payload: RestockRequest): Promise<RestockResponse> {
  const { data } = await api.post<ApiEnvelope<RestockResponse>>('/inventory/restock', payload)
  return unwrapApiResponse<RestockResponse>(data)
}
