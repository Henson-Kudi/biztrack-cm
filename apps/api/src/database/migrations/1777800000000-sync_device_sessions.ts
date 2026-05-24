import { MigrationInterface, QueryRunner } from 'typeorm'

export class SyncDeviceSessions1777800000000 implements MigrationInterface {
  name = 'SyncDeviceSessions1777800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sync_device_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "token_id" character varying NOT NULL,
        "token_hash" character varying NOT NULL,
        "user_id" uuid NOT NULL,
        "business_id" uuid NOT NULL,
        "device_id" character varying(255) NOT NULL,
        "device_name" character varying(255),
        "platform" character varying(255),
        "app_version" character varying(64),
        "last_used_at" TIMESTAMP WITH TIME ZONE,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_sync_device_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_sync_device_sessions_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "unq_sync_device_sessions_token_id"
      ON "sync_device_sessions" ("token_id")
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sync_device_sessions_user_business_device"
      ON "sync_device_sessions" ("user_id", "business_id", "device_id")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sync_device_sessions_user_business_device"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "unq_sync_device_sessions_token_id"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "sync_device_sessions"`)
  }
}
