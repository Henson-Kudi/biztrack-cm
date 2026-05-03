import type { ProductImage } from '@biztrack/types'
import { ProductImage as ProductImageEntity } from '@/entities'
import { toIsoString } from '@/common/http/serialization'

export class ProductImageDto implements ProductImage {
  id!: string
  productId!: string
  url!: string
  altText?: string | null
  sortOrder!: number
  createdAt?: string

  static fromEntity(entity?: ProductImageEntity | null): ProductImageDto | null {
    if (!entity) return null

    const dto = new ProductImageDto()
    dto.id = entity.id
    dto.productId = entity.productId
    dto.url = entity.url
    dto.altText = entity.altText ?? null
    dto.sortOrder = entity.sortOrder
    dto.createdAt = toIsoString(entity.createdAt) ?? undefined
    return dto
  }
}
