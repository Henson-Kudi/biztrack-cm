import { z } from 'zod'

export const CreateProductSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  sku: z.string().max(100).optional(),
  barcode: z.string().max(100).optional(),
  price: z.number().positive(),
  costPrice: z.number().positive().optional(),
  stockQuantity: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(5),
  unit: z.enum(['piece', 'kg', 'litre', 'metre', 'box', 'dozen', 'pack']).default('piece'),
  categoryId: z.string().uuid().optional(),
  isActive: z.boolean().default(true),
})

export const UpdateProductSchema = CreateProductSchema.partial()

export const SyncProductSchema = z.object({
  id: z.string().uuid(),
  updatedAt: z.string().datetime(),
  isDeleted: z.boolean(),
}).extend(CreateProductSchema.partial().shape)

export type CreateProductInput = z.infer<typeof CreateProductSchema>
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>
