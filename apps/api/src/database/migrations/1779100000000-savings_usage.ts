import { MigrationInterface, QueryRunner } from 'typeorm'

export class SavingsUsage1779100000000 implements MigrationInterface {
  name = 'SavingsUsage1779100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "savings_usages" (
        "id" uuid NOT NULL,
        "savings_id" uuid NOT NULL,
        "sale_id" uuid NOT NULL,
        "business_id" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL DEFAULT 0,
        "notes" text,
        "recorded_by_id" uuid,
        "used_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_savings_usages" PRIMARY KEY ("id"),
        CONSTRAINT "fk_savings_usages_savings_id" FOREIGN KEY ("savings_id")
          REFERENCES "savings_accounts"("id") ON DELETE CASCADE
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_savings_usages_savings_id" ON "savings_usages" ("savings_id")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_savings_usages_sale_id" ON "savings_usages" ("sale_id")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_savings_usages_business_id" ON "savings_usages" ("business_id")
    `)

    await queryRunner.query(`
      ALTER TABLE "sale_payments"
      ADD COLUMN IF NOT EXISTS "savings_account_id" uuid
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sale_payments" DROP COLUMN IF EXISTS "savings_account_id"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "savings_usages"`)
  }
}
