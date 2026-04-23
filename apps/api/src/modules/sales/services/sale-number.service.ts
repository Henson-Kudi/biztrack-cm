import { Injectable } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'

@Injectable()
export class SaleNumberService {
  constructor(private readonly dataSource: DataSource) {}

  async generate(businessId: string, saleDate: string, manager?: EntityManager): Promise<string> {
    const executor = manager ?? this.dataSource
    const dateToken = saleDate.replace(/-/g, '')
    const rows = await executor.query(
      `
        INSERT INTO sale_number_sequences (business_id, sale_date, last_sequence)
        VALUES ($1, $2, 1)
        ON CONFLICT (business_id, sale_date)
        DO UPDATE SET last_sequence = sale_number_sequences.last_sequence + 1
        RETURNING last_sequence
      `,
      [businessId, saleDate],
    )

    const sequence = String(rows[0]?.last_sequence ?? 1).padStart(4, '0')
    return `VTE-${dateToken}-${sequence}`
  }
}
