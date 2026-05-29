'use client'

import type { User } from '@biztrack/types'
import { dbQuery, dbRun } from './local-db'

export type LocalUserProfile = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  avatarUrl: string | null
  role: string | null
  language: string | null
  isEmailVerified: boolean | null
  isPhoneVerified: boolean | null
  businessId: string | null
  status: string | null
  onboardingStep: string | null
  preferredPhoneChannel: string | null
  isActive: boolean | null
  createdAt: string | null
  updatedAt: string | null
}

type LocalUserProfileRow = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  avatar_url: string | null
  role: string | null
  language: string | null
  is_email_verified: number | null
  is_phone_verified: number | null
  business_id: string | null
  status: string | null
  onboarding_step: string | null
  preferred_phone_channel: string | null
  is_active: number | null
  created_at: string | null
  updated_at: string | null
}

export async function upsertLocalUserProfile(user: User): Promise<void> {
  await dbRun(
    `INSERT INTO local_user_profiles (
       id, name, email, phone, avatar_url, role, language,
       is_email_verified, is_phone_verified, business_id,
       status, onboarding_step, preferred_phone_channel, is_active,
       created_at, updated_at, saved_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name                    = excluded.name,
       email                   = excluded.email,
       phone                   = excluded.phone,
       avatar_url              = excluded.avatar_url,
       role                    = excluded.role,
       language                = excluded.language,
       is_email_verified       = excluded.is_email_verified,
       is_phone_verified       = excluded.is_phone_verified,
       business_id             = excluded.business_id,
       status                  = excluded.status,
       onboarding_step         = excluded.onboarding_step,
       preferred_phone_channel = excluded.preferred_phone_channel,
       is_active               = excluded.is_active,
       created_at              = excluded.created_at,
       updated_at              = excluded.updated_at,
       saved_at                = excluded.saved_at`,
    [
      user.id,
      user.name ?? null,
      user.email ?? null,
      user.phone ?? null,
      user.avatarUrl ?? null,
      user.role ?? null,
      user.language ?? null,
      user.isEmailVerified != null ? (user.isEmailVerified ? 1 : 0) : null,
      user.isPhoneVerified != null ? (user.isPhoneVerified ? 1 : 0) : null,
      user.businessId ?? null,
      user.status ?? null,
      user.onboardingStep ?? null,
      user.preferredPhoneChannel ?? null,
      user.isActive != null ? (user.isActive ? 1 : 0) : null,
      user.createdAt ?? null,
      user.updatedAt ?? null,
      new Date().toISOString(),
    ],
  )
}

export async function getLocalUserProfile(userId: string): Promise<LocalUserProfile | null> {
  const rows = await dbQuery<LocalUserProfileRow>(
    `SELECT
       id, name, email, phone, avatar_url, role, language,
       is_email_verified, is_phone_verified, business_id,
       status, onboarding_step, preferred_phone_channel, is_active,
       created_at, updated_at
     FROM local_user_profiles WHERE id = ?`,
    [userId],
  )

  const row = rows[0]
  if (!row) return null

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    role: row.role,
    language: row.language,
    isEmailVerified: row.is_email_verified != null ? row.is_email_verified === 1 : null,
    isPhoneVerified: row.is_phone_verified != null ? row.is_phone_verified === 1 : null,
    businessId: row.business_id,
    status: row.status,
    onboardingStep: row.onboarding_step,
    preferredPhoneChannel: row.preferred_phone_channel,
    isActive: row.is_active != null ? row.is_active === 1 : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
