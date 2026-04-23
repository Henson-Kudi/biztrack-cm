'use client'

import {
  InventoryMovementType,
  PaymentMethod,
  SaleStatus,
  type CreateSaleItemRequest,
  type CreateSaleRequest,
  type DailySalesSummary,
  type PaginatedResult,
  type Sale,
  type SaleItem,
  type SaleListItem,
  type SalePayment,
  type SaleReceipt,
  type SalesQuery,
  type SaleSyncPayload,
} from '@biztrack/types'
import { compareValues, dbBatch, dbQuery, normalizeSortOrder, paginateResult } from './local-db'
import { assertBusinessId, fetchProductRowsForBusiness, type ProductRow } from './products.local'
import { buildOutboxEventOperation, requestBackgroundSync } from './sync.local'

type InventoryLevelRow = {
  id: string
  quantity: number
}

type SaleRow = {
  id: string
  business_id: string
  client_id: string | null
  cashier_id: string
  cashier_name: string | null
  sale_number: string | null
  receipt_number: string | null
  status: string
  subtotal: number | null
  total_amount: number | null
  net_amount: number | null
  discount_amount: number | null
  tax_amount: number | null
  amount_paid: number | null
  change_given: number | null
  payment_method: string | null
  momo_reference: string | null
  customer_name: string | null
  customer_phone: string | null
  notes: string | null
  price_drift_warning: number | null
  currency: string | null
  sale_date: string | null
  sold_at: string | null
  synced_at: string | null
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
  created_at: string
  updated_at: string
}

type SaleItemRow = {
  id: string
  sale_id: string
  business_id: string
  product_id: string
  product_name: string
  product_sku: string | null
  unit_of_measure: string | null
  quantity: number
  unit_price: number
  discount_amount: number | null
  line_total: number | null
  total_price: number | null
  cost_price: number | null
  created_at: string
  updated_at: string
  is_deleted: number
}

type SalePaymentRow = {
  id: string
  sale_id: string
  business_id: string
  method: string
  amount: number
  mobile_money_reference: string | null
  created_at: string
}

type SaleCountRow = {
  sale_id: string
  item_count: number
}

export type CreateLocalSaleItemInput = CreateSaleItemRequest

export type CreateLocalSaleInput = Omit<CreateSaleRequest, 'clientId' | 'soldAt'> & {
  clientId?: string
  soldAt?: string
  cashierId?: string | null
  cashierName?: string | null
}

export type LocalSaleRecord = Sale & {
  cashierName: string | null
  subtotalAmount: number
  receiptNumber: string
  netAmount: number
  momoReference: string | null
}

export class SaleLocalError extends Error {
  constructor(
    public readonly code:
      | 'SALE_NOT_FOUND'
      | 'SALE_EMPTY'
      | 'SALE_QUANTITY_INVALID'
      | 'SALE_UNIT_PRICE_INVALID'
      | 'SALE_ITEM_DISCOUNT_INVALID'
      | 'SALE_DISCOUNT_INVALID'
      | 'SALE_UNDERPAID'
      | 'SALE_PRODUCT_NOT_FOUND'
      | 'SALE_PRODUCT_INACTIVE'
      | 'SALE_INSUFFICIENT_STOCK'
      | 'SALE_PAYMENT_REQUIRED'
      | 'SALE_PAYMENT_AMOUNT_INVALID'
      | 'SALE_PAYMENT_METHOD_INVALID',
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'SaleLocalError'
  }
}

