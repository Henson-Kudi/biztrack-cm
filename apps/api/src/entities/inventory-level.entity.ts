import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  Unique,
} from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { Product } from './product.entity'

@Entity('inventory_levels')
@Unique('unq_inventory_levels_business_id_product_id', ['businessId', 'productId'])
@Index('idx_inventory_levels_business_id', ['businessId'])
export class InventoryLevel extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_inventory_levels_business_id' })
  business?: Business

  @Column({ name: 'product_id' })
  productId!: string

  @OneToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id', foreignKeyConstraintName: 'fk_inventory_levels_product_id' })
  product?: Product

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 3,
    default: 0,
    transformer: decimalTransformer,
  })
  quantity!: number

  @Column({
    name: 'low_stock_threshold',
    type: 'decimal',
    precision: 12,
    scale: 3,
    nullable: true,
    transformer: decimalTransformer,
  })
  lowStockThreshold?: number | null

  @Column({
    name: 'reorder_point',
    type: 'decimal',
    precision: 12,
    scale: 3,
    nullable: true,
    transformer: decimalTransformer,
  })
  reorderPoint?: number | null

  @Column({
    name: 'quantity_reserved',
    type: 'decimal',
    precision: 12,
    scale: 3,
    default: 0,
    transformer: decimalTransformer,
  })
  quantityReserved!: number

  @Column({ name: 'last_restock_at', type: 'timestamptz', nullable: true })
  lastRestockAt?: Date | null

  get quantityAvailable(): number {
    return Math.max(0, this.quantity - this.quantityReserved)
  }
}
