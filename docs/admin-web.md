# BizTrack CM — Admin Web Frontend
## Complete Documentation — Architecture, Structure & Implementation Guide
**apps/admin-web · NextJS 14 App Router · Tailwind CSS · shadcn/ui**

---

## 1. Purpose & Scope

`apps/admin-web` is the internal admin dashboard for the BizTrack CM team. It is a **fully online** application — no offline support required. Every action requires a live connection to `apps/admin-api`.

It serves four roles with different permission sets:
- **SUPER_ADMIN** — full access
- **FINANCE** — revenue, subscriptions, payments
- **SUPPORT** — businesses, users, tickets, sync errors
- **TECHNICAL** — plans, metrics, sync errors

Custom dynamic roles created through the admin panel also consume this same frontend — the UI adapts based on the permissions embedded in the admin's JWT.

---

## 2. Why Online-Only Changes the Architecture

Unlike the mobile app and desktop client which must work offline, `apps/admin-web` is always connected. This simplifies the architecture significantly:

- **No local database.** All data comes from `apps/admin-api`. No WatermelonDB, no SQLite, no sync engine.
- **Server Components by default.** Data fetching happens on the server in React Server Components — no client-side fetching waterfalls, no loading spinners for initial data.
- **Server Actions for mutations.** Form submissions and data mutations use Next.js Server Actions — no separate API route files needed for most operations.
- **No permission caching on the client.** Permissions are read from the JWT on every server render. No stale permission state.
- **Simple auth.** Sessions are managed with `next-auth` or a lightweight cookie-based approach — no complex token management like the mobile app.

---

## 3. Tech Stack

| Concern | Technology | Reason |
|---------|-----------|--------|
| Framework | Next.js 14 (App Router) | Server Components, Server Actions, built-in routing |
| Language | TypeScript | Shared types with `packages/types` |
| Styling | Tailwind CSS | Utility-first, consistent with design system |
| UI Components | shadcn/ui | Accessible, unstyled primitives, easy to customise |
| Charts | Recharts | React-native charts, works with Server Components via client wrapper |
| Tables | TanStack Table | Headless, powerful — pairs well with shadcn DataTable |
| Forms | React Hook Form + Zod | Validation shared with `packages/validators` |
| Auth | next-auth v5 (Auth.js) | Cookie-based session, credentials provider for email+password |
| HTTP Client | Server-side fetch (native) | Used in Server Components and Server Actions |
| State (client) | Zustand | Lightweight — only for UI state (sidebar, modals, toasts) |
| Toast notifications | sonner | Pairs with shadcn/ui |
| Date handling | date-fns | Lightweight, tree-shakeable |
| Icons | Lucide React | Already bundled with shadcn/ui |

---

## 4. File Structure

