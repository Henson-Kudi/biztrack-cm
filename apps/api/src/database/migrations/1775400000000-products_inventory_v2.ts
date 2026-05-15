import { MigrationInterface, QueryRunner } from 'typeorm'

export class ProductsInventoryV21775400000000 implements MigrationInterface {
  name = 'ProductsInventoryV21775400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'unit_of_measures_type_enum') THEN
          CREATE TYPE "public"."unit_of_measures_type_enum" AS ENUM('QUANTITY', 'WEIGHT', 'VOLUME', 'LENGTH', 'CUSTOM');
        END IF;
      END $$;
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "unit_of_measures" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "business_id" uuid,
        "name" character varying(50) NOT NULL,
        "abbreviation" character varying(10) NOT NULL,
        "type" "public"."unit_of_measures_type_enum" NOT NULL,
        "is_default" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_unit_of_measures_id" PRIMARY KEY ("id")
      )
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
    await queryRunner.query(`
      ALTER TABLE "unit_of_measures"
      ADD CONSTRAINT "fk_unit_of_measures_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      INSERT INTO "unit_of_measures" ("name", "abbreviation", "type", "is_default")
      VALUES
        ('Piece', 'pcs', 'QUANTITY', true),
        ('Kilogram', 'kg', 'WEIGHT', true),
        ('Liter', 'L', 'VOLUME', true),
        ('Meter', 'm', 'LENGTH', true),
        ('Service', 'svc', 'CUSTOM', true),
        ('Box', 'box', 'QUANTITY', true),
        ('Packet', 'pkt', 'QUANTITY', true),
        ('Bottle', 'btl', 'QUANTITY', true),
        ('Sachet', 'sch', 'QUANTITY', true)
      ON CONFLICT DO NOTHING
    `)

    await queryRunner.query(`
      ALTER TABLE "product_categories"
      ADD COLUMN IF NOT EXISTS "slug" character varying(100),
      ADD COLUMN IF NOT EXISTS "color" character varying(7),
      ADD COLUMN IF NOT EXISTS "icon" character varying(50),
      ADD COLUMN IF NOT EXISTS "image_url" character varying(500),
      ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0
    `)
    await queryRunner.query(`
      UPDATE "product_categories"
      SET "slug" = trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'))
      WHERE "slug" IS NULL
    `)
    await queryRunner.query(`
      ALTER TABLE "product_categories"
      ALTER COLUMN "slug" SET NOT NULL
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "unq_product_categories_business_id_slug"
      ON "product_categories" ("business_id", "slug")
    `)

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "slug" character varying(220),
      ADD COLUMN IF NOT EXISTS "barcode_type" character varying(50),
      ADD COLUMN IF NOT EXISTS "is_barcode_generated" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "currency" character varying(10) NOT NULL DEFAULT 'XAF',
      ADD COLUMN IF NOT EXISTS "tax_rate" numeric(5,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "is_service" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "track_inventory" boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "created_by" uuid,
      ADD COLUMN IF NOT EXISTS "unit_of_measure_id" uuid
    `)
    await queryRunner.query(`
      UPDATE "products"
      SET "slug" = trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'))
      WHERE "slug" IS NULL
    `)
    await queryRunner.query(`
      UPDATE "products" p
      SET "unit_of_measure_id" = uom.id
      FROM "unit_of_measures" uom
      WHERE p."unit_of_measure_id" IS NULL
        AND uom."business_id" IS NULL
        AND (
          (lower(coalesce(p."unit", 'piece')) IN ('piece', 'pcs') AND uom."name" = 'Piece')
          OR (lower(coalesce(p."unit", '')) IN ('kg', 'kilogram') AND uom."name" = 'Kilogram')
          OR (lower(coalesce(p."unit", '')) IN ('litre', 'l') AND uom."name" = 'Litre')
          OR (lower(coalesce(p."unit", '')) IN ('metre', 'm') AND uom."name" = 'Metre')
          OR (lower(coalesce(p."unit", '')) IN ('box') AND uom."name" = 'Box')
          OR (lower(coalesce(p."unit", '')) IN ('pack', 'packet') AND uom."name" = 'Packet')
          OR (lower(coalesce(p."unit", '')) IN ('bottle') AND uom."name" = 'Bottle')
          OR (lower(coalesce(p."unit", '')) IN ('sachet') AND uom."name" = 'Sachet')
        )
    `)
    await queryRunner.query(`
      UPDATE "products" p
      SET "unit_of_measure_id" = uom.id
      FROM "unit_of_measures" uom
      WHERE p."unit_of_measure_id" IS NULL
        AND uom."business_id" IS NULL
        AND uom."name" = 'Piece'
    `)
    await queryRunner.query(`
      ALTER TABLE "products"
      ALTER COLUMN "slug" SET NOT NULL
    `)
    await queryRunner.query(`
      ALTER TABLE "products"
      ALTER COLUMN "unit_of_measure_id" SET NOT NULL
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "unq_products_business_id_slug"
      ON "products" ("business_id", "slug")
    `)
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD CONSTRAINT "fk_products_created_by"
      FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `).catch(() => undefined)
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD CONSTRAINT "fk_products_unit_of_measure_id"
      FOREIGN KEY ("unit_of_measure_id") REFERENCES "unit_of_measures"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_images" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "url" character varying(500) NOT NULL,
        "alt_text" character varying(200),
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_images_id" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "product_images"
      ADD CONSTRAINT "fk_product_images_product_id"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "inventory_levels" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "business_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "quantity" numeric(12,3) NOT NULL DEFAULT 0,
        "low_stock_threshold" numeric(12,3),
        "reorder_point" numeric(12,3),
        "last_restock_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_inventory_levels_id" PRIMARY KEY ("id"),
        CONSTRAINT "unq_inventory_levels_business_id_product_id" UNIQUE ("business_id", "product_id")
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_inventory_levels_business_id"
      ON "inventory_levels" ("business_id")
    `)
    await queryRunner.query(`
      ALTER TABLE "inventory_levels"
      ADD CONSTRAINT "fk_inventory_levels_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)
    await queryRunner.query(`
      ALTER TABLE "inventory_levels"
      ADD CONSTRAINT "fk_inventory_levels_product_id"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      INSERT INTO "inventory_levels" (
        "business_id",
        "product_id",
        "quantity",
        "low_stock_threshold"
      )
      SELECT
        p."business_id",
        p."id",
        COALESCE(p."stock_quantity", 0)::numeric(12,3),
        COALESCE(p."low_stock_threshold", 5)::numeric(12,3)
      FROM "products" p
      WHERE p."deleted_at" IS NULL
        AND p."track_inventory" = true
      ON CONFLICT ("business_id", "product_id") DO NOTHING
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "inventory_movements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "business_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "type" character varying NOT NULL,
        "quantity_change" numeric(12,3) NOT NULL,
        "quantity_before" numeric(12,3) NOT NULL,
        "quantity_after" numeric(12,3) NOT NULL,
        "reference_type" character varying(50),
        "reference_id" uuid,
        "notes" text,
        "performed_by" uuid,
        CONSTRAINT "PK_inventory_movements_id" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_inventory_movements_business_id_product_id"
      ON "inventory_movements" ("business_id", "product_id")
    `)
    await queryRunner.query(`
      ALTER TABLE "inventory_movements"
      ADD CONSTRAINT "fk_inventory_movements_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)
    await queryRunner.query(`
      ALTER TABLE "inventory_movements"
      ADD CONSTRAINT "fk_inventory_movements_product_id"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)
    await queryRunner.query(`
      ALTER TABLE "inventory_movements"
      ADD CONSTRAINT "fk_inventory_movements_performed_by"
      FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      INSERT INTO "inventory_movements" (
        "business_id",
        "product_id",
        "type",
        "quantity_change",
        "quantity_before",
        "quantity_after",
        "reference_type",
        "reference_id",
        "notes",
        "performed_by"
      )
      SELECT
        p."business_id",
        p."id",
        'OPENING_STOCK',
        p."stock_quantity"::numeric(12,3),
        0,
        p."stock_quantity"::numeric(12,3),
        'migration',
        p."id",
        'Backfilled from legacy stock quantity during products/inventory v2 migration',
        p."created_by"
      FROM "products" p
      WHERE COALESCE(p."stock_quantity", 0) > 0
        AND p."deleted_at" IS NULL
        AND p."track_inventory" = true
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "restock_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "business_id" uuid NOT NULL,
        "reference_number" character varying(100),
        "supplier_name" character varying(200),
        "total_cost" numeric(12,2),
        "notes" text,
        "performed_by" uuid,
        CONSTRAINT "PK_restock_records_id" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_restock_records_business_id"
      ON "restock_records" ("business_id")
    `)
    await queryRunner.query(`
      ALTER TABLE "restock_records"
      ADD CONSTRAINT "fk_restock_records_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)
    await queryRunner.query(`
      ALTER TABLE "restock_records"
      ADD CONSTRAINT "fk_restock_records_performed_by"
      FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "restock_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "restock_record_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "quantity" numeric(12,3) NOT NULL,
        "unit_cost" numeric(12,2),
        CONSTRAINT "PK_restock_items_id" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "restock_items"
      ADD CONSTRAINT "fk_restock_items_restock_record_id"
      FOREIGN KEY ("restock_record_id") REFERENCES "restock_records"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)
    await queryRunner.query(`
      ALTER TABLE "restock_items"
      ADD CONSTRAINT "fk_restock_items_product_id"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "restock_items" DROP CONSTRAINT IF EXISTS "fk_restock_items_product_id"`)
    await queryRunner.query(`ALTER TABLE "restock_items" DROP CONSTRAINT IF EXISTS "fk_restock_items_restock_record_id"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "restock_items"`)

    await queryRunner.query(`ALTER TABLE "restock_records" DROP CONSTRAINT IF EXISTS "fk_restock_records_performed_by"`)
    await queryRunner.query(`ALTER TABLE "restock_records" DROP CONSTRAINT IF EXISTS "fk_restock_records_business_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_restock_records_business_id"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "restock_records"`)

    await queryRunner.query(`ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "fk_inventory_movements_performed_by"`)
    await queryRunner.query(`ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "fk_inventory_movements_product_id"`)
    await queryRunner.query(`ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "fk_inventory_movements_business_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_inventory_movements_business_id_product_id"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_movements"`)

    await queryRunner.query(`ALTER TABLE "inventory_levels" DROP CONSTRAINT IF EXISTS "fk_inventory_levels_product_id"`)
    await queryRunner.query(`ALTER TABLE "inventory_levels" DROP CONSTRAINT IF EXISTS "fk_inventory_levels_business_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_inventory_levels_business_id"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_levels"`)

    await queryRunner.query(`ALTER TABLE "product_images" DROP CONSTRAINT IF EXISTS "fk_product_images_product_id"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "product_images"`)

    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "fk_products_unit_of_measure_id"`)
    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "fk_products_created_by"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "unq_products_business_id_slug"`)
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "unit_of_measure_id"`)
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "created_by"`)
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "track_inventory"`)
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "is_service"`)
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "tax_rate"`)
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "currency"`)
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "is_barcode_generated"`)
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "barcode_type"`)
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "slug"`)

    await queryRunner.query(`DROP INDEX IF EXISTS "unq_product_categories_business_id_slug"`)
    await queryRunner.query(`ALTER TABLE "product_categories" DROP COLUMN IF EXISTS "sort_order"`)
    await queryRunner.query(`ALTER TABLE "product_categories" DROP COLUMN IF EXISTS "image_url"`)
    await queryRunner.query(`ALTER TABLE "product_categories" DROP COLUMN IF EXISTS "icon"`)
    await queryRunner.query(`ALTER TABLE "product_categories" DROP COLUMN IF EXISTS "color"`)
    await queryRunner.query(`ALTER TABLE "product_categories" DROP COLUMN IF EXISTS "slug"`)

    await queryRunner.query(`ALTER TABLE "unit_of_measures" DROP CONSTRAINT IF EXISTS "fk_unit_of_measures_business_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "unq_unit_of_measures_business_id_name"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "unq_unit_of_measures_default_name"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_unit_of_measures_business_id"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "unit_of_measures"`)
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."unit_of_measures_type_enum"`)
  }
}
