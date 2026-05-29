import type { Currency } from './business.types'
import type { IsoDateString, ListQuery } from './http.types'
import type { ProductUserSummary } from './product.types'

export enum PaymentMethod {
  CASH = 'CASH',
  MTN_MOMO = 'MTN_MOMO',
  ORANGE_MONEY = 'ORANGE_MONEY',
  CARD = 'CARD',
  SAVINGS = 'SAVINGS',
  MIXED = 'MIXED',
}

export enum SaleStatus {
  COMPLETED = 'COMPLETED',
  VOIDED = 'VOIDED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  CANCELLED = 'CANCELLED',
}

export interface SaleCashierSummary extends ProductUserSummary {}

export interface SalePayment {
  id: string
  saleId: string
  businessId: string
  method: PaymentMethod
  amount: number
  mobileMoneyReference?: string | null
  savingsAccountId?: string | null
  createdAt: IsoDateString
}

export interface SaleItem {
  id: string
  saleId: string
  productId: string
  productName: string
  productSku?: string | null
  unitOfMeasure?: string | null
  quantity: number
  unitPrice: number
  discountAmount: number
  lineTotal: number
  costPrice?: number | null
  createdAt?: IsoDateString | Date
  updatedAt?: IsoDateString | Date
  isDeleted?: boolean
  /** @deprecated Prefer `lineTotal`. */
  totalPrice: number
}

export interface Sale {
  id: string
  businessId: string
  clientId: string
  cashierId: string
  cashier?: SaleCashierSummary | null
  saleNumber: string
  status: SaleStatus
  subtotal: number
  discountAmount: number
  chargesAmount: number
  taxAmount: number
  totalAmount: number
  amountPaid: number
  creditAmount: number
  changeGiven: number
  customerId?: string | null
  customerName?: string | null
  customerPhone?: string | null
  notes?: string | null
  priceDriftWarning: boolean
  saleDate: string
  soldAt: IsoDateString
  syncedAt?: IsoDateString | null
  createdAt: IsoDateString
  updatedAt?: IsoDateString
  voidedAt?: IsoDateString | null
  voidedById?: string | null
  voidReason?: string | null
  currency?: Currency | string | null
  paymentMethod?: PaymentMethod | null
  payments: SalePayment[]
  items: SaleItem[]
  /** @deprecated Prefer `saleNumber`. */
  receiptNumber?: string
  /** @deprecated Prefer `totalAmount`. */
  netAmount?: number
  /** @deprecated Prefer `payments[].mobileMoneyReference`. */
  momoReference?: string | null
}

export interface SaleListItem
  extends Omit<Sale, 'items' | 'payments' | 'cashier'> {
  cashier?: SaleCashierSummary | null
  itemCount: number
}

export interface CreateSalePaymentRequest {
  method: PaymentMethod
  amount: number
  mobileMoneyReference?: string
}

export interface CreateSaleItemRequest {
  productId: string
  quantity: number
  unitPrice: number
  discountAmount?: number
  costPrice?: number
}

export interface CreateSaleRequest {
  clientId: string
  soldAt: IsoDateString
  customerId?: string
  customerName?: string
  customerPhone?: string
  notes?: string
  discountAmount?: number
  chargesAmount?: number
  payments: CreateSalePaymentRequest[]
  items: CreateSaleItemRequest[]
}

export interface VoidSaleRequest {
  reason: string
}

export interface SalesQuery extends ListQuery {
  dateFrom?: string
  dateTo?: string
  status?: SaleStatus
  cashierId?: string
  paymentMethod?: PaymentMethod
}

export interface DailySalesSummary {
  date: string
  totalSales: number
  totalRevenue: number
  totalCost: number
  grossProfit: number
  grossMarginPercent: number
  totalDiscounts: number
  cashCollected: number
  mtnMomoCollected: number
  orangeMoneyCollected: number
  cardCollected: number
  creditIssued: number
  creditSales: number
  voidedSales: number
  voidedAmount: number
}

export interface SaleReceiptItem {
  name: string
  qty: number
  unitPrice: number
  total: number
  discountAmount?: number | null
}

export interface SaleReceiptPayment {
  method: PaymentMethod
  amount: number
  mobileMoneyReference?: string | null
}

export interface SaleReceiptChargeLine {
  name: string
  amount: number
}

export interface SaleReceiptDiscountLine {
  description: string
  amount: number
}

export interface CashierActivityItem {
  id: string
  saleNumber: string
  type: 'sale' | 'void'
  totalAmount: number
  soldAt: IsoDateString
  voidedAt: IsoDateString | null
  voidReason: string | null
  itemSummary: string
  customerName: string | null
}

export interface CashierShiftSummary {
  cashierId: string
  cashierName: string | null
  date: string
  shiftRevenue: number
  transactionCount: number
  avgOrderValue: number
  voidCount: number
  voidAmount: number
  hourlyCounts: Array<{ hour: number; count: number }>
  topItems: Array<{ productId: string; productName: string; quantity: number }>
  paymentSplit: Array<{ method: PaymentMethod | string; amount: number }>
  recentActivity: CashierActivityItem[]
}

export interface SaleReceipt {
  businessName: string
  businessPhone?: string | null
  businessAddress?: string | null
  saleNumber: string
  soldAt: IsoDateString
  cashierName: string
  customerName?: string | null
  customerPhone?: string | null
  items: SaleReceiptItem[]
  subtotal: number
  discountAmount: number
  chargesAmount: number
  chargeLines?: SaleReceiptChargeLine[]
  discountLines?: SaleReceiptDiscountLine[]
  totalAmount: number
  amountPaid: number
  creditAmount: number
  changeGiven: number
  currency?: Currency | string | null
  payments: SaleReceiptPayment[]
  footer?: string | null
}
