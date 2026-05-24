import type { MigrationInterface, QueryRunner } from 'typeorm'

// Permission sets for default system roles (from spec Section 4)
const OWNER_PERMISSIONS = [
  'sales:create', 'sales:void', 'sales:view_all', 'sales:view_own',
  'expenses:create', 'expenses:view', 'expenses:delete',
  'contacts:create', 'contacts:view', 'contacts:edit',
  'inventory:adjust', 'inventory:view', 'inventory:view_stock',
  'debts:record_payment', 'debts:view', 'debts:write_off',
  'reports:basic', 'reports:financial',
  'users:manage', 'business:settings',
]

const MANAGER_PERMISSIONS = [
  'sales:create', 'sales:void', 'sales:view_all',
  'expenses:create', 'expenses:view',
  'contacts:create', 'contacts:view', 'contacts:edit',
  'inventory:adjust', 'inventory:view',
  'debts:record_payment', 'debts:view',
  'reports:basic', 'reports:financial',
]

const CASHIER_PERMISSIONS = [
  'sales:create', 'sales:view_own',
  'contacts:view',
  'inventory:view_stock',
]

const ACCOUNTANT_PERMISSIONS = [
  'sales:view_all',
  'expenses:view',
  'contacts:view',
  'debts:view',
  'reports:basic', 'reports:financial',
]

