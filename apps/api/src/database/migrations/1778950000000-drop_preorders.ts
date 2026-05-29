import { MigrationInterface, QueryRunner } from 'typeorm'

export class DropPreorders1778950000000 implements MigrationInterface {
  name = 'DropPreorders1778950000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse FK order
    await queryRunner.query(`DROP TABLE IF EXISTS "preorder_refunds" CASCADE`)
    await queryRunner.query(`DROP TABLE IF EXISTS "preorder_payments" CASCADE`)
    await queryRunner.query(`DROP TABLE IF EXISTS "preorder_items" CASCADE`)
    await queryRunner.query(`DROP TABLE IF EXISTS "preorders" CASCADE`)

    // Drop the preorder_id column from sales if it was added
    await queryRunner.query(`
      ALTER TABLE "sales" DROP COLUMN IF EXISTS "preorder_id"
    `)

    // Remove 'PREORDERS' from every plan's resources array in plan_configs (text[] column)
    await queryRunner.query(`
      UPDATE "plan_configs"
      SET "resources" = array_remove("resources", 'PREORDERS')
      WHERE 'PREORDERS' = ANY("resources")
    `)
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally empty — preorder tables are permanently removed and data is not recoverable.
  }
}
