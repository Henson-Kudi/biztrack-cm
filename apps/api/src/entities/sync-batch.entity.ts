import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { dateTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { SyncOperation } from './sync-operation.entity'

@Entity('sync_batches')
@Index('idx_sync_batches_business_id_device_id_created_at', ['businessId', 'deviceId', 'createdAt'])
export class SyncBatch extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_sync_batches_business_id' })
  business?: Business

  @Column({ name: 'device_id' })
  deviceId!: string

  @Column({ name: 'base_cursor', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  baseCursor!: Date | null

  @Column({ type: 'varchar', length: 20, default: 'pending_enqueue' })
  status!: string

  @Column({ name: 'bull_job_id', type: 'varchar', nullable: true })
  bullJobId!: string | null

  @Column({ name: 'accepted_count', default: 0 })
  acceptedCount!: number

  @Column({ name: 'processed_count', default: 0 })
  processedCount!: number

  @Column({ name: 'applied_count', default: 0 })
  appliedCount!: number

  @Column({ name: 'conflict_count', default: 0 })
  conflictCount!: number

  @Column({ name: 'failed_count', default: 0 })
  failedCount!: number

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  startedAt!: Date | null

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  completedAt!: Date | null

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null

  @OneToMany(() => SyncOperation, (operation) => operation.batch)
  operations?: SyncOperation[]
}
