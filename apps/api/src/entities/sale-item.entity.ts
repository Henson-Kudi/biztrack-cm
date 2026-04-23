import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { Product } from './product.entity'
import { Sale } from './sale.entity'

@Entity('sale_items')
@Index('idx_sale_items_sale_id', ['saleId'])
@Index('idx_sale_items_product_id', ['productId'])
@Index('idx_sale_items_business_id', ['businessId'])
export class SaleItem extends BaseEntity {
  @Column({ name: 'sale_id' })
  saleId!: string

  @ManyToOne(() => Sale, (sale) => sale.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id', foreignKeyConstraintName: 'fk_sale_items_sale_id' })
  sale?: Sale

  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_sale_items_business_id' })
  business?: Business

  @Column({ name: 'product_id' })
  productId!: string

  @ManyToOne(() => Product, (product) => product.saleItems, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'product_id', foreignKeyConstraintName: 'fk_sale_items_product_id' })
  product?: Product

  @Column({ name: 'product_name', length: 200 })
  productName!: string

  @Column({ name: 'product_sku', nullable: true, type: 'varchar', length: 100 })
  productSku?: string | null

  @Column({ name: 'unit_of_measure', nullable: true, type: 'varchar', length: 50 })
  unitOfMeasure?: string | null

  @Column({ type: 'decimal', precision: 12, scale: 3, transformer: decimalTransformer })
  quantity!: number

  @Column({
    name: 'unit_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  unitPrice!: number

  @Column({
    name: 'discount_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  discountAmount!: number

  @Column({
    name: 'line_total',
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  lineTotal!: number

  @Column({
    name: 'cost_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  costPrice?: number | null
}
