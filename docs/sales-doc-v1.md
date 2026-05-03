# Sales Module
## Complete Documentation — Business Logic, Architecture & Implementation Guide
**BizTrack CM · NestJS + TypeORM + PostgreSQL**

---

## 1. Purpose & Business Context

The Sales module is the **operational heart of BizTrack CM**. It is the screen a cashier opens every morning and does not close until the shop shuts. Everything else in the system — products, inventory, reports — exists to support this one workflow: recording what was sold, to whom, for how much, and how it was paid.

For the target customer — a small shop owner or cashier in Douala — the sale recording experience must be:

- **Fast**: tapping a product and confirming a sale should take under 10 seconds
- **Offline-capable**: network drops must never block a sale from being recorded
- **Receipt-ready**: every sale should produce a shareable receipt, primarily via WhatsApp
- **Trustworthy**: once a sale is confirmed, the owner must be able to trust that the numbers are right

The module handles the full sale lifecycle: cart creation → item selection → discount application → payment → confirmation → receipt generation → inventory deduction → optional void/reversal.

---

## 2. Key Concepts & Terminology

Understanding these terms precisely prevents ambiguity across the codebase and documentation.

**Sale** — A completed transaction. A sale is immutable once confirmed. It has a status (`COMPLETED` or `VOIDED`) and can never be edited — only voided and re-entered.

**Sale Item** — One line in a sale. Links a product to a quantity and the unit price at time of sale. Prices are snapshotted — changes to a product's price after a sale do not affect historical sale records.

**Cart** — The in-progress state before a sale is confirmed. A cart exists only on the client (mobile app) for offline-first reasons. There is no `carts` table in the database. The server only ever receives a completed sale payload.

**Receipt** — The human-readable summary of a confirmed sale. Generated on-demand, never stored as a separate record. Always derivable from the sale + sale_items data.

**Payment Method** — How the customer paid. BizTrack CM supports: `CASH`, `MTN_MOMO`, `ORANGE_MONEY`, `MIXED` (partial cash + partial mobile money). `MIXED` is handled via multiple `sale_payments` records.

**Void** — The mechanism for reversing a completed sale. Voiding cancels the sale, reverses inventory deductions, and marks the record so it is excluded from revenue reports. A void is not a delete — the original sale record is retained for audit purposes.

**Daily Summary** — An aggregated view of all completed (non-voided) sales for a business on a given date. Used for the home screen dashboard widget and the daily closing report.

---

## 3. Multi-Tenancy

The same rule from the Products module applies here without exception:

**Every query on sales tables must include `businessId` as a condition.**

`businessId` is embedded in the JWT via `Phase2Guard` and passed explicitly to every service method. A sale fetched without a `businessId` filter would expose one business's revenue data to another — a critical data and trust violation.

---

## 4. Offline-First Architecture for Sales

Sales recording is the most critical offline scenario in the entire application. A cashier in a Douala shop with intermittent connectivity must be able to record sales continuously. The offline strategy for the sales module is:

### 4.1 Client-Side (React Native — WatermelonDB)

All sales are first written to **WatermelonDB** (local SQLite) on the device. The sale is immediately confirmed to the user and a receipt is rendered — no network call is made during the sale flow.

A background sync worker monitors connectivity and pushes unsynced sales to the server when online. The sync is:
- **Append-only** from client → server: the client never deletes sales locally, only marks them as synced
- **Idempotent**: each sale payload carries a client-generated `clientId` (UUID v4). If the same sale is submitted twice (e.g. a retry after a timeout), the server returns the existing record without creating a duplicate

### 4.2 Server-Side (NestJS)

The server accepts sale payloads and treats them as **authoritative**. It does not maintain a draft/cart state. The server:
1. Validates the payload (products exist, prices are in range, businessId matches)
2. Checks inventory if `stock_enforcement` is `STRICT`
3. Writes sale + sale_items + sale_payments in a single DB transaction
4. Triggers inventory deduction (via `InventoryService.deductForSale`)
5. Returns the confirmed sale with server-assigned `id` and `createdAt`

### 4.3 Client ID & Deduplication

```typescript
// Client sends this on every sale creation request
{
  clientId: "550e8400-e29b-41d4-a716-446655440000",  // UUID v4 — generated on device
  ...salePayload
}

// Server deduplication logic
async createSale(businessId: string, dto: CreateSaleDto) {
  // Check if this clientId has already been processed
  const existing = await this.saleRepo.findOne({
    where: { businessId, clientId: dto.clientId }
  })
  if (existing) return existing  // idempotent — return without re-processing

  // Proceed with new sale creation
}
```

### 4.4 Price Validation on Sync

When a sale syncs from the client to the server, the server performs a soft price validation:
- If the sale's `unit_price` for a line item differs from the product's current `selling_price` by more than 10%, the sale is flagged with `price_drift_warning = true` but is **not rejected**
- This handles the legitimate case where a cashier sold at a price that was correct at the time but the product price has since been updated
- The owner sees flagged sales in a dedicated review section in the dashboard

---

## 5. Database Schema

