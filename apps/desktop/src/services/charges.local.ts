'use client'

import { dbQuery } from './local-db'

export type LocalChargeType = {
  id: string
  businessId: string | null
  name: string
  description: string | null
  rateType: 'PERCENT' | 'FIXED'
  defaultValue: number
  isSystem: boolean
  sortOrder: number
}

type ChargeTypeRow = {
  id: string
  business_id: string | null
  name: string
  description: string | null
  rate_type: string
  default_value: number
  is_active: number
  is_system: number
  sort_order: number
}

export async function listChargeTypesLocal(businessId: string): Promise<LocalChargeType[]> {
  const rows = await dbQuery<ChargeTypeRow>(
    `
      SELECT id, business_id, name, description, rate_type, default_value, is_active, is_system, sort_order
      FROM charge_types
      WHERE (business_id = ? OR business_id IS NULL)
        AND is_active = 1
      ORDER BY is_system DESC, sort_order ASC, name ASC
    `,
    [businessId],
  )

  return rows.map((row) => ({
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    description: row.description ?? null,
    rateType: (row.rate_type === 'PERCENT' ? 'PERCENT' : 'FIXED') as 'PERCENT' | 'FIXED',
    defaultValue: row.default_value,
    isSystem: Boolean(row.is_system),
    sortOrder: row.sort_order,
  }))
}
