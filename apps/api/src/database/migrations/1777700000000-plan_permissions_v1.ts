import { MigrationInterface, QueryRunner } from 'typeorm'

type PlanQuotaMap = {
  products: number | null
  contacts: number | null
  categories: number | null
  users: number | null
}

const PLAN_QUOTAS: Record<'FREE' | 'SOLO' | 'BUSINESS' | 'PRO', PlanQuotaMap> = {
  FREE: { products: 50, contacts: 20, categories: 10, users: 1 },
  SOLO: { products: 200, contacts: null, categories: 50, users: 1 },
  BUSINESS: { products: null, contacts: null, categories: null, users: 5 },
  PRO: { products: null, contacts: null, categories: null, users: null },
}

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function sqlJson(value: unknown) {
  return `${sqlString(JSON.stringify(value))}::jsonb`
}

export class PlanPermissionsV11777700000000 implements MigrationInterface {
  name = 'PlanPermissionsV11777700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "plan_configs"
      ADD COLUMN IF NOT EXISTS "quotas" jsonb NOT NULL DEFAULT '{}'::jsonb
    `)

    await queryRunner.query(`
      ALTER TABLE "sync_operations"
      ADD COLUMN IF NOT EXISTS "error_details" jsonb
    `)

    for (const [plan, quotas] of Object.entries(PLAN_QUOTAS)) {
      await queryRunner.query(`
        UPDATE "plan_configs"
        SET "quotas" = ${sqlJson(quotas)}
        WHERE "plan" = ${sqlString(plan)}
      `)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sync_operations"
      DROP COLUMN IF EXISTS "error_details"
    `)

    await queryRunner.query(`
      ALTER TABLE "plan_configs"
      DROP COLUMN IF EXISTS "quotas"
    `)
  }
}
