# BizTrack CM Admin Dashboard
## Complete Documentation — Architecture, Roles, Dynamic RBAC & Implementation Guide
**apps/admin-api + apps/admin-web · Version 1.0**

---

## 1. Purpose & Business Context

The BizTrack CM admin dashboard is the internal operations platform used exclusively by the BizTrack CM team. It is completely separate from the client-facing platform that business owners and their staff use.

Its core purpose at launch is to give the team full visibility and control over:
- Who is using the platform and how
- Revenue health (MRR, trials converting or expiring, payment failures)
- Customer support (responding to issues, resolving sync errors, unlocking features)
- Platform configuration (what each plan includes, special grants for specific clients)

It is **not** a public-facing product. It is an internal tool. This distinction drives every architectural decision — security over convenience, auditability over speed, control over self-service.

---

## 2. Why a Separate Admin API

The admin API lives in `apps/admin-api` — completely separate from `apps/api`. This is a deliberate architectural boundary.

**Security isolation.** A vulnerability in the client API cannot be exploited to gain admin access. The admin API runs on a different port, has its own authentication system, its own rate limits, and is not exposed to the public internet.

**Independent deployment.** The admin API can be deployed, restarted, or rolled back without affecting the client-facing API.

**Different security posture.** The client API is optimised for mobile performance and high throughput. The admin API is optimised for auditability, role enforcement, and safety.

**Shared database.** Both APIs connect to the same PostgreSQL database. No data duplication — just two different entry points to the same truth.

---

## 3. Role Architecture — Hybrid Static + Dynamic RBAC

The admin role system uses a hybrid model: a static layer that is always guaranteed to work, and a fully dynamic RBAC layer on top for flexibility.

### 3.1 Why Hybrid

Pure dynamic RBAC has a bootstrap problem — who configures the roles before anyone can use the system? It also introduces risk: a misconfiguration could accidentally strip a super admin of their own permissions or grant sensitive access to the wrong person.

The hybrid model solves this:

```
LAYER 1 — SUPER_ADMIN (static, hardcoded, immutable)
│  Always has access to everything.
│  Cannot be modified, deleted, or have permissions removed.
│  This is the escape hatch — if dynamic RBAC breaks, SUPER_ADMIN still works.
│  Maximum 2 accounts should hold this role (founders/CTO only).
│
LAYER 2 — BASELINE ROLES (seeded in DB, permissions editable by SUPER_ADMIN)
│  FINANCE, SUPPORT, TECHNICAL ship with sensible default permissions.
│  Their permission sets CAN be edited.
│  They serve as templates for creating new custom roles.
│  The role names themselves cannot be deleted (they are system roles).
│
LAYER 3 — DYNAMIC ROLES (fully configurable)
   Any name, any combination of permissions.
   Created and managed by SUPER_ADMIN.
   Assigned to any admin user.
   Examples: "Customer Success", "Marketing", "Regional Manager Douala"
```

### 3.2 Default Baseline Role Permissions

These are the seeded defaults. SUPER_ADMIN can modify these after seeding.

**FINANCE** (default permissions):
```
revenue:view, payments:view, payments:retry, payments:waive,
subscriptions:view, subscriptions:edit, businesses:view (read-only)
```

**SUPPORT** (default permissions):
```
businesses:view, businesses:suspend, businesses:override_permissions,
users:view, users:suspend, users:resend_otp,
support:view, support:create_ticket, support:resolve_ticket,
sync_errors:view, sync_errors:resolve
```

**TECHNICAL** (default permissions):
```
businesses:view, sync_errors:view, sync_errors:resolve,
plans:view, plans:edit, metrics:view
```

### 3.3 The Full Admin Permission Space

Admin permissions follow the pattern `{module}:{action}`.

```
MODULE: businesses
  businesses:view                View business list and details
  businesses:suspend             Suspend or activate a business
  businesses:override_permissions Grant/revoke plan-level resource overrides
  businesses:delete              Permanently delete a business (SUPER_ADMIN only)

MODULE: users
  users:view                     View client user list and details
  users:suspend                  Suspend or activate a user account
  users:resend_otp               Trigger a new OTP for a stuck user
  users:delete                   Permanently delete a user (SUPER_ADMIN only)

MODULE: revenue
  revenue:view                   View MRR, ARR, churn, conversion metrics

MODULE: subscriptions
  subscriptions:view             View subscription status for all businesses
  subscriptions:edit             Manually adjust plan, trial dates, status

MODULE: payments
  payments:view                  View all payment transactions
  payments:retry                 Trigger a retry on a failed payment
  payments:waive                 Mark a failed payment as waived

MODULE: support
  support:view                   View all support tickets
  support:create_ticket          Create a new support ticket
  support:resolve_ticket         Mark tickets as resolved/closed
  support:assign_ticket          Assign tickets to admin team members

MODULE: sync_errors
  sync_errors:view               View sync error logs
  sync_errors:resolve            Acknowledge and trigger manual sync

MODULE: plans
  plans:view                     View plan configurations and resource lists
  plans:edit                     Modify what resources a plan includes

MODULE: metrics
  metrics:view                   View platform overview metrics

MODULE: audit_logs
  audit_logs:view                View the full admin audit log (SUPER_ADMIN only)

MODULE: admin_users
  admin_users:view               View admin team member list
  admin_users:manage             Create/edit/deactivate admin users (SUPER_ADMIN only)

MODULE: admin_roles
  admin_roles:view               View all roles and their permissions
  admin_roles:manage             Create/edit/delete dynamic roles (SUPER_ADMIN only)
```

### 3.4 Scope-Based Permissions

Some permissions can carry an optional **scope** — a constraint that limits which records they apply to. This enables regional or segment-specific access without creating a separate codebase.

```typescript
interface PermissionScope {
  city?:   string      // e.g. "Douala" — limits to businesses in this city
  plan?:   PlanName    // e.g. "PRO" — limits to businesses on this plan
  // Extend with more scope types as needed
}
```

Example use cases:
- A "Douala Support Agent" role: `businesses:view` with scope `{ city: "Douala" }` — can only see Douala businesses
- A "Pro Client Success" role: `businesses:view` + `support:create_ticket` with scope `{ plan: "PRO" }` — focused on Pro customers

Scope is enforced server-side by the `AdminRoleGuard` — the query is automatically filtered before returning results.

---

## 4. Database Tables

### 4.1 New Tables

#### `admin_users`
The BizTrack CM team members who can access this dashboard.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | varchar(100) | |
| email | varchar(255) UNIQUE | Admin login identifier |
| password_hash | varchar(255) | bcrypt cost 12 |
| admin_role_id | uuid FK → admin_roles | Current assigned role |
| is_active | boolean DEFAULT true | |
| is_super_admin | boolean DEFAULT false | Static flag — never dynamic |
| last_login_at | timestamptz NULLABLE | |
| created_by | uuid FK → admin_users NULLABLE | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Important:** `is_super_admin` is a boolean column, not a role. A SUPER_ADMIN also has an `admin_role_id` (pointing to the SUPER_ADMIN system role) but the `is_super_admin` flag is what the guard checks. This flag can only be set via direct DB migration — never through the API.