export async function createSaleLocal(
  businessId: string,
  payload: CreateLocalSaleInput,
): Promise<LocalSaleRecord> {
  const normalizedBusinessId = assertBusinessId(businessId)
  validateSalePayload(payload)

  const clientId = payload.clientId?.trim() || crypto.randomUUID()
  const existing = await getSaleByClientIdLocal(normalizedBusinessId, clientId)
  if (existing) {
    return existing
  }

  const now = new Date()
  const soldAtDate = payload.soldAt ? new Date(payload.soldAt) : now
  const soldAt = Number.isNaN(soldAtDate.getTime()) ? now : soldAtDate
  const soldAtIso = soldAt.toISOString()
  const createdAt = now.toISOString()
  const saleDate = soldAtIso.slice(0, 10)
  const cashierId = payload.cashierId?.trim() || 'local-user'
  const cashierName = payload.cashierName?.trim() || null
  const customerName = payload.customerName?.trim() || null
  const customerPhone = payload.customerPhone?.trim() || null
  const saleNotes = payload.notes?.trim() || null
  const rows = await fetchProductRowsForBusiness(normalizedBusinessId)
  const productMap = new Map(rows.map((row) => [row.id, row]))
  const saleId = crypto.randomUUID()
  const saleNumber = await buildSaleNumber(normalizedBusinessId, saleDate)

  let subtotal = 0
  let priceDriftWarning = false
  const saleItems: LocalSaleRecord['items'] = []
  const salePayments: SalePayment[] = []
  const itemMovementIds: Array<string | null> = []
  const operations: Array<{ sql: string; params?: unknown[] }> = []

  for (const input of payload.items) {
    const row = productMap.get(input.productId)
    if (!row) {
      throw new SaleLocalError('SALE_PRODUCT_NOT_FOUND')
    }
    if (!row.is_active) {
      throw new SaleLocalError('SALE_PRODUCT_INACTIVE')
    }

    const quantity = roundQuantity(input.quantity)
    const unitPrice = roundMoney(input.unitPrice)
    const itemDiscountAmount = roundMoney(input.discountAmount ?? 0)
    const lineTotal = roundMoney(Math.max(0, unitPrice * quantity - itemDiscountAmount))
    const costPrice =
      input.costPrice !== undefined ? roundMoney(input.costPrice) : (row.cost_price ?? null)

    if (hasPriceDrift(unitPrice, row.price)) {
      priceDriftWarning = true
    }

    subtotal = roundMoney(subtotal + lineTotal)

    const itemId = crypto.randomUUID()
    saleItems.push({
      id: itemId,
      saleId,
      productId: row.id,
      productName: row.name,
      productSku: row.sku,
      unitOfMeasure: row.unit_abbreviation ?? row.unit_name ?? null,
      quantity,
      unitPrice,
      discountAmount: itemDiscountAmount,
      lineTotal,
      totalPrice: lineTotal,
      costPrice,
      createdAt: soldAtIso,
      updatedAt: createdAt,
      isDeleted: false,
    })

    operations.push({
      sql: `
        INSERT INTO sale_items (
          id,
          sale_id,
          business_id,
          product_id,
          product_name,
          product_sku,
          unit_of_measure,
          quantity,
          unit_price,
          discount_amount,
          line_total,
          total_price,
          cost_price,
          is_deleted,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `,
      params: [
        itemId,
        saleId,
        normalizedBusinessId,
        row.id,
        row.name,
        row.sku,
        row.unit_abbreviation ?? row.unit_name ?? null,
        quantity,
        unitPrice,
        itemDiscountAmount,
        lineTotal,
        lineTotal,
        costPrice,
        soldAtIso,
        createdAt,
      ],
    })

    let movementId: string | null = null

    if (row.track_inventory) {
      const level = await ensureInventoryLevel(normalizedBusinessId, row, createdAt)
      const quantityBefore = roundQuantity(level.quantity)
      const quantityAfter = roundQuantity(quantityBefore - quantity)

      if (quantityAfter < 0) {
        throw new SaleLocalError('SALE_INSUFFICIENT_STOCK')
      }

      movementId = crypto.randomUUID()
      operations.push(
        {
          sql: `
            UPDATE inventory_levels
            SET quantity = ?,
                updated_at = ?
            WHERE id = ?
          `,
          params: [quantityAfter, createdAt, level.id],
        },
        {
          sql: `
            UPDATE products
            SET stock_quantity = ?,
                updated_at = ?
            WHERE id = ?
          `,
          params: [quantityAfter, createdAt, row.id],
        },
        {
          sql: `
            INSERT INTO inventory_movements (
              id,
              business_id,
              product_id,
              type,
              quantity_change,
              quantity_before,
              quantity_after,
              reference_type,
              reference_id,
              notes,
              performed_by_id,
              performed_by_name,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          params: [
            movementId,
            normalizedBusinessId,
            row.id,
            InventoryMovementType.SALE,
            -quantity,
            quantityBefore,
            quantityAfter,
            'sale',
            saleId,
            `Sale ${saleNumber}`,
            cashierId,
            cashierName ?? 'Local user',
            soldAtIso,
          ],
        },
      )
    }

    itemMovementIds.push(movementId)
  }

  const saleDiscountAmount = Math.min(roundMoney(payload.discountAmount ?? 0), subtotal)
  const taxAmount = 0
  const totalAmount = roundMoney(Math.max(0, subtotal - saleDiscountAmount + taxAmount))

  for (const payment of payload.payments) {
    const paymentId = crypto.randomUUID()
    salePayments.push({
      id: paymentId,
      saleId,
      businessId: normalizedBusinessId,
      method: payment.method,
      amount: roundMoney(payment.amount),
      mobileMoneyReference: payment.mobileMoneyReference?.trim() || null,
      createdAt,
    })

    operations.push({
      sql: `
        INSERT INTO sale_payments (
          id,
          sale_id,
          business_id,
          method,
          amount,
          mobile_money_reference,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        paymentId,
        saleId,
        normalizedBusinessId,
        payment.method,
        roundMoney(payment.amount),
        payment.mobileMoneyReference?.trim() || null,
        createdAt,
      ],
    })
  }

  const amountPaid = roundMoney(salePayments.reduce((sum, payment) => sum + payment.amount, 0))
  if (amountPaid < totalAmount) {
    throw new SaleLocalError('SALE_UNDERPAID')
  }

  const changeGiven = roundMoney(amountPaid - totalAmount)
  const paymentMethod = derivePaymentMethod(salePayments)
  const momoReference = salePayments.find((payment) => payment.mobileMoneyReference)?.mobileMoneyReference ?? null

  operations.unshift(
    {
      sql: `
        INSERT INTO sales (
          id,
          business_id,
          client_id,
          cashier_id,
          cashier_name,
          sale_number,
          receipt_number,
          subtotal,
          total_amount,
          discount_amount,
          tax_amount,
          net_amount,
          amount_paid,
          change_given,
          payment_method,
          momo_reference,
          customer_name,
          customer_phone,
          notes,
          price_drift_warning,
          currency,
          sale_date,
          sold_at,
          synced_at,
          voided_at,
          voided_by,
          void_reason,
          status,
          is_deleted,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, 0, ?, ?)
      `,
      params: [
        saleId,
        normalizedBusinessId,
        clientId,
        cashierId,
        cashierName,
        saleNumber,
        saleNumber,
        subtotal,
        totalAmount,
        saleDiscountAmount,
        taxAmount,
        totalAmount,
        amountPaid,
        changeGiven,
        paymentMethod,
        momoReference,
        customerName,
        customerPhone,
        saleNotes,
        priceDriftWarning ? 1 : 0,
        'XAF',
        saleDate,
        soldAtIso,
        SaleStatus.COMPLETED,
        createdAt,
        createdAt,
      ],
    },
    buildOutboxEventOperation('sales', saleId, {
      saleId,
      clientId,
      saleNumber,
      soldAt: soldAtIso,
      cashierId: isUuid(cashierId) ? cashierId : null,
      cashierName: cashierName ?? undefined,
      customerName: customerName ?? undefined,
      customerPhone: customerPhone ?? undefined,
      notes: saleNotes ?? undefined,
      discountAmount: saleDiscountAmount,
      payments: salePayments.map((payment) => ({
        id: payment.id,
        method: payment.method,
        amount: payment.amount,
        mobileMoneyReference: payment.mobileMoneyReference ?? undefined,
      })),
      items: saleItems.map((item, index) => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        costPrice: item.costPrice ?? undefined,
        movementId: itemMovementIds[index] ?? undefined,
      })),
    } satisfies SaleSyncPayload),
  )

  await dbBatch(operations)
  requestBackgroundSync()

  return {
    id: saleId,
    businessId: normalizedBusinessId,
    clientId,
    cashierId,
    cashier: cashierName ? { id: cashierId, name: cashierName } : null,
    cashierName,
    saleNumber,
    receiptNumber: saleNumber,
    status: SaleStatus.COMPLETED,
    subtotal,
    subtotalAmount: subtotal,
    discountAmount: saleDiscountAmount,
    taxAmount,
    totalAmount,
    amountPaid,
    changeGiven,
    customerName,
    customerPhone,
    notes: saleNotes,
    priceDriftWarning,
    saleDate,
    soldAt: soldAtIso,
    syncedAt: null,
    createdAt,
    updatedAt: createdAt,
    voidedAt: null,
    voidedById: null,
    voidReason: null,
    currency: 'XAF',
    paymentMethod,
    payments: salePayments,
    items: saleItems,
    netAmount: totalAmount,
    momoReference,
  }
}

