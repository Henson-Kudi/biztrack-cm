import type { ProductCategory } from '@biztrack/types'
import { ProductCategory as ProductCategoryEntity } from '@/entities'
import { toIsoString } from '@/common/http/serialization'

export class CategoryDto implements ProductCategory {
  id!: string
  businessId!: string
  name!: string
  slug?: string
  color?: string | null
  icon?: string | null
  imageUrl?: string | null
  sortOrder?: number
  isActive?: boolean
  createdAt!: string
  updatedAt!: string

  static fromEntity(entity?: ProductCategoryEntity | null): CategoryDto | null {
    if (!entity) return null

    const dto = new CategoryDto()
    dto.id = entity.id
    dto.businessId = entity.businessId
    dto.name = entity.name
    dto.slug = entity.slug
    dto.color = entity.color ?? null
    dto.icon = entity.icon ?? null
    dto.imageUrl = entity.imageUrl ?? null
    dto.sortOrder = entity.sortOrder
    dto.isActive = entity.isActive
    dto.createdAt = toIsoString(entity.createdAt) ?? ''
    dto.updatedAt = toIsoString(entity.updatedAt) ?? ''
    return dto
  }
}
