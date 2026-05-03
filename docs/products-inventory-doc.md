# Products & Inventory Modules
## Complete Documentation — Business Logic, Architecture & Implementation Guide
**BizTrack CM · NestJS + TypeORM + PostgreSQL**

---

## 1. Purpose & Business Context

Every BizTrack CM business needs to manage two closely related but distinct concerns:

**Products** — the catalog of what a business sells. A product record describes something: its name, price, SKU, barcode, category, and unit of measure. Products change slowly — a shop owner adds new products, updates prices, maybe removes discontinued items. Products exist independently of whether any stock is available.

**Inventory** — the quantity of each product currently available. Inventory changes constantly — every sale reduces it, every restock increases it, every manual adjustment corrects it. Inventory is also the source for alerts: when stock drops below a threshold, the system notifies the owner.

These are deliberately implemented as **two separate modules** because they have different lifecycles, different actors, and different data access patterns. The products module is managed by owners and managers. The inventory module is updated automatically by the sales module and manually by anyone with restocking permissions.

---

## 2. Multi-Tenancy — Row-Level Business Isolation

BizTrack CM does not use database-level multi-tenancy (separate schemas or databases per business). Instead, every product and inventory record carries a `businessId` column. All queries are scoped to the requesting business at the service layer.

### The Rule

**Every repository query on product-related tables must include `businessId` as a condition.** There are no exceptions. A product fetched without a `businessId` filter would expose one business's catalog to another — a critical data leak.

### How It Is Enforced

The `Phase2Guard` embeds `businessId` in the JWT payload. Every guarded controller has `businessId` available via `@CurrentUser()`. Services receive `businessId` as an explicit parameter — never inferred from context or defaulted.

```typescript
// Pattern used in every product service method
async findAll(businessId: string, filters: ProductFiltersDto) {
  return this.productRepo.find({
    where: {
      businessId,           // ← always first condition
      ...buildFilters(filters),
    },
  })
}
```

A shared `BusinessScopedRepository<T>` base class wraps TypeORM's `Repository<T>` and enforces `businessId` on every `find`, `findOne`, `update`, and `delete` call. Methods that do not receive a `businessId` will throw at runtime — not silently return wrong data.

---

## 3. SKU & Barcode Strategy

### 3.1 SKU (Stock Keeping Unit)

The SKU is the **internal identifier** for a product within a business. Every product must have one.

Rules:
- If the business owner provides a SKU → validate uniqueness within the business → use as-is
- If no SKU is provided → auto-generate one using the format below
- SKU is unique per business, not globally (two businesses can have the same SKU)
- SKU is immutable once set — changing it breaks references in sales history

**Auto-generated SKU format:**
```
{TYPE_PREFIX}-{TIMESTAMP_BASE36}-{RANDOM_4}

Examples:
  GEN-LV3K2M-A4F2      (general product, no category)
  DRK-LV3K2M-B8C1      (category: drinks)
  PHM-LV3K2M-C3D9      (category: pharmacy)

Where:
  TYPE_PREFIX   = 3-letter category code (or GEN if no category)
  TIMESTAMP     = Date.now().toString(36).toUpperCase() — last 6 chars
  RANDOM_4      = 4 random alphanumeric characters (uppercase)
```

This format is:
- Short enough to print on labels
- Sortable by creation time (timestamp component)
- Human-readable (category prefix is recognisable)
- Collision-resistant (random suffix)

### 3.2 Barcode

The barcode is the **scannable code** on the product. It may be provided (from an existing manufacturer barcode) or auto-generated.

**If a barcode is explicitly provided** (scanned from packaging):
- Accept any standard format: EAN-13, EAN-8, UPC-A, Code128, QR
- Validate format with a check digit verification for EAN-13/EAN-8/UPC-A
- Store as a plain string — the format type is auto-detected on scan

**If no barcode is provided:**
- Generate an **internal EAN-13** barcode from the SKU
- Use **prefix 200–299** — the GS1 "internal use" range reserved specifically for in-store barcodes that will never be registered globally
- This means the barcode is valid EAN-13 format and scannable by any standard scanner, but it is understood to be an internal code, not a globally registered product

