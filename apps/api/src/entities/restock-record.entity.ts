import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm'
import { ImmutableBaseEntity } from '@/common/entities/immutable-base.entity'
import { decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { RestockItem } from './restock-item.entity'
import { User } from './user.entity'

@Entity('restock_records')
@Index('idx_restock_records_business_id', ['businessId'])
export class RestockRecord extends ImmutableBaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_restock_records_business_id' })
  business?: Business

  @Column({ name: 'reference_number', nullable: true, type: 'varchar' })
  referenceNumber?: string | null

  @Column({ name: 'supplier_name', nullable: true, type: 'varchar' })
  supplierName?: string | null

  @Column({
    name: 'total_cost',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  totalCost?: number | null

  @Column({ nullable: true, type: 'text' })
  notes?: string | null

  @Column({ name: 'performed_by', nullable: true })
  performedById?: string | null

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'performed_by', foreignKeyConstraintName: 'fk_restock_records_performed_by' })
  performedBy?: User | null

  @OneToMany(() => RestockItem, (item) => item.restockRecord, { cascade: false })
  items?: RestockItem[]
}
