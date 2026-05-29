import type { MigrationInterface, QueryRunner } from 'typeorm'

export class NotificationProvider1779400000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Extend the type enum with the new marketing value
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'marketing'`,
    )

    // Add the provider column (stores service name, e.g. 'resend', 'africas_talking', 'meta')
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "provider" character varying(100)`,
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN IF EXISTS "provider"`)
    // Postgres does not support removing enum values; the type remains extended
  }
}
