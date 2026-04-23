import { MigrationInterface, QueryRunner } from 'typeorm'

export class SchemaDriftRepair1776934494374 implements MigrationInterface {
  name = 'SchemaDriftRepair1776934494374'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_categories"
      ADD COLUMN IF NOT EXISTS "slug" character varying(100),
      ADD COLUMN IF NOT EXISTS "is_active" boolean,
      ADD COLUMN IF NOT EXISTS "color" character varying(7),
      ADD COLUMN IF NOT EXISTS "icon" character varying,
      ADD COLUMN IF NOT EXISTS "image_url" character varying,
      ADD COLUMN IF NOT EXISTS "sort_order" integer
    `)

    await queryRunner.query(`
      WITH source AS (
        SELECT
          "id",
          "business_id",
          COALESCE(
            NULLIF(trim("slug"), ''),
            NULLIF(trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g')), ''),
            'category'
          ) AS base_slug,
          "created_at"
        FROM "product_categories"
      ),
      ranked AS (
        SELECT
          "id",
          base_slug,
          row_number() OVER (
            PARTITION BY "business_id", base_slug
            ORDER BY "created_at" ASC, "id" ASC
          ) AS duplicate_rank
        FROM source
      )
      UPDATE "product_categories" category
      SET "slug" = CASE
        WHEN ranked.duplicate_rank = 1 THEN ranked.base_slug
        ELSE ranked.base_slug || '-' || ranked.duplicate_rank
      END
      FROM ranked
      WHERE category."id" = ranked."id"
        AND (category."slug" IS NULL OR trim(category."slug") = '')
    `)

    await queryRunner.query(`
      UPDATE "product_categories"
      SET
        "is_active" = COALESCE("is_active", true),
        "sort_order" = COALESCE("sort_order", 0)
    `)

    await queryRunner.query(`
      WITH ranked AS (
        SELECT
          "id",
          "slug",
          row_number() OVER (
            PARTITION BY "business_id", "slug"
            ORDER BY "created_at" ASC, "id" ASC
          ) AS duplicate_rank
        FROM "product_categories"
      )
      UPDATE "product_categories" category
      SET "slug" = left(ranked."slug", 91) || '-' || left(category."id"::text, 8)
      FROM ranked
      WHERE category."id" = ranked."id"
        AND ranked.duplicate_rank > 1
    `)

    await queryRunner.query(`
      ALTER TABLE "product_categories"
      ALTER COLUMN "is_active" SET DEFAULT true,
      ALTER COLUMN "is_active" SET NOT NULL,
      ALTER COLUMN "sort_order" SET DEFAULT 0,
      ALTER COLUMN "sort_order" SET NOT NULL,
      ALTER COLUMN "slug" SET NOT NULL
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "unq_product_categories_business_id_slug"
      ON "product_categories" ("business_id", "slug")
    `)

    await queryRunner.query(`
      ALTER TABLE "unit_of_measures"
      ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "is_active" boolean
    `)

    await queryRunner.query(`
      UPDATE "unit_of_measures"
      SET
        "updated_at" = COALESCE("updated_at", "created_at", now()),
        "is_active" = COALESCE("is_active", true)
    `)

    await queryRunner.query(`
      ALTER TABLE "unit_of_measures"
      ALTER COLUMN "updated_at" SET DEFAULT now(),
      ALTER COLUMN "updated_at" SET NOT NULL,
      ALTER COLUMN "is_active" SET DEFAULT true,
      ALTER COLUMN "is_active" SET NOT NULL
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_unit_of_measures_business_id"
      ON "unit_of_measures" ("business_id")
    `)
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
    await queryRunner.query(`ALTER TABLE "unit_of_measures" DROP COLUMN IF EXISTS "is_active"`)
    await queryRunner.query(`ALTER TABLE "unit_of_measures" DROP COLUMN IF EXISTS "deleted_at"`)
    await queryRunner.query(`ALTER TABLE "unit_of_measures" DROP COLUMN IF EXISTS "updated_at"`)
    await queryRunner.query(`ALTER TABLE "product_categories" DROP COLUMN IF EXISTS "is_active"`)
  }
}
