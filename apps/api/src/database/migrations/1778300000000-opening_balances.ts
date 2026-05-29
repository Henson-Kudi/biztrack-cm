import { MigrationInterface, QueryRunner } from 'typeorm'

export class OpeningBalances1778300000000 implements MigrationInterface {
  name = 'OpeningBalances1778300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contact_opening_balances" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "contact_id" uuid NOT NULL,
        "direction" character varying NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "as_of_date" date NOT NULL,
        "notes" text,
        "recorded_by" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contact_opening_balances_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_contact_opening_balances_contact_direction"
          UNIQUE ("business_id", "contact_id", "direction")
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_contact_opening_balances_business_id"
      ON "contact_opening_balances" ("business_id")
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_contact_opening_balances_contact_id"
      ON "contact_opening_balances" ("business_id", "contact_id")
    `)

    await queryRunner.query(`
      ALTER TABLE "contact_opening_balances"
      ADD CONSTRAINT "fk_contact_opening_balances_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      ALTER TABLE "contact_opening_balances"
      ADD CONSTRAINT "fk_contact_opening_balances_contact_id"
      FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      ALTER TABLE "contact_opening_balances"
      ADD CONSTRAINT "fk_contact_opening_balances_recorded_by"
      FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `).catch(() => undefined)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contact_opening_balances" DROP CONSTRAINT IF EXISTS "fk_contact_opening_balances_recorded_by"`)
    await queryRunner.query(`ALTER TABLE "contact_opening_balances" DROP CONSTRAINT IF EXISTS "fk_contact_opening_balances_contact_id"`)
    await queryRunner.query(`ALTER TABLE "contact_opening_balances" DROP CONSTRAINT IF EXISTS "fk_contact_opening_balances_business_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_contact_opening_balances_contact_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_contact_opening_balances_business_id"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "contact_opening_balances"`)
  }
}