**EAN-13 generation from SKU:**
```typescript
function generateEAN13FromSKU(sku: string): string {
  // Use prefix 200 (internal use range)
  // Convert SKU characters to a 12-digit number via hash
  const hash = hashSKUToNumeric(sku)  // deterministic 9-digit number from SKU
  const base = `200${hash.toString().padStart(9, '0')}` // 12 digits
  const checkDigit = calculateEAN13CheckDigit(base)
  return `${base}${checkDigit}`       // 13 digits
}

function calculateEAN13CheckDigit(digits: string): number {
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i]) * (i % 2 === 0 ? 1 : 3)
  }
  return (10 - (sum % 10)) % 10
}
```

**Key point:** The barcode value stored in the database is always a plain string. The visual barcode rendering (the black lines image for printing labels) is generated on-the-fly by the frontend using a library like `JsBarcode` — it is never stored.

### 3.3 SKU → Barcode Relationship

```
SCENARIO                              SKU             BARCODE
─────────────────────────────────────────────────────────────
Owner provides both                   provided        provided
Owner provides SKU, no barcode        provided        generated from SKU
Owner provides barcode, no SKU        generated       provided
Owner provides neither                generated       generated from generated SKU
Owner scans existing product          generated       scanned value
```

The SKU and barcode are stored separately. They may be equal in value (when barcode is generated from SKU) but they serve different purposes and must remain distinct fields.

---

## 4. Database Schema

### 4.1 Products Module Tables

#### `product_categories`
Business-scoped product categories. Each business has its own categories.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| business_id | uuid FK → businesses | INDEX — row-level tenancy |
| name | varchar(100) | e.g. "Boissons", "Alimentation" |
| slug | varchar(100) | lowercase, hyphenated — for filtering |
| color | varchar(7) NULLABLE | Hex color for UI display |
| icon | varchar(50) NULLABLE | Icon name for UI |
| sort_order | int DEFAULT 0 | Display ordering |
| created_at | timestamptz | |
| | | UNIQUE(business_id, slug) | |

#### `unit_of_measures`
System-wide (not business-scoped) — predefined units shared across all businesses.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | varchar(50) | e.g. "Piece", "Kilogram", "Litre" |
| abbreviation | varchar(10) | e.g. "pcs", "kg", "L" |
| type | enum(UOMType) | QUANTITY \| WEIGHT \| VOLUME \| LENGTH |
| is_default | boolean DEFAULT false | |

Seeded at deployment — not user-configurable at launch.

#### `products`
The core product catalog. One row per product per business.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| business_id | uuid FK → businesses | INDEX — row-level tenancy |
| category_id | uuid FK → product_categories NULLABLE | |
| unit_of_measure_id | uuid FK → unit_of_measures | |
| name | varchar(200) | |
| description | text NULLABLE | |
| sku | varchar(100) | INDEX — unique per business |
| barcode | varchar(100) NULLABLE | INDEX — unique per business when set |
| barcode_type | enum(BarcodeType) NULLABLE | EAN13 \| EAN8 \| UPCA \| CODE128 \| QR \| INTERNAL |
| is_barcode_generated | boolean DEFAULT false | true = system-generated, false = user-provided |
| selling_price | decimal(12,2) | Price charged to customers (XAF) |
| cost_price | decimal(12,2) NULLABLE | Purchase/cost price — for margin calculation |
| currency | varchar(10) DEFAULT 'XAF' | |
| tax_rate | decimal(5,2) DEFAULT 0 | Percentage — for future tax support |
| is_active | boolean DEFAULT true | Soft disable without deleting |
| is_service | boolean DEFAULT false | Services have no inventory tracking |
| image_url | varchar(500) NULLABLE | Product photo |
| created_by | uuid FK → users | Who created the product |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| | | UNIQUE(business_id, sku) | |
| | | UNIQUE(business_id, barcode) WHERE barcode IS NOT NULL | Partial unique index |

**Note on `is_service`:** Service products (haircuts, consultations, repairs) have no physical stock. They can be added to a sale but the inventory module ignores them — no stock deduction, no restock needed. This is an important distinction for salons, repair shops, and restaurants.

