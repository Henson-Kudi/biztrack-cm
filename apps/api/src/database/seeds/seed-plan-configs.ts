import 'reflect-metadata'
import { AppDataSource } from '../data-source'
import { PlanConfig } from '@/entities/plan-config.entity'
import { Resource, FREE_PERMISSIONS, SubscriptionPlan } from '@biztrack/types'

type PlanSeed = {
  plan: SubscriptionPlan
  displayName: string
  priceXAF: number
  resources: Resource[]
}

const seedPlans: PlanSeed[] = [
  {
    plan: SubscriptionPlan.FREE,
    displayName: 'Free',
    priceXAF: 0,
    resources: [...FREE_PERMISSIONS],
  },
  {
    plan: SubscriptionPlan.SOLO,
    displayName: 'Solo',
    priceXAF: 15000,
    resources: [
      ...FREE_PERMISSIONS,
      Resource.PRODUCTS_IMPORT_CSV,
      Resource.REPORTS_WEEKLY,
      Resource.REPORTS_MONTHLY,
      Resource.REPORTS_EXPORT_PDF,
      Resource.REPORTS_EXPORT_CSV,
      Resource.EXPENSES_CATEGORIES,
      Resource.SCANNER_CAMERA,
      Resource.DESKTOP_ACCESS,
      Resource.STAFF_LIMIT_3,
    ],
  },
  {
    plan: SubscriptionPlan.BUSINESS,
    displayName: 'Business',
    priceXAF: 35000,
    resources: [
      ...FREE_PERMISSIONS,
      Resource.PRODUCTS_UNLIMITED,
      Resource.PRODUCTS_IMPORT_CSV,
      Resource.REPORTS_WEEKLY,
      Resource.REPORTS_MONTHLY,
      Resource.REPORTS_EXPORT_PDF,
      Resource.REPORTS_EXPORT_CSV,
      Resource.EXPENSES_CATEGORIES,
      Resource.SCANNER_CAMERA,
      Resource.DESKTOP_ACCESS,
      Resource.STAFF_INVITE,
      Resource.STAFF_MANAGE,
      Resource.STAFF_UNLIMITED,
      Resource.BRANCHES_MULTI,
      Resource.BRANCHES_DASHBOARD,
      Resource.BRANCHES_REPORTS,
    ],
  },
  {
    plan: SubscriptionPlan.PRO,
    displayName: 'Pro',
    priceXAF: 60000,
    resources: [
      ...FREE_PERMISSIONS,
      Resource.PRODUCTS_UNLIMITED,
      Resource.PRODUCTS_IMPORT_CSV,
      Resource.REPORTS_WEEKLY,
      Resource.REPORTS_MONTHLY,
      Resource.REPORTS_EXPORT_PDF,
      Resource.REPORTS_EXPORT_CSV,
      Resource.EXPENSES_CATEGORIES,
      Resource.SCANNER_CAMERA,
      Resource.SCANNER_USB,
      Resource.DESKTOP_ACCESS,
      Resource.STAFF_INVITE,
      Resource.STAFF_MANAGE,
      Resource.STAFF_UNLIMITED,
      Resource.BRANCHES_MULTI,
      Resource.BRANCHES_DASHBOARD,
      Resource.BRANCHES_REPORTS,
      Resource.API_ACCESS,
    ],
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
      updatedBy: plan.updatedBy,
    })),
  )

  await AppDataSource.destroy()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
