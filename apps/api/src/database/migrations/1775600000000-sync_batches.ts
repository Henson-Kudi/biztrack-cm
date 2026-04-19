import { MigrationInterface, QueryRunner } from 'typeorm'

export class SyncBatches1775600000000 implements MigrationInterface {
  name = 'SyncBatches1775600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sync_batches" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "business_id" uuid NOT NULL,
        "device_id" character varying NOT NULL,
        "base_cursor" TIMESTAMP WITH TIME ZONE,
        "status" character varying(20) NOT NULL DEFAULT 'queued',
        "accepted_count" integer NOT NULL DEFAULT '0',
        "processed_count" integer NOT NULL DEFAULT '0',
        "applied_count" integer NOT NULL DEFAULT '0',
        "conflict_count" integer NOT NULL DEFAULT '0',
        "failed_count" integer NOT NULL DEFAULT '0',
        "started_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_sync_batches_id" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sync_batches_business_id_device_id_created_at"
      ON "sync_batches" ("business_id", "device_id", "created_at")
    `)

    await queryRunner.query(`
      ALTER TABLE "sync_batches"
      ADD CONSTRAINT "fk_sync_batches_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sync_operations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "batch_id" uuid NOT NULL,
        "business_id" uuid NOT NULL,
        "device_id" character varying NOT NULL,
        "client_operation_id" character varying NOT NULL,
        "entity" character varying(40) NOT NULL,
        "action" character varying(20) NOT NULL,
        "record_id" uuid NOT NULL,
        "record_updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "payload" jsonb,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "resolution" character varying(20),
        "error_message" text,
        CONSTRAINT "PK_sync_operations_id" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sync_operations_batch_id_created_at"
      ON "sync_operations" ("batch_id", "created_at")
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sync_operations_business_id_status_created_at"
      ON "sync_operations" ("business_id", "status", "created_at")
    `)

    await queryRunner.query(`
      ALTER TABLE "sync_operations"
      ADD CONSTRAINT "fk_sync_operations_batch_id"
      FOREIGN KEY ("batch_id") REFERENCES "sync_batches"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)

    await queryRunner.query(`
      ALTER TABLE "sync_operations"
      ADD CONSTRAINT "fk_sync_operations_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sync_operations" DROP CONSTRAINT IF EXISTS "fk_sync_operations_business_id"`)
    await queryRunner.query(`ALTER TABLE "sync_operations" DROP CONSTRAINT IF EXISTS "fk_sync_operations_batch_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sync_operations_business_id_status_created_at"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sync_operations_batch_id_created_at"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "sync_operations"`)

    await queryRunner.query(`ALTER TABLE "sync_batches" DROP CONSTRAINT IF EXISTS "fk_sync_batches_business_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sync_batches_business_id_device_id_created_at"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "sync_batches"`)
  }
}
