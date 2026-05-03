import { ProductResponseDto } from './product-response.dto'

export class ProductDetailResponseDto extends ProductResponseDto {
  static override fromModel(model: Parameters<typeof ProductResponseDto.fromModel>[0]): ProductDetailResponseDto {
    return Object.assign(new ProductDetailResponseDto(), ProductResponseDto.fromModel(model))
  }
}
