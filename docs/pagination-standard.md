# BizTrack Pagination Standard

## Overview
All endpoints that list many results must implement pagination for performance and consistency. This document defines the standard query object structure that all modules must implement.

---

## 1. Core Pagination DTOs

### 1.1 Base Query DTO (Shared across all modules)
**Location:** `apps/api/src/common/dto/list-query.dto.ts`

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsOptional, IsInt, Min, Max, IsString, IsIn } from 'class-validator'

export class ListQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @ApiPropertyOptional({
    description: 'Items per page (1-100)',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20

  @ApiPropertyOptional({
    description: 'Sort field (module-specific)',
    example: 'name',
  })
  @IsOptional()
  @IsString()
  sortBy?: string

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['ASC', 'DESC'],
    default: 'ASC',
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'ASC'

  @ApiPropertyOptional({
    description: 'Search term (full-text search)',
    example: 'iPhone 15',
  })
  @IsOptional()
  @IsString()
  search?: string
}
```

### 1.2 Module-Specific Query DTOs
Extend `ListQueryDto` for module-specific filtering:

**Example - Products List Query DTO**
**Location:** `apps/api/src/modules/products/dto/list-products-query.dto.ts`

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsUUID, IsBoolean } from 'class-validator'
import { Type } from 'class-transformer'
import { ListQueryDto } from '@/common/dto/list-query.dto'

export class ListProductsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by category ID',
    example: 'uuid-xxx',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string

  @ApiPropertyOptional({
    description: 'Filter by active status',
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean

  @ApiPropertyOptional({
    description: 'Filter by service flag',
    example: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isService?: boolean

  @ApiPropertyOptional({
    description: 'Filter by inventory tracking',
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  trackInventory?: boolean
}
```

---

## 2. Response Structure

### 2.1 Paginated Response DTO
**Location:** `apps/api/src/common/dto/paginated-response.dto.ts`

```typescript
import { ApiProperty } from '@nestjs/swagger'

export class PaginatedResponseDto<T> {
  @ApiProperty({
    description: 'Array of items',
    isArray: true,
  })
  data: T[]

  @ApiProperty({
    description: 'Total number of records',
    example: 156,
  })
  total: number

  @ApiProperty({
    description: 'Current page number',
    example: 1,
  })
  page: number

  @ApiProperty({
    description: 'Items per page',
    example: 20,
  })
  limit: number

  @ApiProperty({
    description: 'Total number of pages',
    example: 8,
  })
  totalPages: number
}
```

---

## 3. Implementation in Services

### Example - Products Service
**File:** `apps/api/src/modules/products/services/products.service.ts`

```typescript
import type { ListProductsQueryDto } from '../dto/list-products-query.dto'

@Injectable()
export class ProductsService {
  // ... existing code ...

  async findAll(
    businessId: string,
    query: ListProductsQueryDto,
  ) {
    try {
      const where = { businessId, deletedAt: IsNull() }

      // Apply filters
      const filters: any = { ...where }
      
      if (query.categoryId) {
        filters.categoryId = query.categoryId
      }
      if (query.isActive !== undefined) {
        filters.isActive = query.isActive
      }
      if (query.isService !== undefined) {
        filters.isService = query.isService
      }
      if (query.trackInventory !== undefined) {
        filters.trackInventory = query.trackInventory
      }

      // Handle search if provided
      let result

      if (query.search) {
        // Use custom query builder for complex search
        const qb = this.productsRepo.createQueryBuilder('product')
          .leftJoinAndSelect('product.category', 'category')
          .leftJoinAndSelect('product.unitOfMeasure', 'unitOfMeasure')
          .where('product.business_id = :businessId', { businessId })
          .andWhere('product.deleted_at IS NULL')
          .andWhere(
            '(LOWER(product.name) LIKE LOWER(:search) OR LOWER(product.sku) LIKE LOWER(:search) OR LOWER(product.barcode) LIKE LOWER(:search))',
            { search: `%${query.search}%` },
          )

        // Apply additional filters
        if (query.categoryId) {
          qb.andWhere('product.category_id = :categoryId', { categoryId: query.categoryId })
        }
        if (query.isActive !== undefined) {
          qb.andWhere('product.is_active = :isActive', { isActive: query.isActive })
        }
        if (query.isService !== undefined) {
          qb.andWhere('product.is_service = :isService', { isService: query.isService })
        }
        if (query.trackInventory !== undefined) {
          qb.andWhere('product.track_inventory = :trackInventory', { 
            trackInventory: query.trackInventory 
          })
        }

        // Apply sorting
        const sortField = this.validateSortField(query.sortBy || 'name')
        qb.orderBy(`product.${sortField}`, query.sortOrder || 'ASC')

        // Manual pagination for query builder
        const page = Math.max(query.page ?? 1, 1)
        const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
        const skip = (page - 1) * limit

        const [data, total] = await qb
          .skip(skip)
          .take(limit)
          .getManyAndCount()

        result = {
          data: await this.attachInventoryAndImages(data, businessId),
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        }
      } else {
        // Use repository paginate for simple queries
        const paginationOptions = {
          page: query.page,
          limit: query.limit,
          order: {
            [this.validateSortField(query.sortBy || 'name')]: query.sortOrder || 'ASC',
          },
        }

        result = await this.productsRepo.paginate(filters, paginationOptions)
        result.data = await this.attachInventoryAndImages(result.data, businessId)
      }

      return result
    } catch (error) {
      return this.handleServiceError('findAll', error, { businessId })
    }
  }

  private validateSortField(field: string): string {
    const allowed = ['name', 'sku', 'createdAt', 'sellingPrice', 'costPrice']
    return allowed.includes(field) ? field : 'name'
  }
}
```

---

## 4. Implementation in Controllers

### Updated Products Controller
**File:** `apps/api/src/modules/products/controllers/products.controller.ts`

```typescript
import { ListProductsQueryDto } from '../dto/list-products-query.dto'

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ... other endpoints ...

  @Get()
  @ApiOperation({ summary: 'List products with pagination' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListProductsQueryDto,
  ) {
    return this.productsService.findAll(user.businessId as string, query)
  }

  // ... other endpoints ...
}
```

### Updated Categories Controller
**File:** `apps/api/src/modules/products/controllers/categories.controller.ts`

```typescript
import { ListQueryDto } from '@/common/dto/list-query.dto'

@ApiTags('Product Categories')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('products/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a product category' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(user.businessId as string, dto)
  }

  @Get()
  @ApiOperation({ summary: 'List product categories with pagination' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListQueryDto,
  ) {
    return this.categoriesService.findAll(user.businessId as string, query)
  }

  // ... other endpoints ...
}
```

---

## 5. API Usage Examples

### List Products (Simple)
```bash
GET /api/products
# Returns default: page=1, limit=20, sorted by name ASC
```

### List Products (With Pagination)
```bash
GET /api/products?page=2&limit=50
# Returns: page 2, 50 items per page
```

### List Products (With Filters)
```bash
GET /api/products?categoryId=uuid-xxx&isActive=true&page=1&limit=30
# Returns: active products in category, page 1, 30 items
```

### List Products (With Search)
```bash
GET /api/products?search=iPhone&sortBy=price&sortOrder=DESC&page=1&limit=20
# Search across name/sku/barcode, sort by price descending
```

### List Products (Complex)
```bash
GET /api/products?categoryId=uuid-xxx&isService=false&search=product&sortBy=name&sortOrder=ASC&page=1&limit=25
# Filtered, searched, and paginated
```

---

## 6. Response Format

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Product Name",
      "sku": "SKU001",
      "sellingPrice": 100.00,
      "category": {
        "id": "uuid",
        "name": "Electronics"
      }
    },
    // ... more items
  ],
  "total": 156,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