```
apps/admin-web/
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── middleware.ts                    ← Route protection + IP check
├── .env.local
│
├── public/
│   └── logo.svg
│
└── src/
    │
    ├── app/                         ← Next.js App Router
    │   │
    │   ├── layout.tsx               Root layout — fonts, providers
    │   ├── not-found.tsx
    │   ├── error.tsx
    │   │
    │   ├── (auth)/                  Auth route group — no sidebar
    │   │   ├── layout.tsx           Centered card layout
    │   │   └── login/
    │   │       └── page.tsx         Email + password login form
    │   │
    │   └── (dashboard)/             Protected route group — with sidebar
    │       ├── layout.tsx           Sidebar + topbar shell
    │       │
    │       ├── page.tsx             Redirect → /overview
    │       │
    │       ├── overview/
    │       │   └── page.tsx         Platform health overview
    │       │
    │       ├── businesses/
    │       │   ├── page.tsx         Business list with filters + pagination
    │       │   └── [id]/
    │       │       └── page.tsx     Business detail + actions
    │       │
    │       ├── users/
    │       │   ├── page.tsx         Client user list
    │       │   └── [id]/
    │       │       └── page.tsx     User detail
    │       │
    │       ├── revenue/
    │       │   └── page.tsx         MRR, ARR, churn charts + breakdown
    │       │
    │       ├── subscriptions/
    │       │   ├── page.tsx         All subscriptions list
    │       │   └── trials/
    │       │       └── page.tsx     Expiring trials — finance team daily view
    │       │
    │       ├── payments/
    │       │   ├── page.tsx         All payments
    │       │   └── failures/
    │       │       └── page.tsx     Failed payments — requires action
    │       │
    │       ├── support/
    │       │   ├── page.tsx         Ticket list
    │       │   ├── [id]/
    │       │   │   └── page.tsx     Ticket detail
    │       │   └── sync-errors/
    │       │       └── page.tsx     Sync error log
    │       │
    │       ├── plans/
    │       │   └── page.tsx         Plan config editor
    │       │
    │       ├── team/
    │       │   ├── page.tsx         Admin team members
    │       │   └── roles/
    │       │       ├── page.tsx     All roles list
    │       │       └── [id]/
    │       │           └── page.tsx Role editor — permissions checkboxes
    │       │
    │       └── audit/
    │           └── page.tsx         Audit log viewer
    │
    ├── components/
    │   │
    │   ├── ui/                      shadcn/ui components (auto-generated)
    │   │   ├── button.tsx
    │   │   ├── card.tsx
    │   │   ├── dialog.tsx
    │   │   ├── dropdown-menu.tsx
    │   │   ├── form.tsx
    │   │   ├── input.tsx
    │   │   ├── select.tsx
    │   │   ├── table.tsx
    │   │   ├── badge.tsx
    │   │   ├── separator.tsx
    │   │   ├── sheet.tsx            Used for mobile sidebar
    │   │   ├── skeleton.tsx         Loading states
    │   │   ├── switch.tsx
    │   │   ├── textarea.tsx
    │   │   ├── toast.tsx
    │   │   └── tooltip.tsx
    │   │
    │   ├── layout/                  App shell components
    │   │   ├── sidebar.tsx          Main navigation sidebar
    │   │   ├── topbar.tsx           Page header + breadcrumbs + admin avatar
    │   │   └── permission-gate.tsx  Conditionally renders based on permissions
    │   │
    │   ├── data-table/              Reusable table system (TanStack Table)
    │   │   ├── data-table.tsx       Generic table component
    │   │   ├── data-table-toolbar.tsx    Search + filter bar
    │   │   ├── data-table-pagination.tsx
    │   │   └── data-table-column-header.tsx  Sortable column headers
    │   │
    │   ├── charts/                  Chart components (client components)
    │   │   ├── mrr-chart.tsx        Line chart — MRR over time
    │   │   ├── plan-breakdown.tsx   Pie/donut — revenue by plan
    │   │   └── growth-chart.tsx     Bar chart — new businesses over time
    │   │
    │   ├── businesses/
    │   │   ├── business-columns.tsx      TanStack column definitions
    │   │   ├── business-status-badge.tsx
    │   │   ├── suspend-dialog.tsx        Confirm + reason input dialog
    │   │   └── override-form.tsx         Grant/revoke resource override
    │   │
    │   ├── users/
    │   │   ├── user-columns.tsx
    │   │   └── resend-otp-dialog.tsx
    │   │
    │   ├── support/
    │   │   ├── ticket-columns.tsx
    │   │   ├── ticket-form.tsx           Create/edit ticket
    │   │   └── severity-badge.tsx
    │   │
    │   ├── payments/
    │   │   ├── payment-columns.tsx
    │   │   └── retry-payment-button.tsx  Client component — calls Server Action
    │   │
    │   ├── plans/
    │   │   ├── plan-resource-editor.tsx  Checkbox grid for plan permissions
    │   │   └── plan-change-warning.tsx   Shows blast radius before saving
    │   │
    │   ├── team/
    │   │   ├── admin-user-form.tsx
    │   │   └── role-permission-editor.tsx  Dynamic permission assignment
    │   │
    │   └── shared/
    │       ├── stat-card.tsx          KPI metric card
    │       ├── empty-state.tsx
    │       ├── error-boundary.tsx
    │       ├── confirm-dialog.tsx     Generic confirmation dialog
    │       ├── reason-dialog.tsx      Dialog that requires a reason string
    │       └── copy-button.tsx        Copy UUID/phone to clipboard
    │
    ├── lib/
    │   ├── api.ts                     Typed fetch wrapper for admin API calls
    │   ├── auth.ts                    next-auth config (credentials provider)
    │   ├── permissions.ts             Permission check helpers
    │   ├── utils.ts                   cn() helper, formatters
    │   ├── formatters.ts              XAF currency, dates, phone masking
    │   └── constants.ts               Permission strings, route map
    │
    ├── hooks/
    │   ├── use-permission.ts          Check if current admin has a permission
    │   ├── use-confirm.ts             Programmatic confirm dialog
    │   └── use-debounce.ts            For search inputs
    │
    ├── actions/                       Next.js Server Actions
    │   ├── businesses.actions.ts      suspend, activate, override
    │   ├── users.actions.ts           suspend, resend-otp
    │   ├── payments.actions.ts        retry, waive
    │   ├── subscriptions.actions.ts   edit subscription
    │   ├── support.actions.ts         create, update, assign tickets
    │   ├── plans.actions.ts           update plan resources
    │   ├── team.actions.ts            create/edit/deactivate admin users
    │   └── roles.actions.ts           create/edit/delete roles
    │
    └── types/
        └── admin.ts                   Frontend-specific type extensions
```