export class RbacRolesV11778100000000 implements MigrationInterface {
  name = 'RbacRolesV11778100000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create roles table
    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "business_id" uuid NOT NULL,
        "name" character varying(100) NOT NULL,
        "description" text,
        "is_system" boolean NOT NULL DEFAULT false,
        "is_owner_role" boolean NOT NULL DEFAULT false,
        "colour" character varying(7),
        "created_by" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_roles" PRIMARY KEY ("id"),
        CONSTRAINT "fk_roles_business_id" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_roles_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "unq_roles_business_id_name" UNIQUE ("business_id", "name")
      )
    `)
    await queryRunner.query(`CREATE INDEX "idx_roles_business_id" ON "roles" ("business_id")`)

    // 2. Create role_permissions table
    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "role_id" uuid NOT NULL,
        "business_id" uuid NOT NULL,
        "permission" character varying(100) NOT NULL,
        "granted_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "granted_by" uuid,
        CONSTRAINT "pk_role_permissions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_role_permissions_role_id" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_role_permissions_business_id" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_role_permissions_granted_by" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "unq_role_permissions_role_id_permission" UNIQUE ("role_id", "permission")
      )
    `)
    await queryRunner.query(`CREATE INDEX "idx_role_permissions_role_id" ON "role_permissions" ("role_id")`)
    await queryRunner.query(`CREATE INDEX "idx_role_permissions_business_id" ON "role_permissions" ("business_id")`)

    // 3. Add role_id to business_members
    await queryRunner.query(`
      ALTER TABLE "business_members"
        ADD COLUMN "role_id" uuid,
        ADD CONSTRAINT "fk_business_members_role_id" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL
    `)

    // 4. Add role_id to pending_invites (also make role column nullable for dynamic roles)
    await queryRunner.query(`ALTER TABLE "pending_invites" ADD COLUMN "role_id" uuid`)
    await queryRunner.query(`
      ALTER TABLE "pending_invites"
        ADD CONSTRAINT "fk_pending_invites_role_id" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL
    `)
    await queryRunner.query(`ALTER TABLE "pending_invites" ALTER COLUMN "role" DROP NOT NULL`)

    // 5. Alter enum to add STAFF value
    await queryRunner.query(`ALTER TYPE "public"."business_members_role_enum" ADD VALUE IF NOT EXISTS 'STAFF'`)

    // 6. Seed 4 default roles for all existing businesses
    await queryRunner.query(`
      INSERT INTO "roles" ("id", "business_id", "name", "description", "is_system", "is_owner_role", "created_at", "updated_at")
      SELECT gen_random_uuid(), b.id, 'OWNER', 'Full access — cannot be edited', true, true, now(), now()
      FROM "businesses" b
    `)
    await queryRunner.query(`
      INSERT INTO "roles" ("id", "business_id", "name", "description", "is_system", "is_owner_role", "created_at", "updated_at")
      SELECT gen_random_uuid(), b.id, 'MANAGER', 'Can manage most operations', true, false, now(), now()
      FROM "businesses" b
    `)
    await queryRunner.query(`
      INSERT INTO "roles" ("id", "business_id", "name", "description", "is_system", "is_owner_role", "created_at", "updated_at")
      SELECT gen_random_uuid(), b.id, 'CASHIER', 'Can process sales', true, false, now(), now()
      FROM "businesses" b
    `)
    await queryRunner.query(`
      INSERT INTO "roles" ("id", "business_id", "name", "description", "is_system", "is_owner_role", "created_at", "updated_at")
      SELECT gen_random_uuid(), b.id, 'ACCOUNTANT', 'Can view financial reports', true, false, now(), now()
      FROM "businesses" b
    `)

    // 7. Seed permissions for OWNER roles
    const ownerPerms = OWNER_PERMISSIONS.map((p) => `('${p}')`).join(',')
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("id", "role_id", "business_id", "permission", "granted_at")
      SELECT gen_random_uuid(), r.id, r.business_id, perm.permission, now()
      FROM "roles" r
      CROSS JOIN (VALUES ${ownerPerms}) AS perm(permission)
      WHERE r.is_owner_role = true AND r.is_system = true
    `)

    // 8. Seed permissions for MANAGER roles
    const managerPerms = MANAGER_PERMISSIONS.map((p) => `('${p}')`).join(',')
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("id", "role_id", "business_id", "permission", "granted_at")
      SELECT gen_random_uuid(), r.id, r.business_id, perm.permission, now()
      FROM "roles" r
      CROSS JOIN (VALUES ${managerPerms}) AS perm(permission)
      WHERE r.name = 'MANAGER' AND r.is_system = true
    `)

    // 9. Seed permissions for CASHIER roles
    const cashierPerms = CASHIER_PERMISSIONS.map((p) => `('${p}')`).join(',')
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("id", "role_id", "business_id", "permission", "granted_at")
      SELECT gen_random_uuid(), r.id, r.business_id, perm.permission, now()
      FROM "roles" r
      CROSS JOIN (VALUES ${cashierPerms}) AS perm(permission)
      WHERE r.name = 'CASHIER' AND r.is_system = true
    `)

    // 10. Seed permissions for ACCOUNTANT roles
    const accountantPerms = ACCOUNTANT_PERMISSIONS.map((p) => `('${p}')`).join(',')
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("id", "role_id", "business_id", "permission", "granted_at")
      SELECT gen_random_uuid(), r.id, r.business_id, perm.permission, now()
      FROM "roles" r
      CROSS JOIN (VALUES ${accountantPerms}) AS perm(permission)
      WHERE r.name = 'ACCOUNTANT' AND r.is_system = true
    `)

    // 11. Backfill role_id on business_members from matching role name
    await queryRunner.query(`
      UPDATE "business_members" bm
      SET "role_id" = r.id
      FROM "roles" r
      WHERE r.business_id = bm.business_id
        AND r.name = bm.role::text
        AND r.is_system = true
    `)

    // 12. Backfill role_id on pending_invites
    await queryRunner.query(`
      UPDATE "pending_invites" pi
      SET "role_id" = r.id
      FROM "roles" r
      WHERE r.business_id = pi.business_id
        AND r.name = pi.role::text
        AND r.is_system = true
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pending_invites" DROP CONSTRAINT IF EXISTS "fk_pending_invites_role_id"`)
    await queryRunner.query(`ALTER TABLE "pending_invites" DROP COLUMN IF EXISTS "role_id"`)
    await queryRunner.query(`ALTER TABLE "pending_invites" ALTER COLUMN "role" SET NOT NULL`)
    await queryRunner.query(`ALTER TABLE "business_members" DROP CONSTRAINT IF EXISTS "fk_business_members_role_id"`)
    await queryRunner.query(`ALTER TABLE "business_members" DROP COLUMN IF EXISTS "role_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_role_permissions_business_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_role_permissions_role_id"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_roles_business_id"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`)
  }
}