#### `product_images`
Multiple images per product (future v2 — not required at launch but schema should support it).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| product_id | uuid FK → products CASCADE | |
| url | varchar(500) | |
| sort_order | int DEFAULT 0 | |
| created_at | timestamptz | |

### 4.2 Inventory Module Tables

#### `inventory_levels`
The current stock quantity for each product. One row per product (per location in Pro plan with branches — see note).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| business_id | uuid FK → businesses | INDEX |
| product_id | uuid FK → products | INDEX |
| location_id | uuid FK → business_locations NULLABLE | NULL = main/only location |
| quantity | decimal(12,3) | Decimal supports partial units (0.5 kg) |
| reserved_quantity | decimal(12,3) DEFAULT 0 | Reserved for pending orders (future) |
| low_stock_threshold | int NULLABLE | Alert when quantity drops below this |
| reorder_point | int NULLABLE | Suggested reorder quantity |
| last_restock_at | timestamptz NULLABLE | |
| updated_at | timestamptz | |
| | | UNIQUE(product_id, location_id) | |

**Note on branches:** For Solo and Business plans (single location), `location_id` is NULL. For Pro plan (multi-branch), each branch has its own `inventory_levels` row per product. This means the same product can have different stock levels at different branches without any schema change.

#### `inventory_movements`
The immutable audit log of every stock change. Never updated — append only.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| business_id | uuid FK → businesses | INDEX |
| product_id | uuid FK → products | INDEX |
| location_id | uuid NULLABLE | |
| type | enum(MovementType) | See below |
| quantity_change | decimal(12,3) | Positive = stock in, Negative = stock out |
| quantity_before | decimal(12,3) | Snapshot before this movement |
| quantity_after | decimal(12,3) | Snapshot after this movement |
| reference_type | varchar(50) NULLABLE | SALE \| RESTOCK \| ADJUSTMENT \| TRANSFER |
| reference_id | uuid NULLABLE | FK to the sale, restock, or adjustment record |
| notes | text NULLABLE | |
| performed_by | uuid FK → users | Who triggered this movement |
| created_at | timestamptz | |

**MovementType enum:**
```
SALE_OUT          Product sold — triggered by sales module
SALE_VOID         Sale voided — reverses a SALE_OUT
RESTOCK_IN        Manual restock by owner/manager
ADJUSTMENT_UP     Manual positive correction
ADJUSTMENT_DOWN   Manual negative correction
TRANSFER_OUT      Stock moved to another branch (Pro plan)
TRANSFER_IN       Stock received from another branch (Pro plan)
OPENING_STOCK     Initial stock set when product is created
```

#### `restock_records`
Formal records of restocking events (purchasing stock from a supplier).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| business_id | uuid FK → businesses | INDEX |
| reference_number | varchar(100) NULLABLE | Invoice or delivery number |
| supplier_name | varchar(200) NULLABLE | |
| total_cost | decimal(12,2) NULLABLE | Total amount paid for this restock |
| notes | text NULLABLE | |
| performed_by | uuid FK → users | |
| created_at | timestamptz | |

#### `restock_items`
The individual product lines within a restock record.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| restock_id | uuid FK → restock_records CASCADE | |
| product_id | uuid FK → products | |
| quantity_added | decimal(12,3) | |
| unit_cost | decimal(12,2) NULLABLE | Cost per unit for this restock |

---

## 5. Module Structure

```
apps/api/src/modules/
│
├── products/
│   ├── products.module.ts
│   ├── products.controller.ts
│   ├── products.service.ts
│   ├── products.service.spec.ts
│   │
│   ├── sku.service.ts           SKU generation + validation
│   ├── barcode.service.ts       Barcode generation + validation
│   │
│   ├── categories/
│   │   ├── categories.controller.ts
│   │   └── categories.service.ts
│   │
│   └── dto/
│       ├── create-product.dto.ts
│       ├── update-product.dto.ts
│       ├── product-filters.dto.ts
│       ├── create-category.dto.ts
│       └── update-category.dto.ts
│
└── inventory/
    ├── inventory.module.ts
    ├── inventory.controller.ts
    ├── inventory.service.ts
    ├── inventory.service.spec.ts
    │
    ├── inventory.scheduler.ts   Low-stock alert checks (cron)
    │
    ├── restock/
    │   ├── restock.controller.ts
    │   └── restock.service.ts
    │
    └── dto/
        ├── adjust-stock.dto.ts
        ├── restock.dto.ts
        ├── set-threshold.dto.ts
        └── inventory-filters.dto.ts
```