---

## 5. Authentication

### How it Works

Admin auth uses **next-auth v5** with a credentials provider. The session stores the admin's JWT from `apps/admin-api`, their role, and their permissions array.

```
Admin enters email + password
      │
      ▼
next-auth CredentialsProvider
      │
      ▼
POST apps/admin-api/admin/auth/login
      │
      ▼
Returns: { accessToken, refreshToken, admin: { id, name, role, permissions, scopes } }
      │
      ▼
next-auth stores in encrypted cookie session:
  { accessToken, refreshToken, admin, permissions, scopes, expiresAt }
      │
      ▼
Every Server Component reads session via getServerSession()
Every Server Action reads session via getServerSession()
```

### next-auth Configuration

```typescript
// src/lib/auth.ts

import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email:    { type: 'email' },
        password: { type: 'password' },
      },
      async authorize(credentials) {
        const res = await fetch(`${process.env.ADMIN_API_URL}/admin/auth/login`, {
          method: 'POST',
          body: JSON.stringify(credentials),
          headers: { 'Content-Type': 'application/json' },
        })

        if (!res.ok) return null

        const data = await res.json()
        return {
          id:          data.admin.id,
          name:        data.admin.name,
          email:       data.admin.email,
          role:        data.admin.role,
          isSuperAdmin: data.admin.isSuperAdmin,
          permissions: data.admin.permissions,   // string[]
          scopes:      data.admin.scopes,        // Record<string, scope>
          accessToken: data.tokens.accessToken,
          refreshToken: data.tokens.refreshToken,
        }
      },
    }),
  ],

  callbacks: {
    jwt({ token, user }) {
      if (user) Object.assign(token, user)
      return token
    },
    session({ session, token }) {
      session.admin = token as AdminSession
      return session
    },
  },

  pages: {
    signIn: '/login',
    error:  '/login',
  },
})
```

### Token Refresh

Access tokens expire in 1 hour. Refresh before expiry:

