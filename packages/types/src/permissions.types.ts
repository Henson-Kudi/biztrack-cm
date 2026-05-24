import { SubscriptionPlan } from "./business.types"

export enum Resource {
  SALES_CREATE = 'SALES_CREATE',
  SALES_VIEW = 'SALES_VIEW',
  SALES_VOID = 'SALES_VOID',
  SALES_EXPORT = 'SALES_EXPORT',

  PRODUCTS_CREATE = 'PRODUCTS_CREATE',
  PRODUCTS_VIEW = 'PRODUCTS_VIEW',
  PRODUCTS_EDIT = 'PRODUCTS_EDIT',
  PRODUCTS_DELETE = 'PRODUCTS_DELETE',
  PRODUCTS_LIMIT_50 = 'PRODUCTS_LIMIT_50',
  PRODUCTS_UNLIMITED = 'PRODUCTS_UNLIMITED',
  PRODUCTS_IMPORT_CSV = 'PRODUCTS_IMPORT_CSV',

  INVENTORY_VIEW = 'INVENTORY_VIEW',
  INVENTORY_ADJUST = 'INVENTORY_ADJUST',
  INVENTORY_ALERTS = 'INVENTORY_ALERTS',

  EXPENSES_CREATE = 'EXPENSES_CREATE',
  EXPENSES_VIEW = 'EXPENSES_VIEW',
  EXPENSES_EDIT = 'EXPENSES_EDIT',
  EXPENSES_DELETE = 'EXPENSES_DELETE',
  EXPENSES_CATEGORIES = 'EXPENSES_CATEGORIES',

  CONTACTS_VIEW = 'CONTACTS_VIEW',
  CONTACTS_MANAGE = 'CONTACTS_MANAGE',
  DEBTS_VIEW = 'DEBTS_VIEW',
  DEBTS_RECORD_PAYMENT = 'DEBTS_RECORD_PAYMENT',
  DEBTS_DELETE_PAYMENT = 'DEBTS_DELETE_PAYMENT',
  DEBTS_WRITE_OFF = 'DEBTS_WRITE_OFF',

  REPORTS_DAILY = 'REPORTS_DAILY',
  REPORTS_WEEKLY = 'REPORTS_WEEKLY',
  REPORTS_MONTHLY = 'REPORTS_MONTHLY',
  REPORTS_EXPORT_PDF = 'REPORTS_EXPORT_PDF',
  REPORTS_EXPORT_CSV = 'REPORTS_EXPORT_CSV',

  RECEIPTS_GENERATE = 'RECEIPTS_GENERATE',
  RECEIPTS_WHATSAPP = 'RECEIPTS_WHATSAPP',

  SCANNER_CAMERA = 'SCANNER_CAMERA',
  SCANNER_USB = 'SCANNER_USB',

  DESKTOP_ACCESS = 'DESKTOP_ACCESS',

  // These placeholders come from the plan-permissions spec. Some of the
  // underlying features do not exist yet, but adding stable resource IDs now
  // lets future modules plug into the same subscription model without a later
  // rename/migration.
  OPENING_BALANCES = 'OPENING_BALANCES',
  PREORDERS = 'PREORDERS',
  DEPOSITS = 'DEPOSITS',
  CHARGES_MULTIPLE = 'CHARGES_MULTIPLE',
  REPORTS_FINANCIAL = 'REPORTS_FINANCIAL',
  CUSTOM_ROLES = 'CUSTOM_ROLES',
  AGENT_TRACK = 'AGENT_TRACK',

  STAFF_INVITE = 'STAFF_INVITE',
  STAFF_MANAGE = 'STAFF_MANAGE',
  STAFF_LIMIT_3 = 'STAFF_LIMIT_3',
  STAFF_UNLIMITED = 'STAFF_UNLIMITED',

  BRANCHES_MULTI = 'BRANCHES_MULTI',
  BRANCHES_DASHBOARD = 'BRANCHES_DASHBOARD',
  BRANCHES_REPORTS = 'BRANCHES_REPORTS',

  API_ACCESS = 'API_ACCESS',
}

export const FREE_PERMISSIONS: Resource[] = [
  Resource.SALES_CREATE,
  Resource.SALES_VIEW,
  Resource.PRODUCTS_CREATE,
  Resource.PRODUCTS_VIEW,
  Resource.PRODUCTS_EDIT,
  Resource.PRODUCTS_DELETE,
  Resource.PRODUCTS_LIMIT_50,
  Resource.INVENTORY_VIEW,
  Resource.INVENTORY_ADJUST,
  Resource.INVENTORY_ALERTS,
  Resource.EXPENSES_CREATE,
  Resource.EXPENSES_VIEW,
  Resource.EXPENSES_EDIT,
  Resource.EXPENSES_DELETE,
  Resource.CONTACTS_VIEW,
  Resource.CONTACTS_MANAGE,
  Resource.DEBTS_VIEW,
  Resource.DEBTS_RECORD_PAYMENT,
  Resource.DEBTS_DELETE_PAYMENT,
  Resource.DEBTS_WRITE_OFF,
  Resource.REPORTS_DAILY,
  Resource.RECEIPTS_GENERATE,
  Resource.RECEIPTS_WHATSAPP,
]

export const PLAN_QUOTA_RESOURCES = ['products', 'contacts', 'categories', 'users'] as const

