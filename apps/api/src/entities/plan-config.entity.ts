import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { SubscriptionPlan } from '@biztrack/types'
import type { PlanQuotaMap } from '@biztrack/types'

@Entity('plan_configs')
@Index('unq_plan_configs_plan', ['plan'], { unique: true })
export class PlanConfig extends BaseEntity {
  @Column({ type: 'enum', enum: SubscriptionPlan })
  plan!: SubscriptionPlan

  @Column({ type: 'text', array: true })
  resources!: string[]

  // v1 keeps plan-specific exceptions boolean-only. Numeric quotas always come
  // from the selected plan so sync, controller writes, and offline desktop
  // writes can all resolve the same deterministic limits.
  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  quotas!: PlanQuotaMap

  @Column({ name: 'display_name' })
  displayName!: string

  @Column({ name: 'price_xaf', type: 'int' })
  priceXAF!: number

  @Column({ name: 'updated_by' })
  updatedBy!: string
}