### 5.1 `sales`
The header record for each completed transaction.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | Server-assigned |
| client_id | uuid | Client-generated deduplication key — UNIQUE per business |
| business_id | uuid FK → businesses | INDEX — row-level tenancy |
| cashier_id | uuid FK → users | The user who recorded the sale |
| sale_number | varchar(30) | Human-readable reference — auto-generated, unique per business |
| status | enum(SaleStatus) | `COMPLETED` \| `VOIDED` |
| subtotal | decimal(12,2) | Sum of (unit_price × quantity) for all items, before discount |
| discount_amount | decimal(12,2) DEFAULT 0 | Total discount applied to the sale |
| tax_amount | decimal(12,2) DEFAULT 0 | Total tax (future use — 0 for now) |
| total_amount | decimal(12,2) | subtotal − discount_amount + tax_amount |
| amount_paid | decimal(12,2) | Total amount actually received from customer |
| change_given | decimal(12,2) DEFAULT 0 | Cash change returned to customer |
| customer_name | varchar(200) NULLABLE | Optional — customer identification |
| customer_phone | varchar(30) NULLABLE | Optional — for receipt delivery via SMS/WhatsApp |
| notes | text NULLABLE | Cashier notes |
| price_drift_warning | boolean DEFAULT false | True if any item price deviated >10% from current product price at sync time |
| sale_date | date | Date of the sale — stored separately for efficient daily aggregation queries |
| sold_at | timestamptz | Exact timestamp of the sale (device time, sent by client) |
| synced_at | timestamptz NULLABLE | When the record was received and confirmed by server; NULL = not yet synced |
| created_at | timestamptz | Server insert time |
| voided_at | timestamptz NULLABLE | When the sale was voided |
| voided_by | uuid FK → users NULLABLE | Who voided the sale |
| void_reason | text NULLABLE | Required when voiding |
| | | UNIQUE(business_id, client_id) | |
| | | UNIQUE(business_id, sale_number) | |
| | | INDEX(business_id, sale_date) — for daily summary queries | |
| | | INDEX(business_id, status) | |

**On `sale_number`:**
Auto-generated, human-readable reference. Format:
```
{PREFIX}-{YYYYMMDD}-{SEQUENCE}

Examples:
  VTE-20250413-0001
  VTE-20250413-0042

Where:
  PREFIX    = "VTE" (from French "Vente" = Sale) — fixed
  YYYYMMDD  = sale date
  SEQUENCE  = 4-digit daily sequence, reset to 0001 each day
```
The sequence is generated using a PostgreSQL sequence per business per day, or via a `SELECT MAX + 1` with a unique constraint to handle concurrency safely.

---

### 5.2 `sale_items`
One row per product line in a sale.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| sale_id | uuid FK → sales CASCADE DELETE | INDEX |
| business_id | uuid FK → businesses | Denormalised for query performance — avoids join to sales on every item query |
| product_id | uuid FK → products | |
| product_name | varchar(200) | **Snapshot** — product name at time of sale |
| product_sku | varchar(100) | **Snapshot** — SKU at time of sale |
| unit_of_measure | varchar(50) | **Snapshot** — UoM abbreviation at time of sale (e.g. "pcs", "kg") |
| quantity | decimal(12,3) | Must be > 0 |
| unit_price | decimal(12,2) | **Snapshot** — selling price at time of sale |
| discount_amount | decimal(12,2) DEFAULT 0 | Per-line discount |
| line_total | decimal(12,2) | (unit_price × quantity) − discount_amount |
| cost_price | decimal(12,2) NULLABLE | **Snapshot** — cost price at time of sale, for margin calculation |
| created_at | timestamptz | |

**Why snapshots matter:** A product's name or price may change after a sale. The `sale_items` row must reflect what was true at the moment of the transaction, not what the product looks like today. This is critical for accurate historical reporting and for receipts that need to match what the customer was charged.

---

### 5.3 `sale_payments`
One or more payment records per sale. Supports mixed payment methods.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| sale_id | uuid FK → sales CASCADE DELETE | INDEX |
| business_id | uuid FK → businesses | Denormalised for query performance |
| method | enum(PaymentMethod) | `CASH` \| `MTN_MOMO` \| `ORANGE_MONEY` |
| amount | decimal(12,2) | Amount paid via this method |
| mobile_money_reference | varchar(100) NULLABLE | Transaction reference from MTN/Orange — entered manually by cashier |
| created_at | timestamptz | |

**Mixed payment example:**
A customer pays XAF 5,000 by MTN MoMo and XAF 2,000 cash for a XAF 7,000 total. Two rows:
```
{ method: 'MTN_MOMO', amount: 5000, mobile_money_reference: 'TXN-123456' }
{ method: 'CASH',     amount: 2000, mobile_money_reference: null }
```
`sales.amount_paid` = 7000, `sales.change_given` = 0.

The sum of all `sale_payments.amount` for a sale must equal `sales.amount_paid`. Enforced at the service layer.

---

### 5.4 `daily_sale_summaries` (Materialised Cache)
A pre-aggregated daily summary per business, updated after every confirmed sale and every void.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| business_id | uuid FK → businesses | |
| summary_date | date | |
| total_sales | int DEFAULT 0 | Count of COMPLETED (non-voided) sales |
| total_revenue | decimal(14,2) DEFAULT 0 | Sum of total_amount for COMPLETED sales |
| total_cost | decimal(14,2) DEFAULT 0 | Sum of cost snapshots — for gross profit |
| gross_profit | decimal(14,2) DEFAULT 0 | total_revenue − total_cost |
| total_discounts | decimal(12,2) DEFAULT 0 | Sum of discount_amount |
| cash_collected | decimal(12,2) DEFAULT 0 | Total paid via CASH |
| mtn_momo_collected | decimal(12,2) DEFAULT 0 | Total paid via MTN_MOMO |
| orange_money_collected | decimal(12,2) DEFAULT 0 | Total paid via ORANGE_MONEY |
| voided_sales | int DEFAULT 0 | Count of voided sales |
| voided_amount | decimal(12,2) DEFAULT 0 | Sum of voided sale totals |
| updated_at | timestamptz | |
| | | UNIQUE(business_id, summary_date) | |

This table powers the home screen dashboard ("Today: XAF 245,000 revenue, 38 sales") without running aggregate queries on the full `sales` table. It is always derived — if corrupted, it can be fully rebuilt by re-aggregating `sales`.

---

## 6. Sale Number Generation

