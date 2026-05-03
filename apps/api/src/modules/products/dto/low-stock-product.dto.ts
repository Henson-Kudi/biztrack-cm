import type { LowStockProduct } from '@biztrack/types'

export class LowStockProductDto implements LowStockProduct {
  productId!: string
  productName!: string | null
  currentQuantity!: number
  lowStockThreshold!: number | null
  reorderPoint!: number | null
  unitOfMeasure!: string | null
  categoryName!: string | null

  static fromModel(model: {
    productId: string
    productName: string | null
    currentQuantity: number
    lowStockThreshold?: number | null
    reorderPoint?: number | null
    unitOfMeasure: string | null
    categoryName: string | null
  }): LowStockProductDto {
    const dto = new LowStockProductDto()
    Object.assign(dto, model)
    dto.lowStockThreshold = model.lowStockThreshold ?? null
    dto.reorderPoint = model.reorderPoint ?? null
    return dto
  }
}