```typescript
// src/lib/api.ts — called before every admin API request

async function refreshAccessToken(session: AdminSession) {
  const res = await fetch(`${process.env.ADMIN_API_URL}/admin/auth/refresh`, {
    method: 'POST',
    body: JSON.stringify({ refreshToken: session.refreshToken }),
    headers: { 'Content-Type': 'application/json' },
  })

  if (!res.ok) return null   // triggers sign-out on the client

  const data = await res.json()
  return {
    ...session,
    accessToken:  data.tokens.accessToken,
    refreshToken: data.tokens.refreshToken,
    expiresAt:    Date.now() + 60 * 60 * 1000,   // 1 hour
  }
}
```

---

## 6. Route Protection (Middleware)

```typescript
// middleware.ts

import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const isLoggedIn  = !!req.auth
  const isLoginPage = req.nextUrl.pathname.startsWith('/login')

  // Not logged in — redirect to login
  if (!isLoggedIn && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Already logged in — redirect away from login
  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL('/overview', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
```

---

## 7. Permission System on the Frontend

### The Core Principle

**The frontend never makes security decisions.** Permissions are enforced by `apps/admin-api`. The frontend uses permissions only to:
1. Hide or show UI elements (buttons, menu items, entire pages)
2. Show a "permission denied" state instead of a blank page

A SUPPORT admin navigating to `/revenue` does not get an error page — the page renders but shows a "You don't have access to this section" message, which is better UX than a 404 or 500.

### Permission Check Helpers

```typescript
// src/lib/permissions.ts

import { auth } from '@/lib/auth'

// Use in Server Components
export async function getAdminPermissions() {
  const session = await auth()
  return {
    permissions: session?.admin?.permissions ?? [],
    scopes:      session?.admin?.scopes ?? {},
    isSuperAdmin: session?.admin?.isSuperAdmin ?? false,
  }
}

export function hasPermission(
  permissions: string[],
  isSuperAdmin: boolean,
  required: string,
): boolean {
  if (isSuperAdmin) return true
  return permissions.includes(required)
}
```

```typescript
// src/hooks/use-permission.ts — for Client Components

'use client'
import { useSession } from 'next-auth/react'

export function usePermission(required: string): boolean {
  const { data: session } = useSession()
  if (!session?.admin) return false
  if (session.admin.isSuperAdmin) return true
  return session.admin.permissions.includes(required)
}
```

### PermissionGate Component

Wraps any UI element — renders it only if the admin has the required permission:

```typescript
// src/components/layout/permission-gate.tsx

import { auth } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'

interface Props {
  permission: string
  children: React.ReactNode
  fallback?: React.ReactNode   // optional — shown when no permission
}

export async function PermissionGate({ permission, children, fallback }: Props) {
  const session = await auth()
  const can = hasPermission(
    session?.admin?.permissions ?? [],
    session?.admin?.isSuperAdmin ?? false,
    permission,
  )

  if (!can) return fallback ? <>{fallback}</> : null
  return <>{children}</>
}

// Usage in a Server Component:
<PermissionGate permission="businesses:suspend">
  <SuspendButton businessId={business.id} />
</PermissionGate>

<PermissionGate
  permission="revenue:view"
  fallback={<RevenueAccessDenied />}
>
  <RevenueMetrics data={metrics} />
</PermissionGate>
```

### Sidebar Navigation

The sidebar filters its links based on the admin's permissions. Links to pages the admin cannot access are hidden entirely — they never see a nav item they cannot use.

```typescript
// src/components/layout/sidebar.tsx (simplified)

const navItems = [
  { href: '/overview',       label: 'Overview',       permission: 'metrics:view',        icon: LayoutDashboard },
  { href: '/businesses',     label: 'Businesses',     permission: 'businesses:view',     icon: Building2 },
  { href: '/users',          label: 'Users',          permission: 'users:view',          icon: Users },
  { href: '/revenue',        label: 'Revenue',        permission: 'revenue:view',        icon: TrendingUp },
  { href: '/subscriptions',  label: 'Subscriptions',  permission: 'subscriptions:view',  icon: CreditCard },
  { href: '/payments',       label: 'Payments',       permission: 'payments:view',       icon: Banknote },
  { href: '/support',        label: 'Support',        permission: 'support:view',        icon: HeadphonesIcon },
  { href: '/plans',          label: 'Plans',          permission: 'plans:view',          icon: Settings },
  { href: '/team',           label: 'Team',           permission: 'admin_users:view',    icon: UserCog },
  { href: '/audit',          label: 'Audit Log',      permission: 'audit_logs:view',     icon: ScrollText },
]
```

