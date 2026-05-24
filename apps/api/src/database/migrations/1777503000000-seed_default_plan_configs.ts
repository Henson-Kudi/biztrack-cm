import { MigrationInterface, QueryRunner } from 'typeorm'

const UPDATED_BY = 'migration:1777503000000-seed_default_plan_configs'

type PlanSeed = {
  plan: 'FREE' | 'SOLO' | 'BUSINESS' | 'PRO'
  displayName: string
  priceXAF: number
  resources: string[]
  quotas: {
    products: number | null
    contacts: number | null
    categories: number | null
    users: number | null
  }
}

const FREE_RESOURCES = [
  'SALES_CREATE',
  'SALES_VIEW',
  'PRODUCTS_CREATE',
  'PRODUCTS_VIEW',
  'PRODUCTS_EDIT',
  'PRODUCTS_DELETE',
  'PRODUCTS_LIMIT_50',
  'INVENTORY_VIEW',
  'INVENTORY_ADJUST',
  'INVENTORY_ALERTS',
  'EXPENSES_CREATE',
  'EXPENSES_VIEW',
  'EXPENSES_EDIT',
  'EXPENSES_DELETE',
  'CONTACTS_VIEW',
  'CONTACTS_MANAGE',
  'DEBTS_VIEW',
  'DEBTS_RECORD_PAYMENT',
  'DEBTS_DELETE_PAYMENT',
  'DEBTS_WRITE_OFF',
  'REPORTS_DAILY',
  'RECEIPTS_GENERATE',
  'RECEIPTS_WHATSAPP',
] as const

const SEED_PLANS: PlanSeed[] = [
  {
    plan: 'FREE',
    displayName: 'Free',
    priceXAF: 0,
    resources: [...FREE_RESOURCES],
    quotas: { products: 50, contacts: 20, categories: 10, users: 1 },
  },
  {
    plan: 'SOLO',
    displayName: 'Solo',
    priceXAF: 15000,
    resources: [
      ...FREE_RESOURCES,
      'OPENING_BALANCES',
      'PREORDERS',
      'DEPOSITS',
      'CHARGES_MULTIPLE',
      'REPORTS_FINANCIAL',
      'PRODUCTS_IMPORT_CSV',
      'REPORTS_WEEKLY',
      'REPORTS_MONTHLY',
      'REPORTS_EXPORT_PDF',
      'REPORTS_EXPORT_CSV',
      'EXPENSES_CATEGORIES',
      'SCANNER_CAMERA',
      'DESKTOP_ACCESS',
    ],
    quotas: { products: 200, contacts: null, categories: 50, users: 1 },
  },
  {
    plan: 'BUSINESS',
    displayName: 'Business',
    priceXAF: 35000,
    resources: [
      ...FREE_RESOURCES,
      'OPENING_BALANCES',
      'PREORDERS',
      'DEPOSITS',
      'CHARGES_MULTIPLE',
      'REPORTS_FINANCIAL',
      'PRODUCTS_UNLIMITED',
      'PRODUCTS_IMPORT_CSV',
      'REPORTS_WEEKLY',
      'REPORTS_MONTHLY',
      'REPORTS_EXPORT_PDF',
      'REPORTS_EXPORT_CSV',
      'EXPENSES_CATEGORIES',
      'SCANNER_CAMERA',
      'DESKTOP_ACCESS',
      'STAFF_INVITE',
      'STAFF_MANAGE',
      'CUSTOM_ROLES',
      'BRANCHES_MULTI',
      'BRANCHES_DASHBOARD',
      'BRANCHES_REPORTS',
    ],
    quotas: { products: null, contacts: null, categories: null, users: 5 },
  },
  {
    plan: 'PRO',
    displayName: 'Pro',
    priceXAF: 60000,
    resources: [
      ...FREE_RESOURCES,
      'OPENING_BALANCES',
      'PREORDERS',
      'DEPOSITS',
      'CHARGES_MULTIPLE',
      'REPORTS_FINANCIAL',
      'PRODUCTS_UNLIMITED',
      'PRODUCTS_IMPORT_CSV',
      'REPORTS_WEEKLY',
      'REPORTS_MONTHLY',
      'REPORTS_EXPORT_PDF',
      'REPORTS_EXPORT_CSV',
      'EXPENSES_CATEGORIES',
      'SCANNER_CAMERA',
      'SCANNER_USB',
      'DESKTOP_ACCESS',
      'STAFF_INVITE',
      'STAFF_MANAGE',
      'CUSTOM_ROLES',
      'BRANCHES_MULTI',
      'BRANCHES_DASHBOARD',
      'BRANCHES_REPORTS',
      'API_ACCESS',
      'AGENT_TRACK',
    ],
    quotas: { products: null, contacts: null, categories: null, users: null },
  },
]

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function sqlArray(values: string[]) {
  return `ARRAY[${values.map(sqlString).join(', ')}]::text[]`
}

function sqlJson(value: unknown) {
  return `${sqlString(JSON.stringify(value))}::jsonb`
}

function unique(values: string[]) {
  return Array.from(new Set(values))
}

export class SeedDefaultPlanConfigs1777503000000 implements MigrationInterface {
  name = 'SeedDefaultPlanConfigs1777503000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "plan_configs"
      ADD COLUMN IF NOT EXISTS "quotas" jsonb NOT NULL DEFAULT '{}'::jsonb
    `)

    // This seed now carries the v1 quota payload as part of the same plan source
    // of truth. The later permissions migration still keeps an IF NOT EXISTS guard
    // because older databases may have already executed this seed before the quota
    // column existed, while fresh databases execute strictly by timestamp order.
    for (const config of SEED_PLANS) {
      await queryRunner.query(`
        INSERT INTO "plan_configs" (
          "id",
          "created_at",
          "updated_at",
          "deleted_at",
          "plan",
          "resources",
          "quotas",
          "display_name",
          "price_xaf",
          "updated_by"
        )
        VALUES (
          uuid_generate_v4(),
          now(),
          now(),
          NULL,
          ${sqlString(config.plan)},
          ${sqlArray(unique(config.resources))},
          ${sqlJson(config.quotas)},
          ${sqlString(config.displayName)},
          ${config.priceXAF},
          ${sqlString(UPDATED_BY)}
        )
        ON CONFLICT ("plan") DO UPDATE
        SET
          "resources" = EXCLUDED."resources",
          "quotas" = EXCLUDED."quotas",
          "display_name" = EXCLUDED."display_name",
          "price_xaf" = EXCLUDED."price_xaf",
          "updated_by" = EXCLUDED."updated_by",
          "updated_at" = now(),
          "deleted_at" = NULL
      `)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const plansSql = SEED_PLANS.map((config) => sqlString(config.plan)).join(', ')

    await queryRunner.query(`
      DELETE FROM "plan_configs"
      WHERE "updated_by" = ${sqlString(UPDATED_BY)}
        AND "plan" IN (${plansSql})
    `)
  }
}
