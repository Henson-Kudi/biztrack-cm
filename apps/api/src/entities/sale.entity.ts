import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm'
import { SaleStatus } from '@biztrack/types'
import { BaseEntity } from '@/common/entities/base.entity'
import { dateTransformer, decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { SaleItem } from './sale-item.entity'
import { SalePayment } from './sale-payment.entity'
import { User } from './user.entity'

@Entity('sales')
@Index('unq_sales_business_id_client_id', ['businessId', 'clientId'], { unique: true })
@Index('unq_sales_business_id_sale_number', ['businessId', 'saleNumber'], { unique: true })
@Index('idx_sales_business_id_sale_date', ['businessId', 'saleDate'])
@Index('idx_sales_business_id_status', ['businessId', 'status'])
@Index('idx_sales_business_id_created_at', ['businessId', 'createdAt'])
export class Sale extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, (business) => business.sales, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_sales_business_id' })
  business?: Business

  @Column({ name: 'client_id' })
  clientId!: string

  @Column({ name: 'cashier_id' })
  cashierId!: string

  @ManyToOne(() => User, (user) => user.sales, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'cashier_id', foreignKeyConstraintName: 'fk_sales_cashier_id' })
  cashier?: User

  @Column({ name: 'sale_number' })
  saleNumber!: string

  @Column({ type: 'varchar', default: SaleStatus.COMPLETED })
  status!: SaleStatus

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  subtotal!: number

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
    name: 'tax_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  taxAmount!: number

  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  totalAmount!: number

  @Column({
    name: 'amount_paid',
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  amountPaid!: number

  @Column({
    name: 'change_given',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  changeGiven!: number

  @Column({ name: 'customer_name', nullable: true, type: 'varchar', length: 200 })
  customerName?: string | null

  @Column({ name: 'customer_phone', nullable: true, type: 'varchar', length: 30 })
  customerPhone?: string | null

  @Column({ nullable: true, type: 'text' })
  notes?: string | null

  @Column({ name: 'price_drift_warning', default: false })
  priceDriftWarning!: boolean

  @Column({ name: 'sale_date', type: 'date' })
  saleDate!: string

  @Column({ name: 'sold_at', type: 'timestamptz', transformer: dateTransformer })
  soldAt!: Date

  @Column({ name: 'synced_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  syncedAt?: Date | null

  @Column({ name: 'voided_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  voidedAt?: Date | null

  @Column({ name: 'voided_by', nullable: true, type: 'uuid' })
  voidedById?: string | null

  @ManyToOne(() => User, { nullable: true, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'voided_by', foreignKeyConstraintName: 'fk_sales_voided_by' })
  voidedBy?: User | null

  @Column({ name: 'void_reason', nullable: true, type: 'text' })
  voidReason?: string | null

  @OneToMany(() => SaleItem, (item) => item.sale)
  items?: SaleItem[]

  @OneToMany(() => SalePayment, (payment) => payment.sale)
  payments?: SalePayment[]
}
