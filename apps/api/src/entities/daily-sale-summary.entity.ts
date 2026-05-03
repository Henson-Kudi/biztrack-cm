import {
  BaseEntity as TypeOrmBaseEntity,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { Business } from './business.entity'
import { decimalTransformer, dateTransformer } from '@/common/entities/transformers'

@Entity('daily_sale_summaries')
@Index('unq_daily_sale_summaries_business_id_summary_date', ['businessId', 'summaryDate'], { unique: true })
export class DailySaleSummary extends TypeOrmBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_daily_sale_summaries_business_id' })
  business?: Business

  @Column({ name: 'summary_date', type: 'date' })
  summaryDate!: string

  @Column({ name: 'total_sales', type: 'int', default: 0 })
  totalSales!: number

  @Column({
    name: 'total_revenue',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  totalRevenue!: number

  @Column({
    name: 'total_cost',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  totalCost!: number

  @Column({
    name: 'gross_profit',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  grossProfit!: number

  @Column({
    name: 'total_discounts',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  totalDiscounts!: number

  @Column({
    name: 'cash_collected',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  cashCollected!: number

  @Column({
    name: 'mtn_momo_collected',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  mtnMomoCollected!: number

  @Column({
    name: 'orange_money_collected',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  orangeMoneyCollected!: number

  @Column({
    name: 'card_collected',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  cardCollected!: number

  @Column({ name: 'voided_sales', type: 'int', default: 0 })
  voidedSales!: number

  @Column({
    name: 'voided_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  voidedAmount!: number

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', transformer: dateTransformer })
  updatedAt!: Date
}