---

## 7. Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] Create `ListQueryDto` in `apps/api/src/common/dto/`
- [ ] Create `PaginatedResponseDto` in `apps/api/src/common/dto/`
- [ ] Update DTOs to export in module indices

### Phase 2: Products Module
- [ ] Create `ListProductsQueryDto` extending `ListQueryDto`
- [ ] Create `ListCategoriesQueryDto` (or reuse `ListQueryDto`)
- [ ] Create `ListProductImagesQueryDto` (or reuse `ListQueryDto`)
- [ ] Update `ProductsService.findAll()` to use pagination
- [ ] Update `CategoriesService.findAll()` to use pagination  
- [ ] Update `ProductImagesService.list()` to use pagination
- [ ] Update `UnitOfMeasuresService.findForBusiness()` to use pagination
- [ ] Update all controllers to accept query DTO
- [ ] Add Swagger documentation
- [ ] Test with postman

### Phase 3: Rollout to Other Modules
- [ ] Identify all list endpoints across modules
- [ ] Create module-specific query DTOs
- [ ] Update services and controllers
- [ ] Test and deploy

### Phase 4: Frontend Updates
- [ ] Update API clients to handle pagination
- [ ] Add pagination UI components
- [ ] Implement infinite scroll or pagination controls

---

## 8. Best Practices

1. **Always validate sort fields** - Use a whitelist to prevent SQL injection
2. **Default limits** - Default to 20 items, max 100 to prevent resource exhaustion
3. **Cache metadata** - Calculate `totalPages` from total count
4. **Consistent naming** - Always use `page`, `limit`, `sortBy`, `sortOrder`
5. **Module-specific filtering** - Extend query DTO for module-specific filters
6. **Search performance** - Index common search fields (name, sku, barcode)
7. **Response consistency** - Always return same structure with metadata
8. **Backward compatibility** - Consider providing simple default sorting until frontend updates

---

## 9. Database Optimization

For large result sets, ensure indexes on:
- Foreign keys (`categoryId`, `businessId`)
- Search fields (`name`, `sku`, `barcode`)
- Sort fields (`createdAt`, `sellingPrice`)
- Soft delete field (`deletedAt`)

```sql
CREATE INDEX idx_products_businessid_deletedat ON products(business_id, deleted_at);
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_categoryid ON products(category_id);
```

---

## 10. Testing

### Unit Tests
```typescript
describe('ProductsService.findAll', () => {
  it('should return paginated results', async () => {
    const query = { page: 1, limit: 10 }
    const result = await service.findAll(businessId, query)
    
    expect(result).toHaveProperty('data')
    expect(result).toHaveProperty('total')
    expect(result).toHaveProperty('page', 1)
    expect(result).toHaveProperty('limit', 10)
    expect(result.data).toHaveLength(result.data.length)
  })

  it('should respect max limit of 100', async () => {
    const query = { page: 1, limit: 500 }
    const result = await service.findAll(businessId, query)
    
    expect(result.limit).toBeLessThanOrEqual(100)
  })

  it('should filter by category', async () => {
    const query = { categoryId }
    const result = await service.findAll(businessId, query)
    
    expect(result.data.every(p => p.categoryId === categoryId)).toBe(true)
  })
})
```

### Integration Tests
Test with actual database pagination, sorting, filtering, and searching.

---

## 11. Migration Strategy

If you have existing list endpoints without pagination:

1. **Add pagination params as optional** (backward compatible)
2. **Update frontend to provide params**
3. **After 2-3 releases, make pagination required** (deprecation notice)
4. **Plan: Sunset non-paginated endpoints in v2.0**
