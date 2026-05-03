import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { ProductCategory } from './product-category.entity'
import { ProductImage } from './product-image.entity'
import { SaleItem } from './sale-item.entity'
import { StockMovement } from './stock-movement.entity'
import { UnitOfMeasure } from './unit-of-measure.entity'
import { User } from './user.entity'

@Entity('products')
@Unique('unq_products_business_id_barcode', ['businessId', 'barcode'])
@Unique('unq_products_business_id_sku', ['businessId', 'sku'])
@Unique('unq_products_business_id_slug', ['businessId', 'slug'])
@Index('idx_products_business_id_deleted_at', ['businessId', 'deletedAt'])
export class Product
  extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, (business) => business.products, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_products_business_id' })
  business?: Business

  @Column()
  name!: string

  @Column()
  slug!: string

  @Column({ nullable: true, type: 'text' })
  description?: string | null

  @Column({ nullable: true, type: 'varchar' })
  sku!: string | null

  @Column({ nullable: true, type: 'varchar' })
  barcode!: string | null

  @Column({ name: 'barcode_type', nullable: true, type: 'varchar' })
  barcodeType!: string | null // E.g., 'CODE128', 'EAN13', etc.

  @Column({ name: 'is_barcode_generated', default: false })
  isBarcodeGenerated!: boolean

  @Column({ name: 'price', type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  sellingPrice!: number

  @Column({
    name: 'cost_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  costPrice?: number | null

  @Column({ default: 'XAF' })
  currency!: string

  @Column({
    name: 'tax_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  taxRate!: number

  @Column({ name: 'is_service', default: false })
  isService!: boolean

  @Column({ name: 'track_inventory', default: true })
  trackInventory!: boolean

  @Column({ name: 'category_id', nullable: true })
  categoryId?: string | null

  @ManyToOne(() => ProductCategory, (category) => category.products, { nullable: true })
  @JoinColumn({ name: 'category_id', foreignKeyConstraintName: 'fk_products_category_id' })
  category?: ProductCategory | null

  @Column({ name: 'unit_of_measure_id' })
  unitOfMeasureId!: string

  @ManyToOne(() => UnitOfMeasure, (unitOfMeasure) => unitOfMeasure.products)
  @JoinColumn({ name: 'unit_of_measure_id', foreignKeyConstraintName: 'fk_products_unit_of_measure_id' })
  unitOfMeasure!: UnitOfMeasure

  @Column({ name: 'image_url', nullable: true, type: 'varchar' })
  imageUrl?: string | null

  @Column({ name: 'created_by', nullable: true, type: 'uuid' })
  createdById?: string | null

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by', foreignKeyConstraintName: 'fk_products_created_by' })
  createdBy?: User | null

  @Column({ name: 'is_active', default: true })
  isActive!: boolean

  @OneToMany(() => SaleItem, (item) => item.product)
  saleItems?: SaleItem[]

  @OneToMany(() => StockMovement, (movement) => movement.product)
  stockMovements?: StockMovement[]

  @OneToMany(() => ProductImage, (image) => image.product)
  images?: ProductImage[]
}
