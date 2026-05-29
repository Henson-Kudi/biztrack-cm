import { MigrationInterface, QueryRunner } from 'typeorm'

export class InventoryLevelReserved1778401000000 implements MigrationInterface {
  name = 'InventoryLevelReserved1778401000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_levels"
      ADD COLUMN IF NOT EXISTS "quantity_reserved" numeric(12,3) NOT NULL DEFAULT 0
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_levels"
      DROP COLUMN IF EXISTS "quantity_reserved"
    `)
  }
}