---

## 6. Products Module — Endpoints

### 6.1 Categories

#### GET /products/categories
Returns all categories for the authenticated business.
**Permission:** `PRODUCTS_VIEW`

Response:
```
[ { id, name, slug, color, icon, sortOrder, productCount } ]
```

#### POST /products/categories
Create a new category.
**Permission:** `PRODUCTS_CREATE`

```
name        string    required    max 100 chars
color       string    optional    hex color e.g. "#185FA5"
icon        string    optional    icon name
sortOrder   number    optional    defaults to end of list
```

Auto-generates `slug` from name (lowercased, spaces to hyphens, accents stripped).
Validates uniqueness within the business.

#### PATCH /products/categories/:id
Update category name, color, icon, sort order.
**Permission:** `PRODUCTS_EDIT`

#### DELETE /products/categories/:id
**Permission:** `PRODUCTS_DELETE`

Business rule: Cannot delete a category that has active products assigned to it.
Returns 409 with `{ productCount: N }` if products exist.
Option: pass `?reassignTo=<categoryId>` to move all products to another category before deletion.

---

### 6.2 Products

#### GET /products
Returns paginated product list for the business.
**Permission:** `PRODUCTS_VIEW`

Query params:
```
q             string    Search by name, SKU, or barcode
categoryId    uuid      Filter by category
isActive      boolean   Default: true
isService     boolean   Filter service vs physical products
page          number    Default: 1
limit         number    Default: 20, max: 100
sortBy        string    name | createdAt | sellingPrice | updatedAt
sortDir       asc | desc
```

Response per product:
```
id, name, sku, barcode, barcodeType, isBarcodeGenerated,
categoryId, categoryName, unitOfMeasure,
sellingPrice, costPrice, currency,
isActive, isService, imageUrl,
currentStock,    ← joined from inventory_levels (convenience field)
lowStockThreshold,
createdAt, updatedAt
```

Note: `currentStock` is a convenience field joined from `inventory_levels`. It is included in list responses to avoid a second API call. For service products, it is always `null`.

#### GET /products/:id
Full product detail.
**Permission:** `PRODUCTS_VIEW`

Additional fields beyond list response:
```
description, taxRate, createdBy,
stockMovementCount,   ← total number of movements ever
lastRestockAt,
images[]
```

#### POST /products
Create a new product.
**Permission:** `PRODUCTS_CREATE`

```
name              string      required    max 200 chars
categoryId        uuid        optional
unitOfMeasureId   uuid        optional    defaults to "Piece"
sku               string      optional    auto-generated if not provided
barcode           string      optional    auto-generated from SKU if not provided
sellingPrice      number      required    in business currency (XAF)
costPrice         number      optional    for margin tracking
description       string      optional
isService         boolean     optional    default false
taxRate           number      optional    default 0
openingStock      number      optional    initial stock quantity (ignored for services)
lowStockThreshold number      optional    alert threshold
```

**SKU handling:**
1. If `sku` provided → validate: alphanumeric + hyphens, max 100 chars → check uniqueness within business → use as-is
2. If `sku` not provided → generate using `SkuService.generate(businessId, categorySlug)`

**Barcode handling:**
1. If `barcode` provided → detect format → validate check digit (for EAN/UPC) → check uniqueness within business → store with `isBarcodeGenerated: false`
2. If `barcode` not provided → generate EAN-13 using `BarcodeService.generateFromSKU(sku)` → store with `isBarcodeGenerated: true`

**Opening stock:**
If `openingStock > 0` and product is not a service:
- Create `inventory_levels` record with `quantity = openingStock`
- Create `inventory_movements` record with `type: OPENING_STOCK`
- This is the only time a product creation touches the inventory module

