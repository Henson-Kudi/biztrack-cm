import type {
  DailySalesSummary,
  PaymentMethod,
  Sale,
  SaleCashierSummary,
  SaleItem,
  SaleListItem,
  SalePayment,
  SaleReceipt,
} from '@biztrack/types'
import { PaymentMethod as PaymentMethodEnum } from '@biztrack/types'
import { Business } from '@/entities/business.entity'
import { DailySaleSummary as DailySaleSummaryEntity } from '@/entities/daily-sale-summary.entity'
import { Sale as SaleEntity } from '@/entities/sale.entity'
import { SaleItem as SaleItemEntity } from '@/entities/sale-item.entity'
import { SalePayment as SalePaymentEntity } from '@/entities/sale-payment.entity'
import { toIsoString } from '@/common/http/serialization'

type SaleDetailModel = SaleEntity & {
  items?: SaleItemEntity[]
  payments?: SalePaymentEntity[]
  cashier?: { id: string; name: string } | null
}

type SaleListModel = SaleEntity & {
  payments?: SalePaymentEntity[]
  cashier?: { id: string; name: string } | null
  itemCount?: number
}

function derivePaymentMethod(payments: Array<{ method: PaymentMethod }> = []) {
  const methods = [...new Set(payments.map((payment) => payment.method))]
  if (methods.length === 0) return null
  if (methods.length === 1) return methods[0]
  return PaymentMethodEnum.MIXED
}

function firstMobileMoneyReference(payments: Array<{ mobileMoneyReference?: string | null }> = []) {
  return payments.find((payment) => payment.mobileMoneyReference)?.mobileMoneyReference ?? null
}

export class SaleCashierDto implements SaleCashierSummary {
  id!: string
  name!: string

  static fromModel(model?: { id: string; name: string } | null) {
    if (!model) return null

    const dto = new SaleCashierDto()
    dto.id = model.id
    dto.name = model.name
    return dto
  }
}

export class SalePaymentDto implements SalePayment {
  id!: string
  saleId!: string
  businessId!: string
  method!: PaymentMethod
  amount!: number
  mobileMoneyReference?: string | null
  createdAt!: string

  static fromEntity(entity: SalePaymentEntity): SalePaymentDto {
    const dto = new SalePaymentDto()
    dto.id = entity.id
    dto.saleId = entity.saleId
    dto.businessId = entity.businessId
    dto.method = entity.method
    dto.amount = entity.amount
    dto.mobileMoneyReference = entity.mobileMoneyReference ?? null
    dto.createdAt = toIsoString(entity.createdAt) ?? ''
    return dto
  }
}

export class SaleItemDto implements SaleItem {
  id!: string
  saleId!: string
  productId!: string
  productName!: string
  productSku?: string | null
  unitOfMeasure?: string | null
  quantity!: number
  unitPrice!: number
  discountAmount!: number
  lineTotal!: number
  costPrice?: number | null
  createdAt?: string
  updatedAt?: string
  isDeleted?: boolean
  totalPrice!: number

  static fromEntity(entity: SaleItemEntity): SaleItemDto {
    const dto = new SaleItemDto()
    dto.id = entity.id
    dto.saleId = entity.saleId
    dto.productId = entity.productId
    dto.productName = entity.productName
    dto.productSku = entity.productSku ?? null
    dto.unitOfMeasure = entity.unitOfMeasure ?? null
    dto.quantity = entity.quantity
    dto.unitPrice = entity.unitPrice
    dto.discountAmount = entity.discountAmount
    dto.lineTotal = entity.lineTotal
    dto.totalPrice = entity.lineTotal
    dto.costPrice = entity.costPrice ?? null
    dto.createdAt = toIsoString(entity.createdAt) ?? undefined
    dto.updatedAt = toIsoString(entity.updatedAt) ?? undefined
    dto.isDeleted = Boolean(entity.deletedAt)
    return dto
  }
}

export class SaleResponseDto implements Sale {
  id!: string
  businessId!: string
  clientId!: string
  cashierId!: string
  cashier?: SaleCashierDto | null
  saleNumber!: string
  status!: Sale['status']
  subtotal!: number
  discountAmount!: number
  chargesAmount!: number
  taxAmount!: number
  totalAmount!: number
  amountPaid!: number
  changeGiven!: number
  customerName?: string | null
  customerPhone?: string | null
  notes?: string | null
  priceDriftWarning!: boolean
  saleDate!: string
  soldAt!: string
  syncedAt?: string | null
  createdAt!: string
  updatedAt?: string
  voidedAt?: string | null
  voidedById?: string | null
  voidReason?: string | null
  currency?: string | null
  paymentMethod?: PaymentMethod | null
  payments!: SalePaymentDto[]
  items!: SaleItemDto[]
  receiptNumber?: string
  netAmount?: number
  momoReference?: string | null

