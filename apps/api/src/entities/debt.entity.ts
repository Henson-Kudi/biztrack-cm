import {
  BaseEntity as TypeOrmBaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { DebtDirection, DebtSource, DebtStatus } from '@biztrack/types'
import { dateTransformer, decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { Contact } from './contact.entity'
import { DebtPayment } from './debt-payment.entity'
import { User } from './user.entity'

@Entity('debts')
@Index('idx_debts_business_id_status', ['businessId', 'status'])
@Index('idx_debts_business_id_direction', ['businessId', 'direction'])
@Index('idx_debts_business_id_contact_id', ['businessId', 'contactId'])
@Index('idx_debts_business_id_updated_at', ['businessId', 'updatedAt'])
@Index('idx_debts_source_type_source_id', ['sourceType', 'sourceId'])
export class Debt extends TypeOrmBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_debts_business_id' })
  business?: Business

  @Column({ name: 'contact_id' })
  contactId!: string

  @ManyToOne(() => Contact, (contact) => contact.debts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contact_id', foreignKeyConstraintName: 'fk_debts_contact_id' })
  contact?: Contact

  @Column({ type: 'varchar' })
  direction!: DebtDirection

  @Column({ name: 'source_type', type: 'varchar' })
  sourceType!: DebtSource

  @Column({ name: 'source_id', type: 'uuid' })
  sourceId!: string

  @Column({ name: 'source_reference', type: 'varchar', length: 100 })
  sourceReference!: string

  @Column({
    name: 'original_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  originalAmount!: number

  @Column({ type: 'varchar', default: DebtStatus.OUTSTANDING })
  status!: DebtStatus

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate?: string | null

  @Column({ nullable: true, type: 'text' })
  notes?: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', transformer: dateTransformer })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', transformer: dateTransformer })
  updatedAt!: Date

  @Column({ name: 'settled_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  settledAt?: Date | null

  @Column({ name: 'written_off_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  writtenOffAt?: Date | null

  @Column({ name: 'written_off_by', type: 'uuid', nullable: true })
  writtenOffById?: string | null

  @ManyToOne(() => User, { nullable: true, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'written_off_by', foreignKeyConstraintName: 'fk_debts_written_off_by' })
  writtenOffBy?: User | null

  @Column({ name: 'written_off_reason', type: 'text', nullable: true })
  writtenOffReason?: string | null

  @OneToMany(() => DebtPayment, (payment) => payment.debt)
  payments?: DebtPayment[]
}
