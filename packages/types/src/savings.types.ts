import type { IsoDateString } from './http.types'

export interface SavingsTaggedProduct {
  productId: string
  productName: string
}

export type SavingsTransactionType = 'deposit' | 'refund' | 'sale' | 'voided_sale'
export type SavingsTransactionDirection = 'inbound' | 'outbound'

export interface SavingsAccount {
  id: string
  businessId: string
  customerId: string
  customerName?: string | null
  customerPhone?: string | null
  accountNumber: string
  balance: number
  totalDeposited: number
  totalRefunded: number
  totalUsed: number
  taggedProducts?: SavingsTaggedProduct[] | null
  isDeleted?: boolean
  createdAt: IsoDateString
  updatedAt: IsoDateString
}

export interface SavingsTransaction {
  id: string
  savingsId: string
  businessId: string
  type: SavingsTransactionType
  direction: SavingsTransactionDirection
  amount: number
  method?: string | null
  mobileMoneyReference?: string | null
  saleId?: string | null
  notes?: string | null
  recordedById?: string | null
  occurredAt: IsoDateString
  createdAt: IsoDateString
  isDeleted?: boolean
}

export interface SavingsStatementEntry {
  id: string
  type: SavingsTransactionType
  direction: SavingsTransactionDirection
  amount: number
  method?: string | null
  mobileMoneyReference?: string | null
  saleId?: string | null
  notes?: string | null
  occurredAt: IsoDateString
  createdAt: IsoDateString
  runningBalance: number
}

export interface SavingsStatement {
  account: SavingsAccount
  entries: SavingsStatementEntry[]
}

export interface CreateSavingsTransactionInput {
  type: SavingsTransactionType
  direction: SavingsTransactionDirection
  amount: number
  method?: string | null
  mobileMoneyReference?: string | null
  saleId?: string | null
  notes?: string | null
  recordedById?: string | null
}

export interface CreateSavingsInput {
  customerId: string
  customerName?: string | null
  customerPhone?: string | null
  taggedProducts?: SavingsTaggedProduct[] | null
  initialDeposit: CreateSavingsTransactionInput
}

export interface SavingsQuery {
  page?: number
  limit?: number
  search?: string
  sortBy?: string
  sortOrder?: 'ASC' | 'DESC'
}