```typescript
// sales/sale-number.service.ts

@Injectable()
export class SaleNumberService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  async generate(businessId: string, saleDate: Date): Promise<string> {
    const dateStr = format(saleDate, 'yyyyMMdd')

    // Atomic sequence increment using a raw query to avoid race conditions
    const result = await this.dataSource.query(`
      INSERT INTO sale_number_sequences (business_id, sale_date, last_sequence)
      VALUES ($1, $2, 1)
      ON CONFLICT (business_id, sale_date)
      DO UPDATE SET last_sequence = sale_number_sequences.last_sequence + 1
      RETURNING last_sequence
    `, [businessId, dateStr])

    const sequence = result[0].last_sequence.toString().padStart(4, '0')
    return `VTE-${dateStr}-${sequence}`
  }
}
```

Supporting table:
```sql
CREATE TABLE sale_number_sequences (
  business_id  uuid    NOT NULL,
  sale_date    date    NOT NULL,
  last_sequence int    NOT NULL DEFAULT 0,
  PRIMARY KEY (business_id, sale_date)
);
```

---

## 7. Sale Lifecycle & State Machine

```
CLIENT SIDE                          SERVER SIDE
───────────────                      ────────────────────────────────
User taps products
→ Cart built in memory/WatermelonDB
→ Payment confirmed by cashier
→ Sale written to local DB           
→ Receipt shown to customer          → [online] Sale synced to server
                                     → Validated
                                     → Inventory deducted
                                     → daily_sale_summaries updated
                                     → Confirmed (synced_at set)

                                     → [if void requested]
                                     → status = VOIDED
                                     → Inventory reversed
                                     → daily_sale_summaries decremented
```

**Sale statuses:**

| Status | Description |
|--------|-------------|
| `COMPLETED` | Normal confirmed sale. Included in all revenue calculations. |
| `VOIDED` | Reversed sale. Excluded from revenue. Inventory deductions reversed. Original record retained. |

There is no `PENDING` or `DRAFT` status on the server — the server only ever receives completed sales.

---

## 8. Business Rules

### 8.1 Sale Creation Rules

1. **All items must belong to the same business.** If any `productId` in the payload does not belong to `businessId`, the entire sale is rejected with a 422.

2. **Prices are accepted from the client** (since the sale may have been recorded offline at a different time). The server snapshots whatever price the client sends. The `price_drift_warning` flag is set if the price deviates significantly from the current product price (see §4.4).

3. **Inventory enforcement** depends on the business's `stock_enforcement` setting:
   - `STRICT`: if any tracked product has insufficient stock, the sale is rejected
   - `WARN`: sale is accepted, inventory goes negative, owner is notified
   - `IGNORE`: sale is accepted silently (default)

4. **`amount_paid` must be ≥ `total_amount`** — a cashier cannot record a sale where the customer paid less than the total. If credit/debt tracking is needed, that is a future feature (`CREDIT` payment method).

5. **`change_given` is computed by the server** as `amount_paid − total_amount`. The client may send it for display purposes but the server always recalculates.

6. **`line_total` is computed by the server** as `(unit_price × quantity) − discount_amount`. Client-sent values are recalculated and replaced.

7. **`subtotal`, `total_amount` are computed by the server** from line items. Client-sent totals are ignored and recalculated to prevent tampering.

8. **Minimum one item** — a sale with zero items is rejected.

9. **`clientId` uniqueness** — duplicate clientIds for the same business return the existing sale (idempotent, no error).

### 8.2 Void Rules

1. Voiding requires `void_reason` — empty reason is rejected.
2. Only `OWNER` and `MANAGER` roles can void a sale.
3. A `VOIDED` sale cannot be voided again.
4. Voiding reverses inventory deductions for all tracked items in the sale.
5. Voiding decrements `daily_sale_summaries` for the sale's `sale_date` — not today's date.
6. Voiding does not delete any record. The sale, its items, and payments remain in the database permanently.

### 8.3 Discount Rules

Discounts can be applied at two levels:
- **Line-level**: `discount_amount` on each `sale_item` (e.g. "100 XAF off this item")
- **Sale-level**: `discount_amount` on the `sale` record (e.g. "500 XAF off the whole order")

The `sales.discount_amount` represents the **sale-level discount only**. The total effective discount across the entire transaction is:
```
total_discount = sales.discount_amount + SUM(sale_items.discount_amount)
```

Both discount fields default to 0. A sale with no discounts has 0 in both.

---

## 9. Sale Total Calculation (Server-Side)

```typescript
function computeSaleTotals(items: CreateSaleItemDto[], saleLevelDiscount: number) {
  let subtotal = 0

  const computedItems = items.map(item => {
    const lineTotal = round2(item.unitPrice * item.quantity) - round2(item.discountAmount ?? 0)
    subtotal += lineTotal
    return { ...item, lineTotal }
  })

  const discountAmount = round2(saleLevelDiscount ?? 0)
  const taxAmount = 0          // tax support reserved for future version
  const totalAmount = round2(subtotal - discountAmount + taxAmount)

  return { computedItems, subtotal, discountAmount, taxAmount, totalAmount }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
```

All monetary values are stored as `decimal(12,2)` and computed in JavaScript using rounded arithmetic — floating point errors are eliminated by rounding to 2 decimal places at each step.

---

## 10. Endpoints

### 10.1 Create Sale

#### POST /sales
**Permission:** `SALES_CREATE`
**Offline note:** This endpoint must be idempotent via `clientId`. Retries are safe.