---

## 8. Data Fetching Strategy

### Server Components (default)

Every page that displays data uses a React Server Component. Data is fetched on the server before the page is sent to the browser — no loading spinners for the initial render, no client-side fetch waterfalls.

```typescript
// src/app/(dashboard)/businesses/page.tsx

import { auth } from '@/lib/auth'
import { adminFetch } from '@/lib/api'
import { BusinessesTable } from '@/components/businesses/businesses-table'

interface Props {
  searchParams: { page?: string; status?: string; plan?: string; q?: string }
}

export default async function BusinessesPage({ searchParams }: Props) {
  const session = await auth()

  // Data fetched on the server — no useEffect, no loading state
  const { data, meta } = await adminFetch('/admin/businesses', {
    params: searchParams,
    session,
  })

  return (
    <div>
      <h1>Businesses</h1>
      <BusinessesTable data={data} meta={meta} />
    </div>
  )
}
```

### The `adminFetch` Helper

A typed wrapper around native `fetch` that:
- Attaches the admin's `Authorization: Bearer <token>` header
- Handles token refresh if the access token is expired
- Returns typed responses
- Throws on non-2xx with structured error information

```typescript
// src/lib/api.ts

export async function adminFetch<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    params?: Record<string, string | undefined>
    body?: unknown
    session: AdminSession
  },
): Promise<T> {
  const url = new URL(`${process.env.ADMIN_API_URL}${path}`)

  // Append query params
  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, v)
    })
  }

  const res = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.session.accessToken}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',   // admin data is always fresh
  })

  if (res.status === 401) {
    // Token expired — sign out
    redirect('/login')
  }

  if (!res.ok) {
    const error = await res.json()
    throw new AdminApiError(error.message, error.code, res.status)
  }

  return res.json()
}
```

### Server Actions (for mutations)

All create/update/delete operations use Next.js Server Actions. No separate API route files — the action runs on the server, calls `apps/admin-api`, revalidates the relevant page cache, and returns a result to the client.

```typescript
// src/actions/businesses.actions.ts

'use server'

import { auth } from '@/lib/auth'
import { adminFetch } from '@/lib/api'
import { revalidatePath } from 'next/cache'

export async function suspendBusiness(
  businessId: string,
  reason: string,
): Promise<ActionResult> {
  const session = await auth()

  // Server-side permission check — belt and braces
  if (!session?.admin?.permissions.includes('businesses:suspend')
      && !session?.admin?.isSuperAdmin) {
    return { success: false, error: 'Insufficient permissions' }
  }

  try {
    await adminFetch(`/admin/businesses/${businessId}/status`, {
      method: 'PATCH',
      body: { status: 'SUSPENDED', reason },
      session,
    })

    revalidatePath('/businesses')
    revalidatePath(`/businesses/${businessId}`)

    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
```

**Why Server Actions instead of client-side fetch?**
- No API route boilerplate
- Permission is re-checked server-side before the API call
- `revalidatePath` keeps the page data fresh after mutations
- The admin's access token never touches client-side JavaScript

### Client Components (only when needed)

Client components are used only when interactivity requires it:
- Charts (Recharts requires browser APIs)
- Data tables with client-side sorting/filtering
- Dialogs and modals
- Toast notifications
- Real-time search with debounce

They are always leaf nodes in the component tree — never wrap Server Components.

---

