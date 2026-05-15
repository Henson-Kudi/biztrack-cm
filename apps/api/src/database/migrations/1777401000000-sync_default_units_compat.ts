import { MigrationInterface, QueryRunner } from 'typeorm'

export class SyncDefaultUnitsCompat1777401000000 implements MigrationInterface {
  name = 'SyncDefaultUnitsCompat1777401000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "unit_of_measures"
      SET
        "name" = 'Liter',
        "abbreviation" = 'L',
        "is_default" = true,
        "is_active" = true,
        "updated_at" = now()
      WHERE "business_id" IS NULL
        AND lower("name") = 'litre'
        AND "type" = 'VOLUME'
        AND NOT EXISTS (
          SELECT 1
          FROM "unit_of_measures" existing
          WHERE existing."business_id" IS NULL
            AND lower(existing."name") = 'liter'
            AND existing."type" = 'VOLUME'
        )
    `)

    await queryRunner.query(`
      UPDATE "unit_of_measures"
      SET
        "name" = 'Meter',
        "abbreviation" = 'm',
        "is_default" = true,
        "is_active" = true,
        "updated_at" = now()
      WHERE "business_id" IS NULL
        AND lower("name") = 'metre'
        AND "type" = 'LENGTH'
        AND NOT EXISTS (
          SELECT 1
          FROM "unit_of_measures" existing
          WHERE existing."business_id" IS NULL
            AND lower(existing."name") = 'meter'
            AND existing."type" = 'LENGTH'
        )
    `)

    await queryRunner.query(`
      UPDATE "unit_of_measures"
      SET
        "abbreviation" = 'svc',
        "is_default" = true,
        "is_active" = true,
        "updated_at" = now()
      WHERE "business_id" IS NULL
        AND lower("name") = 'service'
        AND "type" = 'CUSTOM'
    `)

    await queryRunner.query(`
      INSERT INTO "unit_of_measures" (
        "id",
        "created_at",
        "updated_at",
        "business_id",
        "name",
        "abbreviation",
        "type",
        "is_default",
        "is_active"
      )
      SELECT
        uuid_generate_v4(),
        now(),
        now(),
        NULL,
        'Service',
        'svc',
        'CUSTOM',
        true,
        true
      WHERE NOT EXISTS (
        SELECT 1
        FROM "unit_of_measures"
        WHERE "business_id" IS NULL
          AND (
            lower("name") = 'service'
            OR lower(COALESCE("abbreviation", '')) = 'svc'
          )
          AND "type" = 'CUSTOM'
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "unit_of_measures"
      WHERE "business_id" IS NULL
        AND lower("name") = 'service'
        AND lower(COALESCE("abbreviation", '')) = 'svc'
        AND "type" = 'CUSTOM'
    `)

    await queryRunner.query(`
      UPDATE "unit_of_measures"
      SET
        "name" = 'Litre',
        "updated_at" = now()
      WHERE "business_id" IS NULL
        AND lower("name") = 'liter'
        AND "type" = 'VOLUME'
    `)

    await queryRunner.query(`
      UPDATE "unit_of_measures"
      SET
        "name" = 'Metre',
        "updated_at" = now()
      WHERE "business_id" IS NULL
        AND lower("name") = 'meter'
        AND "type" = 'LENGTH'
    `)
  }
}
