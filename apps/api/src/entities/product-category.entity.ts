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
import { Business } from './business.entity'
import { Product } from './product.entity'

@Entity('product_categories')
@Unique('unq_product_categories_business_id_slug', ['businessId', 'slug'])
@Index('idx_product_categories_business_id_deleted_at', ['businessId', 'deletedAt'])
export class ProductCategory extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, (business) => business.productCategories, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_product_categories_business_id' })
  business?: Business

  @Column()
  name!: string

  @Column()
  slug!: string

  @Column({ name: 'is_active', default: true })
  isActive!: boolean

  @Column({ nullable: true, type: 'varchar', length: 7 })
  color?: string | null // Hex color code (e.g., #FF5733)

  @Column({ nullable: true, type: 'varchar', })
  icon?: string | null

  @Column({ name: 'image_url', nullable: true, type: 'varchar' })
  imageUrl?: string | null

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number

  @OneToMany(() => Product, (product) => product.category)
  products!: Product[]
}
