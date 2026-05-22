// TODO: Wire to API when /sales endpoint is available on the backend.
// The backend modules directory currently has: auth, business, permissions,
// plans, products, subscriptions, sync, users — no sales module yet.

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { PaymentMethod } from '@/store/cart.store'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SaleLineItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  // subtotal is derived (quantity * unitPrice) and must NOT be trusted from the
  // client — it is recalculated server-side when the real API is wired up.
  subtotal: number
}

export interface CreateSalePayload {
  items: SaleLineItem[]
  paymentMethod: PaymentMethod
  discountAmount?: number
  // total is NOT accepted from the payload — it is always recalculated below to
  // prevent price manipulation by the caller.
  note?: string
}

export interface Sale {
  id: string
  receiptNumber: string
  items: SaleLineItem[]
  paymentMethod: PaymentMethod
  subtotal: number
  discountAmount: number
  total: number
  note?: string
  createdAt: string
}

// ─── Persistent receipt counter ───────────────────────────────────────────────
// Stored in AsyncStorage so the sequence doesn't reset on every app reload,
// preventing duplicate receipt numbers within the same day.

const RECEIPT_COUNTER_KEY = 'biztrack_receipt_counter'

async function nextReceiptCounter(): Promise<number> {
  const stored = await AsyncStorage.getItem(RECEIPT_COUNTER_KEY)
  const next = stored ? parseInt(stored, 10) + 1 : 1
  await AsyncStorage.setItem(RECEIPT_COUNTER_KEY, String(next))
  return next
}

export async function generateLocalReceiptNumber(): Promise<string> {
  const seq = await nextReceiptCounter()
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `BT-${date}-${String(seq).padStart(4, '0')}`
}

// ─── API stub ─────────────────────────────────────────────────────────────────

// TODO: replace with real API call:
// import apiClient from './apiClient'
// export const createSale = (payload: CreateSalePayload) =>
//   apiClient.post<Sale>('/sales', payload)

export async function createSale(payload: CreateSalePayload): Promise<Sale> {
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 600))

  // Recalculate from source values — do not trust client-supplied subtotals or total
  const subtotal = payload.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const discountAmount = payload.discountAmount ?? 0
  const total = subtotal - discountAmount

  return {
    id: Math.random().toString(36).slice(2),
    receiptNumber: await generateLocalReceiptNumber(),
    items: payload.items,
    paymentMethod: payload.paymentMethod,
    subtotal,
    discountAmount,
    total,
    note: payload.note,
    createdAt: new Date().toISOString(),
  }
}
