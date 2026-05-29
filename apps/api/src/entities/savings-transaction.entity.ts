import {
  BaseEntity as TypeOrmBaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm'
import { dateTransformer, decimalTransformer } from '@/common/entities/transformers'
import { SavingsAccount } from './savings-account.entity'
import { User } from './user.entity'

@Entity('savings_transactions')
@Index('idx_savings_transactions_savings_id', ['savingsId'])
@Index('idx_savings_transactions_sale_id', ['saleId'])
@Index('idx_savings_transactions_business_id', ['businessId'])
@Index('idx_savings_transactions_created_at', ['createdAt'])
export class SavingsTransaction extends TypeOrmBaseEntity {
  @PrimaryColumn('uuid')
  id!: string

  @Column({ name: 'savings_id' })
  savingsId!: string

  @ManyToOne(() => SavingsAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'savings_id', foreignKeyConstraintName: 'fk_savings_transactions_savings_id' })
  savingsAccount?: SavingsAccount

  @Column({ name: 'business_id' })
  businessId!: string

  @Column({ type: 'varchar', length: 20 })
  type!: string

  @Column({ type: 'varchar', length: 10 })
  direction!: string

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  amount!: number

  @Column({ type: 'varchar', length: 50, nullable: true })
  method?: string | null

  @Column({ name: 'mobile_money_reference', type: 'varchar', length: 200, nullable: true })
  mobileMoneyReference?: string | null

  @Column({ name: 'sale_id', type: 'uuid', nullable: true })
  saleId?: string | null

  @Column({ type: 'text', nullable: true })
  notes?: string | null

  @Column({ name: 'recorded_by_id', type: 'uuid', nullable: true })
  recordedById?: string | null

  @ManyToOne(() => User, { nullable: true, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'recorded_by_id', foreignKeyConstraintName: 'fk_savings_transactions_recorded_by_id' })
  recordedBy?: User | null

  @Column({ name: 'occurred_at', type: 'timestamptz', transformer: dateTransformer })
  occurredAt!: Date

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted!: boolean

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', transformer: dateTransformer })
  createdAt!: Date
}