  static fromEntity(entity: SaleDetailModel): SaleResponseDto {
    const dto = new SaleResponseDto()
    const payments = (entity.payments ?? []).map((payment) => SalePaymentDto.fromEntity(payment))

    dto.id = entity.id
    dto.businessId = entity.businessId
    dto.clientId = entity.clientId
    dto.cashierId = entity.cashierId
    dto.cashier = SaleCashierDto.fromModel(entity.cashier) ?? null
    dto.saleNumber = entity.saleNumber
    dto.status = entity.status
    dto.subtotal = entity.subtotal
    dto.discountAmount = entity.discountAmount
    dto.chargesAmount = entity.chargesAmount
    dto.taxAmount = entity.taxAmount
    dto.totalAmount = entity.totalAmount
    dto.amountPaid = entity.amountPaid
    dto.changeGiven = entity.changeGiven
    dto.customerName = entity.customerName ?? null
    dto.customerPhone = entity.customerPhone ?? null
    dto.notes = entity.notes ?? null
    dto.priceDriftWarning = entity.priceDriftWarning
    dto.saleDate = entity.saleDate
    dto.soldAt = toIsoString(entity.soldAt) ?? ''
    dto.syncedAt = toIsoString(entity.syncedAt) ?? null
    dto.createdAt = toIsoString(entity.createdAt) ?? ''
    dto.updatedAt = toIsoString(entity.updatedAt) ?? undefined
    dto.voidedAt = toIsoString(entity.voidedAt) ?? null
    dto.voidedById = entity.voidedById ?? null
    dto.voidReason = entity.voidReason ?? null
    dto.currency = entity.business?.currency ?? null
    dto.paymentMethod = derivePaymentMethod(payments)
    dto.payments = payments
    dto.items = (entity.items ?? []).map((item) => SaleItemDto.fromEntity(item))
    dto.receiptNumber = entity.saleNumber
    dto.netAmount = entity.totalAmount
    dto.momoReference = firstMobileMoneyReference(payments)
    return dto
  }
}

export class SaleListItemDto implements SaleListItem {
  id!: string
  businessId!: string
  clientId!: string
  cashierId!: string
  cashier?: SaleCashierDto | null
  saleNumber!: string
  status!: SaleListItem['status']
  subtotal!: number
  discountAmount!: number
  chargesAmount!: number
  taxAmount!: number
  totalAmount!: number
  amountPaid!: number
  changeGiven!: number
  customerName?: string | null
  customerPhone?: string | null
  notes?: string | null
  priceDriftWarning!: boolean
  saleDate!: string
  soldAt!: string
  syncedAt?: string | null
  createdAt!: string
  updatedAt?: string
  voidedAt?: string | null
  voidedById?: string | null
  voidReason?: string | null
  currency?: string | null
  paymentMethod?: PaymentMethod | null
  receiptNumber?: string
  netAmount?: number
  momoReference?: string | null
  itemCount!: number

  static fromEntity(entity: SaleListModel): SaleListItemDto {
    const dto = new SaleListItemDto()
    const payments = entity.payments ?? []

    dto.id = entity.id
    dto.businessId = entity.businessId
    dto.clientId = entity.clientId
    dto.cashierId = entity.cashierId
    dto.cashier = SaleCashierDto.fromModel(entity.cashier) ?? null
    dto.saleNumber = entity.saleNumber
    dto.status = entity.status
    dto.subtotal = entity.subtotal
    dto.discountAmount = entity.discountAmount
    dto.chargesAmount = entity.chargesAmount
    dto.taxAmount = entity.taxAmount
    dto.totalAmount = entity.totalAmount
    dto.amountPaid = entity.amountPaid
    dto.changeGiven = entity.changeGiven
    dto.customerName = entity.customerName ?? null
    dto.customerPhone = entity.customerPhone ?? null
    dto.notes = entity.notes ?? null
    dto.priceDriftWarning = entity.priceDriftWarning
    dto.saleDate = entity.saleDate
    dto.soldAt = toIsoString(entity.soldAt) ?? ''
    dto.syncedAt = toIsoString(entity.syncedAt) ?? null
    dto.createdAt = toIsoString(entity.createdAt) ?? ''
    dto.updatedAt = toIsoString(entity.updatedAt) ?? undefined
    dto.voidedAt = toIsoString(entity.voidedAt) ?? null
    dto.voidedById = entity.voidedById ?? null
    dto.voidReason = entity.voidReason ?? null
    dto.currency = entity.business?.currency ?? null
    dto.paymentMethod = derivePaymentMethod(payments)
    dto.receiptNumber = entity.saleNumber
    dto.netAmount = entity.totalAmount
    dto.momoReference = firstMobileMoneyReference(payments)
    dto.itemCount = entity.itemCount ?? 0
    return dto
  }
}

