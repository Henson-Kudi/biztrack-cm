# Products & Inventory Modules
## Complete Documentation — Business Logic, Architecture & Implementation Guide
**BizTrack CM · NestJS + TypeORM + PostgreSQL**
> **v2** — Updated schema: category images, business-scoped UoM, product_images as primary strategy, slug, track_inventory flag

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

> **v2 change:** Added `image_url` — categories can now display a visual thumbnail in the UI
> (useful in the mobile POS product grid and the online shop if enabled).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| business_id | uuid FK → businesses | INDEX — row-level tenancy |
| name | varchar(100) | e.g. "Boissons", "Alimentation" |
| slug | varchar(100) | lowercase, hyphenated — for filtering |
| color | varchar(7) NULLABLE | Hex color for UI display |
| icon | varchar(50) NULLABLE | Icon name for UI |
| image_url | varchar(500) NULLABLE | Category thumbnail image |
| sort_order | int DEFAULT 0 | Display ordering |
| created_at | timestamptz | |
| | | UNIQUE(business_id, slug) | |

---

#### `unit_of_measures`
Shared system units **and** optional business-specific custom units.

> **v2 change:** Added `business_id` (nullable). Rows where `business_id IS NULL` are system-wide
> seeded units available to all businesses. Rows where `business_id` is set are custom units
> created by that business only.
>
> **Query rule:** Always filter as `WHERE business_id IS NULL OR business_id = :businessId`.
> This returns the full set a business can use — system defaults plus their own custom entries.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| business_id | uuid FK → businesses NULLABLE | NULL = system-wide; set = business-specific custom unit |
| name | varchar(50) | e.g. "Piece", "Kilogram", "Litre", "Cuvette" |
| abbreviation | varchar(10) | e.g. "pcs", "kg", "L", "cuv" |
| type | enum(UOMType) | QUANTITY \| WEIGHT \| VOLUME \| LENGTH \| CUSTOM |
| is_default | boolean DEFAULT false | Only meaningful for system-wide units (business_id IS NULL) |
| created_at | timestamptz | |
| | | UNIQUE(business_id, name) — business_id can be NULL, use NULLS NOT DISTINCT | |

**Fetching units for a business (service layer):**
```typescript
async findForBusiness(businessId: string): Promise<UnitOfMeasure[]> {
  return this.uomRepo.find({
    where: [
      { businessId: IsNull() },       // system-wide units
      { businessId: businessId },     // business custom units
    ],
    order: { isDefault: 'DESC', name: 'ASC' },
  })
}
```

**Creating a custom unit:**
- Requires `businessId` from the authenticated user — never taken from request body
- `is_default` is always `false` for business-created units
- The `CUSTOM` type covers units that don't fit the standard categories (e.g. "Cuvette", "Carton de 48", "Fagot")

---

#### `products`
The core product catalog. One row per product per business.

> **v2 changes:**
> - `image_url` retained — single product photo, quick to set, sufficient for most small shop owners
> - `product_images` relation added alongside `image_url` for full gallery support (online shop upsell path)
> - Added `slug` — URL-friendly identifier, unique per business; required now for online shop upsell path
> - Added `track_inventory` boolean — decouples inventory tracking from service classification.
>   A product can be non-service but still have tracking disabled (e.g. promotional items, gift vouchers).
>   The inventory module checks `track_inventory`, not `is_service`, when deciding whether to act.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| business_id | uuid FK → businesses | INDEX — row-level tenancy |
| category_id | uuid FK → product_categories NULLABLE | |
| unit_of_measure_id | uuid FK → unit_of_measures | |
| name | varchar(200) | |
| slug | varchar(220) | URL-friendly, auto-generated from name — INDEX, unique per business |
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
| is_service | boolean DEFAULT false | Marks the product type — service products typically don't need inventory |
| track_inventory | boolean DEFAULT true | Whether to track stock for this product. False = inventory module ignores it entirely |
| image_url | varchar(500) NULLABLE | Primary product photo — single image, quick upload |
| created_by | uuid FK → users | Who created the product |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| | | UNIQUE(business_id, sku) | |
| | | UNIQUE(business_id, slug) | |
| | | UNIQUE(business_id, barcode) WHERE barcode IS NOT NULL | Partial unique index |

**On `is_service` vs `track_inventory` — important distinction:**

