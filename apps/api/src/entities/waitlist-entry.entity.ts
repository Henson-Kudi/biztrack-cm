import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('waitlist_entries')
export class WaitlistEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ length: 200 })
  name!: string

  @Column({ length: 300 })
  email!: string

  @Column({ length: 50 })
  phone!: string

  @Column({ type: 'varchar', length: 5, default: 'fr' })
  locale!: string

  @Column({ length: 200, nullable: true })
  utm_source?: string

  @Column({ length: 200, nullable: true })
  utm_medium?: string

  @Column({ length: 200, nullable: true })
  utm_campaign?: string

  @Column({ length: 500, nullable: true })
  user_agent?: string

  @Column({ length: 100, nullable: true })
  referrer?: string

  @Column({
    type: 'enum',
    enum: ['PENDING', 'CONTACTED', 'INSTALLED', 'DECLINED'],
    default: 'PENDING',
  })
  status!: 'PENDING' | 'CONTACTED' | 'INSTALLED' | 'DECLINED'

  @Column({ type: 'text', nullable: true })
  notes?: string

  @Column({ default: false })
  is_duplicate!: boolean

  @CreateDateColumn()
  created_at!: Date

  @UpdateDateColumn()
  updated_at!: Date
}
