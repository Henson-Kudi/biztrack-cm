import { MigrationInterface, QueryRunner } from 'typeorm'

export class ExpensesLegacyCategoryCleanup1777402000000 implements MigrationInterface {
  name = 'ExpensesLegacyCategoryCleanup1777402000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "expenses"
      DROP COLUMN IF EXISTS "category"
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "expenses"
      ADD COLUMN IF NOT EXISTS "category" character varying
    `)

    await queryRunner.query(`
      UPDATE "expenses" expense
      SET "category" = COALESCE(category_lookup."name", 'Divers')
      FROM "expense_categories" category_lookup
      WHERE category_lookup."id" = expense."category_id"
        AND (expense."category" IS NULL OR trim(expense."category") = '')
    `)

    await queryRunner.query(`
      UPDATE "expenses"
      SET "category" = 'Divers'
      WHERE "category" IS NULL OR trim("category") = ''
    `)

    await queryRunner.query(`
      ALTER TABLE "expenses"
      ALTER COLUMN "category" SET NOT NULL
    `)
  }
}
