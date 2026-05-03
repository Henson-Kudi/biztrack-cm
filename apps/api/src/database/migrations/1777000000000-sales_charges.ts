import { MigrationInterface, QueryRunner } from 'typeorm'

export class SalesCharges1777000000000 implements MigrationInterface {
  name = 'SalesCharges1777000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD COLUMN IF NOT EXISTS "charges_amount" numeric(12,2) NOT NULL DEFAULT 0
    `)

    await queryRunner.query(`
      UPDATE "sales"
      SET "charges_amount" = COALESCE("charges_amount", 0)
    `)

    await queryRunner.query(`
      ALTER TABLE "sales"
      ALTER COLUMN "charges_amount" SET DEFAULT 0,
      ALTER COLUMN "charges_amount" SET NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales"
      DROP COLUMN IF EXISTS "charges_amount"
    `)
  }
}