export async function listSalesLocal(
  businessId: string,
  query: SalesQuery,
): Promise<PaginatedResult<SaleListItem>> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const sortOrder = normalizeSortOrder(query.sortOrder)
  const sales = await dbQuery<SaleRow>(
    `
      SELECT
        id,
        business_id,
        client_id,
        cashier_id,
        cashier_name,
        sale_number,
        receipt_number,
        status,
        subtotal,
        total_amount,
        net_amount,
        discount_amount,
        tax_amount,
        amount_paid,
        change_given,
        payment_method,
        momo_reference,
        customer_name,
        customer_phone,
        notes,
        price_drift_warning,
        currency,
        sale_date,
        sold_at,
        synced_at,
        voided_at,
        voided_by,
        void_reason,
        created_at,
        updated_at
      FROM sales
      WHERE business_id = ?
      ORDER BY sold_at DESC, created_at DESC
    `,
    [normalizedBusinessId],
  )
  const counts = await dbQuery<SaleCountRow>(
    `
      SELECT sale_id, COUNT(*) AS item_count
      FROM sale_items
      WHERE business_id = ?
        AND is_deleted = 0
      GROUP BY sale_id
    `,
    [normalizedBusinessId],
  )
  const countsBySaleId = new Map(counts.map((row) => [row.sale_id, row.item_count]))
  const search = query.search?.trim().toLowerCase()

  const filtered = sales
    .filter((sale) => {
      if (query.dateFrom && (sale.sale_date ?? '') < query.dateFrom) return false
      if (query.dateTo && (sale.sale_date ?? '') > query.dateTo) return false
      if (query.cashierId && sale.cashier_id !== query.cashierId) return false
      if (query.status && normalizeSaleStatus(sale.status) !== query.status) return false
      if (query.paymentMethod && normalizePaymentMethod(sale.payment_method) !== query.paymentMethod) {
        return false
      }

      if (!search) return true
      const haystack = [
        sale.sale_number,
        sale.receipt_number,
        sale.customer_name,
        sale.customer_phone,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(search)
    })
    .map((sale) => mapSaleListItem(sale, countsBySaleId.get(sale.id) ?? 0))

  filtered.sort((left, right) => {
    switch (query.sortBy) {
      case 'saleDate':
        return compareValues(left.saleDate, right.saleDate, sortOrder)
      case 'saleNumber':
        return compareValues(left.saleNumber, right.saleNumber, sortOrder)
      case 'totalAmount':
        return compareValues(left.totalAmount, right.totalAmount, sortOrder)
      case 'customerName':
        return compareValues(left.customerName ?? null, right.customerName ?? null, sortOrder)
      case 'status':
        return compareValues(left.status, right.status, sortOrder)
      case 'createdAt':
        return compareValues(left.createdAt, right.createdAt, sortOrder)
      case 'soldAt':
      default:
        return compareValues(left.soldAt, right.soldAt, sortOrder)
    }
  })

  return paginateResult(filtered, query.page, query.limit)
}