| Scenario | is_service | track_inventory | Behaviour |
|----------|-----------|-----------------|-----------|
| Physical product, tracked (default) | false | true | Normal inventory deduction on sale |
| Physical product, not tracked (e.g. promo items, gift vouchers) | false | false | Sold freely, no stock deduction |
| Service (haircut, repair, consultation) | true | false | No stock concept; track_inventory auto-set false on creation |
| Service owner wants to track "units" (e.g. prepaid session packs) | true | true | Allowed — unusual but valid; inventory deducts on sale |

**Rule:** When `is_service = true` is set on creation, `track_inventory` defaults to `false` automatically. The owner can override this. When `is_service = false`, `track_inventory` defaults to `true` but can be manually disabled.

**On `slug`:**
- Auto-generated from `name` on creation: `"Eau Minérale 75cl"` → `"eau-minerale-75cl"`
- If slug already exists for that business, append a short suffix: `"eau-minerale-75cl-2"`
- Slug is used now for internal filtering/display and is the URL key if the online shop feature is activated (e.g. `biztrack.cm/shop/akwa-boutique/eau-minerale-75cl`)
- Slug is **not immutable** — it can be updated by an owner, but doing so invalidates any previously shared product URLs (warn the user in the UI)

---

#### `product_images`
Gallery images per product — coexists with `image_url` on the products table.

> **v2 note:** `image_url` on the `products` table remains the **primary display image** — it's the
> simple single-photo field most small shop owners will use. `product_images` is the **gallery
> relation** for businesses that want multiple photos (e.g. when the online shop feature is activated).
> The two are independent — a product can have `image_url` set with no rows in `product_images`,
> or have both, or have only gallery images.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| product_id | uuid FK → products CASCADE DELETE | |
| url | varchar(500) | Uploaded image URL (CDN or storage bucket) |
| alt_text | varchar(200) NULLABLE | Accessibility + online shop SEO |
| sort_order | int DEFAULT 0 | 0 = primary/display image; higher = gallery images |
| created_at | timestamptz | |

**Key rules:**
- A product can have zero images (image-less product is valid — common for small shops at launch)
- The image with the lowest `sort_order` is the primary display image
- Maximum images per product: 10 (enforced at service layer — enough for an online shop gallery)
- Deleting a product cascades and removes all its images
- Image upload itself is handled by the `StorageModule` (S3-compatible or Cloudflare R2) — this table only stores the resulting URL

**Fetching the primary image efficiently:**
```typescript
// When listing products, join only the primary image to avoid N+1
// Use a lateral join or subquery to get only sort_order = MIN per product

SELECT p.*, pi.url AS primary_image_url
FROM products p
LEFT JOIN LATERAL (
  SELECT url FROM product_images
  WHERE product_id = p.id
  ORDER BY sort_order ASC
  LIMIT 1
) pi ON true
WHERE p.business_id = $1
```

---

### 4.2 Inventory Module Tables

#### `inventory_levels`
The current stock quantity for each product. One row per product (per location in Pro plan with branches — see note).

> **v2 note:** The inventory module now checks `track_inventory` on the product before acting.
> Products where `track_inventory = false` are skipped entirely during sale deduction,
> restock processing, and low-stock alert checks.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| business_id | uuid FK → businesses | INDEX |
| product_id | uuid FK → products | UNIQUE per business (one level row per product) |
| quantity | decimal(12,3) DEFAULT 0 | Supports fractional quantities (kg, litres) |
| low_stock_threshold | decimal(12,3) NULLABLE | Alert when quantity ≤ this value |
| reorder_point | decimal(12,3) NULLABLE | Suggested reorder trigger (informational) |
| last_restock_at | timestamptz NULLABLE | |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| | | UNIQUE(business_id, product_id) | |

**Creation rule:** An `inventory_levels` row is created automatically when a product is created **only if `track_inventory = true`**. If `track_inventory` is later enabled on a product that had none, the row is created on demand with `quantity = 0`.

#### `inventory_movements`
Immutable audit log of every stock change.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| business_id | uuid FK → businesses | INDEX |
| product_id | uuid FK → products | INDEX |
| type | enum(MovementType) | SALE \| RESTOCK_IN \| MANUAL_ADJUSTMENT \| VOID_REVERSAL \| OPENING_STOCK \| TRANSFER_IN \| TRANSFER_OUT |
| quantity_change | decimal(12,3) | Positive = stock in, Negative = stock out |
| quantity_before | decimal(12,3) | Snapshot at time of movement |
| quantity_after | decimal(12,3) | Snapshot at time of movement |
| reference_type | varchar(50) NULLABLE | 'sale', 'restock', 'adjustment' |
| reference_id | uuid NULLABLE | FK to the source record (sale_id, restock_id, etc.) |
| notes | text NULLABLE | Manual notes for adjustments |
| performed_by | uuid FK → users | Who triggered the movement |
| created_at | timestamptz | Immutable — never updated |

