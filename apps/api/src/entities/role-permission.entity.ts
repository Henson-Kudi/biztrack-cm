import {
  BaseEntity as TypeOrmBaseEntity,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { dateTransformer } from '@/common/entities/transformers'
import { Role } from './role.entity'
import { Business } from './business.entity'
import { User } from './user.entity'

@Entity('role_permissions')
@Index('unq_role_permissions_role_id_permission', ['roleId', 'permission'], { unique: true })
@Index('idx_role_permissions_role_id', ['roleId'])
@Index('idx_role_permissions_business_id', ['businessId'])
export class RolePermission extends TypeOrmBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string
  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string

  @ManyToOne(() => Role, (role) => role.rolePermissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id', foreignKeyConstraintName: 'fk_role_permissions_role_id' })
  role?: Role

  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_role_permissions_business_id' })
  business?: Business

  @Column({ type: 'varchar', length: 100 })
  permission!: string

  @Column({ name: 'granted_at', type: 'timestamptz', transformer: dateTransformer })
  grantedAt!: Date

  @Column({ name: 'granted_by', nullable: true, type: 'uuid' })
  grantedBy!: string | null

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'granted_by', foreignKeyConstraintName: 'fk_role_permissions_granted_by' })
  grantedByUser?: User | null
}