export async function getSaleLocal(
  businessId: string,
  saleId: string,
): Promise<LocalSaleRecord> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const [row] = await dbQuery<SaleRow>(
    `
      SELECT
        id,
        business_id,
        client_id,
        cashier_id,
        cashier_name,
        sale_number,
        receipt_number,
        status,
        subtotal,
        total_amount,
        net_amount,
        discount_amount,
        tax_amount,
        amount_paid,
        change_given,
        payment_method,
        momo_reference,
        customer_name,
        customer_phone,
        notes,
        price_drift_warning,
        currency,
        sale_date,
        sold_at,
        synced_at,
        voided_at,
        voided_by,
        void_reason,
        created_at,
        updated_at
      FROM sales
      WHERE business_id = ?
        AND id = ?
      LIMIT 1
    `,
    [normalizedBusinessId, saleId],
  )

  if (!row) {
    throw new SaleLocalError('SALE_NOT_FOUND')
  }

  return hydrateSaleRecord(row)
}

export async function getSaleByNumberLocal(
  businessId: string,
  saleNumber: string,
): Promise<LocalSaleRecord> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const [row] = await dbQuery<SaleRow>(
    `
      SELECT
        id,
        business_id,
        client_id,
        cashier_id,
        cashier_name,
        sale_number,
        receipt_number,
        status,
        subtotal,
        total_amount,
        net_amount,
        discount_amount,
        tax_amount,
        amount_paid,
        change_given,
        payment_method,
        momo_reference,
        customer_name,
        customer_phone,
        notes,
        price_drift_warning,
        currency,
        sale_date,
        sold_at,
        synced_at,
        voided_at,
        voided_by,
        void_reason,
        created_at,
        updated_at
      FROM sales
      WHERE business_id = ?
        AND (sale_number = ? OR receipt_number = ?)
      LIMIT 1
    `,
    [normalizedBusinessId, saleNumber, saleNumber],
  )

  if (!row) {
    throw new SaleLocalError('SALE_NOT_FOUND')
  }

  return hydrateSaleRecord(row)
}

