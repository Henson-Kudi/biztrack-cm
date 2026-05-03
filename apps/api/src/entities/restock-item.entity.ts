import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
} from 'typeorm'
import { ImmutableBaseEntity } from '@/common/entities/immutable-base.entity'
import { decimalTransformer } from '@/common/entities/transformers'
import { Product } from './product.entity'
import { RestockRecord } from './restock-record.entity'

@Entity('restock_items')
export class RestockItem extends ImmutableBaseEntity {
  @Column({ name: 'restock_record_id' })
  restockRecordId!: string

  @ManyToOne(() => RestockRecord, (record) => record.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'restock_record_id', foreignKeyConstraintName: 'fk_restock_items_restock_record_id' })
  restockRecord?: RestockRecord

  @Column({ name: 'product_id' })
  productId!: string

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id', foreignKeyConstraintName: 'fk_restock_items_product_id' })
  product?: Product

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 3,
    transformer: decimalTransformer,
  })
  quantity!: number

  @Column({
    name: 'unit_cost',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  unitCost?: number | null
}
