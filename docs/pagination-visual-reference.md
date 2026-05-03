# Pagination Solution - Visual Quick Reference

## System Architecture at a Glance

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                    BIZTRACK PAGINATION STANDARD                      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘


REQUEST → VALIDATION → SERVICE LAYER → DATABASE → RESPONSE
   │         │              │           │           │
   ▼         ▼              ▼           ▼           ▼
HTTP GET   ListQueryDto   Repository   SQL      PaginatedResponseDto
Query      Validators     Pattern      Query     with Metadata
Params     (@Type,        (Filters,    (LIMIT,   (data, total, page,
           @IsInt,        Sorting,     OFFSET)   limit, totalPages)
           @Min,          Pagination)
           @Max)


══════════════════════════════════════════════════════════════════════

                    PRODUCTS MODULE DTO TREE

ListQueryDto (Base)
    │
    ├─ Pagination Params:
    │  ├─ page: number (1-indexed)
    │  ├─ limit: number (1-100)
    │  └─ default: page=1, limit=20
    │
    ├─ Sorting Params:
    │  ├─ sortBy: string (whitelist validated)
    │  └─ sortOrder: 'ASC' | 'DESC'
    │
    ├─ Search Param:
    │  └─ search: string (multi-field)
    │
    └─ Module-Specific Filters (extends in child DTOs):
       ├─ ListProductsQueryDto adds:
       │  ├─ categoryId: UUID
       │  ├─ isActive: boolean
       │  ├─ isService: boolean
       │  └─ trackInventory: boolean
       │
       ├─ ListCategoriesQueryDto adds: (nothing extra)
       │
       ├─ ListProductImagesQueryDto adds: (nothing extra)
       │
       └─ ListUnitOfMeasuresQueryDto adds: (nothing extra)


══════════════════════════════════════════════════════════════════════

                    RESPONSE STRUCTURE

PaginatedResponseDto
    │
    ├─ data: T[]
    │  └─ Contains only requested page of items (default 20, max 100)
    │
    ├─ total: number
    │  └─ Total matching records in database
    │
    ├─ page: number
    │  └─ Current page (1-indexed)
    │
    ├─ limit: number
    │  └─ Items per page
    │
    └─ totalPages: number
       └─ Calculated as Math.ceil(total / limit)


Example Response:
{
  "data": [ {...10 products...} ],
  "total": 156,
  "page": 1,
  "limit": 10,
  "totalPages": 16
}


══════════════════════════════════════════════════════════════════════

                    CONTROLLER FLOW

@Controller('products')
┌─────────────────────────────────────────────────────┐
│                                                     │
│  @Get()                                             │
│  findAll(                                           │
│    @CurrentUser() user,                             │
│    @Query() query: ListProductsQueryDto             │
│  ) {                                                │
│    // NestJS automatically:                         │
│    // 1. Parses query string                        │
│    // 2. Validates types                            │
│    // 3. Transforms values                          │
│    // 4. Validates constraints                      │
│    return this.service.findAll(id, query)           │
│  }                                                  │
│                                                     │
└─────────────────────────────────────────────────────┘


══════════════════════════════════════════════════════════════════════

                    SERVICE LAYER LOGIC

