import { MigrationInterface, QueryRunner } from 'typeorm'

const SYSTEM_EXPENSE_CATEGORY_IDS = {
  RENT: '11111111-1111-4111-8111-111111111111',
  SALARIES: '22222222-2222-4222-8222-222222222222',
  UTILITIES: '33333333-3333-4333-8333-333333333333',
  TRANSPORT: '44444444-4444-4444-8444-444444444444',
  MAINTENANCE: '55555555-5555-4555-8555-555555555555',
  MISC: '66666666-6666-4666-8666-666666666666',
} as const

export class ExpensesV21777100000000 implements MigrationInterface {
  name = 'ExpensesV21777100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "expense_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "business_id" uuid,
        "name" character varying(100) NOT NULL,
        "slug" character varying(110) NOT NULL,
        "color" character varying(7) NOT NULL,
        "icon" character varying(50),
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_expense_categories_id" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_expense_categories_business_id"
      ON "expense_categories" ("business_id")
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "unq_expense_categories_system_slug"
      ON "expense_categories" ("slug")
      WHERE "business_id" IS NULL AND "deleted_at" IS NULL
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "unq_expense_categories_business_slug"
      ON "expense_categories" ("business_id", "slug")
      WHERE "business_id" IS NOT NULL AND "deleted_at" IS NULL
    `)

    await queryRunner.query(`
      ALTER TABLE "expense_categories"
      ADD CONSTRAINT "fk_expense_categories_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "monthly_expense_summaries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "summary_year" integer NOT NULL,
        "summary_month" integer NOT NULL,
        "total_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "category_breakdown" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "expense_count" integer NOT NULL DEFAULT 0,
        "recurring_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_monthly_expense_summaries_id" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "unq_monthly_expense_summaries_business_id_year_month"
      ON "monthly_expense_summaries" ("business_id", "summary_year", "summary_month")
    `)

    await queryRunner.query(`
      ALTER TABLE "monthly_expense_summaries"
      ADD CONSTRAINT "fk_monthly_expense_summaries_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      ALTER TABLE "expenses"
      ADD COLUMN IF NOT EXISTS "category_id" uuid,
      ADD COLUMN IF NOT EXISTS "currency" character varying(10) NOT NULL DEFAULT 'XAF',
      ADD COLUMN IF NOT EXISTS "vendor" character varying(200),
      ADD COLUMN IF NOT EXISTS "notes" text,
      ADD COLUMN IF NOT EXISTS "is_recurring" boolean NOT NULL DEFAULT false
    `)

    await queryRunner.query(`
      ALTER TABLE "expenses"
      ALTER COLUMN "date" TYPE date
      USING COALESCE("date"::date, "created_at"::date)
    `)

    await queryRunner.query(`
      INSERT INTO "expense_categories" ("id", "business_id", "name", "slug", "color", "icon", "sort_order")
      SELECT '${SYSTEM_EXPENSE_CATEGORY_IDS.RENT}', NULL, 'Loyer', 'loyer', '#378ADD', NULL, 1
      WHERE NOT EXISTS (
        SELECT 1 FROM "expense_categories" WHERE "slug" = 'loyer' AND "business_id" IS NULL
      )
    `)

    await queryRunner.query(`
      INSERT INTO "expense_categories" ("id", "business_id", "name", "slug", "color", "icon", "sort_order")
      SELECT '${SYSTEM_EXPENSE_CATEGORY_IDS.SALARIES}', NULL, 'Salaires', 'salaires', '#1D9E75', NULL, 2
      WHERE NOT EXISTS (
        SELECT 1 FROM "expense_categories" WHERE "slug" = 'salaires' AND "business_id" IS NULL
      )
    `)

    await queryRunner.query(`
      INSERT INTO "expense_categories" ("id", "business_id", "name", "slug", "color", "icon", "sort_order")
      SELECT '${SYSTEM_EXPENSE_CATEGORY_IDS.UTILITIES}', NULL, 'Électricité & Eau', 'electricite-eau', '#EF9F27', NULL, 3
      WHERE NOT EXISTS (
        SELECT 1 FROM "expense_categories" WHERE "slug" = 'electricite-eau' AND "business_id" IS NULL
      )
    `)

    await queryRunner.query(`
      INSERT INTO "expense_categories" ("id", "business_id", "name", "slug", "color", "icon", "sort_order")
      SELECT '${SYSTEM_EXPENSE_CATEGORY_IDS.TRANSPORT}', NULL, 'Transport', 'transport', '#D85A30', NULL, 4
      WHERE NOT EXISTS (
        SELECT 1 FROM "expense_categories" WHERE "slug" = 'transport' AND "business_id" IS NULL
      )
    `)

    await queryRunner.query(`
      INSERT INTO "expense_categories" ("id", "business_id", "name", "slug", "color", "icon", "sort_order")
      SELECT '${SYSTEM_EXPENSE_CATEGORY_IDS.MAINTENANCE}', NULL, 'Entretien', 'entretien', '#7F77DD', NULL, 5
      WHERE NOT EXISTS (
        SELECT 1 FROM "expense_categories" WHERE "slug" = 'entretien' AND "business_id" IS NULL
      )
    `)

    await queryRunner.query(`
      INSERT INTO "expense_categories" ("id", "business_id", "name", "slug", "color", "icon", "sort_order")
      SELECT '${SYSTEM_EXPENSE_CATEGORY_IDS.MISC}', NULL, 'Divers', 'divers', '#888780', NULL, 6
      WHERE NOT EXISTS (
        SELECT 1 FROM "expense_categories" WHERE "slug" = 'divers' AND "business_id" IS NULL
      )
    `)

    await queryRunner.query(`
      UPDATE "expenses"
      SET "currency" = COALESCE(NULLIF("currency", ''), 'XAF'),
          "is_recurring" = COALESCE("is_recurring", false)
    `)

    await queryRunner.query(`
      UPDATE "expenses"
      SET "category_id" = CASE
        WHEN lower(COALESCE("category", '')) IN ('loyer', 'rent') THEN '${SYSTEM_EXPENSE_CATEGORY_IDS.RENT}'::uuid
        WHEN lower(COALESCE("category", '')) IN ('salaires', 'salaire', 'salary', 'wages') THEN '${SYSTEM_EXPENSE_CATEGORY_IDS.SALARIES}'::uuid
        WHEN lower(COALESCE("category", '')) IN (
          'électricité & eau',
          'electricite & eau',
          'électricité / eau',
          'electricite / eau',
          'electricite-eau',
          'electricite eau',
          'electricite',
          'électricité',
          'utilities',
          'utility',
          'water',
          'eau'
        ) THEN '${SYSTEM_EXPENSE_CATEGORY_IDS.UTILITIES}'::uuid
        WHEN lower(COALESCE("category", '')) IN ('transport', 'livraison', 'delivery') THEN '${SYSTEM_EXPENSE_CATEGORY_IDS.TRANSPORT}'::uuid
        WHEN lower(COALESCE("category", '')) IN ('entretien', 'maintenance', 'repair', 'reparation', 'réparation') THEN '${SYSTEM_EXPENSE_CATEGORY_IDS.MAINTENANCE}'::uuid
        ELSE '${SYSTEM_EXPENSE_CATEGORY_IDS.MISC}'::uuid
      END
      WHERE "category_id" IS NULL
    `)

    await queryRunner.query(`
      ALTER TABLE "expenses"
      ALTER COLUMN "category_id" SET NOT NULL,
      ALTER COLUMN "currency" SET NOT NULL,
      ALTER COLUMN "is_recurring" SET NOT NULL
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_expenses_business_id_category_id"
      ON "expenses" ("business_id", "category_id")
    `)

    await queryRunner.query(`
      ALTER TABLE "expenses"
      ADD CONSTRAINT "fk_expenses_category_id"
      FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      ALTER TABLE "expenses"
      DROP COLUMN IF EXISTS "category"
    `)

    await queryRunner.query(`
      WITH monthly_source AS (
        SELECT
          e."business_id" AS business_id,
          EXTRACT(YEAR FROM e."date")::int AS summary_year,
          EXTRACT(MONTH FROM e."date")::int AS summary_month,
          c."slug" AS slug,
          SUM(e."amount")::numeric(14,2) AS category_total,
          COUNT(e."id")::int AS category_count,
          SUM(CASE WHEN e."is_recurring" = true THEN e."amount" ELSE 0 END)::numeric(14,2) AS category_recurring
        FROM "expenses" e
        INNER JOIN "expense_categories" c
          ON c."id" = e."category_id"
        WHERE e."deleted_at" IS NULL
        GROUP BY
          e."business_id",
          EXTRACT(YEAR FROM e."date"),
          EXTRACT(MONTH FROM e."date"),
          c."slug"
      ),
      monthly_rollup AS (
        SELECT
          business_id,
          summary_year,
          summary_month,
          SUM(category_total)::numeric(14,2) AS total_amount,
          SUM(category_count)::int AS expense_count,
          SUM(category_recurring)::numeric(14,2) AS recurring_amount,
          jsonb_object_agg(slug, category_total) AS category_breakdown
        FROM monthly_source
        GROUP BY business_id, summary_year, summary_month
      )
      INSERT INTO "monthly_expense_summaries" (
        "business_id",
        "summary_year",
        "summary_month",
        "total_amount",
        "category_breakdown",
        "expense_count",
        "recurring_amount"
      )
      SELECT
        business_id,
        summary_year,
        summary_month,
        total_amount,
        category_breakdown,
        expense_count,
        recurring_amount
      FROM monthly_rollup
      ON CONFLICT ("business_id", "summary_year", "summary_month")
      DO UPDATE SET
        "total_amount" = EXCLUDED."total_amount",
        "category_breakdown" = EXCLUDED."category_breakdown",
        "expense_count" = EXCLUDED."expense_count",
        "recurring_amount" = EXCLUDED."recurring_amount",
        "updated_at" = now()
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "expenses"
      DROP CONSTRAINT IF EXISTS "fk_expenses_category_id"
    `)

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_expenses_business_id_category_id"
    `)

    await queryRunner.query(`
      ALTER TABLE "expenses"
      ADD COLUMN IF NOT EXISTS "category" character varying
    `)

    await queryRunner.query(`
      UPDATE "expenses" expense
      SET "category" = COALESCE(category_lookup."name", expense."category", 'Divers')
      FROM "expense_categories" category_lookup
      WHERE category_lookup."id" = expense."category_id"
        AND (expense."category" IS NULL OR trim(expense."category") = '')
    `)

    await queryRunner.query(`
      UPDATE "expenses"
      SET "category" = COALESCE("category", 'Divers')
      WHERE "category" IS NULL OR trim("category") = ''
    `)

    await queryRunner.query(`
      ALTER TABLE "expenses"
      ALTER COLUMN "category" SET NOT NULL
    `)

    await queryRunner.query(`
      ALTER TABLE "expenses"
      DROP COLUMN IF EXISTS "category_id",
      DROP COLUMN IF EXISTS "currency",
      DROP COLUMN IF EXISTS "vendor",
      DROP COLUMN IF EXISTS "notes",
      DROP COLUMN IF EXISTS "is_recurring",
      ALTER COLUMN "date" TYPE TIMESTAMP WITH TIME ZONE
      USING "date"::timestamptz
    `)

    await queryRunner.query(`
      ALTER TABLE "monthly_expense_summaries"
      DROP CONSTRAINT IF EXISTS "fk_monthly_expense_summaries_business_id"
    `)
    await queryRunner.query(`
      DROP INDEX IF EXISTS "unq_monthly_expense_summaries_business_id_year_month"
    `)
    await queryRunner.query(`
      DROP TABLE IF EXISTS "monthly_expense_summaries"
    `)

    await queryRunner.query(`
      ALTER TABLE "expense_categories"
      DROP CONSTRAINT IF EXISTS "fk_expense_categories_business_id"
    `)
    await queryRunner.query(`
      DROP INDEX IF EXISTS "unq_expense_categories_business_slug"
    `)
    await queryRunner.query(`
      DROP INDEX IF EXISTS "unq_expense_categories_system_slug"
    `)
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_expense_categories_business_id"
    `)
    await queryRunner.query(`
      DROP TABLE IF EXISTS "expense_categories"
    `)
  }
}
