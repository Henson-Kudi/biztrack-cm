import type { MigrationInterface, QueryRunner } from 'typeorm'

const PAID_PLANS = ['SOLO', 'BUSINESS', 'PRO']

export class AddSavingsToPlans1778961000000 implements MigrationInterface {
  name = 'AddSavingsToPlans1778961000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const plan of PAID_PLANS) {
      await queryRunner.query(`
        UPDATE "plan_configs"
        SET "resources" = array_append("resources", 'SAVINGS')
        WHERE "plan" = '${plan}'
          AND NOT ('SAVINGS' = ANY("resources"))
      `)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const plan of PAID_PLANS) {
      await queryRunner.query(`
        UPDATE "plan_configs"
        SET "resources" = array_remove("resources", 'SAVINGS')
        WHERE "plan" = '${plan}'
      `)
    }
  }
}
