import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm'
import { PaymentMethod } from '@biztrack/types'
import { ImmutableBaseEntity } from '@/common/entities/immutable-base.entity'
import { decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { Sale } from './sale.entity'

@Entity('sale_payments')
@Index('idx_sale_payments_sale_id', ['saleId'])
@Index('idx_sale_payments_business_id', ['businessId'])
export class SalePayment extends ImmutableBaseEntity {
  @Column({ name: 'sale_id' })
  saleId!: string

  @ManyToOne(() => Sale, (sale) => sale.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id', foreignKeyConstraintName: 'fk_sale_payments_sale_id' })
  sale?: Sale

  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_sale_payments_business_id' })
  business?: Business

  @Column({ type: 'varchar' })
  method!: PaymentMethod

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  amount!: number

  @Column({ name: 'mobile_money_reference', nullable: true, type: 'varchar', length: 100 })
  mobileMoneyReference?: string | null

  @Column({ name: 'savings_account_id', nullable: true, type: 'uuid' })
  savingsAccountId?: string | null
}
