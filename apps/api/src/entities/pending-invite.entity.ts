import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { ImmutableBaseEntity } from '@/common/entities/immutable-base.entity'
import { dateTransformer } from '@/common/entities/transformers'
import { BusinessMemberRole } from '@biztrack/types'
import { Business } from './business.entity'
import { User } from './user.entity'
import { Role } from './role.entity'

@Entity('pending_invites')
@Index('unq_pending_invites_token', ['token'], { unique: true })
@Index('idx_pending_invites_business_id', ['businessId'])
export class PendingInvite extends ImmutableBaseEntity {
  @Column()
  token!: string

  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_pending_invites_business_id' })
  business?: Business

  @Column({ name: 'role_id', nullable: true, type: 'uuid' })
  roleId!: string | null

  @ManyToOne(() => Role, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'role_id', foreignKeyConstraintName: 'fk_pending_invites_role_id' })
  roleRecord?: Role | null

  @Column({ type: 'enum', enum: BusinessMemberRole, nullable: true })
  role!: BusinessMemberRole | null

  @Column({ nullable: true, type: 'varchar', length: 20 })
  phone?: string | null

  @Column({ nullable: true, type: 'varchar', length: 255 })
  email?: string | null

  @Column({ name: 'invited_by_id', nullable: true, type: 'uuid' })
  invitedById?: string | null

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'invited_by_id', foreignKeyConstraintName: 'fk_pending_invites_invited_by_id' })
  invitedBy?: User

  @Column({ name: 'expires_at', type: 'timestamptz', transformer: dateTransformer })
  expiresAt!: Date

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  acceptedAt?: Date | null
}