export async function getDailySalesSummaryLocal(
  businessId: string,
  date?: string,
): Promise<DailySalesSummary> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const targetDate = date ?? new Date().toISOString().slice(0, 10)
  const sales = await dbQuery<SaleRow>(
    `
      SELECT
        id,
        business_id,
        client_id,
        cashier_id,
        cashier_name,
        sale_number,
        receipt_number,
        status,
        subtotal,
        total_amount,
        net_amount,
        discount_amount,
        tax_amount,
        amount_paid,
        change_given,
        payment_method,
        momo_reference,
        customer_name,
        customer_phone,
        notes,
        price_drift_warning,
        currency,
        sale_date,
        sold_at,
        synced_at,
        voided_at,
        voided_by,
        void_reason,
        created_at,
        updated_at
      FROM sales
      WHERE business_id = ?
        AND sale_date = ?
    `,
    [normalizedBusinessId, targetDate],
  )

  if (sales.length === 0) {
    return {
      date: targetDate,
      totalSales: 0,
      totalRevenue: 0,
      totalCost: 0,
      grossProfit: 0,
      grossMarginPercent: 0,
      totalDiscounts: 0,
      cashCollected: 0,
      mtnMomoCollected: 0,
      orangeMoneyCollected: 0,
      cardCollected: 0,
      voidedSales: 0,
      voidedAmount: 0,
    }
  }

  const saleIds = sales.map((sale) => sale.id)
  const itemRows = await querySaleItemsBySaleIds(saleIds)
  const paymentRows = await querySalePaymentsBySaleIds(saleIds)
  const itemGroups = groupBy(itemRows, (row) => row.sale_id)
  const paymentGroups = groupBy(paymentRows, (row) => row.sale_id)

  let totalSales = 0
  let totalRevenue = 0
  let totalCost = 0
  let grossProfit = 0
  let totalDiscounts = 0
  let cashCollected = 0
  let mtnMomoCollected = 0
  let orangeMoneyCollected = 0
  let cardCollected = 0
  let voidedSales = 0
  let voidedAmount = 0

  for (const sale of sales) {
    const status = normalizeSaleStatus(sale.status)
    const saleTotal = roundMoney(sale.total_amount ?? sale.net_amount ?? 0)
    const saleDiscount = roundMoney(sale.discount_amount ?? 0)
    const saleItems = itemGroups.get(sale.id) ?? []
    const payments = paymentGroups.get(sale.id) ?? []
    const lineDiscounts = saleItems.reduce(
      (sum, item) => sum + roundMoney(item.discount_amount ?? 0),
      0,
    )

    if (status === SaleStatus.VOIDED) {
      voidedSales += 1
      voidedAmount = roundMoney(voidedAmount + saleTotal)
      continue
    }

    if (status !== SaleStatus.COMPLETED) {
      continue
    }

    totalSales += 1
    totalRevenue = roundMoney(totalRevenue + saleTotal)
    totalDiscounts = roundMoney(totalDiscounts + saleDiscount + lineDiscounts)

    const itemCost = saleItems.reduce((sum, item) => {
      const costPrice = item.cost_price ?? 0
      return sum + roundMoney(costPrice * item.quantity)
    }, 0)

    totalCost = roundMoney(totalCost + itemCost)
    grossProfit = roundMoney(grossProfit + (saleTotal - itemCost))

    for (const payment of payments) {
      if (payment.method === PaymentMethod.CASH) {
        cashCollected = roundMoney(cashCollected + payment.amount)
      } else if (payment.method === PaymentMethod.MTN_MOMO) {
        mtnMomoCollected = roundMoney(mtnMomoCollected + payment.amount)
      } else if (payment.method === PaymentMethod.ORANGE_MONEY) {
        orangeMoneyCollected = roundMoney(orangeMoneyCollected + payment.amount)
      } else if (payment.method === PaymentMethod.CARD) {
        cardCollected = roundMoney(cardCollected + payment.amount)
      }
    }
  }

  return {
    date: targetDate,
    totalSales,
    totalRevenue,
    totalCost,
    grossProfit,
    grossMarginPercent: totalRevenue > 0 ? roundMoney((grossProfit / totalRevenue) * 100) : 0,
    totalDiscounts,
    cashCollected,
    mtnMomoCollected,
    orangeMoneyCollected,
    cardCollected,
    voidedSales,
    voidedAmount,
  }
}

export async function buildSaleReceiptLocal(
  businessName: string,
  sale: LocalSaleRecord,
  businessPhone?: string | null,
  businessAddress?: string | null,
  footer?: string | null,
): Promise<SaleReceipt> {
  return {
    businessName,
    businessPhone: businessPhone ?? null,
    businessAddress: businessAddress ?? null,
    saleNumber: sale.saleNumber,
    soldAt: sale.soldAt,
    cashierName: sale.cashierName ?? sale.cashier?.name ?? 'Local user',
    customerName: sale.customerName ?? null,
    customerPhone: sale.customerPhone ?? null,
    items: sale.items.map((item) => ({
      name: item.productName,
      qty: item.quantity,
      unitPrice: item.unitPrice,
      total: item.lineTotal,
      discountAmount: item.discountAmount,
    })),
    subtotal: sale.subtotal,
    discountAmount: sale.discountAmount,
    totalAmount: sale.totalAmount,
    amountPaid: sale.amountPaid,
    changeGiven: sale.changeGiven,
    currency: sale.currency ?? 'XAF',
    payments: sale.payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount,
      mobileMoneyReference: payment.mobileMoneyReference ?? null,
    })),
    footer: footer ?? null,
  }
}