## 9. Page-by-Page Specification

### /overview
**Data:** `GET /admin/metrics/overview`
**Server Component:** Yes
**Permission:** `metrics:view`

Displays:
- KPI stat cards: total businesses, active today, open tickets, critical tickets, sync errors, failed payments
- Revenue stat cards (hidden via `PermissionGate` if no `revenue:view`): MRR, trial count, churn rate
- Recent signups table (last 10 businesses)
- System health indicators: sync error count, failed payment count, open critical tickets

Each stat card links to the relevant detail page.

---

### /businesses
**Data:** `GET /admin/businesses` (paginated)
**Server Component:** Yes — table rendered server-side with initial data
**Permission:** `businesses:view`

Search params drive server-side filtering:
- `q` — search by name, owner phone/email
- `status` — ONBOARDING | PLAN_PENDING | ACTIVE | SUSPENDED
- `plan` — FREE | SOLO | BUSINESS | PRO
- `city`
- `page`, `limit`

Columns: Business name, Owner, City, Plan badge, Status badge, Members, Last active, Created at, Actions menu.

Actions menu (gated by permission):
- View detail → `/businesses/:id`
- Suspend/Activate (`businesses:suspend`) — opens `ReasonDialog`
- Grant override (`businesses:override_permissions`) — opens `OverrideForm` sheet

---

### /businesses/[id]
**Data:** `GET /admin/businesses/:id`
**Server Component:** Yes
**Permission:** `businesses:view`

Sections:
1. **Business info** — name, type, city, currency, status, created at
2. **Owner** — name, phone (masked), email (masked), onboarding step
3. **Subscription** — plan, status, trial end date, MRR contribution. Edit button (`subscriptions:edit`)
4. **Members** — table of all BusinessMembers with roles
5. **Active overrides** — list of special permission grants/revocations. Add/remove buttons (`businesses:override_permissions`)
6. **Payment history** — last 10 payment attempts with status
7. **Subscription event log** — timeline of plan changes, trial start/end, payments
8. **Sync activity** — last sync timestamp, device count, any active errors
9. **Actions** — Suspend/Activate button (`businesses:suspend`)

---

### /users
**Data:** `GET /admin/users/clients`
**Permission:** `users:view`

Search: name, phone, email.
Columns: Name, Phone (masked), Email (masked), Status, Onboarding step, Business count, Created at.
Actions: View detail, Suspend/Activate, Resend OTP.

---

### /users/[id]
**Data:** `GET /admin/users/clients/:id`
**Permission:** `users:view`

Sections:
1. User info + verification status
2. Onboarding progress indicator
3. Business memberships — list with roles and business names
4. Login history — last 10 sessions (date + IP only, no tokens)
5. Actions: Suspend, Resend OTP (`users:resend_otp`)

---

### /revenue
**Data:** `GET /admin/metrics/revenue` + `GET /admin/metrics/mrr-history` + `GET /admin/metrics/revenue/breakdown`
**Permission:** `revenue:view`
**Charts:** Client Components (Recharts)

If admin lacks `revenue:view`, show a full-page `AccessDenied` component with their current role displayed.

Layout:
- Top row: MRR, ARR, Churn Rate, ARPU, Trial Conversion Rate stat cards
- Main chart: MRR over time line chart (period selector: 7d / 30d / 90d / 12m)
- Secondary charts: Revenue by plan (donut), New vs Churning MRR (stacked bar)
- Bottom: Plan breakdown table with subscriber count + revenue per plan

---

### /subscriptions
**Data:** `GET /admin/subscriptions`
**Permission:** `subscriptions:view`

Filters: status, plan, expiringWithin.
Columns: Business, Plan, Status badge, Trial ends, Period end, Cancel at period end.
Actions: Edit subscription (`subscriptions:edit`) — opens a dialog with plan, status, trialEndsAt fields + required reason.

