'use client'

import { Resource, type SubscriptionPlan } from '@biztrack/types'
import type { DesktopPlanState } from '@/services/plan-state.local'
import { getPermissionAccessFromState } from './plan-access'

type AppRouteRule = {
  prefix: string
  resource: Resource
}

// Route-to-resource mapping is kept client-side so offline desktop navigation
// uses the same boolean permission model as the API guards. The API still
// remains authoritative, but we block locally to avoid letting users navigate
// into screens the current cached entitlement clearly does not allow.
const APP_ROUTE_RULES: AppRouteRule[] = [
  { prefix: '/sell', resource: Resource.SALES_CREATE },
  { prefix: '/products', resource: Resource.PRODUCTS_VIEW },
  { prefix: '/inventory', resource: Resource.INVENTORY_VIEW },
  { prefix: '/sales', resource: Resource.SALES_VIEW },
  { prefix: '/contacts/debtors', resource: Resource.DEBTS_VIEW },
  { prefix: '/contacts/creditors', resource: Resource.DEBTS_VIEW },
  { prefix: '/contacts', resource: Resource.CONTACTS_VIEW },
  { prefix: '/expenses', resource: Resource.EXPENSES_VIEW },
  { prefix: '/reports', resource: Resource.REPORTS_DAILY },
]

const APP_ROUTE_ORDER = [
  '/',
  '/sell',
  '/products',
  '/inventory',
  '/sales',
  '/contacts',
  '/expenses',
  '/reports',
  '/settings',
] as const

export function normalizeAppPath(pathname: string) {
  if (!pathname || pathname === '/') {
    return '/'
  }

  const normalized = pathname.replace(/\/+$/, '')
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

export function removeLocalePrefix(pathname: string, locale: string) {
  const localizedPrefix = `/${locale}`
  if (pathname === localizedPrefix) {
    return '/'
  }

  return pathname.startsWith(`${localizedPrefix}/`)
    ? pathname.slice(localizedPrefix.length)
    : pathname
}

export function getRequiredResourceForAppPath(pathname: string): Resource | null {
  const normalized = normalizeAppPath(pathname)

  for (const rule of APP_ROUTE_RULES) {
    if (normalized === rule.prefix || normalized.startsWith(`${rule.prefix}/`)) {
      return rule.resource
    }
  }

  return null
}

export function getFirstAccessibleAppPath(
  state: DesktopPlanState,
  locale: string,
): string {
  for (const path of APP_ROUTE_ORDER) {
    const resource = getRequiredResourceForAppPath(path)
    if (!resource || getPermissionAccessFromState(state, resource).allowed) {
      return localizeAppPath(locale, path)
    }
  }

  return localizeAppPath(locale, '/')
}

export function localizeAppPath(locale: string, path: string) {
  return path === '/' ? `/${locale}` : `/${locale}${path}`
}

export function formatPlanBadge(plan: SubscriptionPlan | null) {
  return plan ? `${plan}+` : null
}