export type PlanQuotaResource = (typeof PLAN_QUOTA_RESOURCES)[number]

export type PlanQuotaMap = Record<PlanQuotaResource, number | null>

export interface PlanQuotaUsage {
  resource: PlanQuotaResource
  limit: number | null
  used: number
  remaining: number | null
  unlimited: boolean
  requiredPlan: SubscriptionPlan | null
}

const unique = <T,>(values: T[]) => Array.from(new Set(values))

// The boolean-resource matrix intentionally preserves current BizTrack-specific
// extras such as scanner/desktop flags while also introducing the documented
// placeholder features from the new plan-permissions spec.
export const DEFAULT_PLAN_RESOURCES: Record<SubscriptionPlan, Resource[]> = {
  [SubscriptionPlan.FREE]: unique([...FREE_PERMISSIONS]),
  [SubscriptionPlan.SOLO]: unique([
    ...FREE_PERMISSIONS,
    Resource.OPENING_BALANCES,
    Resource.PREORDERS,
    Resource.DEPOSITS,
    Resource.CHARGES_MULTIPLE,
    Resource.REPORTS_FINANCIAL,
    Resource.REPORTS_WEEKLY,
    Resource.REPORTS_MONTHLY,
    Resource.REPORTS_EXPORT_PDF,
    Resource.REPORTS_EXPORT_CSV,
    Resource.PRODUCTS_IMPORT_CSV,
    Resource.EXPENSES_CATEGORIES,
    Resource.SCANNER_CAMERA,
    Resource.DESKTOP_ACCESS,
  ]),
  [SubscriptionPlan.BUSINESS]: unique([
    ...FREE_PERMISSIONS,
    Resource.OPENING_BALANCES,
    Resource.PREORDERS,
    Resource.DEPOSITS,
    Resource.CHARGES_MULTIPLE,
    Resource.REPORTS_FINANCIAL,
    Resource.REPORTS_WEEKLY,
    Resource.REPORTS_MONTHLY,
    Resource.REPORTS_EXPORT_PDF,
    Resource.REPORTS_EXPORT_CSV,
    Resource.PRODUCTS_IMPORT_CSV,
    Resource.PRODUCTS_UNLIMITED,
    Resource.EXPENSES_CATEGORIES,
    Resource.SCANNER_CAMERA,
    Resource.DESKTOP_ACCESS,
    Resource.STAFF_INVITE,
    Resource.STAFF_MANAGE,
    Resource.CUSTOM_ROLES,
    Resource.BRANCHES_MULTI,
    Resource.BRANCHES_DASHBOARD,
    Resource.BRANCHES_REPORTS,
  ]),
  [SubscriptionPlan.PRO]: unique([
    ...FREE_PERMISSIONS,
    Resource.OPENING_BALANCES,
    Resource.PREORDERS,
    Resource.DEPOSITS,
    Resource.CHARGES_MULTIPLE,
    Resource.REPORTS_FINANCIAL,
    Resource.REPORTS_WEEKLY,
    Resource.REPORTS_MONTHLY,
    Resource.REPORTS_EXPORT_PDF,
    Resource.REPORTS_EXPORT_CSV,
    Resource.PRODUCTS_IMPORT_CSV,
    Resource.PRODUCTS_UNLIMITED,
    Resource.EXPENSES_CATEGORIES,
    Resource.SCANNER_CAMERA,
    Resource.SCANNER_USB,
    Resource.DESKTOP_ACCESS,
    Resource.STAFF_INVITE,
    Resource.STAFF_MANAGE,
    Resource.CUSTOM_ROLES,
    Resource.BRANCHES_MULTI,
    Resource.BRANCHES_DASHBOARD,
    Resource.BRANCHES_REPORTS,
    Resource.API_ACCESS,
    Resource.AGENT_TRACK,
  ]),
}

// Quotas are the v1 source of truth for count-based restrictions. We keep the
// legacy pseudo-limit resources in the enum for compatibility, but enforcement
// now happens through these numeric limits instead of boolean flags.
export const DEFAULT_PLAN_QUOTAS: Record<SubscriptionPlan, PlanQuotaMap> = {
  [SubscriptionPlan.FREE]: {
    products: 50,
    contacts: 20,
    categories: 10,
    users: 1,
  },
  [SubscriptionPlan.SOLO]: {
    products: 200,
    contacts: null,
    categories: 50,
    users: 1,
  },
  [SubscriptionPlan.BUSINESS]: {
    products: null,
    contacts: null,
    categories: null,
    users: 5,
  },
  [SubscriptionPlan.PRO]: {
    products: null,
    contacts: null,
    categories: null,
    users: null,
  },
}

export interface SpecialPermission {
  resource: Resource
  grantedAt: number
  expiresAt: number | null
  grantedBy: string
  reason: string
  isRevocation: boolean
}

export interface AuthPermissions {
  plan: SubscriptionPlan | null
  effectivePermissions: Resource[]
  specialPermissions: SpecialPermission[]
  permissionsIssuedAt: number
  // `null` means the current entitlement does not expire. A numeric timestamp
  // means "the selected plan is valid until this point, after which the client
  // must fall back to FREE semantics if it cannot revalidate online".
  permissionsExpiresAt: number | null
}