async function getSaleByClientIdLocal(businessId: string, clientId: string) {
  const [row] = await dbQuery<SaleRow>(
    `
      SELECT
        id,
        business_id,
        client_id,
        cashier_id,
        cashier_name,
        sale_number,
        receipt_number,
        status,
        subtotal,
        total_amount,
        net_amount,
        discount_amount,
        tax_amount,
        amount_paid,
        change_given,
        payment_method,
        momo_reference,
        customer_name,
        customer_phone,
        notes,
        price_drift_warning,
        currency,
        sale_date,
        sold_at,
        synced_at,
        voided_at,
        voided_by,
        void_reason,
        created_at,
        updated_at
      FROM sales
      WHERE business_id = ?
        AND client_id = ?
      LIMIT 1
    `,
    [businessId, clientId],
  )

  return row ? hydrateSaleRecord(row) : null
}

async function hydrateSaleRecord(row: SaleRow): Promise<LocalSaleRecord> {
  const [itemRows, paymentRows] = await Promise.all([
    dbQuery<SaleItemRow>(
      `
        SELECT
          id,
          sale_id,
          business_id,
          product_id,
          product_name,
          product_sku,
          unit_of_measure,
          quantity,
          unit_price,
          discount_amount,
          line_total,
          total_price,
          cost_price,
          created_at,
          updated_at,
          is_deleted
        FROM sale_items
        WHERE sale_id = ?
          AND is_deleted = 0
        ORDER BY created_at ASC, id ASC
      `,
      [row.id],
    ),
    dbQuery<SalePaymentRow>(
      `
        SELECT
          id,
          sale_id,
          business_id,
          method,
          amount,
          mobile_money_reference,
          created_at
        FROM sale_payments
        WHERE sale_id = ?
        ORDER BY created_at ASC, id ASC
      `,
      [row.id],
    ),
  ])

  const items = itemRows.map(mapSaleItemRow)
  const payments = paymentRows.map(mapSalePaymentRow)
  const saleNumber = row.sale_number?.trim() || row.receipt_number?.trim() || row.id
  const subtotal = roundMoney(row.subtotal ?? row.total_amount ?? 0)
  const totalAmount = roundMoney(row.total_amount ?? row.net_amount ?? subtotal)
  const paymentMethod = derivePaymentMethod(payments) ?? normalizePaymentMethod(row.payment_method)
  const momoReference =
    payments.find((payment) => payment.mobileMoneyReference)?.mobileMoneyReference ??
    row.momo_reference ??
    null
  const status = normalizeSaleStatus(row.status)

  return {
    id: row.id,
    businessId: row.business_id,
    clientId: row.client_id?.trim() || row.id,
    cashierId: row.cashier_id,
    cashier: row.cashier_name ? { id: row.cashier_id, name: row.cashier_name } : null,
    cashierName: row.cashier_name ?? null,
    saleNumber,
    receiptNumber: saleNumber,
    status,
    subtotal,
    subtotalAmount: subtotal,
    discountAmount: roundMoney(row.discount_amount ?? 0),
    taxAmount: roundMoney(row.tax_amount ?? 0),
    totalAmount,
    amountPaid: roundMoney(row.amount_paid ?? totalAmount),
    changeGiven: roundMoney(row.change_given ?? 0),
    customerName: row.customer_name ?? null,
    customerPhone: row.customer_phone ?? null,
    notes: row.notes ?? null,
    priceDriftWarning: Boolean(row.price_drift_warning),
    saleDate: row.sale_date ?? (row.sold_at ?? row.created_at).slice(0, 10),
    soldAt: row.sold_at ?? row.created_at,
    syncedAt: row.synced_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    voidedAt: row.voided_at ?? null,
    voidedById: row.voided_by ?? null,
    voidReason: row.void_reason ?? null,
    currency: row.currency ?? 'XAF',
    paymentMethod,
    payments,
    items,
    netAmount: totalAmount,
    momoReference,
  }
}