findAll(businessId, query: ListProductsQueryDto) {
  │
  ├─ Step 1: Build Query Builder
  │  └─ SELECT product.* FROM products
  │     WHERE business_id = ? AND deleted_at IS NULL
  │
  ├─ Step 2: Apply Filters
  │  ├─ IF query.categoryId → AND category_id = ?
  │  ├─ IF query.isActive → AND is_active = ?
  │  ├─ IF query.search → AND (name LIKE ? OR sku LIKE ?)
  │  └─ ... more filters
  │
  ├─ Step 3: Apply Sorting
  │  └─ ORDER BY [validated field] [ASC/DESC]
  │
  ├─ Step 4: Calculate Pagination
  │  ├─ page = Math.max(query.page, 1)
  │  ├─ limit = Math.min(Math.max(query.limit, 1), 100)
  │  ├─ skip = (page - 1) * limit
  │  └─ Example: page=2, limit=20 → skip 20, take 20
  │
  ├─ Step 5: Execute with Pagination
  │  └─ .skip(skip).take(limit).getManyAndCount()
  │     Returns: [data: Product[], total: number]
  │
  ├─ Step 6: Enrich Data (if needed)
  │  └─ Attach inventory levels, images, etc.
  │
  └─ Step 7: Return Wrapped Response
     └─ new PaginatedResponseDto(data, total, page, limit)


══════════════════════════════════════════════════════════════════════

                    DATABASE QUERY GENERATED

Scenario: 
  GET /api/products?categoryId=uuid&isActive=true&sortBy=price&page=2&limit=20

Generated SQL:
┌──────────────────────────────────────────────────────────────────┐
│ SELECT product.* FROM products                                   │
│ WHERE                                                            │
│   business_id = $1                                              │
│   AND deleted_at IS NULL                                        │
│   AND category_id = $2                                          │
│   AND is_active = $3                                            │
│ ORDER BY selling_price ASC                                      │
│ LIMIT $4 OFFSET $5                                              │
│ -- $1: businessId                                               │
│ -- $2: categoryId (uuid)                                        │
│ -- $3: isActive (true)                                          │
│ -- $4: limit (20)                                               │
│ -- $5: offset ((2-1) * 20 = 20)                                │
└──────────────────────────────────────────────────────────────────┘

Result:
  - Fetches records 20-40 (page 2)
  - Only filtered records
  - Sorted by price
  - Count of total matching records also returned


══════════════════════════════════════════════════════════════════════

                    VALIDATION PIPELINE

Raw Query String:
  ?page=abc&limit=500&sortBy=hack&search=test

         ↓

ListProductsQueryDto Validation Rules:
  ├─ page:
  │  ├─ @Type(() => Number) → Converts "abc" to NaN → fails @IsInt
  │  ├─ @IsInt() → Validates is integer
  │  └─ @Min(1) → Enforces minimum
  │
  ├─ limit:
  │  ├─ @Type(() => Number) → Converts "500" to 500
  │  ├─ @IsInt() → ✓ Valid
  │  └─ @Max(100) → ✗ 500 > 100, fails
  │
  ├─ sortBy:
  │  ├─ @IsString() → ✓ Valid
  │  └─ Validated in service via validateSortField()
  │
  └─ search:
     └─ @IsString() → ✓ Valid

Result:
  If validation PASSES:
    ✓ Query proceeds with validated values
    ✓ Invalid values get defaults
  
  If validation FAILS:
    ✗ Returns 400 Bad Request
    ✗ Client gets detailed error messages


══════════════════════════════════════════════════════════════════════

                    REQUEST/RESPONSE LIFECYCLE

Request:
  GET /api/products?categoryId=uuid&page=2&limit=15&sortBy=price

         │
         ▼ NestJS Parses
         
{
  categoryId: "uuid",
  page: "2",          ← Note: still string
  limit: "15",        ← Note: still string
  sortBy: "price"
}

         │
         ▼ ClassValidator Validates & Transforms
         
{
  categoryId: "uuid",  ← @IsUUID validates
  page: 2,            ← @Type(() => Number) transforms
  limit: 15,          ← @Type(() => Number) transforms
  sortBy: "price"     ← @IsString validates
}

         │
         ▼ Service Processes
         
Page 2 with limit 15:
  Skip: (2-1) * 15 = 15
  Take: 15
  
Returns records 15-30

         │
         ▼ Response
         
{
  "data": [ ...15 products... ],
  "total": 156,
  "page": 2,
  "limit": 15,
  "totalPages": 11
}


══════════════════════════════════════════════════════════════════════

                    FILES STRUCTURE

biztrack-cm/
├── apps/api/src/
│   ├── common/dto/
│   │   ├── list-query.dto.ts ✅ CREATED
│   │   └── paginated-response.dto.ts ✅ CREATED
│   │
│   └── modules/products/
│       ├── controllers/
│       │   ├── products.controller.ts (UPDATE ME)
│       │   ├── categories.controller.ts (UPDATE ME)
│       │   ├── product-images.controller.ts (UPDATE ME)
│       │   └── unit-of-measures.controller.ts (UPDATE ME)
│       │
│       ├── services/
│       │   ├── products.service.ts (UPDATE ME)
│       │   ├── categories.service.ts (UPDATE ME)
│       │   ├── product-images.service.ts (UPDATE ME)
│       │   └── unit-of-measures.service.ts (UPDATE ME)
│       │
│       └── dto/
│           ├── list-products-query.dto.ts ✅ CREATED
│           ├── list-categories-query.dto.ts ✅ CREATED
│           ├── list-product-images-query.dto.ts ✅ CREATED
│           └── list-unit-of-measures-query.dto.ts ✅ CREATED
│
└── docs/
    ├── pagination-standard.md ✅ CREATED (16 sections)
    ├── pagination-implementation-guide.md ✅ CREATED (4 phases)
    ├── pagination-architecture.md ✅ CREATED (11 sections)
    ├── PAGINATION_SOLUTION.md ✅ CREATED (master summary)
    └── pagination-visual-reference.md ✅ CREATED (this file)


══════════════════════════════════════════════════════════════════════

                    QUICK API EXAMPLES

GET /api/products
→ page=1, limit=20 (defaults)
→ Returns first 20 products

GET /api/products?page=3
→ Returns products 41-60

GET /api/products?limit=50
→ Returns first 50 products

GET /api/products?limit=100&page=1
→ Returns 100 products (maximum)

GET /api/products?limit=999&page=1
→ limit clamped to 100, returns 100 products

GET /api/products?page=0&limit=10
→ page clamped to 1, returns first 10

GET /api/products?search=iPhone
→ Searches name/sku/barcode, returns first 20 matches

GET /api/products?categoryId=uuid&isActive=true&page=1&limit=20
→ Filters + pagination

GET /api/products?search=item&sortBy=price&sortOrder=DESC&page=2&limit=30
→ Search + sorting + pagination, page 2


══════════════════════════════════════════════════════════════════════

                    IMPLEMENTATION CHECKLIST

Controllers (4 files):
  ☐ products.controller.ts
    ☐ Update findAll() with @Query() query: ListProductsQueryDto
    ☐ Pass full query object to service
    
  ☐ categories.controller.ts
    ☐ Update findAll() with @Query() query: ListCategoriesQueryDto
    
  ☐ product-images.controller.ts
    ☐ Update findAll() with @Query() query: ListProductImagesQueryDto
    
  ☐ unit-of-measures.controller.ts
    ☐ Update findAll() with @Query() query: ListUnitOfMeasuresQueryDto

Services (4 files):
  ☐ products.service.ts
    ☐ Update findAll() to accept ListProductsQueryDto
    ☐ Add query builder with pagination
    ☐ Add sortField validation
    
  ☐ categories.service.ts
    ☐ Update findAll() to use repository.paginate()
    
  ☐ product-images.service.ts
    ☐ Update list() with pagination
    
  ☐ unit-of-measures.service.ts
    ☐ Update findForBusiness() with pagination

Testing:
  ☐ Test basic pagination
  ☐ Test sorting
  ☐ Test search
  ☐ Test filters
  ☐ Test edge cases (page=0, limit=0, limit=500)
  ☐ Update Postman collection
  ☐ Update API documentation


══════════════════════════════════════════════════════════════════════

                    KEY PRINCIPLES

1. CONSISTENCY
   All modules follow same pagination pattern

2. PERFORMANCE
   Database-level LIMIT/OFFSET, not memory pagination

3. SAFETY
   Validation at controller, whitelist of sort fields

4. USABILITY
   Reasonable defaults (page=1, limit=20)

5. SCALABILITY
   Works from 100 to 1,000,000 records

6. DEVELOPER EXPERIENCE
   Type-safe DTOs, auto-generated docs, clear errors


══════════════════════════════════════════════════════════════════════

START HERE:
  1. Read: docs/PAGINATION_SOLUTION.md
  2. Read: docs/pagination-implementation-guide.md
  3. Code: Update 4 controllers
  4. Code: Update 4 services
  5. Test: Use Postman examples above
  6. Deploy: To staging → production