**Response:** Full product object including generated SKU and barcode.

#### PATCH /products/:id
Update product details.
**Permission:** `PRODUCTS_EDIT`

All fields optional except constraints:
- `sku` is **immutable** — returns 400 if SKU change is attempted. SKU is the stable internal identifier referenced in sales history.
- `barcode` can be updated (e.g. assigning a real manufacturer barcode to a product that had a generated one)
- `sellingPrice` changes are allowed and take effect immediately on new sales
- `isService` can only be changed if the product has **zero stock movements** — changing a physical product to a service after sales would corrupt history

#### DELETE /products/:id
**Permission:** `PRODUCTS_DELETE`

Soft delete: sets `isActive = false`. Products are never hard-deleted because they may be referenced in sales history.

Hard delete requires: no sales history + no inventory movements. Returns 409 if referenced.

#### POST /products/:id/assign-barcode
Assign or reassign a barcode to a product (e.g. after scanning a manufacturer barcode for an existing product that had a generated one).
**Permission:** `PRODUCTS_EDIT`

```
barcode     string    required
```

Validates format and uniqueness. Updates `barcode`, `barcodeType`, and sets `isBarcodeGenerated: false`.

#### GET /products/by-barcode/:barcode
Look up a product by its barcode value (used by scanner flow).
**Permission:** `PRODUCTS_VIEW`

Returns the full product + current stock level or 404 if not found in this business.

This is the endpoint called in the scanner flow when a barcode is scanned successfully.

#### GET /products/by-sku/:sku
Look up a product by SKU.
**Permission:** `PRODUCTS_VIEW`

---

## 7. SKU Service

```typescript
// products/sku.service.ts

@Injectable()
export class SkuService {
  constructor(
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
  ) {}

  async generate(businessId: string, categorySlug?: string): Promise<string> {
    const prefix = this.getCategoryPrefix(categorySlug)
    const timestamp = Date.now().toString(36).toUpperCase().slice(-6)

    let sku: string
    let attempts = 0

    do {
      const random = this.randomAlphanumeric(4)
      sku = `${prefix}-${timestamp}-${random}`
      attempts++
      if (attempts > 10) throw new Error('SKU generation failed after 10 attempts')
    } while (await this.existsInBusiness(businessId, sku))

    return sku
  }

  async validateAndNormalize(
    businessId: string,
    sku: string,
    excludeProductId?: string,
  ): Promise<string> {
    // Normalize: uppercase, trim
    const normalized = sku.trim().toUpperCase()

    // Validate format: alphanumeric + hyphens + underscores only
    if (!/^[A-Z0-9\-_]{1,100}$/.test(normalized)) {
      throw new BadRequestException({
        code: 'INVALID_SKU_FORMAT',
        message: 'SKU must contain only letters, numbers, hyphens, and underscores.',
      })
    }

    // Check uniqueness within business
    const exists = await this.productRepo.findOne({
      where: {
        businessId,
        sku: normalized,
        ...(excludeProductId ? { id: Not(excludeProductId) } : {}),
      },
    })

    if (exists) {
      throw new ConflictException({
        code: 'SKU_ALREADY_EXISTS',
        message: `SKU "${normalized}" is already used by another product in this business.`,
      })
    }

    return normalized
  }

  private getCategoryPrefix(categorySlug?: string): string {
    if (!categorySlug) return 'GEN'
    // Take first 3 chars of slug, uppercase, strip hyphens
    return categorySlug
      .replace(/-/g, '')
      .toUpperCase()
      .slice(0, 3)
      .padEnd(3, 'X')
  }

  private randomAlphanumeric(length: number): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous chars O,0,I,1
    return Array.from({ length }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('')
  }

  private async existsInBusiness(businessId: string, sku: string): Promise<boolean> {
    return this.productRepo.existsBy({ businessId, sku })
  }
}
```

---

## 8. Barcode Service