function mapSaleListItem(row: SaleRow, itemCount: number): SaleListItem {
  const saleNumber = row.sale_number?.trim() || row.receipt_number?.trim() || row.id
  const totalAmount = roundMoney(row.total_amount ?? row.net_amount ?? 0)
  const paymentMethod = normalizePaymentMethod(row.payment_method)

  return {
    id: row.id,
    businessId: row.business_id,
    clientId: row.client_id?.trim() || row.id,
    cashierId: row.cashier_id,
    cashier: row.cashier_name ? { id: row.cashier_id, name: row.cashier_name } : null,
    saleNumber,
    status: normalizeSaleStatus(row.status),
    subtotal: roundMoney(row.subtotal ?? totalAmount),
    discountAmount: roundMoney(row.discount_amount ?? 0),
    taxAmount: roundMoney(row.tax_amount ?? 0),
    totalAmount,
    amountPaid: roundMoney(row.amount_paid ?? totalAmount),
    changeGiven: roundMoney(row.change_given ?? 0),
    customerName: row.customer_name ?? null,
    customerPhone: row.customer_phone ?? null,
    notes: row.notes ?? null,
    priceDriftWarning: Boolean(row.price_drift_warning),
    saleDate: row.sale_date ?? (row.sold_at ?? row.created_at).slice(0, 10),
    soldAt: row.sold_at ?? row.created_at,
    syncedAt: row.synced_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    voidedAt: row.voided_at ?? null,
    voidedById: row.voided_by ?? null,
    voidReason: row.void_reason ?? null,
    currency: row.currency ?? 'XAF',
    paymentMethod,
    itemCount,
    receiptNumber: saleNumber,
    netAmount: totalAmount,
    momoReference: row.momo_reference ?? null,
  }
}

function mapSaleItemRow(row: SaleItemRow): SaleItem {
  const lineTotal = roundMoney(row.line_total ?? row.total_price ?? 0)

  return {
    id: row.id,
    saleId: row.sale_id,
    productId: row.product_id,
    productName: row.product_name,
    productSku: row.product_sku ?? null,
    unitOfMeasure: row.unit_of_measure ?? null,
    quantity: roundQuantity(row.quantity),
    unitPrice: roundMoney(row.unit_price),
    discountAmount: roundMoney(row.discount_amount ?? 0),
    lineTotal,
    totalPrice: lineTotal,
    costPrice: row.cost_price ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDeleted: Boolean(row.is_deleted),
  }
}

function mapSalePaymentRow(row: SalePaymentRow): SalePayment {
  return {
    id: row.id,
    saleId: row.sale_id,
    businessId: row.business_id,
    method: normalizePaymentMethod(row.method) ?? PaymentMethod.CASH,
    amount: roundMoney(row.amount),
    mobileMoneyReference: row.mobile_money_reference ?? null,
    createdAt: row.created_at,
  }
}

async function querySaleItemsBySaleIds(saleIds: string[]) {
  if (saleIds.length === 0) {
    return [] as SaleItemRow[]
  }

  const placeholders = saleIds.map(() => '?').join(', ')
  return dbQuery<SaleItemRow>(
    `
      SELECT
        id,
        sale_id,
        business_id,
        product_id,
        product_name,
        product_sku,
        unit_of_measure,
        quantity,
        unit_price,
        discount_amount,
        line_total,
        total_price,
        cost_price,
        created_at,
        updated_at,
        is_deleted
      FROM sale_items
      WHERE sale_id IN (${placeholders})
        AND is_deleted = 0
    `,
    saleIds,
  )
}

async function querySalePaymentsBySaleIds(saleIds: string[]) {
  if (saleIds.length === 0) {
    return [] as SalePaymentRow[]
  }

  const placeholders = saleIds.map(() => '?').join(', ')
  return dbQuery<SalePaymentRow>(
    `
      SELECT
        id,
        sale_id,
        business_id,
        method,
        amount,
        mobile_money_reference,
        created_at
      FROM sale_payments
      WHERE sale_id IN (${placeholders})
    `,
    saleIds,
  )
}

async function buildSaleNumber(businessId: string, saleDate: string) {
  const dateToken = saleDate.replace(/-/g, '')
  const prefix = `VTE-${dateToken}-`
  const [lastSale] = await dbQuery<{ sale_number: string | null; receipt_number: string | null }>(
    `
      SELECT sale_number, receipt_number
      FROM sales
      WHERE business_id = ?
        AND (sale_number LIKE ? OR receipt_number LIKE ?)
      ORDER BY COALESCE(NULLIF(sale_number, ''), receipt_number) DESC
      LIMIT 1
    `,
    [businessId, `${prefix}%`, `${prefix}%`],
  )

  const currentNumber = lastSale?.sale_number?.trim() || lastSale?.receipt_number?.trim() || null
  const nextSequence = currentNumber
    ? Number.parseInt(currentNumber.slice(prefix.length), 10) + 1
    : 1

  return `${prefix}${String(Number.isFinite(nextSequence) ? nextSequence : 1).padStart(4, '0')}`
}

