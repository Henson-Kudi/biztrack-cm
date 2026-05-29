import { MigrationInterface, QueryRunner } from 'typeorm'

export class SavingsTransactions1779200000000 implements MigrationInterface {
  name = 'SavingsTransactions1779200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "savings_transactions" (
        "id" uuid NOT NULL,
        "savings_id" uuid NOT NULL,
        "business_id" uuid NOT NULL,
        "type" varchar(20) NOT NULL,
        "direction" varchar(10) NOT NULL,
        "amount" numeric(12,2) NOT NULL DEFAULT 0,
        "method" varchar(50),
        "mobile_money_reference" varchar(200),
        "sale_id" uuid,
        "notes" text,
        "recorded_by_id" uuid,
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "is_deleted" boolean NOT NULL DEFAULT false,
        CONSTRAINT "pk_savings_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_savings_transactions_savings_id" FOREIGN KEY ("savings_id")
          REFERENCES "savings_accounts"("id") ON DELETE CASCADE
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_savings_transactions_savings_id"
        ON "savings_transactions" ("savings_id")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_savings_transactions_sale_id"
        ON "savings_transactions" ("sale_id")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_savings_transactions_business_id"
        ON "savings_transactions" ("business_id")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_savings_transactions_created_at"
        ON "savings_transactions" ("created_at")
    `)

    // Migrate from savings_deposits
    await queryRunner.query(`
      INSERT INTO "savings_transactions"
        (id, savings_id, business_id, type, direction, amount, method, mobile_money_reference,
         sale_id, notes, recorded_by_id, occurred_at, created_at, is_deleted)
      SELECT id, savings_id, business_id, 'deposit', 'inbound', amount, method,
             mobile_money_reference, NULL, notes, recorded_by_id, deposited_at, created_at, is_deleted
      FROM "savings_deposits"
      ON CONFLICT DO NOTHING
    `)

    // Migrate from savings_refunds
    await queryRunner.query(`
      INSERT INTO "savings_transactions"
        (id, savings_id, business_id, type, direction, amount, method, mobile_money_reference,
         sale_id, notes, recorded_by_id, occurred_at, created_at, is_deleted)
      SELECT id, savings_id, business_id, 'refund', 'outbound', amount, method,
             mobile_money_reference, NULL, notes, recorded_by_id, refunded_at, created_at, is_deleted
      FROM "savings_refunds"
      ON CONFLICT DO NOTHING
    `)

    // Migrate from savings_usages
    await queryRunner.query(`
      INSERT INTO "savings_transactions"
        (id, savings_id, business_id, type, direction, amount, method, mobile_money_reference,
         sale_id, notes, recorded_by_id, occurred_at, created_at, is_deleted)
      SELECT id, savings_id, business_id, 'sale', 'outbound', amount, NULL, NULL,
             sale_id, notes, recorded_by_id, used_at, created_at, false
      FROM "savings_usages"
      ON CONFLICT DO NOTHING
    `)

    // Drop old tables
    await queryRunner.query(`DROP TABLE IF EXISTS "savings_usages"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "savings_refunds"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "savings_deposits"`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "savings_transactions"`)
  }
}