```typescript
// products/barcode.service.ts

export enum BarcodeType {
  EAN13    = 'EAN13',
  EAN8     = 'EAN8',
  UPCA     = 'UPCA',
  CODE128  = 'CODE128',
  QR       = 'QR',
  INTERNAL = 'INTERNAL',  // generated EAN-13 in 200-299 range
}

@Injectable()
export class BarcodeService {
  constructor(
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
  ) {}

  // Generate an internal EAN-13 from a SKU
  generateFromSKU(sku: string): { value: string; type: BarcodeType } {
    // Hash SKU to a deterministic 9-digit number
    const hash = this.hashToNineDigits(sku)
    // Use 200-299 prefix range (GS1 internal use)
    const base = `200${hash.toString().padStart(9, '0')}`
    const checkDigit = this.ean13CheckDigit(base)
    return {
      value: `${base}${checkDigit}`,
      type:  BarcodeType.INTERNAL,
    }
  }

  // Detect barcode type from its value
  detectType(value: string): BarcodeType {
    if (/^\d{13}$/.test(value)) return BarcodeType.EAN13
    if (/^\d{8}$/.test(value))  return BarcodeType.EAN8
    if (/^\d{12}$/.test(value)) return BarcodeType.UPCA
    return BarcodeType.CODE128  // alphanumeric fallback
  }

  // Validate check digit for EAN-13, EAN-8, UPC-A
  validateCheckDigit(value: string, type: BarcodeType): boolean {
    if (type === BarcodeType.EAN13 || type === BarcodeType.UPCA) {
      const base = value.slice(0, -1)
      const provided = parseInt(value.slice(-1))
      return this.ean13CheckDigit(base) === provided
    }
    if (type === BarcodeType.EAN8) {
      const base = value.slice(0, -1)
      const provided = parseInt(value.slice(-1))
      return this.ean8CheckDigit(base) === provided
    }
    return true  // CODE128 and QR have no simple check digit
  }

  async validateAndCheck(
    businessId: string,
    barcode: string,
    excludeProductId?: string,
  ): Promise<{ value: string; type: BarcodeType }> {
    const type = this.detectType(barcode)

    // Validate check digit for EAN formats
    if ([BarcodeType.EAN13, BarcodeType.EAN8, BarcodeType.UPCA].includes(type)) {
      if (!this.validateCheckDigit(barcode, type)) {
        throw new BadRequestException({
          code: 'INVALID_BARCODE_CHECK_DIGIT',
          message: 'Barcode check digit is invalid. Please scan again.',
        })
      }
    }

    // Validate uniqueness within business
    const exists = await this.productRepo.findOne({
      where: {
        businessId,
        barcode,
        ...(excludeProductId ? { id: Not(excludeProductId) } : {}),
      },
    })

    if (exists) {
      throw new ConflictException({
        code: 'BARCODE_ALREADY_EXISTS',
        productId: exists.id,
        productName: exists.name,
        message: `Barcode is already assigned to "${exists.name}".`,
      })
    }

    return { value: barcode, type }
  }

  private hashToNineDigits(input: string): number {
    // Simple deterministic hash — produces consistent 9-digit number from string
    let hash = 0
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash) + input.charCodeAt(i)
      hash = hash & hash  // Convert to 32-bit int
    }
    return Math.abs(hash) % 1_000_000_000
  }

  private ean13CheckDigit(twelveDigits: string): number {
    let sum = 0
    for (let i = 0; i < 12; i++) {
      sum += parseInt(twelveDigits[i]) * (i % 2 === 0 ? 1 : 3)
    }
    return (10 - (sum % 10)) % 10
  }

  private ean8CheckDigit(sevenDigits: string): number {
    let sum = 0
    for (let i = 0; i < 7; i++) {
      sum += parseInt(sevenDigits[i]) * (i % 2 === 0 ? 3 : 1)
    }
    return (10 - (sum % 10)) % 10
  }
}
```

---

## 9. Inventory Module — Endpoints

### 9.1 Stock Levels

#### GET /inventory
Returns current stock levels for all products in the business.
**Permission:** `INVENTORY_VIEW`

Query params:
```
lowStockOnly    boolean   Return only products below threshold
outOfStockOnly  boolean   Return only products with quantity = 0
locationId      uuid      Filter by branch (Pro plan)
q               string    Search by product name or SKU
page, limit, sortBy, sortDir
```