**Request body:**
```
clientId            uuid        required    Device-generated deduplication key
soldAt              ISO8601     required    Timestamp of the sale (device time)
customerName        string      optional
customerPhone       string      optional    Used for WhatsApp receipt sharing
notes               string      optional
discountAmount      number      optional    Sale-level discount. Default 0.
payments: [                     required    At least one payment entry
  {
    method          enum        required    CASH | MTN_MOMO | ORANGE_MONEY
    amount          number      required    Must be > 0
    mobileMoneyRef  string      optional    Manual reference from MoMo transaction
  }
]
items: [                        required    At least one item
  {
    productId       uuid        required
    quantity        number      required    Must be > 0
    unitPrice       number      required    Selling price at time of sale
    discountAmount  number      optional    Per-line discount. Default 0.
    costPrice       number      optional    Cost price snapshot for margin tracking
  }
]
```

**Business logic sequence:**
1. Check `clientId` uniqueness → if duplicate, return existing sale (200, not 201)
2. Validate all `productId` values belong to `businessId`
3. Compute line totals, subtotal, discount, total_amount (server-side — client values ignored)
4. Validate `SUM(payments.amount) >= total_amount`
5. Compute `change_given = SUM(payments.amount) - total_amount`
6. Check inventory enforcement if applicable
7. Generate `sale_number`
8. Write `sales` + `sale_items` + `sale_payments` in a single DB transaction
9. Call `InventoryService.deductForSale()`
10. Update `daily_sale_summaries` (upsert)
11. Return full sale response

**Response:**
```json
{
  "id": "uuid",
  "saleNumber": "VTE-20250413-0042",
  "status": "COMPLETED",
  "subtotal": 3500,
  "discountAmount": 0,
  "taxAmount": 0,
  "totalAmount": 3500,
  "amountPaid": 5000,
  "changeGiven": 1500,
  "customerName": null,
  "customerPhone": null,
  "soldAt": "2025-04-13T10:32:00.000Z",
  "syncedAt": "2025-04-13T10:32:05.123Z",
  "priceDriftWarning": false,
  "cashier": { "id": "uuid", "name": "Jean-Pierre" },
  "items": [
    {
      "id": "uuid",
      "productId": "uuid",
      "productName": "Eau Minérale 75cl",
      "productSku": "DRK-LV3K2M-B8C1",
      "unitOfMeasure": "pcs",
      "quantity": 2,
      "unitPrice": 500,
      "discountAmount": 0,
      "lineTotal": 1000
    },
    {
      "id": "uuid",
      "productId": "uuid",
      "productName": "Savon Lux 100g",
      "productSku": "GEN-LV3K3M-C2A1",
      "unitOfMeasure": "pcs",
      "quantity": 5,
      "unitPrice": 500,
      "discountAmount": 0,
      "lineTotal": 2500
    }
  ],
  "payments": [
    { "method": "CASH", "amount": 5000, "mobileMoneyReference": null }
  ]
}
```

---

### 10.2 List Sales

#### GET /sales
**Permission:** `SALES_VIEW`

Query params:
```
page            int         default 1
limit           int         default 20, max 100
dateFrom        date        filter by sale_date >=
dateTo          date        filter by sale_date <=
status          SaleStatus  COMPLETED | VOIDED
cashierId       uuid        filter by specific cashier
search          string      search by sale_number or customer_name
paymentMethod   enum        filter by payment method used
```

Response: paginated list of sales with summary fields (no items expanded — use GET /sales/:id for detail).

---

### 10.3 Get Sale Detail

#### GET /sales/:id
**Permission:** `SALES_VIEW`

Returns full sale with all items and payments expanded.

---

### 10.4 Get Sale by Number

#### GET /sales/by-number/:saleNumber
**Permission:** `SALES_VIEW`

Lookup by human-readable sale number (e.g. `VTE-20250413-0042`). Used for customer receipt requests and support queries.

---

### 10.5 Void Sale

#### POST /sales/:id/void
**Permission:** `SALES_VOID`

**Request body:**
```
reason    string    required    Reason for voiding — minimum 10 characters
```

**Business logic sequence:**
1. Fetch sale — must belong to `businessId`
2. Validate status is `COMPLETED` (cannot void an already voided sale)
3. Set `status = VOIDED`, `voided_at = now()`, `voided_by = userId`, `void_reason = reason`
4. Call `InventoryService.reverseForVoidedSale(saleId, userId)`
5. Decrement `daily_sale_summaries` for `sale_date`
6. Return updated sale record

---

### 10.6 Daily Summary

#### GET /sales/summary/daily
**Permission:** `SALES_VIEW`

Query params:
```
date        date    optional    defaults to today (Africa/Douala timezone)
```

Returns from `daily_sale_summaries` — no aggregate query on the full `sales` table.

**Response:**
```json
{
  "date": "2025-04-13",
  "totalSales": 38,
  "totalRevenue": 245000,
  "totalCost": 148000,
  "grossProfit": 97000,
  "grossMarginPercent": 39.6,
  "totalDiscounts": 3500,
  "cashCollected": 180000,
  "mtnMomoCollected": 45000,
  "orangeMoneyCollected": 20000,
  "voidedSales": 2,
  "voidedAmount": 8500
}
```

---

### 10.7 Sales Report (Date Range)

#### GET /sales/summary/range
**Permission:** `SALES_VIEW`

Query params:
```
dateFrom    date    required
dateTo      date    required    max range: 90 days
groupBy     enum    DAY | WEEK | MONTH    default DAY
```

Aggregates `daily_sale_summaries` across the requested range. For `WEEK` and `MONTH` groupings, the server bucketes and sums the daily rows.

Used for the dashboard chart (revenue trend line) and the downloadable period report.

---

### 10.8 Receipt Generation

#### GET /sales/:id/receipt
**Permission:** `SALES_VIEW`

Returns a structured receipt payload. The receipt is **not stored** — it is always derived on-demand from the sale record.

