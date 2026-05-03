# Pagination Implementation - Architecture & Flow

## Architecture Overview

```
REQUEST → Validation → Service → Repository → RESPONSE
           ↓
      ListQueryDto
      (page, limit, sortBy, 
       sortOrder, search)
```

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                  HTTP REQUEST                                    │
│  GET /api/products?page=2&limit=20&sortBy=name&sortOrder=DESC  │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│              CONTROLLER LAYER                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ @Query() query: ListProductsQueryDto                     │   │
│  │ • Automatic validation via class-validator              │   │
│  │ • Type transformation (string → number, boolean)        │   │
│  │ • Swagger documentation auto-generated                  │   │
│  └────────────────────┬─────────────────────────────────────┘   │
└─────────────────────┼──────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              SERVICE LAYER                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ ProductsService.findAll(businessId, query)              │   │
│  │                                                          │   │
│  │ 1. Build QueryBuilder with filters                      │   │
│  │    • categoryId, isActive, isService, trackInventory    │   │
│  │    • Search across name/sku/barcode                     │   │
│  │                                                          │   │
│  │ 2. Validate & apply sorting                             │   │
│  │    • sortBy: 'name' (default) | 'sku' | 'price' | ...  │   │
│  │    • sortOrder: 'ASC' | 'DESC'                          │   │
│  │    • Whitelist allowed fields                           │   │
│  │                                                          │   │
│  │ 3. Calculate pagination                                 │   │
│  │    • page = max(query.page, 1)                          │   │
│  │    • limit = min(max(query.limit, 1), 100)             │   │
│  │    • skip = (page - 1) * limit                          │   │
│  │                                                          │   │
│  │ 4. Execute query with skip/take                         │   │
│  │    • getManyAndCount() returns [data, total]            │   │
│  │                                                          │   │
│  │ 5. Enrich data (attach inventory, images)               │   │
│  │                                                          │   │
│  │ 6. Return PaginatedResponseDto                          │   │
│  └────────────────────┬─────────────────────────────────────┘   │
└─────────────────────┼──────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              REPOSITORY LAYER                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ TypeORM Repository                                       │   │
│  │                                                          │   │
│  │ • createQueryBuilder() - complex filtering              │   │
│  │ • paginate() - simple queries (Categories, UoM)         │   │
│  └────────────────────┬─────────────────────────────────────┘   │
└─────────────────────┼──────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              DATABASE                                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ SELECT product.* FROM products                          │   │
│  │ WHERE business_id = $1 AND deleted_at IS NULL           │   │
│  │   AND name LIKE $2 OR sku LIKE $2 OR barcode LIKE $2    │   │
│  │ ORDER BY name ASC                                        │   │
│  │ LIMIT 20 OFFSET 20                                       │   │
│  └────────────────────┬─────────────────────────────────────┘   │
└─────────────────────┼──────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              HTTP RESPONSE                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ {                                                        │   │
│  │   "data": [...products],                                │   │
│  │   "total": 156,                                          │   │
│  │   "page": 2,                                             │   │
│  │   "limit": 20,                                           │   │
│  │   "totalPages": 8                                        │   │
│  │ }                                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Examples

### Example 1: Simple Pagination
```
Request: GET /api/products?page=1&limit=20

ListProductsQueryDto:
├─ page: 1
├─ limit: 20
├─ sortBy: undefined (defaults to 'name')
├─ sortOrder: undefined (defaults to 'ASC')
├─ search: undefined
├─ categoryId: undefined
├─ isActive: undefined
└─ isService: undefined

Service Logic:
├─ Skip: (1-1) * 20 = 0
├─ Take: 20
├─ Query: SELECT * FROM products WHERE business_id = ? AND deleted_at IS NULL
│         ORDER BY name ASC LIMIT 20 OFFSET 0
└─ Result: { data: [...20 items], total: 156, page: 1, limit: 20, totalPages: 8 }
```

### Example 2: Complex Query with Filters & Search
```
Request: GET /api/products?categoryId=uuid&isActive=true&search=iPhone&sortBy=price&sortOrder=DESC&page=2&limit=30

ListProductsQueryDto:
├─ page: 2
├─ limit: 30
├─ sortBy: 'price'
├─ sortOrder: 'DESC'
├─ search: 'iPhone'
├─ categoryId: 'uuid'
├─ isActive: true
├─ isService: undefined
└─ trackInventory: undefined

Service Logic:
├─ Filters Applied:
│  ├─ WHERE business_id = ? AND deleted_at IS NULL
│  ├─ AND category_id = 'uuid'
│  ├─ AND is_active = true
│  └─ AND (name LIKE '%iPhone%' OR sku LIKE '%iPhone%' OR barcode LIKE '%iPhone%')
├─ Sorting: ORDER BY price DESC
├─ Pagination: LIMIT 30 OFFSET 30
└─ Result: { data: [...30 items], total: 47, page: 2, limit: 30, totalPages: 2 }
```

## DTO Inheritance Hierarchy

```
ListQueryDto
    ↓
    ├─ ListProductsQueryDto
    │  ├─ page, limit, sortBy, sortOrder, search (inherited)
    │  ├─ categoryId (new)
    │  ├─ isActive (new)
    │  ├─ isService (new)
    │  └─ trackInventory (new)
    │
    ├─ ListCategoriesQueryDto
    │  └─ page, limit, sortBy, sortOrder, search (inherited)
    │
    ├─ ListProductImagesQueryDto
    │  └─ page, limit, sortBy, sortOrder, search (inherited)
    │
    └─ ListUnitOfMeasuresQueryDto
       └─ page, limit, sortBy, sortOrder, search (inherited)
```