#### `restock_records`
Header record for a restock operation (one per delivery/supplier visit).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| business_id | uuid FK → businesses | INDEX |
| reference_number | varchar(100) NULLABLE | Delivery note or invoice number |
| supplier_name | varchar(200) NULLABLE | |
| total_cost | decimal(12,2) NULLABLE | Total paid for this restock |
| notes | text NULLABLE | |
| performed_by | uuid FK → users | |
| created_at | timestamptz | |

#### `restock_items`
Line items for each restock record.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| restock_record_id | uuid FK → restock_records CASCADE | |
| product_id | uuid FK → products | |
| quantity | decimal(12,3) | Must be > 0 |
| unit_cost | decimal(12,2) NULLABLE | Cost per unit for this delivery |
| created_at | timestamptz | |

---

## 5. Slug Generation Logic

Slug generation lives in a shared `SlugService` used by both products and categories.

```typescript
// shared/slug.service.ts

@Injectable()
export class SlugService {
  constructor(
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(ProductCategory) private categoryRepo: Repository<ProductCategory>,
  ) {}

  async generateProductSlug(name: string, businessId: string, excludeId?: string): Promise<string> {
    const base = this.toSlug(name)
    return this.ensureUnique(base, businessId, excludeId, 'product')
  }

  async generateCategorySlug(name: string, businessId: string, excludeId?: string): Promise<string> {
    const base = this.toSlug(name)
    return this.ensureUnique(base, businessId, excludeId, 'category')
  }

  private toSlug(name: string): string {
    return name
      .normalize('NFD')                        // decompose accented chars
      .replace(/[\u0300-\u036f]/g, '')         // remove diacritics (é → e)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')           // remove non-alphanumeric
      .trim()
      .replace(/\s+/g, '-')                    // spaces to hyphens
      .replace(/-+/g, '-')                     // collapse multiple hyphens
      .substring(0, 200)                       // max length
  }

  private async ensureUnique(
    base: string,
    businessId: string,
    excludeId: string | undefined,
    type: 'product' | 'category',
  ): Promise<string> {
    const repo = type === 'product' ? this.productRepo : this.categoryRepo
    let slug = base
    let counter = 2

    while (true) {
      const existing = await repo.findOne({
        where: { businessId, slug, ...(excludeId ? { id: Not(excludeId) } : {}) },
      })
      if (!existing) return slug
      slug = `${base}-${counter++}`
    }
  }
}
```

**Example transformations:**
```
"Eau Minérale 75cl"      → "eau-minerale-75cl"
"Savon  Extra  Doux"     → "savon-extra-doux"
"Poulet DG (portions)"   → "poulet-dg-portions"
"Cuvette 10L"            → "cuvette-10l"
```

---

## 6. Inventory Tracking Decision Logic

The central rule for whether inventory is tracked lives in one place — `InventoryService`:

```typescript
// inventory/inventory.service.ts

private shouldTrackInventory(product: Product): boolean {
  return product.trackInventory === true
}

async deductForSale(businessId: string, items: SaleItemDto[], saleId: string, userId: string) {
  for (const item of items) {
    const product = await this.getProduct(item.productId, businessId)

    if (!this.shouldTrackInventory(product)) {
      // Skip entirely — no inventory row, no movement record
      continue
    }

    await this.deductStock(product, item.quantity, saleId, userId)
  }
}
```

This keeps the sales module clean — it always calls `deductForSale`. The inventory module decides silently whether to act. No `if (is_service)` checks scattered across the codebase.

---

## 7. Unit of Measure — Custom Unit Creation API

#### POST /unit-of-measures
Create a custom unit for the authenticated business.
**Permission:** `PRODUCTS_CREATE` (reuses product permission — UoM management is part of product setup)

```
name          string    required    e.g. "Cuvette"
abbreviation  string    required    e.g. "cuv"
type          UOMType   required    QUANTITY | WEIGHT | VOLUME | LENGTH | CUSTOM
```

Business rules:
- `businessId` is injected from JWT — never from request body
- `is_default` is always `false` — only system seeds can be default
- Name must be unique within the business (case-insensitive check)

#### GET /unit-of-measures
Returns system-wide units + the authenticated business's custom units.

