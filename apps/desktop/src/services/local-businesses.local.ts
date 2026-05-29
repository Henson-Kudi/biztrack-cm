'use client'

import type { BusinessMembershipSummary } from '@biztrack/types'
import { dbQuery, dbBatch } from './local-db'

export type LocalBusiness = {
  id: string
  name: string
  slug: string | null
  currency: string
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  logoUrl: string | null
  plan: string | null
  type: string | null
  description: string | null
  businessStatus: string | null
  ownerId: string | null
  owner: string | null
  subscriptionStatus: string | null
  trialStartedAt: string | null
  trialEndsAt: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean | null
}

type LocalBusinessRow = {
  id: string
  name: string
  slug: string | null
  currency: string
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  logo_url: string | null
  plan: string | null
  type: string | null
  description: string | null
  business_status: string | null
  owner_id: string | null
  owner: string | null
  subscription_status: string | null
  trial_started_at: string | null
  trial_ends_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: number | null
}

export async function upsertLocalBusinesses(
  memberships: BusinessMembershipSummary[],
): Promise<void> {
  const now = new Date().toISOString()
  const ops = memberships
    .filter((m) => m.business != null)
    .map((m) => {
      const b = m.business!
      return {
        sql: `
          INSERT INTO local_businesses (
            id, name, slug, currency, phone, email, address, city, logo_url, plan,
            type, description, business_status, owner_id, owner,
            subscription_status, trial_started_at, trial_ends_at,
            current_period_start, current_period_end, cancel_at_period_end,
            saved_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name                  = excluded.name,
            slug                  = excluded.slug,
            currency              = excluded.currency,
            phone                 = excluded.phone,
            email                 = excluded.email,
            address               = excluded.address,
            city                  = excluded.city,
            logo_url              = excluded.logo_url,
            plan                  = excluded.plan,
            type                  = excluded.type,
            description           = excluded.description,
            business_status       = excluded.business_status,
            owner_id              = excluded.owner_id,
            owner                 = excluded.owner,
            subscription_status   = excluded.subscription_status,
            trial_started_at      = excluded.trial_started_at,
            trial_ends_at         = excluded.trial_ends_at,
            current_period_start  = excluded.current_period_start,
            current_period_end    = excluded.current_period_end,
            cancel_at_period_end  = excluded.cancel_at_period_end,
            saved_at              = excluded.saved_at
        `,
        params: [
          b.id,
          b.name,
          b.slug ?? null,
          b.currency ?? 'XAF',
          b.phone ?? null,
          b.email ?? null,
          b.address ?? null,
          b.city ?? null,
          b.logoUrl ?? null,
          b.plan ?? null,
          b.type ?? null,
          b.description ?? null,
          b.businessStatus ?? null,
          b.ownerId ?? null,
          b.owner ?? null,
          b.subscriptionStatus ?? null,
          b.trialStartedAt ?? null,
          b.trialEndsAt ?? null,
          b.currentPeriodStart ?? null,
          b.currentPeriodEnd ?? null,
          b.cancelAtPeriodEnd != null ? (b.cancelAtPeriodEnd ? 1 : 0) : null,
          now,
        ],
      }
    })

  if (ops.length > 0) {
    await dbBatch(ops)
  }
}

export async function getLocalBusinesses(): Promise<LocalBusiness[]> {
  const rows = await dbQuery<LocalBusinessRow>(
    `SELECT
       id, name, slug, currency, phone, email, address, city, logo_url, plan,
       type, description, business_status, owner_id, owner,
       subscription_status, trial_started_at, trial_ends_at,
       current_period_start, current_period_end, cancel_at_period_end
     FROM local_businesses
     ORDER BY name ASC`,
    [],
  )

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    currency: row.currency,
    phone: row.phone,
    email: row.email,
    address: row.address,
    city: row.city,
    logoUrl: row.logo_url,
    plan: row.plan,
    type: row.type,
    description: row.description,
    businessStatus: row.business_status,
    ownerId: row.owner_id,
    owner: row.owner,
    subscriptionStatus: row.subscription_status,
    trialStartedAt: row.trial_started_at,
    trialEndsAt: row.trial_ends_at,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end != null ? row.cancel_at_period_end === 1 : null,
  }))
}

export async function getLocalBusiness(id: string): Promise<LocalBusiness | null> {
  const rows = await dbQuery<LocalBusinessRow>(
    `SELECT
       id, name, slug, currency, phone, email, address, city, logo_url, plan,
       type, description, business_status, owner_id, owner,
       subscription_status, trial_started_at, trial_ends_at,
       current_period_start, current_period_end, cancel_at_period_end
     FROM local_businesses WHERE id = ?`,
    [id],
  )

  const row = rows[0]
  if (!row) return null

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    currency: row.currency,
    phone: row.phone,
    email: row.email,
    address: row.address,
    city: row.city,
    logoUrl: row.logo_url,
    plan: row.plan,
    type: row.type,
    description: row.description,
    businessStatus: row.business_status,
    ownerId: row.owner_id,
    owner: row.owner,
    subscriptionStatus: row.subscription_status,
    trialStartedAt: row.trial_started_at,
    trialEndsAt: row.trial_ends_at,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end != null ? row.cancel_at_period_end === 1 : null,
  }
}
