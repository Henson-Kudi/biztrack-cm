# Products Module - Pagination Implementation Guide

## Overview
This guide shows exact code changes needed to implement pagination in the products module controllers and services.

## Step 1: Create Query DTOs
✅ **Already created:**
- `list-products-query.dto.ts` - Products with filters
- `list-categories-query.dto.ts` - Categories list
- `list-product-images-query.dto.ts` - Product images list
- `list-unit-of-measures-query.dto.ts` - Unit of measures list

## Step 2: Update Controllers

### 2.1 Products Controller
**File:** `apps/api/src/modules/products/controllers/products.controller.ts`

```typescript
import { ListProductsQueryDto } from '../dto/list-products-query.dto'

@Get()
@ApiOperation({ summary: 'List products' })
findAll(
  @CurrentUser() user: JwtPayload,
  @Query() query: ListProductsQueryDto,
) {
  return this.productsService.findAll(user.businessId as string, query)
}
```

**Changes:**
- Replace individual `@ApiQuery` decorators with single `@Query() query: ListProductsQueryDto`
- Pass entire `query` object to service instead of individual parameters
- NestJS automatically validates and transforms query parameters using the DTO

### 2.2 Categories Controller
**File:** `apps/api/src/modules/products/controllers/categories.controller.ts`

```typescript
import { ListCategoriesQueryDto } from '../dto/list-categories-query.dto'

@Get()
@ApiOperation({ summary: 'List product categories' })
findAll(
  @CurrentUser() user: JwtPayload,
  @Query() query: ListCategoriesQueryDto,
) {
  return this.categoriesService.findAll(user.businessId as string, query)
}
```

### 2.3 Product Images Controller
**File:** `apps/api/src/modules/products/controllers/product-images.controller.ts`

```typescript
import { ListProductImagesQueryDto } from '../dto/list-product-images-query.dto'

@Get()
@ApiOperation({ summary: 'List product gallery images' })
findAll(
  @CurrentUser() user: JwtPayload,
  @Param('productId') productId: string,
  @Query() query: ListProductImagesQueryDto,
) {
  return this.productImagesService.list(productId, user.businessId as string, query)
}
```

### 2.4 Unit of Measures Controller
**File:** `apps/api/src/modules/products/controllers/unit-of-measures.controller.ts`

```typescript
import { ListUnitOfMeasuresQueryDto } from '../dto/list-unit-of-measures-query.dto'

@Get()
@ApiOperation({ summary: 'List default and business-specific units' })
findAll(
  @CurrentUser() user: JwtPayload,
  @Query() query: ListUnitOfMeasuresQueryDto,
) {
  return this.unitOfMeasuresService.findForBusiness(user.businessId as string, query)
}
```

## Step 3: Update Services

### 3.1 Products Service
**File:** `apps/api/src/modules/products/services/products.service.ts`

**Issues in current code:**
- `findAll()` returns all results without pagination
- Does not respect limit/page parameters
- Uses `.getMany()` which fetches all records

**Updated implementation:**

```typescript
import type { ListProductsQueryDto } from '../dto/list-products-query.dto'
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto'

// In ProductsService class:

async findAll(businessId: string, query: ListProductsQueryDto) {
  try {
    const qb = this.productsRepo.createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.unitOfMeasure', 'unitOfMeasure')
      .where('product.business_id = :businessId', { businessId })
      .andWhere('product.deleted_at IS NULL')

    // Apply filters
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
      qb.andWhere('product.track_inventory = :trackInventory', { trackInventory: query.trackInventory })
    }

    // Apply search
    if (query.search) {
      qb.andWhere(
        '(LOWER(product.name) LIKE LOWER(:search) OR LOWER(product.sku) LIKE LOWER(:search) OR LOWER(product.barcode) LIKE LOWER(:search))',
        { search: `%${query.search}%` },
      )
    }

    // Apply sorting
    const sortField = this.validateSortField(query.sortBy)
    const sortOrder = query.sortOrder || 'ASC'
    qb.orderBy(`product.${sortField}`, sortOrder)

    // Calculate pagination
    const page = Math.max(query.page ?? 1, 1)
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
    const skip = (page - 1) * limit

    // Execute query with pagination
    const [products, total] = await qb
      .skip(skip)
      .take(limit)
      .getManyAndCount()

    // Attach inventory and images to results
    const data = await this.attachInventoryAndImages(products, businessId)

    return new PaginatedResponseDto(data, total, page, limit)
  } catch (error) {
    return this.handleServiceError('findAll', error, { businessId })
  }
}

private validateSortField(field?: string): string {
  const allowedFields = ['name', 'sku', 'createdAt', 'sellingPrice', 'costPrice', 'updatedAt']
  return allowedFields.includes(field ?? '') ? field! : 'name'
}
```

### 3.2 Categories Service
**File:** `apps/api/src/modules/products/services/categories.service.ts`

**Current code:**
```typescript
async findAll(businessId: string) {
  try {
    return this.categoriesRepo.find({
      where: { businessId, deletedAt: IsNull() },
      order: { sortOrder: 'ASC', name: 'ASC' },
    })
  } catch (error) {
    return this.handleServiceError('findAll', error, { businessId })
  }
}
```