#### `admin_roles`
All roles — both system baseline roles and dynamic custom roles.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | varchar(100) UNIQUE | e.g. "FINANCE", "Customer Success Douala" |
| description | text NULLABLE | |
| is_system_role | boolean DEFAULT false | true = FINANCE, SUPPORT, TECHNICAL (name cannot be deleted) |
| created_by | uuid FK → admin_users NULLABLE | null = seeded |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `admin_role_permissions`
The many-to-many join between roles and permissions.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| admin_role_id | uuid FK → admin_roles CASCADE | INDEX |
| permission | varchar(100) | e.g. "businesses:view" |
| scope | jsonb NULLABLE | e.g. `{ "city": "Douala" }` |
| created_at | timestamptz | |
| | | UNIQUE(admin_role_id, permission) | |

#### `admin_refresh_tokens`
Separate from client refresh tokens.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| admin_user_id | uuid FK → admin_users | INDEX |
| token_hash | varchar(255) UNIQUE | bcrypt hash |
| family_id | uuid | INDEX |
| used | boolean DEFAULT false | |
| expires_at | timestamptz | 8 hours |
| revoked_at | timestamptz NULLABLE | |
| created_at | timestamptz | |

#### `audit_logs`
Immutable. Append-only. Never deleted through the API.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| admin_user_id | uuid FK → admin_users | |
| admin_role_name | varchar(100) | Role name at time of action (denormalised — roles can change) |
| action | varchar(100) | e.g. BUSINESS_SUSPENDED |
| entity_type | varchar(50) | e.g. Business |
| entity_id | uuid NULLABLE | |
| payload | jsonb NULLABLE | Before/after values, sanitized |
| ip_address | varchar(45) | |
| user_agent | varchar(255) | |
| created_at | timestamptz | |

#### `support_tickets`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| business_id | uuid FK → businesses NULLABLE | |
| user_id | uuid FK → users NULLABLE | |
| created_by | uuid FK → admin_users | |
| assigned_to | uuid FK → admin_users NULLABLE | |
| title | varchar(255) | |
| description | text | |
| category | enum(TicketCategory) | SYNC \| PAYMENT \| APP \| HARDWARE \| FEEDBACK \| OTHER |
| severity | enum(TicketSeverity) | CRITICAL \| WARNING \| INFO |
| status | enum(TicketStatus) | OPEN \| IN_PROGRESS \| RESOLVED \| CLOSED |
| resolution | text NULLABLE | |
| resolved_at | timestamptz NULLABLE | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

## 5. File Structure

```
apps/admin-api/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   │
│   ├── config/
│   │   └── configuration.ts
│   │
│   ├── common/
│   │   ├── guards/
│   │   │   ├── admin-jwt.guard.ts         Validates admin JWT
│   │   │   └── admin-permission.guard.ts  ← NEW: replaces role guard
│   │   │                                   Checks permission string + scope
│   │   ├── decorators/
│   │   │   ├── require-permission.decorator.ts  @RequirePermission('businesses:view')
│   │   │   └── current-admin.decorator.ts
│   │   ├── filters/
│   │   │   └── admin-exception.filter.ts
│   │   └── interceptors/
│   │       └── audit.interceptor.ts
│   │
│   └── modules/
│       ├── admin-auth/
│       ├── admin-users/          Manage admin team accounts
│       ├── admin-roles/          ← NEW: CRUD for dynamic roles + permissions
│       ├── businesses/
│       ├── users/
│       ├── subscriptions/
│       ├── payments/
│       ├── support/
│       ├── plans/
│       ├── metrics/
│       └── audit/
```

---

## 6. How Dynamic RBAC Works at Runtime

### 6.1 Loading Permissions

On every admin request, the guard needs to know what permissions the requesting admin has. This must be fast — not a join query on every request.

**Strategy: Cache permissions in the JWT + Redis.**

When an admin logs in, their effective permissions are loaded from `admin_role_permissions` (for their assigned role) and embedded in the JWT:

```typescript
// JWT payload for admin access token
interface AdminJwtPayload {
  sub:         string        // adminUserId
  role:        string        // role name e.g. "SUPPORT"
  isSuperAdmin: boolean      // static flag
  permissions: string[]      // ["businesses:view", "users:view", ...]
  scopes:      Record<string, PermissionScope>  // { "businesses:view": { city: "Douala" } }
  iat:         number
  exp:         number
}
```

Permissions are embedded in the JWT so the guard can check them without a database query on every request. The JWT expires in 1 hour — any permission changes made by SUPER_ADMIN take effect within 1 hour without requiring the affected admin to log out.

For longer-lived Redis caching (useful for the refresh endpoint), permissions are also cached:
```
Redis key: admin_permissions:{adminUserId}
TTL: 1 hour
Value: { permissions: string[], scopes: Record<string, PermissionScope> }
```

When an admin's role is changed, the Redis cache is invalidated immediately.

### 6.2 The Permission Guard

```typescript
// common/guards/admin-permission.guard.ts

export const RequirePermission = (permission: string) =>
  SetMetadata('required_permission', permission)

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest()
    const admin = req.admin             // populated by AdminJwtGuard

    // SUPER_ADMIN bypasses all permission checks
    if (admin.isSuperAdmin) return true

    const required = this.reflector.get<string>(
      'required_permission',
      context.getHandler()
    )
    if (!required) return true          // no permission declared = any admin

    const hasPermission = admin.permissions.includes(required)
    if (!hasPermission) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_PERMISSIONS',
        required,
        message: `Your role does not have the '${required}' permission.`,
      })
    }

    // Attach scope to request for use in service layer
    req.permissionScope = admin.scopes?.[required] ?? null

    return true
  }
}
```

### 6.3 Scope Enforcement in Services

When a permission has a scope, the service layer must apply it to queries:

```typescript
// modules/businesses/businesses.service.ts

async findAll(
  filters: BusinessFiltersDto,
  scope: PermissionScope | null,
): Promise<PaginatedResult<BusinessSummary>> {
  const qb = this.businessRepo.createQueryBuilder('b')

  // Apply permission scope first — this cannot be bypassed
  if (scope?.city) {
    qb.andWhere('b.city = :city', { city: scope.city })
  }
  if (scope?.plan) {
    qb.andWhere('b.plan = :plan', { plan: scope.plan })
  }

  // Then apply user-requested filters (within the scope)
  if (filters.status)  qb.andWhere('b.businessStatus = :status', { status: filters.status })
  if (filters.plan)    qb.andWhere('b.plan = :plan', { plan: filters.plan })
  if (filters.search)  qb.andWhere('b.name ILIKE :q OR u.phone ILIKE :q', { q: `%${filters.search}%` })

  // ...
}
```

