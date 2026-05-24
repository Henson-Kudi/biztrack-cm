import { MigrationInterface, QueryRunner } from 'typeorm'

export class DebtsSourceReference1001777600000000 implements MigrationInterface {
  name = 'DebtsSourceReference1001777600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "debts"
      ALTER COLUMN "source_reference" TYPE character varying(100)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "debts"
      ALTER COLUMN "source_reference" TYPE character varying(30)
      USING LEFT("source_reference", 30)
    `)
  }
}
