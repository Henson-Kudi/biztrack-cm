import type { MigrationInterface, QueryRunner } from 'typeorm'

export class SavingsV11778960000000 implements MigrationInterface {
  name = 'SavingsV11778960000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE savings_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        customer_id UUID NOT NULL REFERENCES contacts(id) ON DELETE NO ACTION,
        customer_name VARCHAR(200),
        customer_phone VARCHAR(30),
        account_number VARCHAR(50) NOT NULL,
        balance NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_deposited NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_refunded NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_used NUMERIC(12,2) NOT NULL DEFAULT 0,
        tagged_products JSONB,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT unq_savings_business_customer UNIQUE (business_id, customer_id),
        CONSTRAINT unq_savings_business_account_number UNIQUE (business_id, account_number)
      )
    `)

    await queryRunner.query(`
      CREATE INDEX idx_savings_accounts_business_created_at
        ON savings_accounts(business_id, created_at)
    `)

    await queryRunner.query(`
      CREATE TABLE savings_deposits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        savings_id UUID NOT NULL REFERENCES savings_accounts(id) ON DELETE CASCADE,
        business_id UUID NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        method VARCHAR(50) NOT NULL,
        mobile_money_reference VARCHAR(200),
        notes TEXT,
        recorded_by_id UUID REFERENCES users(id) ON DELETE NO ACTION,
        deposited_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE
      )
    `)

    await queryRunner.query(`
      CREATE INDEX idx_savings_deposits_savings_id ON savings_deposits(savings_id)
    `)

    await queryRunner.query(`
      CREATE INDEX idx_savings_deposits_business_id ON savings_deposits(business_id)
    `)

    await queryRunner.query(`
      CREATE TABLE savings_refunds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        savings_id UUID NOT NULL REFERENCES savings_accounts(id) ON DELETE CASCADE,
        business_id UUID NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        method VARCHAR(50) NOT NULL,
        mobile_money_reference VARCHAR(200),
        notes TEXT,
        recorded_by_id UUID REFERENCES users(id) ON DELETE NO ACTION,
        refunded_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE
      )
    `)

    await queryRunner.query(`
      CREATE INDEX idx_savings_refunds_savings_id ON savings_refunds(savings_id)
    `)

    await queryRunner.query(`
      CREATE INDEX idx_savings_refunds_business_id ON savings_refunds(business_id)
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS savings_refunds`)
    await queryRunner.query(`DROP TABLE IF EXISTS savings_deposits`)
    await queryRunner.query(`DROP TABLE IF EXISTS savings_accounts`)
  }
}