The scope is injected into every service call. A scoped admin cannot filter their scope away — it is always AND-ed with their filters.

---

## 7. Admin Roles Module — Endpoints

### GET /admin/roles
Returns all roles (system + dynamic) with their permission lists.
**Permission required:** `admin_roles:view`

Response per role:
```
id, name, description, isSystemRole,
permissions: [{ permission, scope }],
memberCount,    // how many admins are assigned this role
createdAt, createdBy
```

### POST /admin/roles
Create a new dynamic role.
**Permission required:** `admin_roles:manage`

```
name          string      required    unique
description   string      optional
permissions   array       required    array of { permission, scope? }
```

Validation:
- All permission strings must exist in the defined permission space
- Cannot use `admin_users:manage` or `audit_logs:view` unless assigning to SUPER_ADMIN
- Cannot create a role named "SUPER_ADMIN", "FINANCE", "SUPPORT", or "TECHNICAL" (reserved)

### PATCH /admin/roles/:id
Update a role's name, description, or permission set.
**Permission required:** `admin_roles:manage`

- System role names cannot be changed (only their permissions can)
- Changes take effect within 1 hour (next token refresh) for affected admins
- Redis cache for all admins on this role is invalidated immediately

### DELETE /admin/roles/:id
Delete a dynamic role.
**Permission required:** `admin_roles:manage`

- Cannot delete system roles (FINANCE, SUPPORT, TECHNICAL)
- Cannot delete a role that has active admin users assigned to it — must reassign them first
- Returns 409 with list of affected admin users if attempted

### GET /admin/roles/permissions
Returns the full list of available permission strings with descriptions.
Used by the frontend to populate the role editor UI.
**Permission required:** `admin_roles:view`

---

## 8. Admin Users Module — Endpoints

### GET /admin/users (admin team)
List all admin team members.
**Permission required:** `admin_users:view`

### POST /admin/users (admin team)
Create a new admin team member.
**Permission required:** `admin_users:manage`

```
name          string      required
email         string      required
password      string      required    min 12 chars (stricter than client)
adminRoleId   uuid        required
```

New admin receives a welcome email with their credentials and a forced password change on first login.

### PATCH /admin/users/:id (admin team)
Update name, email, or assigned role.
**Permission required:** `admin_users:manage`

When role changes:
1. New permissions are loaded
2. Redis cache for this admin is invalidated immediately
3. Existing JWT remains valid until expiry (1 hour max) — then new permissions apply

### PATCH /admin/users/:id/deactivate
Deactivate an admin account.
**Permission required:** `admin_users:manage`

Deactivation:
1. Sets `is_active = false`
2. Revokes all active refresh tokens for this admin
3. They cannot log in again until reactivated
4. Cannot deactivate your own account
5. Cannot deactivate a SUPER_ADMIN account through the API

---

## 9. All Other Modules — Endpoints

### Business Management
**GET /admin/businesses** — `businesses:view`
Paginated list. Filters: status, plan, city, search. Scope-aware.

**GET /admin/businesses/:id** — `businesses:view`
Full detail: info, owner, members, subscription history, active overrides, payment history, last sync.

**PATCH /admin/businesses/:id/status** — `businesses:suspend`
Suspend or activate. Requires `reason`. Invalidates permission cache. Sends SMS to owner.

**POST /admin/businesses/:id/override** — `businesses:override_permissions`
Grant or revoke a resource for this business. Requires `reason`. Optional `expiresAt`. Invalidates Redis cache.

**DELETE /admin/businesses/:id/override/:overrideId** — `businesses:override_permissions`
Remove a specific override. Invalidates Redis cache.

---

### Client User Management
**GET /admin/users/clients** — `users:view`
Search by name, phone, email.

**GET /admin/users/clients/:id** — `users:view`
Full detail: contact info, verification status, onboarding step, business memberships, login history.

**PATCH /admin/users/clients/:id/status** — `users:suspend`
Suspend or activate. Requires `reason`.

**POST /admin/users/clients/:id/resend-otp** — `users:resend_otp`
Trigger new OTP. Audit logged. Rate limited: 3 per user per hour.

---

### Revenue & Subscriptions
**GET /admin/metrics/revenue** — `revenue:view`
MRR, ARR, churn rate, ARPU, new/expansion/churning MRR. Query params: period.

**GET /admin/metrics/revenue/breakdown** — `revenue:view`
Revenue split by plan.

**GET /admin/metrics/mrr-history** — `revenue:view`
Daily MRR data points for chart.

**GET /admin/subscriptions** — `subscriptions:view`
All subscriptions. Filters: status, plan, expiringWithin.

**GET /admin/subscriptions/trials** — `subscriptions:view`
Active trials sorted by `trialEndsAt` ascending. Finance team's daily screen.

**PATCH /admin/subscriptions/:businessId** — `subscriptions:edit`
Manually adjust plan, status, trial dates. Requires `reason`. Invalidates permission cache.

---

### Payment Management
**GET /admin/payments** — `payments:view`
All transactions. Filters: status, provider, dateRange, search.

**GET /admin/payments/failures** — `payments:view`
Failed payments with retry count and last attempt timestamp.

**POST /admin/payments/:id/retry** — `payments:retry`
Trigger payment retry. Audit logged.

**POST /admin/payments/:id/waive** — `payments:waive`
Mark as waived. Keeps plan active. Requires `reason`. Audit logged.

---

### Support & Issues
**GET /admin/support/tickets** — `support:view`
Filters: status, severity, category, assignedTo, businessId.

**POST /admin/support/tickets** — `support:create_ticket`
Create ticket. Links to business and/or user.

**PATCH /admin/support/tickets/:id** — `support:resolve_ticket`
Update status, assign, add resolution notes.

**GET /admin/support/sync-errors** — `sync_errors:view`
All businesses with active sync errors.

**POST /admin/support/sync-errors/:businessId/resolve** — `sync_errors:resolve`
Acknowledge and trigger manual sync.

---

### Plan Configuration
**GET /admin/plans** — `plans:view`
All plan configs with resource lists. Shows `updatedAt` and `updatedBy`.

**GET /admin/plans/:plan/businesses** — `plans:view`
Businesses on this plan. Useful before making changes — shows blast radius.

**PATCH /admin/plans/:plan** — `plans:edit`
Update resource list. Requires `reason`. Bulk-invalidates all permission caches for businesses on this plan. Rate limited: 5 per hour.

---

### Platform Metrics
**GET /admin/metrics/overview** — `metrics:view`
Platform health. Revenue fields are `null` for admins without `revenue:view`.

---