async function ensureInventoryLevel(businessId: string, row: ProductRow, now: string) {
  const [existing] = await dbQuery<InventoryLevelRow>(
    `
      SELECT id, quantity
      FROM inventory_levels
      WHERE business_id = ?
        AND product_id = ?
      LIMIT 1
    `,
    [businessId, row.id],
  )

  if (existing) {
    return existing
  }

  const created = {
    id: crypto.randomUUID(),
    quantity: roundQuantity(row.inventory_quantity ?? row.stock_quantity ?? 0),
  }

  await dbBatch([
    {
      sql: `
        INSERT INTO inventory_levels (
          id,
          business_id,
          product_id,
          quantity,
          low_stock_threshold,
          reorder_point,
          last_restock_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        created.id,
        businessId,
        row.id,
        created.quantity,
        row.inventory_low_stock_threshold ?? row.low_stock_threshold ?? null,
        row.inventory_reorder_point ?? row.reorder_point ?? null,
        row.inventory_last_restock_at ?? null,
        now,
        now,
      ],
    },
  ])

  return created
}

function validateSalePayload(payload: CreateLocalSaleInput) {
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new SaleLocalError('SALE_EMPTY')
  }

  if (!Array.isArray(payload.payments) || payload.payments.length === 0) {
    throw new SaleLocalError('SALE_PAYMENT_REQUIRED')
  }

  if (!Number.isFinite(payload.discountAmount ?? 0) || (payload.discountAmount ?? 0) < 0) {
    throw new SaleLocalError('SALE_DISCOUNT_INVALID')
  }

  for (const payment of payload.payments) {
    if (!isSupportedSalePaymentMethod(payment.method)) {
      throw new SaleLocalError('SALE_PAYMENT_METHOD_INVALID')
    }

    if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
      throw new SaleLocalError('SALE_PAYMENT_AMOUNT_INVALID')
    }
  }

  for (const item of payload.items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new SaleLocalError('SALE_QUANTITY_INVALID')
    }

    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
      throw new SaleLocalError('SALE_UNIT_PRICE_INVALID')
    }

    if (!Number.isFinite(item.discountAmount ?? 0) || (item.discountAmount ?? 0) < 0) {
      throw new SaleLocalError('SALE_ITEM_DISCOUNT_INVALID')
    }
  }
}

function hasPriceDrift(unitPrice: number, currentSellingPrice: number) {
  if (currentSellingPrice <= 0) {
    return unitPrice > 0
  }

  return Math.abs(unitPrice - currentSellingPrice) / currentSellingPrice > 0.1
}

function derivePaymentMethod(payments: Array<Pick<SalePayment, 'method'>>): PaymentMethod | null {
  const methods = [...new Set(payments.map((payment) => payment.method))]

  if (methods.length === 0) {
    return null
  }

  if (methods.length > 1) {
    return PaymentMethod.MIXED
  }

  return methods[0] ?? null
}

function normalizePaymentMethod(value: string | null | undefined): PaymentMethod | null {
  if (!value) {
    return null
  }

  const normalized = value.trim().toUpperCase()
  return isPaymentMethod(normalized) ? normalized : null
}

function normalizeSaleStatus(value: string | null | undefined): SaleStatus {
  if (!value) {
    return SaleStatus.COMPLETED
  }

  const normalized = value.trim().toUpperCase()
  return isSaleStatus(normalized) ? normalized : SaleStatus.COMPLETED
}

function isSupportedSalePaymentMethod(method: PaymentMethod) {
  return (
    method === PaymentMethod.CASH ||
    method === PaymentMethod.MTN_MOMO ||
    method === PaymentMethod.ORANGE_MONEY ||
    method === PaymentMethod.CARD
  )
}

function isPaymentMethod(value: string): value is PaymentMethod {
  return Object.values(PaymentMethod).includes(value as PaymentMethod)
}

function isSaleStatus(value: string): value is SaleStatus {
  return Object.values(SaleStatus).includes(value as SaleStatus)
}

function isUuid(value: string | null | undefined) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
}

function groupBy<T, TKey extends string>(items: T[], getKey: (item: T) => TKey) {
  const groups = new Map<TKey, T[]>()

  for (const item of items) {
    const key = getKey(item)
    const current = groups.get(key)
    if (current) {
      current.push(item)
    } else {
      groups.set(key, [item])
    }
  }

  return groups
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function roundQuantity(value: number) {
  return Math.round(value * 1000) / 1000
}
