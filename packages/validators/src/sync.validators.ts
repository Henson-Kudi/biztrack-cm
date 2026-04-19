import { z } from 'zod'

const SyncRecordSchema = z.object({
  id: z.string().uuid(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().optional(),
  isDeleted: z.boolean(),
}).catchall(z.unknown())

const SyncPushOperationSchema = z.object({
  operationId: z.string().uuid(),
  entity: z.enum([
    'product',
    'product_category',
    'inventory_threshold',
    'inventory_adjustment',
    'inventory_restock',
  ]),
  action: z.enum(['UPSERT', 'DELETE']),
  recordId: z.string().uuid(),
  updatedAt: z.string().datetime(),
  payload: z.object({}).catchall(z.unknown()).nullish(),
})

export const SyncPushRequestSchema = z.object({
  deviceId: z.string().min(1),
  baseCursor: z.string().datetime().nullable(),
  operations: z.array(SyncPushOperationSchema).max(100),
})

export const SyncPullResponseSchema = z.object({
  changes: z.object({
    products: z.array(SyncRecordSchema).optional(),
    productCategories: z.array(SyncRecordSchema).optional(),
    unitOfMeasures: z.array(SyncRecordSchema).optional(),
    inventoryLevels: z.array(SyncRecordSchema).optional(),
    inventoryMovements: z.array(SyncRecordSchema).optional(),
    restockRecords: z.array(SyncRecordSchema).optional(),
    restockItems: z.array(SyncRecordSchema).optional(),
  }),
  cursor: z.string().datetime(),
})

export type SyncPushRequestInput = z.infer<typeof SyncPushRequestSchema>