export class DailySalesSummaryDto implements DailySalesSummary {
  date!: string
  totalSales!: number
  totalRevenue!: number
  totalCost!: number
  grossProfit!: number
  grossMarginPercent!: number
  totalDiscounts!: number
  cashCollected!: number
  mtnMomoCollected!: number
  orangeMoneyCollected!: number
  cardCollected!: number
  voidedSales!: number
  voidedAmount!: number

  static fromEntity(entity: DailySaleSummaryEntity | DailySalesSummary): DailySalesSummaryDto {
    const dto = new DailySalesSummaryDto()
    const totalRevenue = 'summaryDate' in entity ? entity.totalRevenue : entity.totalRevenue
    const grossProfit = 'summaryDate' in entity ? entity.grossProfit : entity.grossProfit

    dto.date = 'summaryDate' in entity ? entity.summaryDate : entity.date
    dto.totalSales = entity.totalSales
    dto.totalRevenue = totalRevenue
    dto.totalCost = entity.totalCost
    dto.grossProfit = grossProfit
    dto.grossMarginPercent =
      totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 1000) / 10 : 0
    dto.totalDiscounts = entity.totalDiscounts
    dto.cashCollected = entity.cashCollected
    dto.mtnMomoCollected = entity.mtnMomoCollected
    dto.orangeMoneyCollected = entity.orangeMoneyCollected
    dto.cardCollected = entity.cardCollected
    dto.voidedSales = entity.voidedSales
    dto.voidedAmount = entity.voidedAmount
    return dto
  }
}

export class SaleReceiptDto implements SaleReceipt {
  businessName!: string
  businessPhone?: string | null
  businessAddress?: string | null
  saleNumber!: string
  soldAt!: string
  cashierName!: string
  customerName?: string | null
  customerPhone?: string | null
  items!: SaleReceipt['items']
  subtotal!: number
  discountAmount!: number
  chargesAmount!: number
  totalAmount!: number
  amountPaid!: number
  changeGiven!: number
  currency?: string | null
  payments!: SaleReceipt['payments']
  footer?: string | null

  static fromSale(entity: SaleDetailModel, business: Business): SaleReceiptDto {
    const dto = new SaleReceiptDto()

    dto.businessName = business.name
    dto.businessPhone = business.phone ?? null
    dto.businessAddress = [business.address, business.city].filter(Boolean).join(', ') || null
    dto.saleNumber = entity.saleNumber
    dto.soldAt = toIsoString(entity.soldAt) ?? ''
    dto.cashierName = entity.cashier?.name ?? ''
    dto.customerName = entity.customerName ?? null
    dto.customerPhone = entity.customerPhone ?? null
    dto.items = (entity.items ?? []).map((item) => ({
      name: item.productName,
      qty: item.quantity,
      unitPrice: item.unitPrice,
      total: item.lineTotal,
      discountAmount: item.discountAmount ?? 0,
    }))
    dto.subtotal = entity.subtotal
    dto.discountAmount = entity.discountAmount
    dto.chargesAmount = entity.chargesAmount
    dto.totalAmount = entity.totalAmount
    dto.amountPaid = entity.amountPaid
    dto.changeGiven = entity.changeGiven
    dto.currency = business.currency
    dto.payments = (entity.payments ?? []).map((payment) => ({
      method: payment.method,
      amount: payment.amount,
      mobileMoneyReference: payment.mobileMoneyReference ?? null,
    }))
    dto.footer = 'Merci pour votre achat!'
    return dto
  }
}
