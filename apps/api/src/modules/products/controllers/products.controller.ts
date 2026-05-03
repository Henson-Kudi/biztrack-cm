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
import type { JwtPayload, LowStockProduct, PaginatedResult, Product } from '@biztrack/types'
import { serializeDto, serializeDtos, serializePaginatedResult } from '@/common/http/serialization'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { RequireResource, ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { ListProductsQueryDto } from '../dto/list-products-query.dto'
import { AssignBarcodeDto } from '../dto/assign-barcode.dto'
import { CreateProductDto } from '../dto/create-product.dto'
import { UpdateProductDto } from '../dto/update-product.dto'
import { LowStockProductDto } from '../dto/low-stock-product.dto'
import { ProductDetailResponseDto } from '../dto/product-detail-response.dto'
import { ProductResponseDto } from '../dto/product-response.dto'
import { ProductsService } from '../services/products.service'

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(Phase2Guard, ResourceGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @RequireResource(Resource.PRODUCTS_CREATE)
  @ApiOperation({ summary: 'Create a product' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateProductDto): Promise<Product> {
    return serializeDto(
      ProductDetailResponseDto.fromModel(
        await this.productsService.create(user.businessId as string, user.sub, dto),
      ),
    )
  }

  @Get()
  @RequireResource(Resource.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'List products' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListProductsQueryDto,
  ): Promise<PaginatedResult<Product>> {
    const result = await this.productsService.findAll(user.businessId as string, query)
    return serializePaginatedResult(result, (product) => ProductResponseDto.fromModel(product))
  }

  @Get('low-stock')
  @RequireResource(Resource.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'Get low stock products' })
  async getLowStock(@CurrentUser() user: JwtPayload): Promise<LowStockProduct[]> {
    return serializeDtos(
      await this.productsService.getLowStockProducts(user.businessId as string),
      (product) => LowStockProductDto.fromModel(product),
    )
  }

  @Get('by-barcode/:barcode')
  @RequireResource(Resource.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'Find product by barcode' })
  async findByBarcode(
    @CurrentUser() user: JwtPayload,
    @Param('barcode') barcode: string,
  ): Promise<Product> {
    return serializeDto(
      ProductDetailResponseDto.fromModel(
        await this.productsService.findByBarcode(barcode, user.businessId as string),
      ),
    )
  }

  @Get('by-sku/:sku')
  @RequireResource(Resource.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'Find product by SKU' })
  async findBySku(@CurrentUser() user: JwtPayload, @Param('sku') sku: string): Promise<Product> {
    return serializeDto(
      ProductDetailResponseDto.fromModel(
        await this.productsService.findBySku(sku, user.businessId as string),
      ),
    )
  }

  @Get('by-slug/:slug')
  @RequireResource(Resource.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'Find product by slug' })
  async findBySlug(@CurrentUser() user: JwtPayload, @Param('slug') slug: string): Promise<Product> {
    return serializeDto(
      ProductDetailResponseDto.fromModel(
        await this.productsService.findBySlug(slug, user.businessId as string),
      ),
    )
  }

  @Post(':id/assign-barcode')
  @RequireResource(Resource.PRODUCTS_EDIT)
  @ApiOperation({ summary: 'Assign or replace a product barcode' })
  async assignBarcode(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AssignBarcodeDto,
  ): Promise<Product> {
    return serializeDto(
      ProductDetailResponseDto.fromModel(
        await this.productsService.assignBarcode(id, user.businessId as string, dto),
      ),
    )
  }

  @Get(':id')
  @RequireResource(Resource.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'Get a product by id' })
  async findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<Product> {
    return serializeDto(
      ProductDetailResponseDto.fromModel(
        await this.productsService.findById(id, user.businessId as string),
      ),
    )
  }

  @Patch(':id')
  @RequireResource(Resource.PRODUCTS_EDIT)
  @ApiOperation({ summary: 'Update a product' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<Product> {
    return serializeDto(
      ProductDetailResponseDto.fromModel(
        await this.productsService.update(id, user.businessId as string, dto),
      ),
    )
  }

  @Delete(':id')
  @RequireResource(Resource.PRODUCTS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a product' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<void> {
    return this.productsService.softDelete(id, user.businessId as string)
  }
}
