import { MigrationInterface, QueryRunner } from 'typeorm'

export class Notifications1777900000000 implements MigrationInterface {
  name = 'Notifications1777900000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "notification_channel_enum" AS ENUM ('email', 'sms', 'whatsapp')
    `)

    await queryRunner.query(`
      CREATE TYPE "notification_type_enum" AS ENUM ('invite', 'otp', 'payment_reminder')
    `)

    await queryRunner.query(`
      CREATE TYPE "notification_status_enum" AS ENUM ('pending', 'queued', 'sent', 'delivered', 'failed')
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "business_id" uuid,
        "user_id" uuid,
        "channel" "notification_channel_enum" NOT NULL,
        "type" "notification_type_enum" NOT NULL,
        "recipient" character varying(320) NOT NULL,
        "subject" character varying(500),
        "body" text NOT NULL,
        "metadata" jsonb,
        "status" "notification_status_enum" NOT NULL DEFAULT 'pending',
        "provider_message_id" character varying(255),
        "attempts" integer NOT NULL DEFAULT 0,
        "sent_at" TIMESTAMP WITH TIME ZONE,
        "failed_at" TIMESTAMP WITH TIME ZONE,
        "failure_reason" text,
        CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_notifications_status"
      ON "notifications" ("status")
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_notifications_provider_message_id"
      ON "notifications" ("provider_message_id")
      WHERE provider_message_id IS NOT NULL
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_notifications_business_id"
      ON "notifications" ("business_id")
      WHERE business_id IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_notifications_business_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_notifications_provider_message_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_notifications_status"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`)
    await queryRunner.query(`DROP TYPE IF EXISTS "notification_status_enum"`)
    await queryRunner.query(`DROP TYPE IF EXISTS "notification_type_enum"`)
    await queryRunner.query(`DROP TYPE IF EXISTS "notification_channel_enum"`)
  }
}
