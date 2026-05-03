import { MigrationInterface, QueryRunner } from 'typeorm'

export class ProductsInventoryV2Cleanup1775500000000 implements MigrationInterface {
  name = 'ProductsInventoryV2Cleanup1775500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_images_business_id"`)
    await queryRunner.query(`ALTER TABLE "product_images" DROP COLUMN IF EXISTS "business_id"`)

    await queryRunner.query(`ALTER TABLE "unit_of_measures" DROP CONSTRAINT IF EXISTS "unq_unit_of_measures_name"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "unq_unit_of_measures_name"`)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "unq_unit_of_measures_default_name"
      ON "unit_of_measures" ("name")
      WHERE business_id IS NULL
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "unq_unit_of_measures_business_id_name"
      ON "unit_of_measures" ("business_id", "name")
      WHERE business_id IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "unq_unit_of_measures_business_id_name"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "unq_unit_of_measures_default_name"`)
    await queryRunner.query(`
      ALTER TABLE "unit_of_measures"
      ADD CONSTRAINT "unq_unit_of_measures_name" UNIQUE ("name")
    `)

    await queryRunner.query(`ALTER TABLE "product_images" ADD COLUMN IF NOT EXISTS "business_id" uuid`)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_images_business_id"
      ON "product_images" ("business_id")
    `)
  }
}
