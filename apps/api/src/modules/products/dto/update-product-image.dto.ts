import { PartialType } from '@nestjs/mapped-types'
import type { UpdateProductImageRequest } from '@biztrack/types'
import { CreateProductImageDto } from './create-product-image.dto'

export class UpdateProductImageDto extends PartialType(CreateProductImageDto) implements UpdateProductImageRequest {}
