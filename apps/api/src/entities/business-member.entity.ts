import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { Business } from './business.entity'
import { User } from './user.entity'
import { Role } from './role.entity'
import { BusinessMemberRole, BusinessMemberStatus } from '@biztrack/types'

@Entity('business_members')
@Index('unq_business_members_business_id_user_id', ['businessId', 'userId'], { unique: true })
@Index('idx_business_members_business_id', ['businessId'])
@Index('idx_business_members_user_id', ['userId'])
export class BusinessMember extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_business_members_business_id' })
  business?: Business

  @Column({ name: 'user_id' })
  userId!: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_business_members_user_id' })
  user?: User

  @Column({ name: 'role_id', nullable: true, type: 'uuid' })
  roleId!: string | null

  @ManyToOne(() => Role, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'role_id', foreignKeyConstraintName: 'fk_business_members_role_id' })
  roleRecord?: Role | null

  @Column({ type: 'enum', enum: BusinessMemberRole, default: BusinessMemberRole.CASHIER })
  role!: BusinessMemberRole

  @Column({ type: 'enum', enum: BusinessMemberStatus, default: BusinessMemberStatus.ACTIVE })
  status!: BusinessMemberStatus
}