## Response Structure Evolution

### Current (No Pagination)
```typescript
// Returns raw array - causes memory issues with large datasets
GET /api/products
→ Product[]
→ 5,000+ items in single response
```

### New (With Pagination) 
```typescript
// Wrapped response with metadata
GET /api/products
→ PaginatedResponseDto<Product>
→ {
    data: Product[],     // only 20 items (default)
    total: 5000,         // total count
    page: 1,             // current page
    limit: 20,           // items per page
    totalPages: 250      // calculated from total/limit
  }
```

## Service Method Signatures

### Before
```typescript
async findAll(businessId: string, filters: ProductFilters = {})
// Returns: Product[] (all matching results)
```

### After
```typescript
async findAll(businessId: string, query: ListProductsQueryDto)
// Returns: PaginatedResponseDto<Product>
```

## Use Cases & Handling

### Use Case 1: List Products with Default Pagination
```
GET /api/products

→ Defaults applied:
  - page: 1
  - limit: 20
  - sortBy: 'name'
  - sortOrder: 'ASC'

→ Returns first 20 products sorted by name
```

### Use Case 2: Search with Sorting
```
GET /api/products?search=iPhone&sortBy=sellingPrice&sortOrder=DESC

→ Searches across name/sku/barcode
→ Sorts by price descending
→ Returns first 20 matching results
```

### Use Case 3: Navigate Results
```
Page 1: /api/products?page=1&limit=20
Page 2: /api/products?page=2&limit=20
Page 3: /api/products?page=3&limit=20
...
Page N: /api/products?page=N&limit=20
```

### Use Case 4: Custom Page Size
```
// Small results (5 per page)
GET /api/products?limit=5

// Large results (100 per page - max allowed)
GET /api/products?limit=100

// Over max is clamped to 100
GET /api/products?limit=500
→ limit: 100 (max enforced)
```

### Use Case 5: Invalid Pagination Handled Gracefully
```
GET /api/products?page=0
→ page: 1 (minimum enforced)

GET /api/products?page=-5
→ page: 1 (minimum enforced)

GET /api/products?limit=0
→ limit: 1 (minimum enforced)

GET /api/products?limit=-10
→ limit: 1 (minimum enforced)

GET /api/products?limit=999
→ limit: 100 (maximum enforced)
```

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| First page | O(L log N) | L=limit, N=total records. Uses LIMIT OFFSET |
| Middle page | O((P*L) log N) | Offset increases cost on slower DBs |
| Last page | O(N log N) | Full scan to calculate total |
| With search | O(N*M*L) | M=search patterns, requires index on search fields |
| With multiple filters | O(N log N) | Index on filtered columns recommended |

**Optimization Recommendations:**
- Index on `(business_id, deleted_at)` - critical
- Index on search fields `(name, sku, barcode)`
- Index on filter fields `(category_id, is_active)`
- Index on sort fields `(created_at, selling_price)`

## Request Validation Flow

```
Incoming Query String
    ↓
NestJS Parsing
    ↓
ClassValidator (via ListProductsQueryDto)
    ├─ @Type(() => Number) → string to number
    ├─ @IsOptional() → allows undefined
    ├─ @IsInt() → validates integer
    ├─ @Min(1) → enforces minimum
    ├─ @Max(100) → enforces maximum
    ├─ @IsUUID() → validates UUID format
    ├─ @IsBoolean() → validates boolean
    └─ @IsIn(['ASC', 'DESC']) → validates enum
    ↓
Service.findAll() receives validated DTO
```

## Frontend Integration Pattern

```typescript
// Frontend API client
async function listProducts(query: ListProductsQueryDto) {
  const params = new URLSearchParams()
  if (query.page) params.set('page', query.page.toString())
  if (query.limit) params.set('limit', query.limit.toString())
  if (query.search) params.set('search', query.search)
  if (query.categoryId) params.set('categoryId', query.categoryId)
  if (query.isActive !== undefined) params.set('isActive', query.isActive.toString())
  
  const response = await fetch(`/api/products?${params}`)
  return response.json() // Returns PaginatedResponseDto<Product>
}

// Usage in component
const [page, setPage] = useState(1)
const [limit, setLimit] = useState(20)
const result = await listProducts({ page, limit, sortBy: 'name' })

// Display
result.data.forEach(product => console.log(product))
console.log(`Page ${result.page} of ${result.totalPages}`)
```

## Error Handling

```typescript
try {
  const result = await findAll(businessId, query)
  // ✓ Always returns PaginatedResponseDto, even if 0 results
  // {
  //   data: [],
  //   total: 0,
  //   page: 1,
  //   limit: 20,
  //   totalPages: 0
  // }
} catch (error) {
  // Database errors, permission errors, etc.
  handleError(error)
}
```

## Summary

**Pagination Standard enables:**
- ✅ Consistent API across all modules
- ✅ Efficient database queries with LIMIT/OFFSET
- ✅ Frontend-friendly response metadata
- ✅ Customizable sorting and filtering
- ✅ Type-safe query parameters with DTOs
- ✅ Automatic Swagger documentation
- ✅ Validation at the controller layer
- ✅ Graceful handling of invalid inputs