### Audit Logs
**GET /admin/audit-logs** — `audit_logs:view`
Filters: adminUserId, action, entityType, entityId, dateRange.
Immutable — no write operations through the API.

---

## 10. Audit Interceptor

Every `POST`, `PATCH`, `PUT`, `DELETE` is automatically logged. No developer needs to add logging manually.

The interceptor captures:
- `adminUserId` + `admin_role_name` (denormalised — roles can change over time, we want the role at the time of the action)
- `action` — derived from HTTP method + route (e.g. `PATCH /admin/businesses/:id/status` → `BUSINESS_STATUS_UPDATED`)
- `entityType` + `entityId` from route params
- `payload` — request body with sensitive fields stripped (`password`, `token`, `hash`, `secret`)
- `ipAddress` + `userAgent`

The `admin_role_name` is stored as a string (not FK) because if a role is renamed or deleted later, the historical audit record must still make sense.

---

## 11. Admin Authentication

**Email + password only.** No phone OTP for admin. If the SMS provider is down during an incident, admins must not be locked out.

**Token TTLs:**
- Access token: 1 hour (vs 15 min for clients)
- Refresh token: 8 hours (sessions do not persist overnight)

**Stricter password policy for admin accounts:**
- Minimum 12 characters (vs 8 for clients)
- Must include upper, lower, digit, and special character
- Cannot reuse last 5 passwords

**Forced password change on first login.**

**All endpoints:**
- `POST /admin/auth/login` — email + password → tokens + permissions embedded in JWT
- `POST /admin/auth/refresh` — rotation + family invalidation (same pattern as client)
- `POST /admin/auth/logout` — revoke refresh token
- `GET /admin/auth/me` — current admin profile + role + permissions

---

## 12. Security Decisions

| Decision | Reason |
|----------|--------|
| Separate JWT secret | Client JWT cannot be used against admin API |
| `is_super_admin` boolean, not a role assignment | Cannot be stripped via role management UI — only via direct DB migration |
| Permissions embedded in JWT | No DB query on every request — fast enforcement |
| Redis cache invalidated on role change | Changes propagate within 1 hour (next token refresh) |
| Scope enforced server-side | Scoped admins cannot bypass their region/segment restriction |
| IP restriction / VPN | Most important protection — leaked credentials useless from unknown IP |
| Audit log uses role name string (not FK) | Historical accuracy — role names may change |
| Role deletion blocked if members assigned | Prevents accidental permission vacuum |
| Admin API rate-limited on plan edits | Plan changes affect all businesses on that plan — must be deliberate |
| Sensitive fields stripped from audit log | Records intent, not credentials |
| Cannot deactivate own account via API | Prevents accidental self-lockout |

---

## 13. Seed Data

On first deployment, run a seed script that:

1. Creates the 4 system roles (`SUPER_ADMIN`, `FINANCE`, `SUPPORT`, `TECHNICAL`) with `is_system_role = true`
2. Assigns default permissions to each baseline role (as defined in Section 3.2)
3. Creates the first SUPER_ADMIN account (credentials from env variables — changed immediately after)

```typescript
// prisma/seeds/admin.seed.ts (or TypeORM equivalent)

const systemRoles = [
  { name: 'SUPER_ADMIN',  isSystemRole: true, permissions: ALL_PERMISSIONS },
  { name: 'FINANCE',      isSystemRole: true, permissions: FINANCE_DEFAULT },
  { name: 'SUPPORT',      isSystemRole: true, permissions: SUPPORT_DEFAULT },
  { name: 'TECHNICAL',    isSystemRole: true, permissions: TECHNICAL_DEFAULT },
]
```

---

## 14. Environment Variables

```env
# Admin API
ADMIN_PORT=3001
ADMIN_JWT_ACCESS_SECRET=<separate-256-bit-secret>
ADMIN_JWT_REFRESH_SECRET=<separate-256-bit-secret>
ADMIN_ACCESS_TOKEN_TTL=1h
ADMIN_REFRESH_TOKEN_TTL=8h

# IP restriction (comma-separated — office + VPN IPs)
ADMIN_ALLOWED_IPS=127.0.0.1,YOUR_OFFICE_IP,YOUR_VPN_IP

# First super admin (used by seed script — change after first login)
ADMIN_SEED_EMAIL=admin@biztrack.cm
ADMIN_SEED_PASSWORD=<strong-temporary-password>

# Shared
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
```

---

## 15. Implementation Order

### Sprint 1 — Foundation (Week 1)
- Scaffold `apps/admin-api` in monorepo
- Migrations: `admin_users`, `admin_roles`, `admin_role_permissions`, `admin_refresh_tokens`, `audit_logs`
- Admin auth module (login, refresh, logout, /me)
- `AdminJwtGuard` — validates JWT, populates `req.admin` with permissions from JWT payload
- `AdminPermissionGuard` — checks permission string, attaches scope to request
- `@RequirePermission()` decorator
- `AuditInterceptor` — global, automatic
- Seed script — 4 system roles + first SUPER_ADMIN
- IP restriction middleware
- Scaffold `apps/admin-web` with admin auth flow

### Sprint 2 — Roles & Team Management (Week 2)
- Admin roles module (GET list, POST create, PATCH edit, DELETE, GET permissions)
- Admin users module (GET list, POST create, PATCH edit, PATCH deactivate)
- Role permission validation (cannot assign undeclared permissions)
- Redis cache invalidation on role change
- Admin web: Role management UI + Team management UI

### Sprint 3 — Business & User Management (Week 3)
- Businesses module (list, detail, suspend, override)
- Client users module (list, detail, suspend, resend-otp)
- Scope enforcement in business queries
- Support tickets module (CRUD)
- Sync errors endpoints
- Admin web: Businesses page + Users page + Support page

### Sprint 4 — Revenue & Plans (Week 4)
- Metrics module (overview, revenue, MRR history)
- Subscriptions module (list, trials, manual edit)
- Payments module (list, failures, retry, waive)
- Plans module (view, edit with bulk cache invalidation)
- Audit logs endpoint
- Admin web: Revenue dashboard + Plans config + Audit log page
# BizTrack CM Admin Dashboard
## Complete Documentation — Architecture, Roles, Modules & Implementation Guide
**apps/admin-api + apps/admin-web · Version 1.0**

---

## 1. Purpose & Business Context

The BizTrack CM admin dashboard is the internal operations platform used exclusively by the BizTrack CM team. It is completely separate from the client-facing platform that business owners and their staff use.

Its core purpose at launch is to give the team full visibility and control over:
- Who is using the platform and how
- Revenue health (MRR, trials converting or expiring, payment failures)
- Customer support (responding to issues, resolving sync errors, unlocking features)
- Platform configuration (what each plan includes, special grants for specific clients)

It is **not** a public-facing product. It is an internal tool. This distinction drives every architectural decision — security over convenience, auditability over speed, control over self-service.

