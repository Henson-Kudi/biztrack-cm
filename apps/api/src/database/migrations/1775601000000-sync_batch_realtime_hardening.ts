import { MigrationInterface, QueryRunner } from 'typeorm'

export class SyncBatchRealtimeHardening1775601000000 implements MigrationInterface {
  name = 'SyncBatchRealtimeHardening1775601000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sync_batches"
      ADD COLUMN IF NOT EXISTS "bull_job_id" character varying
    `)

    await queryRunner.query(`
      ALTER TABLE "sync_batches"
      ADD COLUMN IF NOT EXISTS "last_error" text
    `)

    await queryRunner.query(`
      ALTER TABLE "sync_batches"
      ALTER COLUMN "status" SET DEFAULT 'pending_enqueue'
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sync_batches_status_created_at"
      ON "sync_batches" ("status", "created_at")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sync_batches_status_created_at"`)
    await queryRunner.query(`ALTER TABLE "sync_batches" ALTER COLUMN "status" SET DEFAULT 'queued'`)
    await queryRunner.query(`ALTER TABLE "sync_batches" DROP COLUMN IF EXISTS "last_error"`)
    await queryRunner.query(`ALTER TABLE "sync_batches" DROP COLUMN IF EXISTS "bull_job_id"`)
  }
}
