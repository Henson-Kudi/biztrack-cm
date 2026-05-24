'use client'

import { ipc } from './ipc.bridge'
import type { BusinessMemberRole, BusinessMemberStatus, TeamMember } from '@biztrack/types'

type LocalTeamMemberRow = {
  id: string
  business_id: string
  user_id: string
  role_id: string | null
  role: string
  status: string
  name: string | null
  email: string | null
  phone: string | null
  is_deleted: number
  created_at: string
}

export async function getLocalTeamMembers(): Promise<TeamMember[]> {
  const rows = (await ipc.db.query(
    `SELECT id, business_id, user_id, role_id, role, status, name, email, phone, is_deleted, created_at
     FROM business_members
     WHERE is_deleted = 0 AND status != 'REMOVED'
     ORDER BY created_at ASC`,
  )) as LocalTeamMemberRow[]

  return rows.map((row) => ({
    memberId: row.id,
    userId: row.user_id,
    roleId: row.role_id ?? '',
    roleName: row.role,
    role: row.role as BusinessMemberRole,
    status: row.status as BusinessMemberStatus,
    name: row.name,
    email: row.email,
    phone: row.phone,
    joinedAt: row.created_at,
  }))
}
