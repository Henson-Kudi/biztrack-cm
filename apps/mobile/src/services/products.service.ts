import apiClient from './apiClient'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProductCategory {
  id: string
  name: string
  businessId: string
  createdAt: string
  updatedAt: string
}

export interface Product {
  id: string
  name: string
  description?: string
  sku?: string
  barcode?: string
  price: number
  costPrice?: number
  stockQuantity: number
  lowStockThreshold: number
  unit: string
  categoryId?: string
  category?: ProductCategory
  isActive: boolean
  businessId: string
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

// Fields left optional because the backend provides defaults (unit='piece',
// lowStockThreshold=5, isActive=true). Align with backend DTO if these
// defaults are removed in the future.
export type CreateProductPayload = {
  name: string
  price: number
  description?: string
  sku?: string
  barcode?: string
  costPrice?: number
  stockQuantity?: number
  lowStockThreshold?: number
  unit?: string
  categoryId?: string
  isActive?: boolean
}

export type UpdateProductPayload = Partial<CreateProductPayload>

// ─── Product endpoints ────────────────────────────────────────────────────────

export const getProducts = (categoryId?: string) =>
  apiClient.get<Product[]>('/products', categoryId ? { categoryId } : undefined)

export const getProductById = (id: string) =>
  apiClient.get<Product>(`/products/${id}`)

// Uses a query param instead of /products/low-stock to avoid route conflict
// with the dynamic /products/:id route on the backend.
export const getLowStockProducts = () =>
  apiClient.get<Product[]>('/products', { lowStock: true })

export const createProduct = (payload: CreateProductPayload) =>
  apiClient.post<Product>('/products', payload)

export const updateProduct = (id: string, payload: UpdateProductPayload) =>
  apiClient.patch<Product>(`/products/${id}`, payload)

export const deleteProduct = (id: string) =>
  apiClient.delete<null>(`/products/${id}`)

// ─── Category endpoints ───────────────────────────────────────────────────────

export const getCategories = () =>
  apiClient.get<ProductCategory[]>('/product-categories')

export const createCategory = (name: string) =>
  apiClient.post<ProductCategory>('/product-categories', { name })

export const deleteCategory = (id: string) =>
  apiClient.delete<null>(`/product-categories/${id}`)