Sub-page `/subscriptions/trials`: sorted by `trialEndsAt` ascending. Highlights businesses expiring within 7 days in amber. This is the finance team's daily check — they reach out to businesses before their trial expires.

---

### /payments
**Data:** `GET /admin/payments`
**Permission:** `payments:view`

Filters: status, provider, dateRange.
Columns: Business, Amount (XAF), Plan, Provider, Status badge, Created at.

Sub-page `/payments/failures`: shows only failed payments. Each row has:
- Retry button (`payments:retry`) — triggers Server Action, shows optimistic status
- Waive button (`payments:waive`) — opens `ReasonDialog`, then Server Action

---

### /support
**Data:** `GET /admin/support/tickets`
**Permission:** `support:view`

Filters: status, severity, category, assignedTo.
Columns: Title, Business, Severity badge, Category badge, Status badge, Assigned to, Created at.

Ticket detail `/support/:id`: full description, resolution notes, assignment, status timeline, linked business link.

Create ticket button (`support:create_ticket`) — opens a sheet form with: business search, title, description, category, severity.

Sub-page `/support/sync-errors`: businesses with active sync errors. Columns: Business, Last sync, Error type, Device count, Error count. Resolve button (`sync_errors:resolve`).

---

### /plans
**Data:** `GET /admin/plans`
**Permission:** `plans:view`

Shows four plan cards (FREE, SOLO, BUSINESS, PRO) each listing their current resources.

