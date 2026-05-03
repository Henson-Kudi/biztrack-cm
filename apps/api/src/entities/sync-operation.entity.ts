import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { dateTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { SyncBatch } from './sync-batch.entity'

@Entity('sync_operations')
@Index('idx_sync_operations_batch_id_created_at', ['batchId', 'createdAt'])
@Index('idx_sync_operations_business_id_status_created_at', ['businessId', 'status', 'createdAt'])
export class SyncOperation extends BaseEntity {
  @Column({ name: 'batch_id' })
  batchId!: string

  @ManyToOne(() => SyncBatch, (batch) => batch.operations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batch_id', foreignKeyConstraintName: 'fk_sync_operations_batch_id' })
  batch?: SyncBatch

  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_sync_operations_business_id' })
  business?: Business

  @Column({ name: 'device_id' })
  deviceId!: string

  @Column({ name: 'client_operation_id' })
  clientOperationId!: string

  @Column({ type: 'varchar', length: 40 })
  entity!: string

  @Column({ type: 'varchar', length: 20 })
  action!: string

  @Column({ name: 'record_id' })
  recordId!: string

  @Column({ name: 'record_updated_at', type: 'timestamptz', transformer: dateTransformer })
  recordUpdatedAt!: Date

  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: string

  @Column({ type: 'varchar', length: 20, nullable: true })
  resolution!: string | null

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null
}