```typescript
// Returns units where business_id IS NULL OR business_id = authenticatedBusinessId
// Sorted: defaults first, then alphabetical
```

---

## 8. Product Endpoints

### 8.1 Create Product

#### POST /products
**Permission:** `PRODUCTS_CREATE`

```
categoryId          uuid      optional
unitOfMeasureId     uuid      required
name                string    required
description         string    optional
sku                 string    optional    (auto-generated if omitted)
barcode             string    optional    (auto-generated from SKU if omitted)
sellingPrice        number    required
costPrice           number    optional
taxRate             number    optional    default 0
isService           boolean   optional    default false
trackInventory      boolean   optional    default: true if !isService, false if isService
openingStock        number    optional    initial inventory quantity (ignored if trackInventory=false)
```

Business rules:
- `slug` is always auto-generated from `name` — not accepted from client
- If `isService = true` and `trackInventory` is not provided → `trackInventory` defaults to `false`
- If `isService = true` and `trackInventory = true` is explicitly set → respect the override
- Creating a product with `trackInventory = true` automatically creates an `inventory_levels` row with `quantity = openingStock ?? 0`
- Images are added separately via `POST /products/:id/images`

### 8.2 Upload Product Image

#### POST /products/:id/images
**Permission:** `PRODUCTS_EDIT`

Multipart form upload. Accepts JPEG, PNG, WebP. Max 5MB per image.

```
file          File      required
sortOrder     number    optional    default: next available order
altText       string    optional
```

Business rules:
- Images added via this endpoint populate `product_images` (the gallery relation) — separate from `image_url`
- `image_url` is set directly via `PATCH /products/:id` as a plain string field
- Maximum 10 images per product — returns 422 if exceeded

#### PATCH /products/:id/images/:imageId
Update `sortOrder` or `altText` of an existing image.

#### DELETE /products/:id/images/:imageId
Remove a specific image. If the deleted image was `sort_order = 0`, the next image in order becomes the effective primary.

### 8.3 Other Product Endpoints

#### GET /products
List with filters + pagination.

Query params:
```
page, limit
categoryId      filter by category
search          name / SKU / barcode substring search
isActive        boolean filter
isService       boolean filter
trackInventory  boolean filter
```

#### GET /products/:id
Full product detail including all images (ordered by sort_order) and current inventory level (if tracked).

#### PATCH /products/:id
Update product fields. SKU is immutable. Slug is regenerated if `name` changes (with uniqueness check).

When `isService` or `trackInventory` is changed:
- `isService: false → true` + `trackInventory` not provided → sets `trackInventory = false`, deactivates inventory_levels row
- `trackInventory: false → true` → creates inventory_levels row with `quantity = 0` if it doesn't exist

#### DELETE /products/:id
Soft delete (`is_active = false`). Hard delete is blocked if product appears in any historical sale.

#### GET /products/by-barcode/:barcode
Scanner lookup — returns product + current stock level if tracked.

#### GET /products/by-slug/:slug
For online shop integration — public endpoint (no auth required when shop is published).

---

## 9. Inventory Endpoints

### 9.1 Stock Levels

#### GET /inventory
All inventory levels for the business. Only returns products where `track_inventory = true`.

Query params: `page`, `limit`, `categoryId`, `lowStockOnly` (boolean)

Response per item:
```
productId, productName, sku, primaryImageUrl,
categoryName, unitAbbreviation,
quantity, lowStockThreshold, reorderPoint,
isLowStock    ← computed: quantity <= lowStockThreshold
lastRestockAt
```

#### GET /inventory/:productId
Single product stock detail + recent movements (last 10).

### 9.2 Manual Adjustment

#### POST /inventory/:productId/adjust
**Permission:** `INVENTORY_ADJUST`

```
type        enum    required    ADD | REMOVE | SET
quantity    number  required    must be > 0 for ADD/REMOVE; >= 0 for SET
notes       string  required    reason for adjustment (audit trail)
```

Business rules:
- `SET` recalculates `quantity_change` as `newQuantity - currentQuantity`
- `REMOVE` with quantity > current stock: allowed only if business stock enforcement = WARN or IGNORE
- Always creates an `inventory_movements` record

### 9.3 Restock

#### POST /inventory/restock
**Permission:** `INVENTORY_ADJUST`