**Updated implementation:**
```typescript
import type { ListCategoriesQueryDto } from '../dto/list-categories-query.dto'
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto'

async findAll(businessId: string, query: ListCategoriesQueryDto) {
  try {
    // Use the base repository's paginate method for simple queries
    const sortField = this.validateSortField(query.sortBy)
    
    const paginationOptions = {
      page: query.page,
      limit: query.limit,
      order: {
        [sortField]: query.sortOrder || 'ASC',
      },
    }

    const result = await this.categoriesRepo.paginate(
      { businessId, deletedAt: IsNull() },
      paginationOptions,
    )

    return new PaginatedResponseDto(result.data, result.total, result.page, result.limit)
  } catch (error) {
    return this.handleServiceError('findAll', error, { businessId })
  }
}

private validateSortField(field?: string): string {
  const allowedFields = ['name', 'createdAt', 'updatedAt', 'sortOrder']
  return allowedFields.includes(field ?? '') ? field! : 'sortOrder'
}
```

### 3.3 Product Images Service
**File:** `apps/api/src/modules/products/services/product-images.service.ts`

**Current code:**
```typescript
async list(productId: string, businessId: string) {
  try {
    await this.productsService.findById(productId, businessId)
    return this.imagesRepo.find({
      where: { productId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    })
  } catch (error) {
    return this.handleServiceError('list', error, { productId, businessId })
  }
}
```

**Updated implementation:**
```typescript
import type { ListProductImagesQueryDto } from '../dto/list-product-images-query.dto'
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto'

async list(productId: string, businessId: string, query: ListProductImagesQueryDto) {
  try {
    await this.productsService.findById(productId, businessId)
    
    const page = Math.max(query.page ?? 1, 1)
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
    const skip = (page - 1) * limit

    const [data, total] = await this.imagesRepo.findAndCount({
      where: { productId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
      skip,
      take: limit,
    })

    return new PaginatedResponseDto(data, total, page, limit)
  } catch (error) {
    return this.handleServiceError('list', error, { productId, businessId })
  }
}
```

### 3.4 Unit of Measures Service
**File:** `apps/api/src/modules/products/services/unit-of-measures.service.ts`

```typescript
import type { ListUnitOfMeasuresQueryDto } from '../dto/list-unit-of-measures-query.dto'
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto'

async findForBusiness(businessId: string, query: ListUnitOfMeasuresQueryDto) {
  try {
    const page = Math.max(query.page ?? 1, 1)
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
    const skip = (page - 1) * limit

    const [data, total] = await this.unitsRepo.findAndCount({
      where: [
        { businessId }, // business-specific units
        { isDefault: true }, // default units
      ],
      order: { name: 'ASC' },
      skip,
      take: limit,
    })

    return new PaginatedResponseDto(data, total, page, limit)
  } catch (error) {
    return this.handleServiceError('findForBusiness', error, { businessId })
  }
}
```

## Step 4: Test Examples

### API Calls

**Simple pagination:**
```bash
GET /api/products?page=1&limit=20
```

**With sorting:**
```bash
GET /api/products?page=1&limit=20&sortBy=sellingPrice&sortOrder=DESC
```

**With search:**
```bash
GET /api/products?search=iPhone&page=1&limit=20
```

**With filters and pagination:**
```bash
GET /api/products?categoryId=<uuid>&isActive=true&isService=false&page=1&limit=30
```

**Complex query:**
```bash
GET /api/products?categoryId=<uuid>&isActive=true&search=product&sortBy=name&sortOrder=ASC&page=2&limit=25&trackInventory=true
```

### Response Format

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Product Name",
      "sku": "SKU-001",
      "barcode": "1234567890",
      "sellingPrice": 99.99,
      "costPrice": 50.00,
      "isActive": true,
      "isService": false,
      "category": {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "name": "Electronics"
      },
      "unitOfMeasure": {
        "id": "550e8400-e29b-41d4-a716-446655440002",
        "name": "Piece"
      },
      "currentStock": 150,
      "lowStockThreshold": 20,
      "createdAt": "2026-01-15T10:30:00Z",
      "updatedAt": "2026-04-14T15:45:00Z"
    }
    // ... more products
  ],
  "total": 156,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

## Step 5: Deployment Checklist

- [ ] Create DTOs
- [ ] Update controllers to use new DTOs
- [ ] Update all service.findAll() methods
- [ ] Test with Postman
- [ ] Verify pagination works with filters
- [ ] Verify sorting works
- [ ] Verify search works
- [ ] Test edge cases (page=0, limit=0, limit=1000, etc.)
- [ ] Update frontend API clients
- [ ] Deploy to staging
- [ ] Deploy to production

## Rollout to Other Modules

After products module is complete:
1. Identify all list endpoints in other modules
2. Create module-specific query DTOs
3. Update controllers and services
4. Test and deploy module by module
5. Update shared documentation

## Backward Compatibility Notes

Current implementation:
- ✅ Maintains same response structure but adds pagination metadata
- ✅ All filters continue to work as before
- ⚠️ Frontend must parse new response structure with `data` wrapper

## Performance Considerations

1. **Indexes** - Ensure these exist on database:
   - `(business_id, deleted_at)` for products
   - `(product_id)` for images
   - `(name)`, `(sku)`, `(barcode)` for search fields

2. **Default limits** - 20 items per page to reduce memory usage

3. **Query builder** - Used for complex searches, repository paginate for simple queries

4. **Relations** - Eager loaded (`leftJoinAndSelect`) to reduce N+1 queries
