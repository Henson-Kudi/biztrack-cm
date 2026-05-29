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

@Entity('sale_discounts')
@Index('idx_sale_discounts_sale_id', ['saleId'])
@Index('idx_sale_discounts_business_id', ['businessId'])
export class SaleDiscount extends TypeOrmBaseEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string

  @Column({ name: 'sale_id', type: 'uuid' })
  saleId!: string

  @ManyToOne(() => Sale, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id', foreignKeyConstraintName: 'fk_sale_discounts_sale_id' })
  sale?: Sale

  @Column({ name: 'sale_item_id', type: 'uuid', nullable: true })
  saleItemId?: string | null

  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @Column({ type: 'varchar', length: 200, default: '' })
  description!: string

  @Column({ name: 'discount_type', type: 'varchar', length: 20, default: 'FIXED_AMOUNT' })
  discountType!: string

  @Column({
    type: 'numeric',
    precision: 8,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
  })
  rate?: number | null

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
