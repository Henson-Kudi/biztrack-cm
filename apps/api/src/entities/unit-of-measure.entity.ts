import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { UnitOfMeasureType } from '@biztrack/types'
import { Business } from './business.entity'
import { Product } from './product.entity'

export { UnitOfMeasureType as UomType }

@Entity('unit_of_measures')
@Index('idx_unit_of_measures_business_id', ['businessId'], { where: '"business_id" IS NOT NULL' })
@Index('unq_unit_of_measures_default_name', ['name'], {
  unique: true,
  where: '"business_id" IS NULL',
})
@Index('unq_unit_of_measures_business_id_name', ['businessId', 'name'], {
  unique: true,
  where: '"business_id" IS NOT NULL',
})
export class UnitOfMeasure extends BaseEntity {
  @Column({ name: 'business_id', nullable: true })
  businessId?: string | null

  @ManyToOne(() => Business, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_unit_of_measures_business_id' })
  business?: Business | null

  @Column({ length: 50, transformer: { to: (value: string) => value.trim().toUpperCase(), from: (value: string) => value } }) // Store name in uppercase to enforce case-insensitive uniqueness
  name!: string

  @Column({ length: 10 })
  abbreviation!: string

  @Column({ type: 'enum', enum: UnitOfMeasureType })
  type!: UnitOfMeasureType

  @Column({ name: 'is_default', default: false })
  isDefault!: boolean

  @Column({ name: 'is_active', default: true })
  isActive!: boolean

  @OneToMany(() => Product, (product) => product.unitOfMeasure)
  products?: Product[]
}
