import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm'
import { ImmutableBaseEntity } from '@/common/entities/immutable-base.entity'
import { decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { Product } from './product.entity'
import { User } from './user.entity'

export enum MovementType {
  SALE = 'SALE',
  RESTOCK_IN = 'RESTOCK_IN',
  MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT',
  VOID_REVERSAL = 'VOID_REVERSAL',
  OPENING_STOCK = 'OPENING_STOCK',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
}

@Entity('inventory_movements')
@Index('idx_inventory_movements_business_id_product_id', ['businessId', 'productId'])
export class InventoryMovement extends ImmutableBaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_inventory_movements_business_id' })
  business?: Business

  @Column({ name: 'product_id' })
  productId!: string

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id', foreignKeyConstraintName: 'fk_inventory_movements_product_id' })
  product?: Product

  @Column({ type: 'varchar' })
  type!: MovementType

  @Column({
    name: 'quantity_change',
    type: 'decimal',
    precision: 12,
    scale: 3,
    transformer: decimalTransformer,
  })
  quantityChange!: number

  @Column({
    name: 'quantity_before',
    type: 'decimal',
    precision: 12,
    scale: 3,
    transformer: decimalTransformer,
  })
  quantityBefore!: number

  @Column({
    name: 'quantity_after',
    type: 'decimal',
    precision: 12,
    scale: 3,
    transformer: decimalTransformer,
  })
  quantityAfter!: number

  @Column({ name: 'reference_type', nullable: true, type: 'varchar' })
  referenceType?: string | null

  @Column({ name: 'reference_id', nullable: true, type: 'uuid' })
  referenceId?: string | null

  @Column({ nullable: true, type: 'text' })
  notes?: string | null

  @Column({ name: 'performed_by', nullable: true, type: 'uuid' })
  performedById?: string | null

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'performed_by', foreignKeyConstraintName: 'fk_inventory_movements_performed_by' })
  performedBy?: User | null
}
