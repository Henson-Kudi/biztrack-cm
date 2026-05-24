import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { dateTransformer } from '@/common/entities/transformers'
import { User } from './user.entity'

@Entity('sync_device_sessions')
@Index('unq_sync_device_sessions_token_id', ['tokenId'], { unique: true })
@Index('idx_sync_device_sessions_user_business_device', ['userId', 'businessId', 'deviceId'])
export class SyncDeviceSession extends BaseEntity {
  @Column({ name: 'token_id' })
  tokenId!: string

  @Column({ name: 'token_hash' })
  tokenHash!: string

  @Column({ name: 'user_id' })
  userId!: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_sync_device_sessions_user_id' })
  user?: User

  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @Column({ name: 'device_id', type: 'varchar', length: 255 })
  deviceId!: string

  @Column({ name: 'device_name', type: 'varchar', length: 255, nullable: true })
  deviceName?: string | null

  @Column({ name: 'platform', type: 'varchar', length: 255, nullable: true })
  platform?: string | null

  @Column({ name: 'app_version', type: 'varchar', length: 64, nullable: true })
  appVersion?: string | null

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  lastUsedAt?: Date | null

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  revokedAt?: Date | null
}