**Response:**
```json
{
  "businessName": "Akwa Boutique",
  "businessPhone": "+237 6XX XXX XXX",
  "saleNumber": "VTE-20250413-0042",
  "soldAt": "2025-04-13T10:32:00.000Z",
  "cashierName": "Jean-Pierre",
  "customerName": null,
  "items": [
    { "name": "Eau Minérale 75cl", "qty": 2, "unitPrice": 500, "total": 1000 },
    { "name": "Savon Lux 100g",    "qty": 5, "unitPrice": 500, "total": 2500 }
  ],
  "subtotal": 3500,
  "discountAmount": 0,
  "totalAmount": 3500,
  "amountPaid": 5000,
  "changeGiven": 1500,
  "payments": [
    { "method": "CASH", "amount": 5000 }
  ],
  "footer": "Merci pour votre achat!"
}
```

The React Native app uses this payload to render the receipt screen and generate the WhatsApp-shareable text (see §11).

---

## 11. WhatsApp Receipt Sharing

Receipts are shared via WhatsApp using the device's native share mechanism. No WhatsApp Business API integration is required — this is a simple deep link.

### 11.1 Receipt Text Format

The app formats the receipt as plain text optimised for WhatsApp readability:

```
🧾 *REÇU DE VENTE*
📍 Akwa Boutique
📅 13/04/2025 à 10h32
N° VTE-20250413-0042
─────────────────────
Eau Minérale 75cl
  2 × 500 XAF = 1 000 XAF

Savon Lux 100g
  5 × 500 XAF = 2 500 XAF
─────────────────────
Sous-total : 3 500 XAF
Remise     :     0 XAF
*TOTAL     : 3 500 XAF*
─────────────────────
Payé (Espèces) : 5 000 XAF
Monnaie rendue : 1 500 XAF
─────────────────────
Merci pour votre achat! 🙏
```

### 11.2 Implementation (React Native)

```typescript
// utils/receipt.utils.ts

export function formatReceiptForWhatsApp(receipt: ReceiptPayload): string {
  const lines: string[] = []

  lines.push('🧾 *REÇU DE VENTE*')
  lines.push(`📍 ${receipt.businessName}`)
  lines.push(`📅 ${formatDate(receipt.soldAt)}`)
  lines.push(`N° ${receipt.saleNumber}`)
  lines.push('─────────────────────')

  for (const item of receipt.items) {
    lines.push(item.name)
    lines.push(`  ${item.qty} × ${fmt(item.unitPrice)} XAF = ${fmt(item.total)} XAF`)
    lines.push('')
  }

  lines.push('─────────────────────')
  lines.push(`Sous-total : ${fmt(receipt.subtotal)} XAF`)
  if (receipt.discountAmount > 0) {
    lines.push(`Remise     : ${fmt(receipt.discountAmount)} XAF`)
  }
  lines.push(`*TOTAL     : ${fmt(receipt.totalAmount)} XAF*`)
  lines.push('─────────────────────')

  for (const p of receipt.payments) {
    lines.push(`Payé (${formatMethod(p.method)}) : ${fmt(p.amount)} XAF`)
  }

  if (receipt.changeGiven > 0) {
    lines.push(`Monnaie rendue : ${fmt(receipt.changeGiven)} XAF`)
  }

  lines.push('─────────────────────')
  lines.push(receipt.footer ?? 'Merci pour votre achat! 🙏')

  return lines.join('\n')
}

// Share via WhatsApp
export async function shareReceiptOnWhatsApp(
  receipt: ReceiptPayload,
  customerPhone?: string,
) {
  const text = formatReceiptForWhatsApp(receipt)
  const encoded = encodeURIComponent(text)

  const url = customerPhone
    ? `whatsapp://send?phone=${customerPhone}&text=${encoded}`
    : `whatsapp://send?text=${encoded}`

  const canOpen = await Linking.canOpenURL(url)
  if (canOpen) {
    await Linking.openURL(url)
  } else {
    // WhatsApp not installed — fall back to native share sheet
    await Share.share({ message: text })
  }
}
```

If the cashier has captured `customerPhone` during the sale, the WhatsApp link pre-fills the recipient. Otherwise, the cashier selects the contact manually inside WhatsApp.

---

## 12. Thermal Printer Receipt

BizTrack CM supports printing receipts on **ESC/POS thermal printers** — the same category of printer used by most POS systems in Cameroonian shops and restaurants. These are inexpensive Bluetooth printers (brands like Xprinter, GOOJPRT, or local equivalents) that connect to the cashier's phone wirelessly.

Thermal receipt printing is a completely separate rendering path from the WhatsApp receipt. The two share the same `ReceiptPayload` data but produce entirely different output formats.

### 12.1 Thermal Receipt Constraints

Thermal printers are not HTML renderers. They understand a binary protocol called **ESC/POS** (Epson Standard Code for Point of Sale). Key constraints that must be respected:

| Constraint | Detail |
|------------|--------|
| **Paper width** | 58mm printers → 32 characters per line. 80mm printers → 48 characters per line. BizTrack CM targets **58mm** as the default (most common and cheapest in Cameroon) with 80mm as a configurable option. |
| **Character set** | Plain ASCII + Latin-1. No emoji. No Unicode arrows or special box-drawing characters. Use `-`, `=`, `*` for dividers. |
| **No images** | Logos can be printed as raster bitmaps via ESC/POS but this adds significant complexity. Not supported at launch — business name is printed as bold text instead. |
| **No colours** | Black ink only. Emphasis is achieved via bold, underline, or font size commands. |
| **No proportional spacing** | Every character occupies exactly the same width — use a monospace mental model when designing the layout. |
| **Line wrapping** | Text longer than the column width wraps automatically, breaking mid-word. All text must be explicitly truncated or padded to fit within the column width. |
| **Cut command** | A paper cut command must be appended at the end of every receipt. Without it, the printer will not advance and cut the paper. |

### 12.2 Column Width Constants

```typescript
// utils/thermal-receipt.constants.ts

export const THERMAL_WIDTH_58MM = 32   // characters per line
export const THERMAL_WIDTH_80MM = 48   // characters per line

