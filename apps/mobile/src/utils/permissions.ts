import type { BusinessRole } from '@/store/useAuthStore'

// ─── Role hierarchy ───────────────────────────────────────────────────────────
// Each role lists what it CAN do. Intentionally explicit — no inheritance
// so future role changes don't silently expand permissions.

const ROLE_PERMISSIONS: Record<BusinessRole, Set<string>> = {
  OWNER: new Set([
    'sell',
    'manage_expenses',
    'view_reports',
    'manage_products',
    'manage_team',
  ]),
  MANAGER: new Set([
    'sell',
    'manage_expenses',
    'view_reports',
    'manage_products',
  ]),
  CASHIER: new Set([
    'sell',
  ]),
  ACCOUNTANT: new Set([
    'manage_expenses',
    'view_reports',
  ]),
}

export type Permission =
  | 'sell'
  | 'manage_expenses'
  | 'view_reports'
  | 'manage_products'
  | 'manage_team'

/**
 * Returns true if the given role has the requested permission.
 * Defaults to false for unknown roles (fail-closed).
 */
export function hasPermission(role: BusinessRole | undefined | null, permission: Permission): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false
}
