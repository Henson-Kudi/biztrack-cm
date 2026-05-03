import { z } from 'zod'

const PaymentMethodSchema = z.enum(['CASH', 'MTN_MOMO', 'ORANGE_MONEY', 'CARD'])

export const CreateSaleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  discountAmount: z.number().min(0).default(0),
  costPrice: z.number().min(0).optional(),
})

export const CreateSalePaymentSchema = z.object({
  method: PaymentMethodSchema,
  amount: z.number().positive(),
  mobileMoneyReference: z.string().max(100).optional(),
})

export const CreateSaleSchema = z.object({
  clientId: z.string().uuid(),
  soldAt: z.string().datetime(),
  customerName: z.string().max(200).optional(),
  customerPhone: z.string().max(30).optional(),
  notes: z.string().max(1000).optional(),
  discountAmount: z.number().min(0).default(0),
  payments: z.array(CreateSalePaymentSchema).min(1),
  items: z.array(CreateSaleItemSchema).min(1),
})

export const VoidSaleSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
})

export type CreateSaleInput = z.infer<typeof CreateSaleSchema>
export type VoidSaleInput = z.infer<typeof VoidSaleSchema>