Edit button (`plans:edit`) opens an inline editor:
- Checkbox grid of all available `Resource` enum values
- Grouped by module (SALES, PRODUCTS, INVENTORY, REPORTS, etc.)
- Before saving, show `PlanChangeWarning` component: "This will affect X businesses currently on the [PLAN] plan. Their permissions will update within 5 minutes."
- Requires typing the plan name to confirm (like GitHub's destructive action pattern)
- Calls Server Action → `PATCH /admin/plans/:plan`

---

### /team
**Data:** `GET /admin/users` (admin users)
**Permission:** `admin_users:view`

Columns: Name, Email, Role badge, Active status, Last login, Created by, Created at.
Invite button (`admin_users:manage`) — opens form: name, email, password, role selector.

Sub-page `/team/roles`: list of all roles (system + dynamic).
- Each role shows: name, `SYSTEM` badge if system role, permission count, member count
- Create role button (`admin_roles:manage`) — opens role editor
- Edit role button → `/team/roles/:id`

Role editor `/team/roles/:id`:
- Name field (disabled for system roles)
- Description field
- Permission grid — checkboxes grouped by module
- Scope inputs appear inline when a permission is checked (optional city/plan filter)
- Save button — calls Server Action, invalidates relevant admin sessions

---

### /audit
**Data:** `GET /admin/audit-logs`
**Permission:** `audit_logs:view` (SUPER_ADMIN only)

Read-only table. No actions.
Filters: adminUser, action, entityType, dateRange.
Columns: Admin (name + role), Action, Entity type, Entity ID (copyable), IP, Date.
Expandable row: shows full `payload` JSON diff (before/after).

---

## 10. Shared Component Patterns

### StatCard
Used across overview and revenue pages.

```typescript
<StatCard
  label="MRR"
  value={formatXAF(metrics.mrr)}
  change={+12.3}                      // percentage change
  changeLabel="vs last month"
  icon={TrendingUp}
  href="/revenue"                      // optional — makes card clickable
/>
```

### ReasonDialog
Any destructive action that requires a written reason before proceeding.

```typescript
<ReasonDialog
  title="Suspend Business"
  description="This will prevent the business from accessing the platform. The owner will be notified by SMS."
  confirmLabel="Suspend"
  confirmVariant="destructive"
  onConfirm={async (reason) => {
    const result = await suspendBusiness(businessId, reason)
    if (result.success) toast.success('Business suspended')
    else toast.error(result.error)
  }}
/>
```

### DataTable
Generic table with TanStack Table. Column definitions live next to their page.

```typescript
// Standard pattern for every table page
<DataTable
  columns={businessColumns}
  data={businesses}
  meta={paginationMeta}
  toolbar={<BusinessTableToolbar />}
/>
```

---

## 11. Error Handling

Three levels of error handling:

**Page level** — `error.tsx` files catch unhandled errors in Server Components. Shows a friendly error card with a retry button.

**Action level** — Server Actions return `{ success: boolean, error?: string }`. The calling Client Component shows a toast on failure.

**API level** — `adminFetch` throws `AdminApiError` with a code and message. Caught by `error.tsx` or by try/catch in Server Actions.

Special case — **403 Forbidden from API**: If `apps/admin-api` returns 403 (permission denied), show an `AccessDenied` component with the required permission name. This should rarely happen if the frontend's `PermissionGate` is working correctly, but API-level enforcement is the real gate.

Special case — **401 Unauthorized from API**: The access token has expired and refresh failed. Call `signOut()` and redirect to `/login`.

---

## 12. Loading States

Use React Suspense + `loading.tsx` for page-level skeletons. Each section of a complex page (like `/businesses/:id`) can have its own Suspense boundary so different sections load independently.

```
/businesses/[id]/
├── page.tsx              Wraps sections in Suspense
├── loading.tsx           Full-page skeleton
└── _sections/
    ├── business-info.tsx       Immediate — from main page fetch
    ├── subscription.tsx        Wrapped in Suspense
    ├── members.tsx             Wrapped in Suspense
    └── payment-history.tsx     Wrapped in Suspense — slowest query
```

---

## 13. Internationalisation

The admin dashboard is **English only**. The admin team is internal — bilingual UI adds complexity without value here.

All strings are hardcoded in English. No `next-intl` setup needed for `apps/admin-web`.

However, when the admin API returns error messages (which are localised based on the `Accept-Language` header), the admin frontend sends `Accept-Language: en` on all requests.

---

## 14. Environment Variables

```env
# apps/admin-web/.env.local

ADMIN_API_URL=http://localhost:3001         # apps/admin-api base URL
NEXTAUTH_URL=http://localhost:3002          # admin-web URL
NEXTAUTH_SECRET=<random-32-char-string>    # next-auth session encryption

# Production
ADMIN_API_URL=https://admin-api.biztrack.cm
NEXTAUTH_URL=https://admin.biztrack.cm
```

---

## 15. Implementation Order

### Sprint 1 — Foundation (Week 1)
- Scaffold `apps/admin-web` in monorepo
- Install and configure: Tailwind, shadcn/ui (init + base components), next-auth v5
- Implement login page + next-auth credentials provider
- Implement middleware (route protection)
- Implement `adminFetch` helper
- Build sidebar + topbar shell layout
- Build `PermissionGate` component
- Build `usePermission` hook
- Configure permission-filtered sidebar navigation

### Sprint 2 — Business & User Pages (Week 2)
- /overview page — stat cards + recent signups
- /businesses page — DataTable with filters
- /businesses/:id — full detail page + all sections
- Suspend/activate dialog + Server Action
- Override grant/revoke form + Server Action
- /users page
- /users/:id page
- Resend OTP dialog + Server Action

### Sprint 3 — Finance Pages (Week 3)
- /revenue page — charts + MRR metrics
- /subscriptions page + /subscriptions/trials
- Subscription edit dialog + Server Action
- /payments page + /payments/failures
- Retry + Waive payment Server Actions

### Sprint 4 — Support, Plans & Admin Management (Week 4)
- /support page + /support/:id
- Create/update ticket forms + Server Actions
- /support/sync-errors + resolve action
- /plans page — resource editor + PlanChangeWarning
- /team page — admin user list + create form
- /team/roles page — role list
- /team/roles/:id — role permission editor + scope inputs
- /audit page — read-only audit log table