---

## 2. Why a Separate Admin API

The admin API lives in `apps/admin-api` — a completely separate NestJS application from `apps/api` (the client-facing API). This is a deliberate architectural boundary, not just a folder separation.

**Security isolation.** A vulnerability in the client API cannot be exploited to gain admin access. The admin API runs on a different port, has its own authentication system, its own rate limits, and is not exposed to the public internet — it sits behind a VPN or IP whitelist. Even if `apps/api` is completely compromised, `apps/admin-api` remains protected.

**Independent deployment.** The admin API can be deployed, restarted, or rolled back without affecting the client-facing API. A bad admin API deployment does not cause downtime for paying customers.

**Different security posture.** The client API is optimised for mobile performance, offline sync, and high throughput. The admin API is optimised for auditability, role enforcement, and safety. They have different middleware stacks, different logging levels, and different error handling strategies.

**Shared database.** Both APIs connect to the same PostgreSQL database. The admin API has full read access and controlled write access (through its own service layer). No data duplication, no sync between two databases — just two different entry points to the same truth.

---

## 3. Admin Team Roles

The admin dashboard supports a small team with distinct responsibilities. Roles are enforced at the API level — not just in the UI.

### SUPER_ADMIN
Full access to everything. Can manage other admin accounts. Should be limited to 1-2 people (founders/CTO).

Capabilities:
- All capabilities of all roles below
- Create, edit, suspend admin accounts
- Access audit logs for admin actions
- Modify plan configurations
- Grant or revoke special permissions for any business
- Manually override subscription status
- View all financial data

### FINANCE
Access to revenue data, subscription management, and payment operations.

Capabilities:
- View MRR, ARR, churn metrics
- View all payment transactions
- Retry failed payments
- View and export subscription history
- View trial conversion rates
- Cannot access user PII beyond business name and plan

### SUPPORT
Access to customer accounts for troubleshooting and resolution.

Capabilities:
- View business details and onboarding status
- View sync error logs for a specific business
- Grant temporary feature unlocks (special permissions with expiry)
- Reset a user's OTP or trigger a new one
- Suspend or activate a business account (with reason logged)
- View a business's subscription status
- Cannot see financial data beyond a business's current plan

### TECHNICAL
Access to system health, error monitoring, and platform configuration.

Capabilities:
- View sync error logs across all businesses
- View API error rates and performance metrics
- Edit plan configurations (what resources each plan includes)
- View feature flag state
- Trigger manual sync for a specific business
- Cannot view financial data or user PII

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    ADMIN WEB (apps/admin-web)                │
│                    NextJS — internal only                    │
│                    IP-restricted or VPN                      │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────────────┐
│                  ADMIN API (apps/admin-api)                  │
│                    NestJS — separate port                    │
│                    Own auth, own guards                      │
│                    IP-restricted or VPN                      │
└────────────────────────┬────────────────────────────────────┘
                         │ TypeORM
┌────────────────────────▼────────────────────────────────────┐
│              SHARED POSTGRESQL DATABASE                      │
│              Same DB as apps/api                            │
│              Admin API has read + controlled write          │
└─────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                      SHARED REDIS                            │
│     Admin API uses same Redis for permission cache          │
│     Admin actions invalidate client permission cache        │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Admin API — File Structure

```
apps/admin-api/
├── src/
│   ├── main.ts                         Entry point — different port from apps/api
│   ├── app.module.ts                   Root module
│   │
│   ├── config/
│   │   └── configuration.ts            Admin-specific env validation
│   │
│   ├── common/
│   │   ├── enums/
│   │   │   └── admin-role.enum.ts      SUPER_ADMIN | FINANCE | SUPPORT | TECHNICAL
│   │   ├── guards/
│   │   │   ├── admin-jwt.guard.ts      Validates admin JWT — separate secret
│   │   │   └── admin-role.guard.ts     Enforces role-based access
│   │   ├── decorators/
│   │   │   ├── admin-roles.decorator.ts   @AdminRoles(AdminRole.SUPPORT)
│   │   │   └── current-admin.decorator.ts
│   │   ├── filters/
│   │   │   └── admin-exception.filter.ts  All errors logged to audit log
│   │   └── interceptors/
│   │       └── audit.interceptor.ts    Logs every mutating action to audit_logs
│   │
│   └── modules/
│       │
│       ├── admin-auth/                 ── ADMIN AUTH ──
│       │   ├── admin-auth.module.ts
│       │   ├── admin-auth.controller.ts
│       │   ├── admin-auth.service.ts
│       │   └── dto/
│       │       ├── admin-login.dto.ts
│       │       └── admin-refresh.dto.ts
│       │
│       ├── admin-users/                ── ADMIN MANAGEMENT ──
│       │   ├── admin-users.module.ts   Manage admin accounts (SUPER_ADMIN only)
│       │   ├── admin-users.controller.ts
│       │   └── admin-users.service.ts
│       │
│       ├── businesses/                 ── BUSINESS MANAGEMENT ──
│       │   ├── businesses.module.ts
│       │   ├── businesses.controller.ts
│       │   └── businesses.service.ts
│       │
│       ├── users/                      ── CLIENT USER MANAGEMENT ──
│       │   ├── users.module.ts
│       │   ├── users.controller.ts
│       │   └── users.service.ts
│       │
│       ├── subscriptions/              ── SUBSCRIPTION & REVENUE ──
│       │   ├── subscriptions.module.ts
│       │   ├── subscriptions.controller.ts
│       │   └── subscriptions.service.ts
│       │
│       ├── payments/                   ── PAYMENT MANAGEMENT ──
│       │   ├── payments.module.ts
│       │   ├── payments.controller.ts
│       │   └── payments.service.ts
│       │
│       ├── support/                    ── SUPPORT & ISSUES ──
│       │   ├── support.module.ts
│       │   ├── support.controller.ts
│       │   └── support.service.ts
│       │
│       ├── permissions/                ── PLAN CONFIG & OVERRIDES ──
│       │   ├── permissions.module.ts
│       │   ├── permissions.controller.ts
│       │   └── permissions.service.ts
│       │
│       ├── metrics/                    ── PLATFORM METRICS ──
│       │   ├── metrics.module.ts
│       │   ├── metrics.controller.ts
│       │   └── metrics.service.ts
│       │
│       └── audit/                      ── AUDIT LOGS ──
│           ├── audit.module.ts
│           ├── audit.controller.ts
│           └── audit.service.ts
│
└── test/
    └── admin-auth.e2e-spec.ts
```

---

## 6. New Database Tables

