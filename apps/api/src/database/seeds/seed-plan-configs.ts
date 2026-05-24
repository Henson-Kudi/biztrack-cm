import 'reflect-metadata'
import { AppDataSource } from '../data-source'
import { PlanConfig } from '@/entities/plan-config.entity'
import {
  DEFAULT_PLAN_QUOTAS,
  DEFAULT_PLAN_RESOURCES,
  SubscriptionPlan,
  type PlanQuotaMap,
  type Resource,
} from '@biztrack/types'

type PlanSeed = {
  plan: SubscriptionPlan
  displayName: string
  priceXAF: number
  resources: Resource[]
  quotas: PlanQuotaMap
}

const seedPlans: PlanSeed[] = [
  {
    plan: SubscriptionPlan.FREE,
    displayName: 'Free',
    priceXAF: 0,
    resources: [...DEFAULT_PLAN_RESOURCES[SubscriptionPlan.FREE]],
    quotas: DEFAULT_PLAN_QUOTAS[SubscriptionPlan.FREE],
  },
  {
    plan: SubscriptionPlan.SOLO,
    displayName: 'Solo',
    priceXAF: 15000,
    resources: [...DEFAULT_PLAN_RESOURCES[SubscriptionPlan.SOLO]],
    quotas: DEFAULT_PLAN_QUOTAS[SubscriptionPlan.SOLO],
  },
  {
    plan: SubscriptionPlan.BUSINESS,
    displayName: 'Business',
    priceXAF: 35000,
    resources: [...DEFAULT_PLAN_RESOURCES[SubscriptionPlan.BUSINESS]],
    quotas: DEFAULT_PLAN_QUOTAS[SubscriptionPlan.BUSINESS],
  },
  {
    plan: SubscriptionPlan.PRO,
    displayName: 'Pro',
    priceXAF: 60000,
    resources: [...DEFAULT_PLAN_RESOURCES[SubscriptionPlan.PRO]],
    quotas: DEFAULT_PLAN_QUOTAS[SubscriptionPlan.PRO],
  },
]

const updatedBy = process.env.PLAN_CONFIGS_UPDATED_BY ?? 'seed-script'

const unique = <T,>(list: T[]) => Array.from(new Set(list))

async function main() {
  const shouldSeed = process.argv.includes('--seed')
  await AppDataSource.initialize()

  const repo = AppDataSource.getRepository(PlanConfig)
  const existing = await repo.find({ order: { createdAt: 'ASC' as any } })

  console.log('Existing plan configs:')
  if (existing.length === 0) {
    console.log('(none)')
  } else {
    console.table(
      existing.map((plan) => ({
        plan: plan.plan,
        displayName: plan.displayName,
        priceXAF: plan.priceXAF,
        resources: plan.resources.length,
        quotas: JSON.stringify(plan.quotas),
        updatedBy: plan.updatedBy,
      })),
    )
  }

  if (!shouldSeed) {
    await AppDataSource.destroy()
    console.log('Tip: run with --seed to upsert default plan configs.')
    return
  }

  for (const config of seedPlans) {
    const resources = unique(config.resources)
    const existingConfig = await repo.findOne({ where: { plan: config.plan } })

    if (existingConfig) {
      await repo.update(existingConfig.id, {
        displayName: config.displayName,
        priceXAF: config.priceXAF,
        resources,
        quotas: config.quotas,
        updatedBy,
      })
      console.log(`Updated ${config.plan}`)
    } else {
      await repo.save(
        repo.create({
          plan: config.plan,
          displayName: config.displayName,
          priceXAF: config.priceXAF,
          resources,
          quotas: config.quotas,
          updatedBy,
        }),
      )
      console.log(`Inserted ${config.plan}`)
    }
  }

  const refreshed = await repo.find({ order: { createdAt: 'ASC' as any } })
  console.log('Plan configs after seeding:')
  console.table(
    refreshed.map((plan) => ({
      plan: plan.plan,
      displayName: plan.displayName,
      priceXAF: plan.priceXAF,
      resources: plan.resources.length,
      quotas: JSON.stringify(plan.quotas),
      updatedBy: plan.updatedBy,
    })),
  )

  await AppDataSource.destroy()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
