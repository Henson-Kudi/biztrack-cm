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
import type { JwtPayload, PaginatedResult, ProductCategory } from '@biztrack/types'
import { serializeDto, serializePaginatedResult } from '@/common/http/serialization'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { RequireResource, ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { ListCategoriesQueryDto } from '../dto/list-categories-query.dto'
import { CreateCategoryDto } from '../dto/create-category.dto'
import { UpdateCategoryDto } from '../dto/update-category.dto'
import { CategoryDto } from '../dto/category-response.dto'
import { CategoriesService } from '../services/categories.service'

@ApiTags('Product Categories')
@ApiBearerAuth()
@UseGuards(Phase2Guard, ResourceGuard)
@Controller('products/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @RequireResource(Resource.PRODUCTS_CREATE)
  @ApiOperation({ summary: 'Create a product category' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCategoryDto,
  ): Promise<ProductCategory> {
    return serializeDto(
      CategoryDto.fromEntity(await this.categoriesService.create(user.businessId as string, dto))!,
    )
  }

  @Get()
  @RequireResource(Resource.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'List product categories' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListCategoriesQueryDto,
  ): Promise<PaginatedResult<ProductCategory>> {
    const result = await this.categoriesService.findAll(user.businessId as string, query)
    return serializePaginatedResult(result, (category) => CategoryDto.fromEntity(category)!)
  }

  @Patch(':id')
  @RequireResource(Resource.PRODUCTS_EDIT)
  @ApiOperation({ summary: 'Update a product category' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<ProductCategory> {
    return serializeDto(
      CategoryDto.fromEntity(
        await this.categoriesService.update(id, user.businessId as string, dto),
      )!,
    )
  }

  @Delete(':id')
  @RequireResource(Resource.PRODUCTS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product category' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<void> {
    return this.categoriesService.remove(id, user.businessId as string)
  }
}
