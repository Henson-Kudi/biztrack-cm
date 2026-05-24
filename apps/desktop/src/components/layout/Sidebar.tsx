'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Resource, type JwtPayload } from '@biztrack/types'
import {
  BarChart3,
  Bell,
  Boxes,
  Building2,
  ChevronRight,
  ChevronsLeft,
  CreditCard,
  HandCoins,
  Home,
  KeyRound,
  LogOut,
  Lock,
  Package,
  Receipt,
  Ruler,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Tag,
  UserCircle2,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { logout } from '@/services/auth.api'
import { formatPlanBadge } from '@/lib/app-route-access'
import { decodeJwtPayload } from '@/lib/jwt'
import { getPermissionAccessFromState } from '@/lib/plan-access'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { usePlanStore } from '@/stores/plan.store'

const SIDEBAR_COLLAPSED_KEY = 'biztrack.sidebar.collapsed'

type NavMatch = {
  key: string
  value: string
}

type NavLeafItem = {
  to: string
  label: string
  icon: LucideIcon
  badge?: string
  requiredResource?: Resource
  activeSearchParam?: NavMatch
  inactiveChildRoutes?: string[]
}

type NavGroupItem = {
  label: string
  icon: LucideIcon
  children: NavLeafItem[]
}

type NavItem = NavLeafItem | NavGroupItem

function hasChildren(item: NavItem): item is NavGroupItem {
  return 'children' in item
}

function initials(value: string) {
  return value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function toTitleCase(value: string) {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function resolveProfileName(payload: JwtPayload | null, fallback: string) {
  if (payload?.email) {
    const [localPart] = payload.email.split('@')
    const label = toTitleCase(localPart || '')
    if (label) {
      return label
    }
  }

  if (payload?.phone) {
    return payload.phone
  }

  return fallback
}

function resolveLocalizedPath(locale: string, to: string) {
  return to === '/' ? `/${locale}` : `/${locale}${to}`
}

function isItemActive(
  locale: string,
  pathname: string,
  searchParams: ReadonlyURLSearchParams,
  item: NavLeafItem,
) {
  const currentPath = resolveLocalizedPath(locale, item.to.split('?')[0] || '/')
  const inactiveChildPaths =
    item.inactiveChildRoutes?.map((route) => resolveLocalizedPath(locale, route)) ?? []

  if (item.activeSearchParam) {
    return (
      pathname === currentPath &&
      searchParams.get(item.activeSearchParam.key) === item.activeSearchParam.value
    )
  }

  // Some leaf items are the "default" section view and should stay highlighted
  // for closely related child pages like `/products/detail`, but not for sibling
  // sub-sections such as `/products/categories`. Explicit exclusions let us keep
  // that intent without making the whole matcher exact-only.
  if (inactiveChildPaths.some((childPath) => pathname === childPath || pathname.startsWith(`${childPath}/`))) {
    return false
  }

  return (
    pathname === currentPath ||
    (currentPath !== `/${locale}` && pathname.startsWith(`${currentPath}/`))
  )
}

function getLeafPermissionState(
  item: NavLeafItem,
  planState: ReturnType<typeof usePlanStore.getState>['current'],
) {
  const permission =
    item.requiredResource && planState
      ? getPermissionAccessFromState(planState, item.requiredResource)
      : null

  return {
    disabled: Boolean(permission && !permission.allowed),
    disabledBadge: permission?.allowed ? null : formatPlanBadge(permission?.requiredPlan ?? null),
    disabledTitle:
      permission && !permission.allowed && permission.requiredPlan
        ? `${item.label} requires the ${permission.requiredPlan} plan.`
        : item.label,
  }
}

function BrandMark({
  collapsed,
  title,
  subtitle,
}: {
  collapsed: boolean
  title: string
  subtitle: string
}) {
  return (
    <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4 dark:border-border/70">
      <div className="relative shrink-0">
        <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-white/10 text-white shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_1px_2px_rgba(15,23,42,0.18)] dark:bg-primary dark:text-primary-foreground">
          <span className="font-serif text-[17px] leading-none tracking-tight">B</span>
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[rgb(var(--chart-2))] ring-2 ring-primary dark:ring-background" />
      </div>
      {!collapsed ? (
        <div className="min-w-0 flex-1">
          <div className="truncate font-serif text-[15px] leading-tight tracking-tight text-white dark:text-foreground">
            {title}
          </div>
          <div className="mt-0.5 truncate text-[11px] uppercase tracking-[0.14em] text-primary-foreground/70 dark:text-muted-foreground/80">
            {subtitle}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SearchField({
  collapsed,
  searchLabel,
  placeholder,
}: {
  collapsed: boolean
  searchLabel: string
  placeholder: string
}) {
  if (collapsed) {
    return (
      <div className="px-2 pt-3">
        <button
          type="button"
          className="grid h-9 w-full place-items-center rounded-md text-primary-foreground/72 transition-colors hover:bg-white/10 hover:text-white dark:text-muted-foreground dark:hover:bg-secondary/70 dark:hover:text-foreground"
          title={searchLabel}
        >
          <Search className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    )
  }

  return (
    <div className="px-3 pt-3">
      <div className="group relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary-foreground/55 dark:text-muted-foreground" />
        <input
          type="text"
          placeholder={placeholder}
          className="h-9 w-full rounded-md border border-white/10 bg-white/10 pl-8 pr-12 text-[13px] text-white outline-none transition-all placeholder:text-primary-foreground/60 focus:border-white/20 focus:bg-white/12 focus:ring-2 focus:ring-white/15 dark:border-transparent dark:bg-secondary/60 dark:text-foreground dark:placeholder:text-muted-foreground dark:focus:border-border dark:focus:bg-card dark:focus:ring-ring/20"
        />
        <kbd className="absolute right-2 top-1/2 grid h-5 -translate-y-1/2 place-items-center rounded border border-white/10 bg-white/10 px-1.5 text-[10px] font-medium text-primary-foreground/70 shadow-sm dark:border-border/80 dark:bg-background dark:text-muted-foreground">
          Ctrl+K
        </kbd>
      </div>
    </div>
  )
}

function NavLeaf({
  item,
  active,
  disabled = false,
  disabledBadge,
  disabledTitle,
  depth = 0,
  collapsed,
  locale,
}: {
  item: NavLeafItem
  active: boolean
  disabled?: boolean
  disabledBadge?: string | null
  disabledTitle?: string
  depth?: number
  collapsed: boolean
  locale: string
}) {
  const Icon = item.icon
  const badge = disabled ? disabledBadge : item.badge
  const iconClassName = cn(
    'shrink-0 transition-colors',
    depth > 0 ? 'h-3.5 w-3.5' : 'h-4 w-4',
    disabled
      ? 'text-primary-foreground/45 dark:text-muted-foreground/60'
      : active
        ? 'text-white dark:text-primary'
        : 'text-primary-foreground/70 group-hover:text-white dark:text-muted-foreground dark:group-hover:text-foreground',
  )
  const content = (
    <>
      <Icon className={iconClassName} strokeWidth={2} />
      {!collapsed ? (
        <>
          <span className="flex-1 truncate text-left">{item.label}</span>
          {disabled ? (
            <Lock className="h-3.5 w-3.5 shrink-0 text-primary-foreground/45 dark:text-muted-foreground/60" />
          ) : null}
          {badge ? (
            <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/90 dark:bg-[rgb(var(--chart-2))]/15 dark:text-[rgb(var(--chart-2))]">
              {badge}
            </span>
          ) : null}
        </>
      ) : null}
    </>
  )

  const className = cn(
    'group relative flex w-full items-center gap-2.5 rounded-md text-[13px] outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-white/20 dark:focus-visible:ring-ring/40',
    collapsed ? 'mx-auto h-9 w-9 justify-center px-0' : 'h-8 px-2.5',
    depth > 0 && !collapsed && 'h-[30px] pl-8',
    disabled
      ? 'cursor-not-allowed text-primary-foreground/45 opacity-75 dark:text-muted-foreground/60'
      : active
        ? 'bg-white/12 font-medium text-white dark:bg-accent dark:text-accent-foreground'
        : 'text-primary-foreground/72 hover:bg-white/10 hover:text-white dark:text-muted-foreground dark:hover:bg-secondary/70 dark:hover:text-foreground',
  )

  if (disabled) {
    return (
      <div title={disabledTitle ?? item.label} aria-disabled="true" className={className}>
        {content}
      </div>
    )
  }

  return (
    <Link
      href={resolveLocalizedPath(locale, item.to)}
      title={collapsed ? item.label : undefined}
      className={className}
    >
      {active && !collapsed ? (
        <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-white dark:bg-primary" />
      ) : null}
      {content}
    </Link>
  )
}

function NavGroup({
  item,
  locale,
  pathname,
  searchParams,
  planState,
  collapsed,
  onExpand,
}: {
  item: NavGroupItem
  locale: string
  pathname: string
  searchParams: ReadonlyURLSearchParams
  planState: ReturnType<typeof usePlanStore.getState>['current']
  collapsed: boolean
  onExpand: () => void
}) {
  const containsActive = item.children.some((child) =>
    isItemActive(locale, pathname, searchParams, child),
  )
  const [open, setOpen] = useState(containsActive)
  const Icon = item.icon

  useEffect(() => {
    if (containsActive) {
      setOpen(true)
    }
  }, [containsActive])

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => {
          onExpand()
          setOpen(true)
        }}
        title={item.label}
        className={cn(
          'group relative mx-auto flex h-9 w-9 items-center justify-center rounded-md text-[13px] outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-white/20 dark:focus-visible:ring-ring/40',
          containsActive
            ? 'bg-white/12 text-white dark:bg-accent dark:text-accent-foreground'
            : 'text-primary-foreground/72 hover:bg-white/10 hover:text-white dark:text-muted-foreground dark:hover:bg-secondary/70 dark:hover:text-foreground',
        )}
      >
        <Icon
          className={cn(
            'h-4 w-4 shrink-0',
            containsActive ? 'text-white dark:text-primary' : 'text-primary-foreground/70 group-hover:text-white dark:text-muted-foreground dark:group-hover:text-foreground',
          )}
          strokeWidth={2}
        />
      </button>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className={cn(
          'group relative flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-white/20 dark:focus-visible:ring-ring/40',
          containsActive
            ? 'font-medium text-white dark:text-foreground'
            : 'text-primary-foreground/72 hover:bg-white/10 hover:text-white dark:text-muted-foreground dark:hover:bg-secondary/70 dark:hover:text-foreground',
        )}
      >
        <Icon
          className={cn(
            'h-4 w-4 shrink-0 transition-colors',
            containsActive ? 'text-white dark:text-primary' : 'text-primary-foreground/70 group-hover:text-white dark:text-muted-foreground dark:group-hover:text-foreground',
          )}
          strokeWidth={2}
        />
        <span className="flex-1 truncate text-left">{item.label}</span>
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 text-primary-foreground/55 transition-transform duration-200 dark:text-muted-foreground/70',
            open && 'rotate-90',
          )}
          strokeWidth={2.25}
        />
      </button>

      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="relative ml-[15px] mt-0.5 space-y-0.5 border-l border-white/12 py-0.5 pl-3 dark:border-border/80">
            {item.children.map((child) => {
              const permissionState = getLeafPermissionState(child, planState)
              return (
                <NavLeaf
                  key={child.to}
                  item={child}
                  depth={1}
                  active={isItemActive(locale, pathname, searchParams, child)}
                  disabled={permissionState.disabled}
                  disabledBadge={permissionState.disabledBadge}
                  disabledTitle={permissionState.disabledTitle}
                  collapsed={false}
                  locale={locale}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function UserMenuItem({
  icon: Icon,
  label,
  hint,
  destructive = false,
  disabled = false,
  href,
  onSelect,
}: {
  icon: LucideIcon
  label: string
  hint?: string
  destructive?: boolean
  disabled?: boolean
  href?: string
  onSelect?: () => void
}) {
  const className = cn(
    'flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors',
    disabled
      ? 'cursor-default opacity-55'
      : destructive
        ? 'text-destructive hover:bg-destructive/10'
        : 'text-foreground hover:bg-secondary/80',
  )
  const iconClassName = cn(
    'h-3.5 w-3.5 shrink-0',
    destructive ? 'text-destructive' : 'text-muted-foreground',
  )

  const content = (
    <>
      <Icon className={iconClassName} strokeWidth={2} />
      <span className="flex-1 truncate text-left">{label}</span>
      {hint ? (
        <kbd className="text-[10px] font-medium tracking-wider text-muted-foreground/80">
          {hint}
        </kbd>
      ) : null}
    </>
  )

  if (href && !disabled) {
    return (
      <Link href={href} className={className} onClick={onSelect}>
        {content}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onSelect} disabled={disabled} className={className}>
      {content}
    </button>
  )
}

function UserPopover({
  collapsed,
  locale,
  initialsValue,
  profileName,
  profileSecondary,
  businessLabel,
  roleLabel,
  profileLabel,
  settingsLabel,
  subscriptionLabel,
  teamLabel,
  rolesLabel,
  notificationsLabel,
  changePinLabel,
  logoutLabel,
  onLogout,
}: {
  collapsed: boolean
  locale: string
  initialsValue: string
  profileName: string
  profileSecondary: string
  businessLabel: string
  roleLabel: string | null
  profileLabel: string
  settingsLabel: string
  subscriptionLabel: string
  teamLabel: string
  rolesLabel: string
  notificationsLabel: string
  changePinLabel: string
  logoutLabel: string
  onLogout: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-t border-white/10 px-2 py-2 dark:border-border/70">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'w-full rounded-md text-left transition-colors hover:bg-white/10 dark:hover:bg-secondary/70',
              collapsed ? 'flex h-10 justify-center' : 'flex h-12 items-center gap-2.5 px-2',
              open && 'bg-white/10 dark:bg-secondary/70',
            )}
          >
            <div className="relative shrink-0">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-white/95 to-white/75 text-[13px] font-medium text-primary ring-2 ring-primary shadow-sm dark:from-primary dark:to-[rgb(var(--chart-5))] dark:text-primary-foreground dark:ring-background">
                {initialsValue}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[rgb(var(--chart-2))] ring-2 ring-primary dark:ring-background" />
            </div>
            {!collapsed ? (
              <>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium leading-tight text-white dark:text-foreground">
                    {profileName}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-primary-foreground/70 dark:text-muted-foreground">
                    {roleLabel ? `${roleLabel} . ${businessLabel}` : businessLabel}
                  </div>
                </div>
                <ChevronRight
                  className={cn(
                    'h-3.5 w-3.5 text-primary-foreground/70 transition-transform duration-200 dark:text-muted-foreground',
                    open && 'rotate-90',
                  )}
                />
              </>
            ) : null}
          </button>
        </PopoverTrigger>

        <PopoverContent
          side={collapsed ? 'right' : 'top'}
          align="start"
          sideOffset={collapsed ? 12 : 10}
          className={cn(
            'w-[238px] overflow-hidden rounded-lg border border-border bg-popover p-0 text-popover-foreground shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18),0_4px_8px_-2px_rgba(15,23,42,0.08)]',
            collapsed ? 'ml-1' : 'mb-1',
          )}
        >
          <div className="border-b border-border/70 bg-gradient-to-br from-secondary/60 to-transparent px-3 py-3">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-primary to-[rgb(var(--chart-5))] text-[14px] font-medium text-primary-foreground shadow-sm">
                {initialsValue}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-foreground">
                  {profileName}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {profileSecondary}
                </div>
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
              <Building2 className="h-3 w-3" strokeWidth={2.25} />
              <span>{businessLabel}</span>
            </div>
          </div>

          <div className="p-1">
            <UserMenuItem icon={UserCircle2} label={profileLabel} disabled />
            <UserMenuItem
              icon={Settings}
              label={settingsLabel}
              hint="Ctrl+,"
              href={resolveLocalizedPath(locale, '/settings')}
              onSelect={() => setOpen(false)}
            />
            <UserMenuItem
              icon={CreditCard}
              label={subscriptionLabel}
              href={resolveLocalizedPath(locale, '/subscription')}
              onSelect={() => setOpen(false)}
            />
            <UserMenuItem
              icon={Users}
              label={teamLabel}
              href={resolveLocalizedPath(locale, '/settings/team')}
              onSelect={() => setOpen(false)}
            />
            <UserMenuItem
              icon={ShieldCheck}
              label={rolesLabel}
              href={resolveLocalizedPath(locale, '/settings/roles')}
              onSelect={() => setOpen(false)}
            />
            <UserMenuItem icon={Bell} label={notificationsLabel} disabled />
            <UserMenuItem icon={KeyRound} label={changePinLabel} disabled />
          </div>
          <div className="border-t border-border/70 p-1">
            <UserMenuItem
              icon={LogOut}
              label={logoutLabel}
              hint="Ctrl+Shift+Q"
              destructive
              onSelect={() => {
                setOpen(false)
                onLogout()
              }}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('nav')
  const accessToken = useAuthStore((state) => state.accessToken)
  const refreshToken = useAuthStore((state) => state.refreshToken)
  const businessName = useAuthStore((state) => state.businessName)
  const role = useAuthStore((state) => state.role)
  const clearSession = useAuthStore((state) => state.clearSession)
  const planState = usePlanStore((state) => state.current)
  const payload = accessToken ? decodeJwtPayload<JwtPayload>(accessToken) : null
  const [collapsed, setCollapsed] = useState(false)
  const [hasLoadedCollapsed, setHasLoadedCollapsed] = useState(false)

  useEffect(() => {
    const storedValue = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    if (storedValue === '1') {
      setCollapsed(true)
    }
    setHasLoadedCollapsed(true)
  }, [])

  useEffect(() => {
    if (!hasLoadedCollapsed) {
      return
    }
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
  }, [collapsed, hasLoadedCollapsed])

  const navItems = useMemo<NavItem[]>(
    () => [
      { to: '/', label: t('home'), icon: Home },
      {
        to: '/sell',
        label: t('sell'),
        icon: ShoppingCart,
        badge: t('active_badge'),
        requiredResource: Resource.SALES_CREATE,
      },
      {
        label: t('products'),
        icon: Package,
        children: [
          {
            to: '/products',
            label: t('all_products'),
            icon: Package,
            requiredResource: Resource.PRODUCTS_VIEW,
            inactiveChildRoutes: ['/products/categories', '/products/units'],
          },
          {
            to: '/products/categories',
            label: t('categories'),
            icon: Tag,
            requiredResource: Resource.PRODUCTS_VIEW,
          },
          {
            to: '/products/units',
            label: t('units_of_measure'),
            icon: Ruler,
            requiredResource: Resource.PRODUCTS_VIEW,
          },
        ],
      },
      { to: '/inventory', label: t('inventory'), icon: Boxes, requiredResource: Resource.INVENTORY_VIEW },
      { to: '/sales', label: t('sales'), icon: Receipt, requiredResource: Resource.SALES_VIEW },
      {
        label: t('contacts'),
        icon: Users,
        children: [
          {
            to: '/contacts',
            label: t('all_contacts'),
            icon: Users,
            requiredResource: Resource.CONTACTS_VIEW,
            inactiveChildRoutes: ['/contacts/debtors', '/contacts/creditors'],
          },
          {
            to: '/contacts/debtors',
            label: t('debtors'),
            icon: HandCoins,
            requiredResource: Resource.DEBTS_VIEW,
          },
          {
            to: '/contacts/creditors',
            label: t('creditors'),
            icon: CreditCard,
            requiredResource: Resource.DEBTS_VIEW,
          },
        ],
      },
      { to: '/expenses', label: t('expenses'), icon: Wallet, requiredResource: Resource.EXPENSES_VIEW },
      { to: '/reports', label: t('reports'), icon: BarChart3, requiredResource: Resource.REPORTS_DAILY },
      {
        label: t('settings'),
        icon: Settings,
        children: [
          {
            to: '/settings',
            label: t('settings_general'),
            icon: Settings,
            inactiveChildRoutes: ['/settings/team', '/settings/roles'],
          },
          { to: '/settings/team', label: t('team'), icon: Users },
          { to: '/settings/roles', label: t('roles'), icon: ShieldCheck },
        ],
      },
    ],
    [t],
  )

  const profileName = resolveProfileName(payload, 'BizTrack')
  const profileSecondary = payload?.email ?? payload?.phone ?? t('profile_hint')
  const profileInitials = initials(profileName || 'BT')
  const businessLabel = businessName?.trim() || t('workspace_fallback')
  const roleLabel = role ? toTitleCase(role) : null

  const handleLogout = async () => {
    try {
      await logout(refreshToken ? { refreshToken } : undefined)
    } catch {
      // Clearing the local session is more important than surfacing a failed revoke call.
    }

    await clearSession()
    router.replace(resolveLocalizedPath(locale, '/login'))
  }

  return (
    <aside
      className={cn(
        'relative flex h-screen flex-col border-r border-primary/18 bg-primary text-primary-foreground backdrop-blur-sm transition-[width] duration-300 ease-out dark:border-border/70 dark:bg-card/50 dark:text-foreground',
        collapsed ? 'w-[68px]' : 'w-[252px]',
      )}
    >
      <BrandMark collapsed={collapsed} title="BizTrack CM" subtitle={t('point_of_sale')} />
      <SearchField
        collapsed={collapsed}
        searchLabel={t('search')}
        placeholder={t('search_placeholder')}
      />

      <button
        type="button"
        onClick={() => setCollapsed((current) => !current)}
        className="absolute -right-3 top-[58px] z-20 grid h-6 w-6 place-items-center rounded-full border border-white/20 bg-background text-primary shadow-sm transition-all hover:border-primary/40 hover:text-primary hover:shadow-md dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:border-primary/40 dark:hover:text-foreground"
        title={collapsed ? t('expand') : t('collapse')}
      >
        <ChevronsLeft
          className={cn('h-3.5 w-3.5 transition-transform duration-300', collapsed && 'rotate-180')}
          strokeWidth={2.25}
        />
      </button>

      {!collapsed ? (
        <div className="px-4 pb-1.5 pt-5">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-primary-foreground/60 dark:text-muted-foreground/80">
            {t('workspace')}
          </div>
        </div>
      ) : (
        <div className="pt-3" />
      )}

      <nav
        className={cn(
          'biztrack-scrollbar flex-1 space-y-0.5 overflow-y-auto px-2 pb-3',
          collapsed && 'px-2',
        )}
      >
        {navItems.map((item) =>
          hasChildren(item) ? (
            <NavGroup
              key={item.label}
              item={item}
              locale={locale}
              pathname={pathname}
              searchParams={searchParams}
              planState={planState}
              collapsed={collapsed}
              onExpand={() => setCollapsed(false)}
            />
          ) : (() => {
              const permissionState = getLeafPermissionState(item, planState)
              return (
                <NavLeaf
                  key={item.to}
                  item={item}
                  active={isItemActive(locale, pathname, searchParams, item)}
                  disabled={permissionState.disabled}
                  disabledBadge={permissionState.disabledBadge}
                  disabledTitle={permissionState.disabledTitle}
                  collapsed={collapsed}
                  locale={locale}
                />
              )
            })(),
        )}
      </nav>

      <UserPopover
        collapsed={collapsed}
        locale={locale}
        initialsValue={profileInitials}
        profileName={profileName}
        profileSecondary={profileSecondary}
        businessLabel={businessLabel}
        roleLabel={roleLabel}
        profileLabel={t('profile')}
        settingsLabel={t('settings')}
        subscriptionLabel={t('subscription')}
        teamLabel={t('team')}
        rolesLabel={t('roles')}
        notificationsLabel={t('notifications')}
        changePinLabel={t('change_pin')}
        logoutLabel={t('logout')}
        onLogout={() => {
          void handleLogout()
        }}
      />
    </aside>
  )
}