Response per item:
```
productId, productName, sku, barcode, categoryName,
quantity, reservedQuantity, availableQuantity,
lowStockThreshold, reorderPoint,
isLowStock,      ← quantity <= lowStockThreshold
isOutOfStock,    ← quantity === 0
lastMovementAt, lastRestockAt
```

#### GET /inventory/:productId
Stock detail for a single product.
**Permission:** `INVENTORY_VIEW`

Returns stock level + last 20 movements for this product.

#### PATCH /inventory/:productId/threshold
Set or update the low-stock alert threshold for a product.
**Permission:** `INVENTORY_ADJUST`

```
lowStockThreshold   number    nullable — null removes the alert
reorderPoint        number    optional — suggested reorder quantity
```

---

### 9.2 Stock Adjustments

#### POST /inventory/:productId/adjust
Manual stock adjustment (positive or negative correction).
**Permission:** `INVENTORY_ADJUST`

```
quantityChange  number    required    positive or negative
reason          string    required    why the adjustment is being made
locationId      uuid      optional    for multi-branch (Pro plan)
```

Business rules:
- `quantityChange` cannot result in a negative stock level (returns 400 with `{ currentQuantity, requested }`)
- Creates an `inventory_movements` record with type `ADJUSTMENT_UP` or `ADJUSTMENT_DOWN`
- Updates `inventory_levels.quantity` atomically (using a DB transaction)
- Audit logged

#### POST /inventory/restock
Record a restocking event (one or more products received together).
**Permission:** `INVENTORY_ADJUST`

```
referenceNumber   string      optional    delivery note or invoice number
supplierName      string      optional
totalCost         number      optional
notes             string      optional
locationId        uuid        optional
items: [
  {
    productId   uuid      required
    quantity    number    required    must be > 0
    unitCost    number    optional
  }
]
```

Business rules:
- All items are processed in a single DB transaction — all succeed or all fail
- Creates one `restock_records` row + N `restock_items` rows
- Creates N `inventory_movements` rows (type: `RESTOCK_IN`)
- Updates N `inventory_levels` rows
- Updates `inventory_levels.last_restock_at`

Response: Full restock record with updated stock levels for each product.

---

### 9.3 Stock Movement History

#### GET /inventory/:productId/movements
Paginated movement history for a product.
**Permission:** `INVENTORY_VIEW`

Query params: `page`, `limit`, `type` (filter by MovementType), `dateFrom`, `dateTo`

Response per movement:
```
id, type, quantityChange, quantityBefore, quantityAfter,
referenceType, referenceId,
notes, performedBy (name), createdAt
```

#### GET /inventory/movements
All stock movements across all products for the business.
**Permission:** `INVENTORY_VIEW`

Same query params as above, plus `productId` filter.
Used for the inventory report in the web dashboard.

---

### 9.4 Low Stock Alerts

#### GET /inventory/alerts
Returns all products currently below their low-stock threshold.
**Permission:** `INVENTORY_VIEW`

Response per alert:
```
productId, productName, sku, categoryName,
currentQuantity, lowStockThreshold, reorderPoint,
shortfall    ← threshold - currentQuantity
```

Sorted by shortfall descending (most urgent first).

---

## 10. Inventory Scheduler

A cron job runs **once daily at 08:00 Cameroon time** to check for low-stock conditions and send alerts.

```typescript
// inventory/inventory.scheduler.ts

@Cron('0 7 * * *', { timeZone: 'Africa/Douala' })
async checkLowStockAlerts() {
  // Find all inventory_levels where:
  // quantity <= low_stock_threshold AND low_stock_threshold IS NOT NULL
  // Join with business + owner user for notification

  const lowStockItems = await this.inventoryRepo
    .createQueryBuilder('il')
    .innerJoin('il.product', 'p')
    .innerJoin('il.business', 'b')
    .innerJoin('b.user', 'u')
    .where('il.low_stock_threshold IS NOT NULL')
    .andWhere('il.quantity <= il.low_stock_threshold')
    .andWhere('p.is_active = true')
    .andWhere('p.is_service = false')
    .select([...])
    .getMany()

  // Group by business — one notification per business (not per product)
  const grouped = groupBy(lowStockItems, 'businessId')

  for (const [businessId, items] of Object.entries(grouped)) {
    await this.notificationsService.sendLowStockAlert({
      user: items[0].business.user,
      items: items.map(i => ({
        name: i.product.name,
        quantity: i.quantity,
        threshold: i.lowStockThreshold,
      })),
    })
  }
}
```

