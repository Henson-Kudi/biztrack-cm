import { MigrationInterface, QueryRunner } from 'typeorm'

export class SaleDiscounts1778700000000 implements MigrationInterface {
  name = 'SaleDiscounts1778700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sale_discounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sale_id" uuid NOT NULL,
        "sale_item_id" uuid,
        "business_id" uuid NOT NULL,
        "description" character varying(200) NOT NULL DEFAULT '',
        "discount_type" character varying(20) NOT NULL DEFAULT 'FIXED_AMOUNT',
        "rate" numeric(8,4),
        "amount" numeric(12,2) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_sale_discounts" PRIMARY KEY ("id"),
        CONSTRAINT "fk_sale_discounts_sale" FOREIGN KEY ("sale_id")
          REFERENCES "sales"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_sale_discounts_business" FOREIGN KEY ("business_id")
          REFERENCES "businesses"("id") ON DELETE CASCADE
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sale_discounts_sale_id" ON "sale_discounts" ("sale_id")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sale_discounts_business_id" ON "sale_discounts" ("business_id")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sale_discounts"`)
  }
}
