import type { Currency } from './business.types'
import type { ListQuery, IsoDateString } from './http.types'

export enum UnitOfMeasureType {
  QUANTITY = 'QUANTITY',
  WEIGHT = 'WEIGHT',
  VOLUME = 'VOLUME',
  LENGTH = 'LENGTH',
  CUSTOM = 'CUSTOM',
}

export interface ProductUserSummary {
  id: string
  name: string
}

export interface ProductCategory {
  id: string
  businessId: string
  name: string
  slug?: string
  color?: string | null
  icon?: string | null
  imageUrl?: string | null
  sortOrder?: number
  isActive?: boolean
  createdAt: IsoDateString
  updatedAt: IsoDateString
}

export interface UnitOfMeasure {
  id: string
  name: string
  abbreviation?: string
  businessId?: string | null
  type: UnitOfMeasureType | null
  isDefault: boolean
  isActive?: boolean
  createdAt?: IsoDateString
  updatedAt?: IsoDateString
  deletedAt?: IsoDateString | null
}

export interface ProductImage {
  id: string
  productId: string
  url: string
  altText?: string | null
  sortOrder: number
  createdAt?: IsoDateString
}

export interface Product {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  sellingPrice: number
  costPrice?: number | null
  currency: Currency | string
  taxRate: number
  isActive: boolean
  isService: boolean
  trackInventory: boolean
  category?: ProductCategory | null
  unitOfMeasure?: UnitOfMeasure
  createdAt?: IsoDateString
  updatedAt?: IsoDateString
  businessId: string
  slug: string
  description?: string | null
  barcodeType?: string | null
  isBarcodeGenerated: boolean
  categoryId?: string | null
  imageUrl?: string | null
  createdById?: string | null
  createdBy?: ProductUserSummary | null
  images: ProductImage[]
  currentStock?: number | null
  lowStockThreshold?: number | null
  reorderPoint?: number | null
  primaryImageUrl?: string | null
}

export interface ProductsQuery extends ListQuery {
  categoryId?: string
  isActive?: boolean
  isService?: boolean
  trackInventory?: boolean
}

export interface CreateProductRequest {
  name: string
  description?: string
  sku?: string
  barcode?: string
  sellingPrice: number
  costPrice?: number
  taxRate?: number
  openingStock?: number
  lowStockThreshold?: number
  unitOfMeasureId: string
  categoryId?: string
  imageUrl?: string
  isService?: boolean
  trackInventory?: boolean
  isActive?: boolean
}

export interface UpdateProductRequest extends Partial<CreateProductRequest> {}

export interface AssignBarcodeRequest {
  barcode: string
}

export interface CategoriesQuery extends ListQuery {}

export interface CreateCategoryRequest {
  name: string
  color?: string
  icon?: string
  imageUrl?: string
  sortOrder?: number
  isActive?: boolean
}

export interface UpdateCategoryRequest extends Partial<CreateCategoryRequest> {
  isActive?: boolean
}

export interface ProductImagesQuery extends ListQuery {}

export interface CreateProductImageRequest {
  url: string
  altText?: string
  sortOrder?: number
}

export interface UpdateProductImageRequest extends Partial<CreateProductImageRequest> {}

export interface UnitOfMeasuresQuery extends ListQuery {}

export interface CreateUnitOfMeasureRequest {
  name: string
  abbreviation: string
  type: UnitOfMeasureType
}

export interface UpdateUnitOfMeasureRequest extends Partial<CreateUnitOfMeasureRequest> {
  isActive?: boolean
}

export interface LowStockProduct {
  productId: string
  productName: string | null
  currentQuantity: number
  lowStockThreshold: number | null
  reorderPoint: number | null
  unitOfMeasure: string | null
  categoryName: string | null
}