### `admin_users`
The BizTrack CM team members who can access this dashboard. Completely separate from the `users` table (client users).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | varchar(100) | |
| email | varchar(255) UNIQUE | Admin login identifier |
| password_hash | varchar(255) | bcrypt cost 12 |
| role | enum(AdminRole) | SUPER_ADMIN \| FINANCE \| SUPPORT \| TECHNICAL |
| is_active | boolean DEFAULT true | |
| last_login_at | timestamptz NULLABLE | |
| created_by | uuid NULLABLE | FK → admin_users.id — who created this account |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `admin_refresh_tokens`
Separate from client refresh tokens. Same rotation logic applies.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| admin_user_id | uuid FK → admin_users | INDEX |
| token_hash | varchar(255) UNIQUE | bcrypt hash |
| family_id | uuid | INDEX |
| used | boolean DEFAULT false | |
| expires_at | timestamptz | 8 hours — shorter than client tokens |
| revoked_at | timestamptz NULLABLE | |
| created_at | timestamptz | |

### `audit_logs`
Immutable record of every action taken by any admin. Never deleted — append only.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| admin_user_id | uuid FK → admin_users | Who performed the action |
| admin_role | enum(AdminRole) | Role at time of action |
| action | varchar(100) | e.g. BUSINESS_SUSPENDED, PLAN_CONFIG_UPDATED |
| entity_type | varchar(50) | e.g. Business, User, PlanConfig |
| entity_id | uuid NULLABLE | The affected record's ID |
| payload | jsonb NULLABLE | What was changed — before/after values |
| ip_address | varchar(45) | IPv4 or IPv6 |
| user_agent | varchar(255) | |
| created_at | timestamptz | |

### `support_tickets`
Internal tickets created by the support team for tracking issues.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| business_id | uuid FK → businesses NULLABLE | |
| user_id | uuid FK → users NULLABLE | |
| created_by | uuid FK → admin_users | |
| assigned_to | uuid FK → admin_users NULLABLE | |
| title | varchar(255) | |
| description | text | |
| category | enum(TicketCategory) | SYNC \| PAYMENT \| APP \| HARDWARE \| FEEDBACK \| OTHER |
| severity | enum(TicketSeverity) | CRITICAL \| WARNING \| INFO |
| status | enum(TicketStatus) | OPEN \| IN_PROGRESS \| RESOLVED \| CLOSED |
| resolution | text NULLABLE | |
| resolved_at | timestamptz NULLABLE | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

## 7. Admin Authentication

Admin auth is completely separate from client auth. Different JWT secret, different token TTLs, different endpoints, different table.

### Why email + password (not phone + OTP)?
Admin users are team members working on desktops in a known environment. Email + password is the appropriate credential for this context. Phone OTP would add friction without meaningful security benefit for an internal tool that is already IP-restricted.

### Admin token TTL
- Access token: **1 hour** (vs 15 min for clients — admins work in longer sessions)
- Refresh token: **8 hours** (vs 30 days for clients — admin sessions should not persist overnight unattended)

### Endpoints

#### POST /admin/auth/login
```
email       string    required
password    string    required
```
Returns `accessToken` + `refreshToken` + admin user profile including role.
Same brute force protection as client login: 10 attempts → 1 hour lock.

#### POST /admin/auth/refresh
Same rotation logic as client refresh — family invalidation on reuse.

#### POST /admin/auth/logout
Revokes the refresh token.

#### GET /admin/auth/me
Returns current admin user profile + role. Used on page load to hydrate the frontend.

---

## 8. Modules — What Each Does

### 8.1 Business Management
**Who:** SUPPORT, SUPER_ADMIN
**Purpose:** View and manage client businesses.

#### GET /admin/businesses
Returns paginated list of all businesses with filters:
- `status` filter: ONBOARDING | PLAN_PENDING | ACTIVE | SUSPENDED
- `plan` filter: FREE | SOLO | BUSINESS | PRO
- `city` filter
- `search`: business name or owner phone/email
- `sort`: createdAt, plan, lastActiveAt

Response per business:
```
id, name, type, city, plan, businessStatus, subscriptionStatus,
trialEndsAt, ownerName, ownerPhone, memberCount,
lastSyncAt, createdAt
```

#### GET /admin/businesses/:id
Full business detail view:
- Business info + owner contact
- All members with roles
- Subscription history (SubscriptionEvent log)
- Active special permissions (BusinessOverride)
- Recent sync activity
- Payment history

#### PATCH /admin/businesses/:id/status
Suspend or activate a business.
```
status      enum    ACTIVE | SUSPENDED
reason      string  required — logged to audit_logs
```
When suspended:
- Business record updated
- Permission cache invalidated in Redis
- SMS notification sent to business owner (localised)
- Audit log entry created

#### POST /admin/businesses/:id/override
Grant or revoke a specific resource for a business beyond their plan.
```
resource      string    Resource enum value
granted       boolean   true=unlock, false=revoke
reason        string    required
expiresAt     datetime  optional — null = permanent
```
After saving:
- Invalidate permission cache for this business in Redis
- Audit log entry with before/after state

#### DELETE /admin/businesses/:id/override/:overrideId
Remove a specific override. Invalidates permission cache.

---

### 8.2 Client User Management
**Who:** SUPPORT, SUPER_ADMIN
**Purpose:** View and manage individual client user accounts.

#### GET /admin/users
Paginated list with search by name, phone, email.
Shows: id, name, phone, email, status, onboardingStep, locale, createdAt, businessCount.

#### GET /admin/users/:id
Full user detail:
- Personal info (phone, email, verification status)
- Onboarding step + progress
- All business memberships with roles
- Login history (last 10 refresh tokens — date, IP only)
- Active OTPs (count only — never the code)

#### PATCH /admin/users/:id/status
Suspend or activate a user account.
```
status    enum    ACTIVE | SUSPENDED
reason    string  required
```

#### POST /admin/users/:id/resend-otp
Trigger a new OTP for a stuck user (e.g. SMS not received).
```
type      enum    PHONE_VERIFY | EMAIL_VERIFY
channel   enum    SMS | WHATSAPP | EMAIL
```
Support use case: user says "I never received the code."
Audit logged. Rate limited: 3 per user per hour.

---

### 8.3 Subscriptions & Revenue
**Who:** FINANCE, SUPER_ADMIN
**Purpose:** Monitor revenue health and manage subscription lifecycle.

#### GET /admin/metrics/revenue
Returns key revenue metrics for a given period:
```
mrr                   number    Monthly Recurring Revenue in XAF
arr                   number    MRR × 12
mrrGrowth             number    % change vs previous period
newMrr                number    Revenue from new subscribers this period
expansionMrr          number    Revenue from upgrades
churningMrr           number    Revenue lost from cancellations/downgrades
netMrr                number    newMrr + expansionMrr - churningMrr
activeSubscribers     number    Paying businesses (non-FREE, non-TRIAL)
trialCount            number    Businesses in active trial
trialConversionRate   number    % of trials that converted to paid last period
churnRate             number    % of paying customers who cancelled this period
arpu                  number    Average Revenue Per User (MRR / activeSubscribers)
```
Query params: `period` (7d | 30d | 90d | 12m), `from`, `to`

