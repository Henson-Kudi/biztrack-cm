import { MigrationInterface, QueryRunner } from 'typeorm'

export class SaleChargesTable1779000000000 implements MigrationInterface {
  name = 'SaleChargesTable1779000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sale_charges" (
        "id" uuid NOT NULL,
        "sale_id" uuid NOT NULL,
        "business_id" uuid NOT NULL,
        "charge_type_id" uuid,
        "name" character varying(200) NOT NULL,
        "rate_type" character varying(20) NOT NULL DEFAULT 'FIXED',
        "rate_value" numeric(10,4) NOT NULL DEFAULT 0,
        "amount" numeric(12,2) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_sale_charges" PRIMARY KEY ("id"),
        CONSTRAINT "fk_sale_charges_sale_id" FOREIGN KEY ("sale_id")
          REFERENCES "sales"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_sale_charges_business_id" FOREIGN KEY ("business_id")
          REFERENCES "businesses"("id") ON DELETE CASCADE
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sale_charges_sale_id" ON "sale_charges" ("sale_id")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sale_charges_business_id" ON "sale_charges" ("business_id")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sale_charges"`)
  }
}