// Business settings will expose a printerWidth setting
// defaulting to THERMAL_WIDTH_58MM
```

### 12.3 Layout Helpers

```typescript
// utils/thermal-receipt.utils.ts

/**
 * Left-align text, right-align value, padding in between.
 * Total line width = cols.
 *
 * Example (cols=32):
 *   padLine('Eau Minerale 75cl', '1 000', 32)
 *   → 'Eau Minerale 75cl       1 000'
 */
export function padLine(left: string, right: string, cols: number): string {
  const gap = cols - left.length - right.length
  if (gap <= 0) {
    // Left side too long — truncate it to leave 1 space + right value
    const truncated = left.substring(0, cols - right.length - 2) + '.'
    return truncated + ' ' + right
  }
  return left + ' '.repeat(gap) + right
}

/**
 * Centre a string within the column width.
 */
export function centre(text: string, cols: number): string {
  const trimmed = text.substring(0, cols)
  const totalPad = cols - trimmed.length
  const left = Math.floor(totalPad / 2)
  return ' '.repeat(left) + trimmed
}

/**
 * Divider line — full width.
 */
export function divider(cols: number, char = '-'): string {
  return char.repeat(cols)
}

/**
 * Format a number as XAF with thousands separator.
 * No decimal places — XAF is a whole-unit currency.
 *
 * fmtXAF(3500)  → '3 500'
 * fmtXAF(245000) → '245 000'
 */