Notification is grouped per business — a shop with 3 low-stock items gets one SMS, not three.

---

## 11. Integration With Sales Module

The sales module calls the inventory service directly — not through the HTTP layer. This is an internal service-to-service call within the same NestJS application.

```typescript
// Called by sales.service.ts when a sale is confirmed

// Deduct stock for each sold item
await this.inventoryService.deductForSale(
  businessId,
  [
    { productId: 'uuid1', quantity: 2 },
    { productId: 'uuid2', quantity: 1 },
  ],
  saleId,
  userId,
)

// Reverse stock for a voided sale
await this.inventoryService.reverseForVoidedSale(saleId, userId)
```

The inventory service processes all deductions in a **single DB transaction**. If any product has insufficient stock (and the business has strict stock enforcement enabled), the entire sale is rolled back.

**Stock enforcement modes** (configurable per business):
- `STRICT` — sale is blocked if any item has insufficient stock
- `WARN` — sale proceeds but owner is notified of negative stock
- `IGNORE` — stock goes negative, no alert (default for new businesses)

This setting lives on the `Business` entity and defaults to `IGNORE` to avoid blocking a new user's first sales before they've properly set up inventory.

---

## 12. RBAC — Permission Requirements

| Action | Required Resource Permission |
|--------|---------------------------|
| View products | `PRODUCTS_VIEW` |
| Create product | `PRODUCTS_CREATE` |
| Edit product | `PRODUCTS_EDIT` |
| Delete product | `PRODUCTS_DELETE` |
| Import products (CSV) | `PRODUCTS_IMPORT_CSV` |
| View inventory | `INVENTORY_VIEW` |
| Adjust stock | `INVENTORY_ADJUST` |
| View stock alerts | `INVENTORY_ALERTS` |
| Restock | `INVENTORY_ADJUST` |

**Role defaults:**
- `OWNER` — all of the above
- `MANAGER` — all of the above
- `CASHIER` — `PRODUCTS_VIEW` only (needs to see products to sell them, cannot modify)
- `ACCOUNTANT` — `PRODUCTS_VIEW`, `INVENTORY_VIEW` (read-only financial context)

---

## 13. Implementation Order

### Sprint 1 — Foundation
- Migrations: all tables above
- Seed `unit_of_measures` (Piece, Kg, Litre, Metre, Box, Packet, Bottle, Sachet)
- `SkuService` with generation + validation
- `BarcodeService` with EAN-13 generation + check digit validation
- Product categories CRUD
- `BusinessScopedRepository` base class

### Sprint 2 — Products Core
- `POST /products` — full creation with SKU/barcode logic
- `GET /products` — list with filters + pagination
- `GET /products/:id` — detail
- `PATCH /products/:id` — update with immutability rules
- `DELETE /products/:id` — soft delete
- `GET /products/by-barcode/:barcode` — scanner lookup
- `GET /products/by-sku/:sku`
- `POST /products/:id/assign-barcode`
- Unit tests for SKU and barcode generation

### Sprint 3 — Inventory Core
- `inventory_levels` creation on product creation (opening stock)
- `GET /inventory` — stock levels list
- `GET /inventory/:productId` — stock detail
- `POST /inventory/:productId/adjust` — manual adjustment
- `POST /inventory/restock` — bulk restock
- `GET /inventory/:productId/movements` — history
- `GET /inventory/alerts` — low stock
- `PATCH /inventory/:productId/threshold` — set threshold

### Sprint 4 — Integration & Automation
- Sales module integration (`deductForSale`, `reverseForVoidedSale`)
- `InventoryScheduler` — daily low-stock alert cron
- `GET /inventory/movements` — cross-product history
- Stock enforcement mode on Business entity
- Integration tests for concurrent stock deduction (race conditions)