#### GET /admin/metrics/revenue/breakdown
Revenue broken down by plan:
```
plan        FREE | SOLO | BUSINESS | PRO
count       number    Businesses on this plan
revenue     number    Total XAF from this plan
percentage  number    % of total MRR
```

#### GET /admin/metrics/mrr-history
MRR data points for chart rendering. One data point per day for the requested period.

#### GET /admin/subscriptions
Paginated list of all subscriptions with filters:
- `status`: TRIAL | ACTIVE | PAST_DUE | CANCELLED
- `plan`: FREE | SOLO | BUSINESS | PRO
- `expiringWithin`: 7d | 14d (trials expiring soon)

#### GET /admin/subscriptions/trials
Businesses currently in trial, sorted by `trialEndsAt` ascending.
Highlights: businesses whose trial ends in ≤ 7 days.

#### PATCH /admin/subscriptions/:businessId
Manually adjust a subscription. SUPER_ADMIN only.
```
plan                PlanName    optional
subscriptionStatus  enum        optional
trialEndsAt         datetime    optional    extend or shorten trial
reason              string      required
```
All changes audit logged.

---

### 8.4 Payment Management
**Who:** FINANCE, SUPER_ADMIN
**Purpose:** Monitor payment health and resolve payment failures.

#### GET /admin/payments
Paginated payment transaction list with filters:
- `status`: SUCCESS | FAILED | PENDING
- `provider`: MTN_MOMO | ORANGE_MONEY
- `dateRange`
- `search`: business name or phone

#### GET /admin/payments/failures
All failed payment transactions. Each failure shows:
- Business name + plan + phone
- Amount, provider, failure reason
- Number of retry attempts
- Last attempt timestamp

This is the most important screen for the finance team — unresolved payment failures mean businesses on paid plans whose payment has not gone through. They need to be followed up.

#### POST /admin/payments/:id/retry
Manually trigger a payment retry for a failed transaction.
Audit logged. Returns new payment attempt status.

#### POST /admin/payments/:id/waive
Mark a failed payment as waived (e.g. for a support gesture).
```
reason    string    required
```
Does not charge the customer. Keeps their plan active. Audit logged.

---

### 8.5 Support & Issue Tracking
**Who:** SUPPORT, TECHNICAL, SUPER_ADMIN
**Purpose:** Track and resolve customer issues.

#### GET /admin/support/tickets
Paginated ticket list with filters:
- `status`: OPEN | IN_PROGRESS | RESOLVED | CLOSED
- `severity`: CRITICAL | WARNING | INFO
- `category`: SYNC | PAYMENT | APP | HARDWARE | FEEDBACK | OTHER
- `assignedTo`: admin user id
- `businessId`

#### POST /admin/support/tickets
Create a new ticket (usually created when a customer contacts support).
```
businessId    uuid      optional
userId        uuid      optional
title         string    required
description   string    required
category      enum      required
severity      enum      required
```

#### PATCH /admin/support/tickets/:id
Update ticket status, assign to team member, add resolution notes.

#### GET /admin/support/sync-errors
All businesses with active sync errors (failed background syncs).
Shows: businessName, lastSyncAt, errorType, errorCount, affectedDevices.
TECHNICAL team uses this to proactively identify and resolve sync issues before customers complain.

#### POST /admin/support/sync-errors/:businessId/resolve
Mark sync errors as acknowledged and trigger a manual sync attempt.

---

### 8.6 Plan Configuration & Feature Flags
**Who:** TECHNICAL, SUPER_ADMIN
**Purpose:** Manage what each plan includes and make platform-wide configuration changes without a code deployment.

#### GET /admin/plans
Returns all plan configs with their full resource lists.
Shows each plan's: name, priceXAF, resources[], updatedAt, updatedBy.

#### PATCH /admin/plans/:plan
Update the resources available on a plan.
```
resources     string[]    Full array of Resource enum values
reason        string      required — explains the change
```
After saving:
- Invalidate ALL business permission caches in Redis (bulk `DEL permissions:*`)
- Audit log with before/after resource arrays
- This is a high-impact operation — all businesses on this plan get updated permissions within 5 minutes

**Why is this available without a code deployment?** This is precisely why we store plan configs in the database rather than hardcoding them. During market entry, the team needs to experiment with which features drive conversions. Giving a group of Free users access to the scanner to see if it drives Solo upgrades, or temporarily including reports in the Free plan — these tests should not require a full deploy cycle.

#### GET /admin/plans/:plan/businesses
List all businesses currently on this plan. Useful before making changes — understanding the blast radius.

---

### 8.7 Platform Metrics (Overview)
**Who:** All roles (read-only, role-filtered)
**Purpose:** The home screen of the admin dashboard. At-a-glance platform health.

#### GET /admin/metrics/overview
```
// Growth
totalBusinesses         number
newBusinessesToday      number
newBusinessesThisWeek   number
newBusinessesThisMonth  number

// Engagement
activeToday             number    businesses with activity in last 24hrs
activeLast7Days         number
totalSalesRecorded      number    all-time sales events across all businesses

// Revenue (FINANCE + SUPER_ADMIN only — other roles see null)
mrr                     number | null
trialCount              number | null
trialConversionRate     number | null
churnRate               number | null

// Health
openSupportTickets      number
criticalTickets         number
syncErrorCount          number
failedPayments          number
```

The response shape is the same for all roles but revenue fields are `null` for non-finance roles. This allows the frontend to use one endpoint for everyone and simply hide revenue cards based on null values.

---

### 8.8 Audit Logs
**Who:** SUPER_ADMIN only
**Purpose:** Full record of every admin action for accountability and compliance.

#### GET /admin/audit-logs
Paginated audit log with filters:
- `adminUserId`
- `action`
- `entityType`
- `entityId`
- `dateRange`

Each entry shows: who, what action, on which entity, what changed (payload), when, from which IP.

This log is append-only and immutable. No admin (including SUPER_ADMIN) can delete audit log entries through the API. Database-level deletion would require direct DB access — which is always logged at the infrastructure level.

---

## 9. Audit Interceptor — How Every Action is Logged

Every `POST`, `PATCH`, `PUT`, `DELETE` request to the admin API is automatically logged by a global `AuditInterceptor`.

```typescript
// common/interceptors/audit.interceptor.ts

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest()
    const admin = req.admin                   // set by AdminJwtGuard
    const method = req.method

    // Only log mutating actions
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return next.handle()
    }

    return next.handle().pipe(
      tap(async (responseBody) => {
        await this.auditService.log({
          adminUserId:  admin.id,
          adminRole:    admin.role,
          action:       this.resolveAction(req),
          entityType:   this.resolveEntityType(req),
          entityId:     req.params?.id ?? null,
          payload: {
            body:     this.sanitize(req.body),   // remove passwords/tokens
            response: this.summarize(responseBody),
          },
          ipAddress:  req.ip,
          userAgent:  req.headers['user-agent'],
        })
      }),
    )
  }
}
```