```
referenceNumber   string      optional
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
- All items processed in a single DB transaction — all succeed or all fail
- Skips any product in `items` where `track_inventory = false` (logs a warning, does not error)
- Creates one `restock_records` row + N `restock_items` rows
- Creates N `inventory_movements` rows (type: `RESTOCK_IN`)
- Updates N `inventory_levels` rows + `last_restock_at`

Response: Full restock record with updated stock levels for each processed product.

### 9.4 Stock Movement History

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

### 9.5 Low Stock Alerts

#### GET /inventory/alerts
Returns all products currently below their low-stock threshold.
**Permission:** `INVENTORY_VIEW`

Response per alert:
```
productId, productName, sku, primaryImageUrl, categoryName,
currentQuantity, lowStockThreshold, reorderPoint,
shortfall    ← threshold - currentQuantity
```

Sorted by shortfall descending (most urgent first).

---

## 10. Inventory Scheduler

A cron job runs **once daily at 08:00 Cameroon time** to check for low-stock conditions and send alerts.

```typescript
@Cron('0 7 * * *', { timeZone: 'Africa/Douala' })
async checkLowStockAlerts() {
  const lowStockItems = await this.inventoryRepo
    .createQueryBuilder('il')
    .innerJoin('il.product', 'p')
    .innerJoin('il.business', 'b')
    .innerJoin('b.user', 'u')
    .where('il.low_stock_threshold IS NOT NULL')
    .andWhere('il.quantity <= il.low_stock_threshold')
    .andWhere('p.is_active = true')
    .andWhere('p.track_inventory = true')   // ← v2: use track_inventory, not is_service
    .select([...])
    .getMany()

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

The inventory service processes all deductions in a **single DB transaction**. Products with `track_inventory = false` are silently skipped. If any tracked product has insufficient stock (and the business has strict stock enforcement enabled), the entire sale is rolled back.

**Stock enforcement modes** (configurable per business):
- `STRICT` — sale is blocked if any tracked item has insufficient stock
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
| Manage product images | `PRODUCTS_EDIT` |
| Create custom UoM | `PRODUCTS_CREATE` |
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
- Migrations: all tables above (including updated `unit_of_measures` with `business_id`, updated `products` with `slug` + `track_inventory`, updated `product_categories` with `image_url`, promoted `product_images`)
- Seed `unit_of_measures` system records (business_id = NULL): Piece, Kg, Litre, Metre, Box, Packet, Bottle, Sachet
- `SlugService` — slug generation + uniqueness enforcement
- `SkuService` with generation + validation
- `BarcodeService` with EAN-13 generation + check digit validation
- Product categories CRUD (with image upload support)
- `BusinessScopedRepository` base class
- `UnitOfMeasureService.findForBusiness()` — system + custom union query

### Sprint 2 — Products Core
- `POST /products` — full creation with SKU/barcode/slug/track_inventory logic
- `POST /products/:id/images` — image upload to cloud storage
- `PATCH /products/:id/images/:imageId` — reorder / update alt text
- `DELETE /products/:id/images/:imageId`
- `GET /products` — list with filters + pagination (lateral join for primary image)
- `GET /products/:id` — detail with images + inventory level
- `PATCH /products/:id` — update with immutability rules + slug regeneration
- `DELETE /products/:id` — soft delete
- `GET /products/by-barcode/:barcode` — scanner lookup
- `GET /products/by-sku/:sku`
- `GET /products/by-slug/:slug` — public endpoint for online shop
- `POST /products/:id/assign-barcode`
- `POST /unit-of-measures` — create custom unit
- `GET /unit-of-measures` — system + business units
- Unit tests for SKU, barcode, slug generation

### Sprint 3 — Inventory Core
- `inventory_levels` creation on product creation (when track_inventory = true)
- Handle track_inventory toggle: create/deactivate inventory_levels row
- `GET /inventory` — stock levels list (track_inventory = true only)
- `GET /inventory/:productId` — stock detail
- `POST /inventory/:productId/adjust` — manual adjustment
- `POST /inventory/restock` — bulk restock (skip untracked products)
- `GET /inventory/:productId/movements` — history
- `GET /inventory/alerts` — low stock (track_inventory = true filter)
- `PATCH /inventory/:productId/threshold` — set threshold

### Sprint 4 — Integration & Automation
- Sales module integration (`deductForSale` with track_inventory check, `reverseForVoidedSale`)
- `InventoryScheduler` — daily low-stock alert cron (track_inventory filter)
- `GET /inventory/movements` — cross-product history
- Stock enforcement mode on Business entity
- Integration tests for concurrent stock deduction (race conditions)
