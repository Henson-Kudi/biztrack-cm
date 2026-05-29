import type { MigrationInterface, QueryRunner } from 'typeorm'

export class NotificationProvider1779400000001 implements MigrationInterface {
  name = 'NotificationProvider1779400000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Extend the type enum with the new marketing value
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "sender" character varying(320) NULL`,
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN IF EXISTS "sender"`)
  }
}