export function fmtXAF(amount: number): string {
  return Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/**
 * Truncate a product name to fit within available space.
 * Preserves the right column for price, adds '.' if truncated.
 */
export function truncateName(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name
  return name.substring(0, maxLen - 1) + '.'
}
```

### 12.4 Receipt Formatter

```typescript
// utils/thermal-receipt.formatter.ts

export function formatThermalReceipt(
  receipt: ReceiptPayload,
  cols: number = THERMAL_WIDTH_58MM,
): string[] {
  const lines: string[] = []
  const div = divider(cols)
  const divHeavy = divider(cols, '=')

  // ── HEADER ──────────────────────────────────────────
  lines.push(centre(receipt.businessName.toUpperCase(), cols))

  if (receipt.businessPhone) {
    lines.push(centre(receipt.businessPhone, cols))
  }
  if (receipt.businessAddress) {
    lines.push(centre(receipt.businessAddress, cols))
  }

  lines.push(div)
  lines.push(centre('RECU DE VENTE', cols))
  lines.push(div)

  // Date and sale number
  const dateStr = formatDateShort(receipt.soldAt)   // e.g. "13/04/2025 10:32"
  lines.push(`Date: ${dateStr}`)
  lines.push(`N Recu: ${receipt.saleNumber}`)
  lines.push(`Caissier: ${truncateName(receipt.cashierName, cols - 10)}`)

  if (receipt.customerName) {
    lines.push(`Client: ${truncateName(receipt.customerName, cols - 8)}`)
  }

  lines.push(div)

  // ── COLUMN HEADERS ───────────────────────────────────
  // For 32-char: "ARTICLE            QTE    TOTAL"
  // For 48-char: "ARTICLE                   QTE    TOTAL"
  lines.push(padLine('ARTICLE', 'TOTAL', cols))
  lines.push(div)

  // ── ITEMS ────────────────────────────────────────────
  for (const item of receipt.items) {
    const totalStr = fmtXAF(item.total)

    // Product name line — truncated to fit, right-aligned total
    const nameMaxLen = cols - totalStr.length - 1
    lines.push(padLine(truncateName(item.name, nameMaxLen), totalStr, cols))

    // Detail line: qty × unit price (indented, no right value)
    const detail = `  ${item.qty} x ${fmtXAF(item.unitPrice)} XAF`
    lines.push(detail)

    // Per-line discount if present
    if (item.discountAmount > 0) {
      lines.push(`  Remise: -${fmtXAF(item.discountAmount)} XAF`)
    }
  }

  lines.push(div)

  // ── TOTALS ───────────────────────────────────────────
  if (receipt.discountAmount > 0) {
    lines.push(padLine('Sous-total', fmtXAF(receipt.subtotal) + ' XAF', cols))
    lines.push(padLine('Remise', '-' + fmtXAF(receipt.discountAmount) + ' XAF', cols))
  }

  lines.push(divHeavy)
  lines.push(padLine('TOTAL', fmtXAF(receipt.totalAmount) + ' XAF', cols))
  lines.push(divHeavy)

  // ── PAYMENTS ─────────────────────────────────────────
  for (const p of receipt.payments) {
    const methodLabel = formatPaymentMethodShort(p.method)
    lines.push(padLine(methodLabel, fmtXAF(p.amount) + ' XAF', cols))
  }

  if (receipt.changeGiven > 0) {
    lines.push(padLine('Monnaie rendue', fmtXAF(receipt.changeGiven) + ' XAF', cols))
  }

  lines.push(div)

  // ── FOOTER ───────────────────────────────────────────
  lines.push(centre('Merci pour votre achat!', cols))
  lines.push(centre('*** BizTrack CM ***', cols))
  lines.push('')
  lines.push('')   // feed lines before cut

  return lines
}

function formatPaymentMethodShort(method: string): string {
  switch (method) {
    case 'CASH':         return 'Especes'
    case 'MTN_MOMO':     return 'MTN Mobile Money'
    case 'ORANGE_MONEY': return 'Orange Money'
    default:             return method
  }
}
```

### 12.5 Rendered Receipt Example (58mm / 32 chars)

```
        AKWA BOUTIQUE
      +237 6XX XXX XXX
--------------------------------
        RECU DE VENTE
--------------------------------
Date: 13/04/2025 10:32
N Recu: VTE-20250413-0042
Caissier: Jean-Pierre
--------------------------------
ARTICLE                    TOTAL
--------------------------------
Eau Minerale 75cl          1 000
  2 x 500 XAF
Savon Lux 100g             2 500
  5 x 500 XAF
Biscuit Petit Beurre 100g    750
  3 x 250 XAF
--------------------------------
================================
TOTAL                    4 250 XAF
================================
Especes                  5 000 XAF
Monnaie rendue             750 XAF
--------------------------------
     Merci pour votre achat!
        *** BizTrack CM ***


```

### 12.6 Bluetooth Printer Integration (React Native)

Thermal printers connect over **Bluetooth**. The recommended library is `react-native-thermal-receipt-printer-image-qr` or the lighter `react-native-bluetooth-escpos-printer`. Both expose a simple API: connect to a device, send raw ESC/POS bytes.

```typescript
// utils/thermal-printer.service.ts  (React Native)

import BluetoothEscposPrinter from 'react-native-bluetooth-escpos-printer'

export async function printReceipt(
  receipt: ReceiptPayload,
  cols: number = THERMAL_WIDTH_58MM,
): Promise<void> {
  const lines = formatThermalReceipt(receipt, cols)

  // Ensure printer is connected before printing
  // Connection state is managed by PrinterContext (see §12.7)

  for (const line of lines) {
    await BluetoothEscposPrinter.printText(line + '\n', {})
  }

  // ESC/POS cut command — advances paper and cuts
  await BluetoothEscposPrinter.printText('\x1B\x6D', {})
}
```

**ESC/POS commands used:**

| Command | Hex | Purpose |
|---------|-----|---------|
| Full cut | `\x1B\x6D` | Cut paper after receipt |
| Bold on | `\x1B\x45\x01` | For TOTAL line emphasis (optional enhancement) |
| Bold off | `\x1B\x45\x00` | Reset after bold |
| Feed lines | `\x1B\x64\x03` | Feed 3 lines before cut (prevents cutting text) |

### 12.7 Printer State Management (React Native)

The app maintains a global printer context so the cashier does not need to re-pair the printer on every sale.

```typescript
// context/PrinterContext.tsx

interface PrinterState {
  isConnected: boolean
  deviceName: string | null
  deviceAddress: string | null   // Bluetooth MAC address — persisted in AsyncStorage
  connect: (address: string, name: string) => Promise<void>
  disconnect: () => Promise<void>
  print: (receipt: ReceiptPayload) => Promise<void>
}
```

**Pairing flow:**
1. Owner opens Settings → Printer
2. App scans for nearby Bluetooth devices
3. Owner selects their thermal printer from the list
4. MAC address is saved to AsyncStorage — auto-reconnects on next app launch
5. A connection status indicator appears on the sale confirmation screen

**Print button behaviour on the receipt screen:**
- If printer is connected → print immediately, show success toast
- If printer is disconnected → show "Printer not connected" with a "Connect" shortcut
- Print is always optional — cashier can dismiss and share via WhatsApp instead

### 12.8 Paper Width Setting

The business owner configures their printer's paper width once in Settings. This value is stored on the `Business` entity:

```typescript
// On the Business entity / businesses table
printerWidth: enum('58mm', '80mm')  DEFAULT '58mm'
```

The React Native app reads this setting from the business profile and passes the correct `cols` value (`32` or `48`) to `formatThermalReceipt()` and `printReceipt()` automatically.

### 12.9 Character Encoding Note

Cameroonian shop names and product names often contain French characters: `é`, `è`, `ê`, `à`, `ç`, `ô`, `û`. Most cheap 58mm printers sold locally support **Code Page 858** (Latin-1 + Euro sign) or **Code Page 437** (standard ASCII, limited accents).

**Safe approach for launch:** Strip diacritics before printing using the same `normalize('NFD')` + remove combining marks logic from `SlugService`. This trades visual fidelity for universal printer compatibility:

```typescript
export function sanitizeForThermal(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // remove diacritics: é→e, ç→c, à→a
    .replace(/[^\x00-\x7F]/g, '?')    // replace any remaining non-ASCII with ?
}
```

So `"Eau Minérale"` prints as `"Eau Minerale"` — perfectly readable, no encoding errors.

**Future enhancement:** Send a code page selection command (`\x1B\x74\x13` for CP858) before printing and keep the accented characters. This works on quality printers but causes garbled output on cheap no-name models. Opt-in per printer model in settings.

---

## 13. Integration With Inventory Module

The sales module calls the inventory service via internal method calls — never over HTTP. This keeps the transaction boundary clean.

```typescript
// Called inside sales.service.ts → createSale(), within the DB transaction

await this.inventoryService.deductForSale(
  businessId,
  items.map(i => ({ productId: i.productId, quantity: i.quantity })),
  saleId,
  cashierId,
)
```

```typescript
// Called inside sales.service.ts → voidSale()

await this.inventoryService.reverseForVoidedSale(saleId, userId)
```

**Key behaviour:**
- Products where `track_inventory = false` are silently skipped by the inventory service
- The inventory call happens **inside the same DB transaction** as the sale write. If inventory deduction fails (e.g. `STRICT` mode + insufficient stock), the entire sale is rolled back — no partial states
- `reverseForVoidedSale` reads the original `inventory_movements` records for the sale and creates equal-and-opposite `VOID_REVERSAL` movements, bringing quantities back to pre-sale levels

---

## 14. Integration With Daily Summary

After every confirmed sale or void, the `daily_sale_summaries` table is updated atomically:

```typescript
// sales/daily-summary.service.ts

async incrementForSale(sale: Sale, items: SaleItem[], payments: SalePayment[]) {
  const cost = items.reduce((sum, i) => sum + (i.costPrice ?? 0) * i.quantity, 0)
  const cashAmount = payments.filter(p => p.method === 'CASH').reduce((s, p) => s + p.amount, 0)
  const mtnAmount  = payments.filter(p => p.method === 'MTN_MOMO').reduce((s, p) => s + p.amount, 0)
  const orangeAmount = payments.filter(p => p.method === 'ORANGE_MONEY').reduce((s, p) => s + p.amount, 0)

  await this.dataSource.query(`
    INSERT INTO daily_sale_summaries
      (business_id, summary_date, total_sales, total_revenue, total_cost,
       gross_profit, total_discounts, cash_collected, mtn_momo_collected,
       orange_money_collected, updated_at)
    VALUES ($1,$2, 1,$3,$4, $3-$4,$5,$6,$7,$8, now())
    ON CONFLICT (business_id, summary_date) DO UPDATE SET
      total_sales            = daily_sale_summaries.total_sales + 1,
      total_revenue          = daily_sale_summaries.total_revenue + $3,
      total_cost             = daily_sale_summaries.total_cost + $4,
      gross_profit           = daily_sale_summaries.gross_profit + ($3 - $4),
      total_discounts        = daily_sale_summaries.total_discounts + $5,
      cash_collected         = daily_sale_summaries.cash_collected + $6,
      mtn_momo_collected     = daily_sale_summaries.mtn_momo_collected + $7,
      orange_money_collected = daily_sale_summaries.orange_money_collected + $8,
      updated_at             = now()
  `, [
    sale.businessId, sale.saleDate,
    sale.totalAmount, cost,
    sale.discountAmount,
    cashAmount, mtnAmount, orangeAmount,
  ])
}

async decrementForVoid(sale: Sale, items: SaleItem[], payments: SalePayment[]) {
  // Mirror of increment — subtracts all values
  // Always operates on sale.saleDate (not today) so historical summaries stay accurate
}
```

---

## 15. RBAC — Permission Requirements

| Action | Required Permission |
|--------|-------------------|
| Record a sale | `SALES_CREATE` |
| View sales list | `SALES_VIEW` |
| View sale detail | `SALES_VIEW` |
| View daily summary | `SALES_VIEW` |
| View sales report (range) | `SALES_VIEW` |
| Get receipt | `SALES_VIEW` |
| Void a sale | `SALES_VOID` |

**Role defaults:**

| Role | SALES_CREATE | SALES_VIEW | SALES_VOID |
|------|:---:|:---:|:---:|
| `OWNER` | ✅ | ✅ | ✅ |
| `MANAGER` | ✅ | ✅ | ✅ |
| `CASHIER` | ✅ | ✅ own sales only | ❌ |
| `ACCOUNTANT` | ❌ | ✅ | ❌ |

**`CASHIER` visibility rule:** A cashier can view their own sales (to issue receipts, look up a sale number) but cannot see other cashiers' sales or the full business revenue summary. This is enforced by an additional `cashierId = userId` filter applied when the requesting role is `CASHIER`.

---

## 16. Error Responses

| Scenario | HTTP | Code | Message |
|----------|------|------|---------|
| Duplicate clientId (same business) | 200 | — | Returns existing sale silently |
| Product not found / wrong business | 422 | `PRODUCT_NOT_FOUND` | "Product {id} does not exist" |
| Product inactive | 422 | `PRODUCT_INACTIVE` | "Product {name} is no longer available" |
| Insufficient stock (STRICT mode) | 422 | `INSUFFICIENT_STOCK` | "Insufficient stock for {name}: {available} available, {requested} requested" |
| amount_paid < total_amount | 422 | `UNDERPAYMENT` | "Amount paid ({paid}) is less than total ({total})" |
| Zero items | 422 | `EMPTY_SALE` | "A sale must have at least one item" |
| Void already voided sale | 422 | `ALREADY_VOIDED` | "Sale {saleNumber} has already been voided" |
| Void reason too short | 422 | `VOID_REASON_REQUIRED` | "Void reason must be at least 10 characters" |
| Sale not found | 404 | `SALE_NOT_FOUND` | "Sale not found" |
| Insufficient permission to void | 403 | `FORBIDDEN` | "Only owners and managers can void sales" |

---

## 17. Implementation Order

### Sprint 5 — Sales Foundation
- Migrations: `sales`, `sale_items`, `sale_payments`, `daily_sale_summaries`, `sale_number_sequences`
- `SaleNumberService` — atomic sequence generation
- `DailySummaryService` — increment / decrement / rebuild
- `POST /sales` — full creation with all business rules, inventory deduction, summary update
- `GET /sales/:id` — detail
- `GET /sales/by-number/:saleNumber`
- Unit tests: total computation, sale number generation, clientId deduplication

### Sprint 6 — Sales Operations & Receipts
- `GET /sales` — list with all filters + pagination
- `POST /sales/:id/void` — void with inventory reversal + summary decrement
- `GET /sales/summary/daily` — daily summary from cache table
- `GET /sales/:id/receipt` — receipt payload generation
- WhatsApp receipt formatting utility — `formatReceiptForWhatsApp()`, `shareReceiptOnWhatsApp()` (React Native)
- Thermal receipt formatter — `formatThermalReceipt()`, `padLine()`, `fmtXAF()`, layout helpers (React Native)
- Bluetooth printer integration — `react-native-bluetooth-escpos-printer`, `PrinterContext`, device pairing + MAC persistence
- `printerWidth` setting on Business entity (58mm / 80mm)
- CASHIER visibility restriction (own sales only)
- Integration tests: offline sync + deduplication, concurrent sales race conditions, void + inventory reversal correctness

### Sprint 7 — Reporting
- `GET /sales/summary/range` — date range aggregation (DAY / WEEK / MONTH)
- `daily_sale_summaries` rebuild job (admin utility — for data recovery)
- Price drift warning detection + flagging
- Cashier performance breakdown endpoint (`GET /sales/summary/by-cashier`)
