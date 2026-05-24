import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddRolesManagePermission1778200000000 implements MigrationInterface {
  name = 'AddRolesManagePermission1778200000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    // Insert roles:manage permission for every existing MANAGER system role
    // that does not already have it.
    await queryRunner.query(`
      INSERT INTO role_permissions (id, role_id, business_id, permission, granted_at, granted_by)
      SELECT
        gen_random_uuid(),
        r.id,
        r.business_id,
        'roles:manage',
        NOW(),
        NULL
      FROM roles r
      WHERE r.name = 'MANAGER'
        AND r.is_system = true
        AND NOT EXISTS (
          SELECT 1 FROM role_permissions rp
          WHERE rp.role_id = r.id AND rp.permission = 'roles:manage'
        )
    `)

    // Also ensure OWNER roles have it (they should already via the full set,
    // but guard against any missing rows from earlier seeds).
    await queryRunner.query(`
      INSERT INTO role_permissions (id, role_id, business_id, permission, granted_at, granted_by)
      SELECT
        gen_random_uuid(),
        r.id,
        r.business_id,
        'roles:manage',
        NOW(),
        NULL
      FROM roles r
      WHERE r.is_owner_role = true
        AND NOT EXISTS (
          SELECT 1 FROM role_permissions rp
          WHERE rp.role_id = r.id AND rp.permission = 'roles:manage'
        )
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions
      WHERE permission = 'roles:manage'
        AND granted_by IS NULL
    `)
  }
}
