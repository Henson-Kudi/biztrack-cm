import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Resource } from '@biztrack/types'
import type { JwtPayload, PaginatedResult, ProductImage } from '@biztrack/types'
import { serializeDto, serializePaginatedResult } from '@/common/http/serialization'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { RequireResource, ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { ListProductImagesQueryDto } from '../dto/list-product-images-query.dto'
import { CreateProductImageDto } from '../dto/create-product-image.dto'
import { UpdateProductImageDto } from '../dto/update-product-image.dto'
import { ProductImageDto } from '../dto/product-image-response.dto'
import { ProductImagesService } from '../services/product-images.service'

@ApiTags('Product Images')
@ApiBearerAuth()
@UseGuards(Phase2Guard, ResourceGuard)
@Controller('products/:productId/images')
export class ProductImagesController {
  constructor(private readonly productImagesService: ProductImagesService) {}

  @Get()
  @RequireResource(Resource.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'List product gallery images' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Query() query: ListProductImagesQueryDto,
  ): Promise<PaginatedResult<ProductImage>> {
    const result = await this.productImagesService.list(productId, user.businessId as string, query)
    return serializePaginatedResult(result, (image) => ProductImageDto.fromEntity(image)!)
  }

  @Post()
  @RequireResource(Resource.PRODUCTS_EDIT)
  @ApiOperation({ summary: 'Create a product gallery image record' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Body() dto: CreateProductImageDto,
  ): Promise<ProductImage> {
    return serializeDto(
      ProductImageDto.fromEntity(
        await this.productImagesService.create(productId, user.businessId as string, dto),
      )!,
    )
  }

  @Patch(':imageId')
  @RequireResource(Resource.PRODUCTS_EDIT)
  @ApiOperation({ summary: 'Update a product image record' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
    @Body() dto: UpdateProductImageDto,
  ): Promise<ProductImage> {
    return serializeDto(
      ProductImageDto.fromEntity(
        await this.productImagesService.update(productId, imageId, user.businessId as string, dto),
      )!,
    )
  }

  @Delete(':imageId')
  @RequireResource(Resource.PRODUCTS_EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product image record' })
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
  ): Promise<void> {
    return this.productImagesService.remove(productId, imageId, user.businessId as string)
  }
}
