import { MigrationInterface, QueryRunner } from 'typeorm'

export class SyncOperationRecordIdText1777400000000 implements MigrationInterface {
  name = 'SyncOperationRecordIdText1777400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sync_operations"
      ALTER COLUMN "record_id" TYPE text
      USING "record_id"::text
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "sync_operations"
      WHERE "record_id" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    `)

    await queryRunner.query(`
      ALTER TABLE "sync_operations"
      ALTER COLUMN "record_id" TYPE uuid
      USING "record_id"::uuid
    `)
  }
}
