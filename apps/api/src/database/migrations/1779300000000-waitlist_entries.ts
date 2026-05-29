import { MigrationInterface, QueryRunner } from 'typeorm'

export class WaitlistEntries1779300000000 implements MigrationInterface {
  name = 'WaitlistEntries1779300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "waitlist_entry_status_enum" AS ENUM ('PENDING', 'CONTACTED', 'INSTALLED', 'DECLINED')
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "waitlist_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(200) NOT NULL,
        "email" character varying(300) NOT NULL,
        "phone" character varying(50) NOT NULL,
        "locale" character varying(5) NOT NULL DEFAULT 'fr',
        "utm_source" character varying(200),
        "utm_medium" character varying(200),
        "utm_campaign" character varying(200),
        "user_agent" character varying(500),
        "referrer" character varying(100),
        "status" "waitlist_entry_status_enum" NOT NULL DEFAULT 'PENDING',
        "notes" text,
        "is_duplicate" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_waitlist_entries_id" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_waitlist_entries_email"
      ON "waitlist_entries" ("email")
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_waitlist_entries_status"
      ON "waitlist_entries" ("status")
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_waitlist_entries_created_at"
      ON "waitlist_entries" ("created_at" DESC)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_waitlist_entries_created_at"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_waitlist_entries_status"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_waitlist_entries_email"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "waitlist_entries"`)
    await queryRunner.query(`DROP TYPE IF EXISTS "waitlist_entry_status_enum"`)
  }
}
