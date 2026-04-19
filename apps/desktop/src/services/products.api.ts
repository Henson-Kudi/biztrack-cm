'use client'

import { api } from './api'
import type {
  CreateProductRequest,
  LowStockProduct,
  PaginatedResult,
  Product,
  ProductCategory,
  ProductsQuery,
  UnitOfMeasure,
  UnitOfMeasuresQuery,
} from '@biztrack/types'
import { type ApiEnvelope, unwrapApiResponse } from './api-response'

export async function listProducts(query: ProductsQuery): Promise<PaginatedResult<Product>> {
  const { data } = await api.get<ApiEnvelope<PaginatedResult<Product>>>('/products', {
    params: { ...query },
  })
  return unwrapApiResponse<PaginatedResult<Product>>(data)
}

export async function createProduct(payload: CreateProductRequest): Promise<Product> {
  const { data } = await api.post<ApiEnvelope<Product>>('/products', payload)
  return unwrapApiResponse<Product>(data)
}

export async function listCategories(): Promise<PaginatedResult<ProductCategory>> {
  const { data } = await api.get<ApiEnvelope<PaginatedResult<ProductCategory>>>(
    '/products/categories',
    {
      params: {
        page: 1,
        limit: 100,
        sortBy: 'name',
        sortOrder: 'ASC',
      },
    },
  )
  return unwrapApiResponse<PaginatedResult<ProductCategory>>(data)
}

export async function listUnitOfMeasures(
  query: UnitOfMeasuresQuery = {
    page: 1,
    limit: 100,
  },
): Promise<PaginatedResult<UnitOfMeasure>> {
  const { data } = await api.get<ApiEnvelope<PaginatedResult<UnitOfMeasure>>>(
    '/unit-of-measures',
    {
      params: { ...query },
    },
  )
  return unwrapApiResponse<PaginatedResult<UnitOfMeasure>>(data)
}

export async function listLowStockProducts(): Promise<LowStockProduct[]> {
  const { data } = await api.get<ApiEnvelope<LowStockProduct[]>>('/products/low-stock')
  return unwrapApiResponse<LowStockProduct[]>(data)
}
