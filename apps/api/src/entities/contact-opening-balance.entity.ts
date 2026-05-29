import {
  BaseEntity as TypeOrmBaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm'
import { DebtDirection } from '@biztrack/types'
import { dateTransformer, decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { Contact } from './contact.entity'
import { User } from './user.entity'

@Entity('contact_opening_balances')
@Unique('UQ_contact_opening_balances_contact_direction', ['businessId', 'contactId', 'direction'])
@Index('idx_contact_opening_balances_business_id', ['businessId'])
@Index('idx_contact_opening_balances_contact_id', ['businessId', 'contactId'])
export class ContactOpeningBalance extends TypeOrmBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_contact_opening_balances_business_id' })
  business?: Business

  @Column({ name: 'contact_id' })
  contactId!: string

  @ManyToOne(() => Contact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contact_id', foreignKeyConstraintName: 'fk_contact_opening_balances_contact_id' })
  contact?: Contact

  @Column({ type: 'varchar' })
  direction!: DebtDirection

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  amount!: number

  @Column({ name: 'as_of_date', type: 'date' })
  asOfDate!: string

  @Column({ type: 'text', nullable: true })
  notes?: string | null

  @Column({ name: 'recorded_by', type: 'uuid', nullable: true })
  recordedById?: string | null

  @ManyToOne(() => User, { nullable: true, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'recorded_by', foreignKeyConstraintName: 'fk_contact_opening_balances_recorded_by' })
  recordedBy?: User | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', transformer: dateTransformer })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', transformer: dateTransformer })
  updatedAt!: Date
}
