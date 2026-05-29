export enum ChargeRateType {
  PERCENT = 'PERCENT',
  FIXED = 'FIXED',
}

export enum DiscountType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED_AMOUNT = 'FIXED_AMOUNT',
}

export interface SaleDiscount {
  id: string
  saleId: string
  saleItemId?: string | null
  businessId: string
  description: string
  discountType: DiscountType
  rate?: number | null
  amount: number
  createdAt: string
}

export interface CreateSaleDiscountInput {
  description: string
  discountType: DiscountType
  rate?: number | null
  amount: number
}

export interface ChargeType {
  id: string
  businessId: string | null
  name: string
  description?: string | null
  rateType: ChargeRateType
  defaultValue: number
  isActive: boolean
  isSystem: boolean
  createdAt: string
  updatedAt: string
}

export interface SaleCharge {
  id: string
  saleId: string
  businessId: string
  chargeTypeId?: string | null
  name: string
  rateType: ChargeRateType
  rateValue: number
  amount: number
  createdAt: string
}

export interface CreateSaleChargeInput {
  chargeTypeId?: string | null
  name: string
  rateType: ChargeRateType
  rateValue: number
  amount: number
}
