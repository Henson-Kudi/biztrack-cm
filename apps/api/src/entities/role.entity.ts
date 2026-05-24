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
import { dateTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { User } from './user.entity'
import { RolePermission } from './role-permission.entity'

@Entity('roles')
@Index('unq_roles_business_id_name', ['businessId', 'name'], { unique: true })
@Index('idx_roles_business_id', ['businessId'])
export class Role extends TypeOrmBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @CreateDateColumn({ name: 'created_at', transformer: dateTransformer })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', transformer: dateTransformer })
  updatedAt!: Date
  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_roles_business_id' })
  business?: Business

  @Column({ type: 'varchar', length: 100 })
  name!: string

  @Column({ type: 'text', nullable: true })
  description!: string | null

  @Column({ name: 'is_system', default: false })
  isSystem!: boolean

  @Column({ name: 'is_owner_role', default: false })
  isOwnerRole!: boolean

  @Column({ type: 'varchar', length: 7, nullable: true })
  colour!: string | null

  @Column({ name: 'created_by', nullable: true, type: 'uuid' })
  createdBy!: string | null

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by', foreignKeyConstraintName: 'fk_roles_created_by' })
  createdByUser?: User | null

  @OneToMany(() => RolePermission, (rp) => rp.role)
  rolePermissions?: RolePermission[]
}
