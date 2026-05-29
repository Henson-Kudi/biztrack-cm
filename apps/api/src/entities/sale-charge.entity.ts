import {
  BaseEntity as TypeOrmBaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm'
import { decimalTransformer } from '@/common/entities/transformers'
import { Sale } from './sale.entity'

@Entity('sale_charges')
@Index('idx_sale_charges_sale_id', ['saleId'])
@Index('idx_sale_charges_business_id', ['businessId'])
export class SaleCharge extends TypeOrmBaseEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string

  @Column({ name: 'sale_id', type: 'uuid' })
  saleId!: string

  @ManyToOne(() => Sale, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id', foreignKeyConstraintName: 'fk_sale_charges_sale_id' })
  sale?: Sale

  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @Column({ name: 'charge_type_id', type: 'uuid', nullable: true })
  chargeTypeId?: string | null

  @Column({ type: 'varchar', length: 200 })
  name!: string

  @Column({ name: 'rate_type', type: 'varchar', length: 20, default: 'FIXED' })
  rateType!: string

  @Column({
    name: 'rate_value',
    type: 'numeric',
    precision: 10,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  rateValue!: number

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  amount!: number

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
