import { MigrationInterface, QueryRunner } from 'typeorm'

const SYSTEM_CHARGE_TYPES = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'TVA',
    description: 'Taxe sur la valeur ajoutee (19.25%)',
    rate_type: 'PERCENT',
    default_value: 19.25,
    sort_order: 0,
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Transport',
    description: 'Frais de transport / livraison',
    rate_type: 'FIXED',
    default_value: 0,
    sort_order: 1,
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Service',
    description: 'Frais de service',
    rate_type: 'PERCENT',
    default_value: 0,
    sort_order: 2,
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    name: 'Emballage',
    description: "Frais d'emballage",
    rate_type: 'FIXED',
    default_value: 0,
    sort_order: 3,
  },
  {
    id: '00000000-0000-4000-8000-000000000005',
    name: 'Commission',
    description: 'Commission sur la vente',
    rate_type: 'PERCENT',
    default_value: 0,
    sort_order: 4,
  },
  {
    id: '00000000-0000-4000-8000-000000000006',
    name: 'Penalite',
    description: 'Penalite ou frais supplementaire',
    rate_type: 'FIXED',
    default_value: 0,
    sort_order: 5,
  },
]

export class ChargeTypes1778600000000 implements MigrationInterface {
  name = 'ChargeTypes1778600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "charge_types" (
        "id" uuid NOT NULL,
        "business_id" uuid,
        "name" character varying(100) NOT NULL,
        "description" text,
        "rate_type" character varying(10) NOT NULL DEFAULT 'FIXED',
        "default_value" numeric(12,2) NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "is_system" boolean NOT NULL DEFAULT false,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_charge_types" PRIMARY KEY ("id"),
        CONSTRAINT "fk_charge_types_business" FOREIGN KEY ("business_id")
          REFERENCES "businesses"("id") ON DELETE CASCADE
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_charge_types_business_id" ON "charge_types" ("business_id")
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sale_charges" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sale_id" uuid NOT NULL,
        "business_id" uuid NOT NULL,
        "charge_type_id" uuid,
        "name" character varying(100) NOT NULL,
        "rate_type" character varying(10) NOT NULL,
        "rate_value" numeric(12,2) NOT NULL DEFAULT 0,
        "amount" numeric(12,2) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_sale_charges" PRIMARY KEY ("id"),
        CONSTRAINT "fk_sale_charges_sale" FOREIGN KEY ("sale_id")
          REFERENCES "sales"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_sale_charges_business" FOREIGN KEY ("business_id")
          REFERENCES "businesses"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_sale_charges_charge_type" FOREIGN KEY ("charge_type_id")
          REFERENCES "charge_types"("id") ON DELETE SET NULL
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sale_charges_sale_id" ON "sale_charges" ("sale_id")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sale_charges_business_id" ON "sale_charges" ("business_id")
    `)

    const now = new Date().toISOString()
    for (const ct of SYSTEM_CHARGE_TYPES) {
      await queryRunner.query(
        `
        INSERT INTO "charge_types" (
          "id", "business_id", "name", "description",
          "rate_type", "default_value", "is_active", "is_system",
          "sort_order", "created_at", "updated_at"
        )
        VALUES ($1, NULL, $2, $3, $4, $5, true, true, $6, $7, $7)
        ON CONFLICT ("id") DO NOTHING
      `,
        [ct.id, ct.name, ct.description, ct.rate_type, ct.default_value, ct.sort_order, now],
      )
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sale_charges"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "charge_types"`)
  }
}
