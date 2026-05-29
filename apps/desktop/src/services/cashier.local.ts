'use client'

import { SaleStatus } from '@biztrack/types'
import type { CashierActivityItem, CashierShiftSummary } from '@biztrack/types'
import { dbQuery } from './local-db'
import { assertBusinessId } from './products.local'

type ShiftSaleRow = {
  id: string
  cashier_name: string | null
  sale_number: string | null
  status: string
  total_amount: number | null
  net_amount: number | null
  sold_at: string | null
  voided_at: string | null
  void_reason: string | null
  customer_name: string | null
  created_at: string
  sale_date: string | null
}

type ShiftItemRow = {
  sale_id: string
  product_id: string
  product_name: string
  quantity: number
}

type ShiftPaymentRow = {
  sale_id: string
  method: string
  amount: number
}

export async function getCashierShiftSummaryLocal(
  businessId: string,
  cashierId: string,
  dateKey: string,
): Promise<CashierShiftSummary> {
  const normalizedBusinessId = assertBusinessId(businessId)

  const salesRows = await dbQuery<ShiftSaleRow>(
    `
      SELECT
        id, cashier_name, sale_number, status, total_amount, net_amount,
        sold_at, voided_at, void_reason, customer_name, created_at, sale_date
      FROM sales
      WHERE business_id = ?
        AND cashier_id = ?
        AND sale_date = ?
        AND is_deleted = 0
      ORDER BY sold_at DESC
    `,
    [normalizedBusinessId, cashierId, dateKey],
  )

  if (salesRows.length === 0) {
    return emptyShiftSummary(cashierId, null, dateKey)
  }

  const cashierName = salesRows[0]?.cashier_name ?? null
  const saleIds = salesRows.map((row) => row.id)
  const placeholders = saleIds.map(() => '?').join(', ')

  const [itemRows, paymentRows] = await Promise.all([
    dbQuery<ShiftItemRow>(
      `
        SELECT sale_id, product_id, product_name, quantity
        FROM sale_items
        WHERE sale_id IN (${placeholders}) AND is_deleted = 0
      `,
      saleIds,
    ),
    dbQuery<ShiftPaymentRow>(
      `
        SELECT sale_id, method, amount
        FROM sale_payments
        WHERE sale_id IN (${placeholders})
      `,
      saleIds,
    ),
  ])

  const itemsBySaleId = groupBy(itemRows, (row) => row.sale_id)
  const paymentsBySaleId = groupBy(paymentRows, (row) => row.sale_id)

  let shiftRevenue = 0
  let transactionCount = 0
  let voidCount = 0
  let voidAmount = 0
  const hourlyMap = new Map<number, number>()
  const productMap = new Map<string, { productName: string; quantity: number }>()
  const paymentMap = new Map<string, number>()
  const recentActivity: CashierActivityItem[] = []

  for (const sale of salesRows) {
    const saleTotal = sale.total_amount ?? sale.net_amount ?? 0
    const isVoid = (sale.status ?? '') === SaleStatus.VOIDED
    const isCompleted = (sale.status ?? '') === SaleStatus.COMPLETED

    if (isVoid) {
      voidCount += 1
      voidAmount = roundMoney(voidAmount + saleTotal)
    } else if (isCompleted) {
      transactionCount += 1
      shiftRevenue = roundMoney(shiftRevenue + saleTotal)

      if (sale.sold_at) {
        const hour = new Date(sale.sold_at).getHours()
        hourlyMap.set(hour, (hourlyMap.get(hour) ?? 0) + 1)
      }

      for (const item of itemsBySaleId.get(sale.id) ?? []) {
        const existing = productMap.get(item.product_id)
        if (existing) {
          existing.quantity += item.quantity
        } else {
          productMap.set(item.product_id, {
            productName: item.product_name,
            quantity: item.quantity,
          })
        }
      }

      for (const payment of paymentsBySaleId.get(sale.id) ?? []) {
        paymentMap.set(payment.method, roundMoney((paymentMap.get(payment.method) ?? 0) + payment.amount))
      }
    }

    if (recentActivity.length < 15) {
      recentActivity.push({
        id: sale.id,
        saleNumber: sale.sale_number ?? '',
        type: isVoid ? 'void' : 'sale',
        totalAmount: roundMoney(saleTotal),
        soldAt: sale.sold_at ?? sale.created_at,
        voidedAt: sale.voided_at ?? null,
        voidReason: sale.void_reason ?? null,
        itemSummary: buildItemSummary(itemsBySaleId.get(sale.id) ?? []),
        customerName: sale.customer_name ?? null,
      })
    }
  }

  const hourlyCounts = Array.from(hourlyMap.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour - b.hour)

  const topItems = Array.from(productMap.entries())
    .map(([productId, { productName, quantity }]) => ({ productId, productName, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5)

  const paymentSplit = Array.from(paymentMap.entries())
    .map(([method, amount]) => ({ method, amount }))
    .sort((a, b) => b.amount - a.amount)

  return {
    cashierId,
    cashierName,
    date: dateKey,
    shiftRevenue,
    transactionCount,
    avgOrderValue: transactionCount > 0 ? roundMoney(shiftRevenue / transactionCount) : 0,
    voidCount,
    voidAmount,
    hourlyCounts,
    topItems,
    paymentSplit,
    recentActivity,
  }
}

function emptyShiftSummary(
  cashierId: string,
  cashierName: string | null,
  date: string,
): CashierShiftSummary {
  return {
    cashierId,
    cashierName,
    date,
    shiftRevenue: 0,
    transactionCount: 0,
    avgOrderValue: 0,
    voidCount: 0,
    voidAmount: 0,
    hourlyCounts: [],
    topItems: [],
    paymentSplit: [],
    recentActivity: [],
  }
}

function buildItemSummary(items: ShiftItemRow[]): string {
  const parts = items.slice(0, 3).map((item) => {
    const qty = Number.isInteger(item.quantity)
      ? item.quantity
      : parseFloat(item.quantity.toFixed(2))
    return `${item.product_name} × ${qty}`
  })
  if (items.length > 3) parts.push(`+${items.length - 3}`)
  return parts.join(', ')
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>()
  for (const item of items) {
    const key = getKey(item)
    const group = result.get(key)
    if (group) {
      group.push(item)
    } else {
      result.set(key, [item])
    }
  }
  return result
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}