The `sanitize()` method strips any field named `password`, `token`, `hash`, `secret` before logging — the audit log records intent and outcome, not credentials.

---

## 10. Role Enforcement Pattern

Two decorators work together on every admin endpoint:

```typescript
// Decorator — declares required roles
export const AdminRoles = (...roles: AdminRole[]) =>
  SetMetadata('admin_roles', roles)

// Guard — enforces declared roles
@Injectable()
export class AdminRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.get<AdminRole[]>(
      'admin_roles', context.getHandler()
    )
    if (!required?.length) return true   // no roles declared = any admin

    const admin = context.switchToHttp().getRequest().admin
    return required.includes(admin.role)
  }
}

// Usage on any controller:
@Patch(':id/status')
@AdminRoles(AdminRole.SUPPORT, AdminRole.SUPER_ADMIN)
async updateBusinessStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
  return this.businessesService.updateStatus(id, dto)
}
```

The `AdminJwtGuard` runs first (validates the JWT, populates `req.admin`), then `AdminRoleGuard` runs (checks the role). Both are applied globally — you opt out with `@PublicAdmin()` for the login endpoint.

---

## 11. Rate Limiting for Admin API

Admin rate limits are more generous than client limits — the team is trusted — but still necessary to prevent accidental bulk operations or runaway scripts.

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /admin/auth/login | 10 | 15 min per IP |
| POST /admin/auth/refresh | 60 | 15 min per admin |
| GET /admin/metrics/* | 120 | 1 min per admin |
| GET /admin/businesses | 60 | 1 min per admin |
| PATCH /admin/businesses/:id/status | 20 | 15 min per admin |
| POST /admin/businesses/:id/override | 30 | 15 min per admin |
| PATCH /admin/plans/:plan | 5 | 60 min per admin |
| POST /admin/support/tickets | 60 | 15 min per admin |
| POST /admin/payments/:id/retry | 10 | 15 min per admin |

The `PATCH /admin/plans/:plan` limit (5 per hour) is intentionally strict — a plan configuration change affects all businesses on that plan. It should never be done casually or in rapid succession.

---

## 12. Security Decisions

**IP restriction / VPN.** The admin API should never be publicly accessible. At minimum, restrict access to known office/VPN IP addresses at the infrastructure level (Nginx, Cloudflare Access, or firewall rules). This is the most important security measure — even if admin credentials are leaked, they are useless from an unknown IP.

**Separate JWT secret.** `ADMIN_JWT_ACCESS_SECRET` and `ADMIN_JWT_REFRESH_SECRET` are different from the client API secrets. A compromised client JWT cannot be used against the admin API.

**Shorter token TTL.** Admin access tokens expire in 1 hour. Refresh tokens expire in 8 hours. An unattended admin session cannot persist overnight.

**Email + password only.** No phone OTP for admin login — it would require the admin API to send SMS, creating a dependency on the SMS provider for internal access. If the SMS provider is down and an admin needs to respond to a critical incident, they should not be locked out. Email + password with bcrypt is sufficient for an IP-restricted internal tool.

**Audit log immutability.** No `DELETE` or `UPDATE` on `audit_logs`. The table has no soft-delete. Any attempt to modify audit logs requires direct database access, which itself leaves infrastructure-level traces.

**Sensitive field sanitization.** The audit interceptor strips credentials and tokens from logged payloads. The audit log records *what happened* — not credentials that could enable replay attacks.

**Admin account creation requires SUPER_ADMIN.** New admin accounts cannot self-register. A SUPER_ADMIN must create them. This ensures the admin user list is always controlled.

---

## 13. Environment Variables

```env
# Admin API specific
ADMIN_PORT=3001
ADMIN_JWT_ACCESS_SECRET=<separate-256-bit-secret>
ADMIN_JWT_REFRESH_SECRET=<separate-256-bit-secret>
ADMIN_ACCESS_TOKEN_TTL=1h
ADMIN_REFRESH_TOKEN_TTL=8h

# IP restriction (comma-separated)
ADMIN_ALLOWED_IPS=127.0.0.1,YOUR_OFFICE_IP,YOUR_VPN_IP

# Shared with apps/api
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
```

---

## 14. Implementation Order

### Sprint 1 — Foundation (Week 1)
**Goal:** Admin API is running with auth and role enforcement working.

- Scaffold `apps/admin-api` as a new NestJS app in the monorepo
- Create `admin_users` and `admin_refresh_tokens` migrations
- Implement admin auth module (login, refresh, logout, /me)
- Implement `AdminJwtGuard` and `AdminRoleGuard`
- Implement `AuditInterceptor` and `audit_logs` table
- Create `audit_logs` migration
- Seed first SUPER_ADMIN account (migration or CLI script)
- Configure IP restriction middleware
- Scaffold `apps/admin-web` (NextJS) with auth flow to admin API

### Sprint 2 — Business & User Management (Week 2)
**Goal:** Support team can look up any business or user and take basic actions.

- GET /admin/businesses (list + filters + pagination)
- GET /admin/businesses/:id (full detail)
- PATCH /admin/businesses/:id/status (suspend/activate)
- GET /admin/users (list + search)
- GET /admin/users/:id (full detail)
- PATCH /admin/users/:id/status
- POST /admin/users/:id/resend-otp
- Admin web: Businesses list page + detail page

### Sprint 3 — Revenue & Subscriptions (Week 3)
**Goal:** Finance team can see MRR, trials, and payment failures.

- GET /admin/metrics/overview
- GET /admin/metrics/revenue
- GET /admin/metrics/revenue/breakdown
- GET /admin/metrics/mrr-history
- GET /admin/subscriptions
- GET /admin/subscriptions/trials
- PATCH /admin/subscriptions/:businessId
- GET /admin/payments
- GET /admin/payments/failures
- POST /admin/payments/:id/retry
- POST /admin/payments/:id/waive
- Admin web: Overview dashboard + Revenue page + Payments page

### Sprint 4 — Support, Plans & Audit (Week 4)
**Goal:** Full admin capability — support tickets, plan config, overrides, audit log.

- GET /admin/support/tickets + POST + PATCH
- GET /admin/support/sync-errors + POST resolve
- GET /admin/plans + PATCH /admin/plans/:plan
- POST /admin/businesses/:id/override
- DELETE /admin/businesses/:id/override/:overrideId
- GET /admin/audit-logs
- Admin users CRUD (SUPER_ADMIN only)
- Admin web: Support page + Plans config page + Audit log page