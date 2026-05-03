import { MigrationInterface, QueryRunner } from 'typeorm'

export class SalesV21775610000000 implements MigrationInterface {
  name = 'SalesV21775610000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'sales' AND column_name = 'receipt_number'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'sales' AND column_name = 'sale_number'
        ) THEN
          ALTER TABLE "sales" RENAME COLUMN "receipt_number" TO "sale_number";
        END IF;
      END $$;
    `)

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'sales' AND column_name = 'total_amount'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'sales' AND column_name = 'subtotal'
        ) THEN
          ALTER TABLE "sales" RENAME COLUMN "total_amount" TO "subtotal";
        END IF;
      END $$;
    `)

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'sales' AND column_name = 'net_amount'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'sales' AND column_name = 'total_amount'
        ) THEN
          ALTER TABLE "sales" RENAME COLUMN "net_amount" TO "total_amount";
        END IF;
      END $$;
    `)

    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD COLUMN IF NOT EXISTS "client_id" uuid,
      ADD COLUMN IF NOT EXISTS "amount_paid" numeric(12,2),
      ADD COLUMN IF NOT EXISTS "change_given" numeric(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "customer_name" character varying(200),
      ADD COLUMN IF NOT EXISTS "customer_phone" character varying(30),
      ADD COLUMN IF NOT EXISTS "price_drift_warning" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "sale_date" date,
      ADD COLUMN IF NOT EXISTS "sold_at" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "synced_at" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "voided_at" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "voided_by" uuid,
      ADD COLUMN IF NOT EXISTS "void_reason" text
    `)

    await queryRunner.query(`
      ALTER TABLE "sales"
      ALTER COLUMN "notes" TYPE text
    `)

    await queryRunner.query(`
      UPDATE "sales"
      SET
        "client_id" = COALESCE("client_id", uuid_generate_v4()),
        "subtotal" = COALESCE("subtotal", "total_amount", 0),
        "total_amount" = COALESCE("total_amount", "subtotal", 0),
        "amount_paid" = COALESCE("amount_paid", "total_amount", 0),
        "change_given" = COALESCE("change_given", 0),
        "sold_at" = COALESCE("sold_at", "created_at"),
        "sale_date" = COALESCE("sale_date", COALESCE("sold_at", "created_at")::date),
        "synced_at" = COALESCE("synced_at", "created_at"),
        "sale_number" = COALESCE(
          NULLIF("sale_number", ''),
          'VTE-' || to_char(COALESCE("sold_at", "created_at"), 'YYYYMMDD') || '-' ||
            upper(substr(replace("id"::text, '-', ''), 1, 6))
        )
    `)

    await queryRunner.query(`
      ALTER TABLE "sales"
      ALTER COLUMN "client_id" SET NOT NULL,
      ALTER COLUMN "sale_number" SET NOT NULL,
      ALTER COLUMN "subtotal" SET NOT NULL,
      ALTER COLUMN "total_amount" SET NOT NULL,
      ALTER COLUMN "amount_paid" SET NOT NULL,
      ALTER COLUMN "sold_at" SET NOT NULL,
      ALTER COLUMN "sale_date" SET NOT NULL
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "unq_sales_business_id_client_id"
      ON "sales" ("business_id", "client_id")
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "unq_sales_business_id_sale_number"
      ON "sales" ("business_id", "sale_number")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sales_business_id_sale_date"
      ON "sales" ("business_id", "sale_date")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sales_business_id_status"
      ON "sales" ("business_id", "status")
    `)
    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD CONSTRAINT "fk_sales_voided_by"
      FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      ALTER TABLE "sale_items"
      ADD COLUMN IF NOT EXISTS "business_id" uuid,
      ADD COLUMN IF NOT EXISTS "product_sku" character varying(100),
      ADD COLUMN IF NOT EXISTS "unit_of_measure" character varying(50),
      ADD COLUMN IF NOT EXISTS "discount_amount" numeric(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "line_total" numeric(12,2),
      ADD COLUMN IF NOT EXISTS "cost_price" numeric(12,2)
    `)

    await queryRunner.query(`
      UPDATE "sale_items" si
      SET
        "business_id" = s."business_id",
        "line_total" = COALESCE(si."line_total", si."total_price", 0)
      FROM "sales" s
      WHERE s."id" = si."sale_id"
        AND (si."business_id" IS NULL OR si."line_total" IS NULL)
    `)

    await queryRunner.query(`
      UPDATE "sale_items" si
      SET
        "product_sku" = COALESCE(si."product_sku", p."sku"),
        "unit_of_measure" = COALESCE(si."unit_of_measure", uom."abbreviation"),
        "cost_price" = COALESCE(si."cost_price", p."cost_price")
      FROM "products" p
      LEFT JOIN "unit_of_measures" uom
        ON uom."id" = p."unit_of_measure_id"
      WHERE p."id" = si."product_id"
    `)

    await queryRunner.query(`
      ALTER TABLE "sale_items"
      ALTER COLUMN "business_id" SET NOT NULL,
      ALTER COLUMN "line_total" SET NOT NULL
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sale_items_business_id"
      ON "sale_items" ("business_id")
    `)
    await queryRunner.query(`
      ALTER TABLE "sale_items"
      ADD CONSTRAINT "fk_sale_items_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sale_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "sale_id" uuid NOT NULL,
        "business_id" uuid NOT NULL,
        "method" character varying NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "mobile_money_reference" character varying(100),
        CONSTRAINT "PK_sale_payments_id" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sale_payments_sale_id"
      ON "sale_payments" ("sale_id")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sale_payments_business_id"
      ON "sale_payments" ("business_id")
    `)
    await queryRunner.query(`
      ALTER TABLE "sale_payments"
      ADD CONSTRAINT "fk_sale_payments_sale_id"
      FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)
    await queryRunner.query(`
      ALTER TABLE "sale_payments"
      ADD CONSTRAINT "fk_sale_payments_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      INSERT INTO "sale_payments" (
        "sale_id",
        "business_id",
        "method",
        "amount",
        "mobile_money_reference"
      )
      SELECT
        s."id",
        s."business_id",
        COALESCE(NULLIF(s."payment_method", ''), 'CASH'),
        COALESCE(s."amount_paid", s."total_amount", 0),
        s."momo_reference"
      FROM "sales" s
      WHERE NOT EXISTS (
        SELECT 1
        FROM "sale_payments" sp
        WHERE sp."sale_id" = s."id"
      )
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "daily_sale_summaries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "summary_date" date NOT NULL,
        "total_sales" integer NOT NULL DEFAULT 0,
        "total_revenue" numeric(14,2) NOT NULL DEFAULT 0,
        "total_cost" numeric(14,2) NOT NULL DEFAULT 0,
        "gross_profit" numeric(14,2) NOT NULL DEFAULT 0,
        "total_discounts" numeric(12,2) NOT NULL DEFAULT 0,
        "cash_collected" numeric(12,2) NOT NULL DEFAULT 0,
        "mtn_momo_collected" numeric(12,2) NOT NULL DEFAULT 0,
        "orange_money_collected" numeric(12,2) NOT NULL DEFAULT 0,
        "card_collected" numeric(12,2) NOT NULL DEFAULT 0,
        "voided_sales" integer NOT NULL DEFAULT 0,
        "voided_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_daily_sale_summaries_id" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "unq_daily_sale_summaries_business_id_summary_date"
      ON "daily_sale_summaries" ("business_id", "summary_date")
    `)
    await queryRunner.query(`
      ALTER TABLE "daily_sale_summaries"
      ADD CONSTRAINT "fk_daily_sale_summaries_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sale_number_sequences" (
        "business_id" uuid NOT NULL,
        "sale_date" date NOT NULL,
        "last_sequence" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_sale_number_sequences" PRIMARY KEY ("business_id", "sale_date")
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "sale_number_sequences"
      ADD CONSTRAINT "fk_sale_number_sequences_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      INSERT INTO "sale_number_sequences" ("business_id", "sale_date", "last_sequence")
      SELECT
        s."business_id",
        s."sale_date",
        GREATEST(
          COUNT(*)::integer,
          COALESCE(
            MAX(
              CASE
                WHEN s."sale_number" ~ '^VTE-[0-9]{8}-[0-9]+$'
                  THEN split_part(s."sale_number", '-', 3)::integer
                ELSE NULL
              END
            ),
            0
          )
        ) AS "last_sequence"
      FROM "sales" s
      GROUP BY s."business_id", s."sale_date"
      ON CONFLICT ("business_id", "sale_date") DO NOTHING
    `)

    await queryRunner.query(`
      WITH item_totals AS (
        SELECT
          si."sale_id",
          COALESCE(SUM(COALESCE(si."cost_price", 0) * si."quantity"), 0) AS "total_cost",
          COALESCE(SUM(COALESCE(si."discount_amount", 0)), 0) AS "line_discounts"
        FROM "sale_items" si
        GROUP BY si."sale_id"
      ),
      payment_totals AS (
        SELECT
          sp."sale_id",
          COALESCE(SUM(CASE WHEN sp."method" = 'CASH' THEN sp."amount" ELSE 0 END), 0) AS "cash_collected",
          COALESCE(SUM(CASE WHEN sp."method" = 'MTN_MOMO' THEN sp."amount" ELSE 0 END), 0) AS "mtn_momo_collected",
          COALESCE(SUM(CASE WHEN sp."method" = 'ORANGE_MONEY' THEN sp."amount" ELSE 0 END), 0) AS "orange_money_collected",
          COALESCE(SUM(CASE WHEN sp."method" = 'CARD' THEN sp."amount" ELSE 0 END), 0) AS "card_collected"
        FROM "sale_payments" sp
        GROUP BY sp."sale_id"
      )
      INSERT INTO "daily_sale_summaries" (
        "business_id",
        "summary_date",
        "total_sales",
        "total_revenue",
        "total_cost",
        "gross_profit",
        "total_discounts",
        "cash_collected",
        "mtn_momo_collected",
        "orange_money_collected",
        "card_collected",
        "voided_sales",
        "voided_amount",
        "updated_at"
      )
      SELECT
        s."business_id",
        s."sale_date",
        COUNT(*) FILTER (WHERE s."status" = 'COMPLETED')::integer,
        COALESCE(SUM(CASE WHEN s."status" = 'COMPLETED' THEN s."total_amount" ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN s."status" = 'COMPLETED' THEN COALESCE(it."total_cost", 0) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN s."status" = 'COMPLETED' THEN s."total_amount" - COALESCE(it."total_cost", 0) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN s."status" = 'COMPLETED' THEN s."discount_amount" + COALESCE(it."line_discounts", 0) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN s."status" = 'COMPLETED' THEN COALESCE(pt."cash_collected", 0) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN s."status" = 'COMPLETED' THEN COALESCE(pt."mtn_momo_collected", 0) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN s."status" = 'COMPLETED' THEN COALESCE(pt."orange_money_collected", 0) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN s."status" = 'COMPLETED' THEN COALESCE(pt."card_collected", 0) ELSE 0 END), 0),
        COUNT(*) FILTER (WHERE s."status" = 'VOIDED')::integer,
        COALESCE(SUM(CASE WHEN s."status" = 'VOIDED' THEN s."total_amount" ELSE 0 END), 0),
        now()
      FROM "sales" s
      LEFT JOIN item_totals it
        ON it."sale_id" = s."id"
      LEFT JOIN payment_totals pt
        ON pt."sale_id" = s."id"
      GROUP BY s."business_id", s."sale_date"
      ON CONFLICT ("business_id", "summary_date") DO NOTHING
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "unq_daily_sale_summaries_business_id_summary_date"`)
    await queryRunner.query(`ALTER TABLE "daily_sale_summaries" DROP CONSTRAINT IF EXISTS "fk_daily_sale_summaries_business_id"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "daily_sale_summaries"`)

    await queryRunner.query(`ALTER TABLE "sale_number_sequences" DROP CONSTRAINT IF EXISTS "fk_sale_number_sequences_business_id"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "sale_number_sequences"`)

    await queryRunner.query(`ALTER TABLE "sale_payments" DROP CONSTRAINT IF EXISTS "fk_sale_payments_business_id"`)
    await queryRunner.query(`ALTER TABLE "sale_payments" DROP CONSTRAINT IF EXISTS "fk_sale_payments_sale_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sale_payments_business_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sale_payments_sale_id"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "sale_payments"`)

    await queryRunner.query(`ALTER TABLE "sale_items" DROP CONSTRAINT IF EXISTS "fk_sale_items_business_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sale_items_business_id"`)
    await queryRunner.query(`ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "cost_price"`)
    await queryRunner.query(`ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "line_total"`)
    await queryRunner.query(`ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "discount_amount"`)
    await queryRunner.query(`ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "unit_of_measure"`)
    await queryRunner.query(`ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "product_sku"`)
    await queryRunner.query(`ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "business_id"`)

    await queryRunner.query(`ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "fk_sales_voided_by"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sales_business_id_status"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sales_business_id_sale_date"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "unq_sales_business_id_sale_number"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "unq_sales_business_id_client_id"`)
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "void_reason"`)
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "voided_by"`)
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "voided_at"`)
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "synced_at"`)
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "sold_at"`)
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "sale_date"`)
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "price_drift_warning"`)
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "customer_phone"`)
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "customer_name"`)
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "change_given"`)
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "amount_paid"`)
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "client_id"`)

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'sales' AND column_name = 'total_amount'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'sales' AND column_name = 'net_amount'
        ) THEN
          ALTER TABLE "sales" RENAME COLUMN "total_amount" TO "net_amount";
        END IF;
      END $$;
    `)

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'sales' AND column_name = 'subtotal'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'sales' AND column_name = 'total_amount'
        ) THEN
          ALTER TABLE "sales" RENAME COLUMN "subtotal" TO "total_amount";
        END IF;
      END $$;
    `)

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'sales' AND column_name = 'sale_number'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'sales' AND column_name = 'receipt_number'
        ) THEN
          ALTER TABLE "sales" RENAME COLUMN "sale_number" TO "receipt_number";
        END IF;
      END $$;
    `)
  }
}
