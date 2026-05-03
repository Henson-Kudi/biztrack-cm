'use client'

import { useLocale, useTranslations } from 'next-intl'
import type { JwtPayload } from '@biztrack/types'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { decodeJwtPayload } from '@/lib/jwt'
import { useAuthStore } from '@/stores/auth.store'

type NavItem = {
  to: string
  label: string
  children?: NavItem[]
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
    const label = toTitleCase(localPart||'')
    if (label) {
      return label
    }
  }

  if (payload?.phone) {
    return payload.phone
  }

  return fallback
}

export function Sidebar() {
  const pathname = usePathname()
  const locale = useLocale()
  const t = useTranslations('nav')
  const accessToken = useAuthStore((state) => state.accessToken)
  const payload = accessToken ? decodeJwtPayload<JwtPayload>(accessToken) : null

  const navItems: NavItem[] = [
    { to: '/', label: t('home') },
    { to: '/sell', label: t('sell') },
    {
      to: '/products',
      label: t('products'),
      children: [
        { to: '/products/categories', label: t('categories') },
        { to: '/products/units', label: t('units_of_measure') },
      ],
    },
    { to: '/inventory', label: t('inventory') },
    { to: '/expenses', label: t('expenses') },
    { to: '/reports', label: t('reports') },
    { to: '/settings', label: t('settings') },
  ]

  const localizedPath = (to: string) => (to === '/' ? `/${locale}` : `/${locale}${to}`)

  const isItemActive = (to: string) => {
    const currentPath = localizedPath(to)

    return pathname === currentPath || (to !== '/' && pathname.startsWith(`${currentPath}/`))
  }

  const profileName = resolveProfileName(payload, t('profile'))
  const profileSecondary = payload?.email ?? payload?.phone ?? t('profile_hint')
  const profileInitials = initials(profileName || 'BT')

  return (
    <aside className="w-[220px] bg-brand-900 text-white flex flex-col py-4">
      <div className="px-4 pb-6 border-b border-brand-800">
        <span className="font-semibold text-lg text-brand-100">BizTrack CM</span>
      </div>
      <nav className="mt-4 flex-1 space-y-1">
        {navItems.map((item) => {
          const itemPath = localizedPath(item.to)
          const isActive = isItemActive(item.to)

          return (
            <div key={itemPath} className="space-y-1">
              <Link
                href={itemPath}
                className={[
                  'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'bg-brand-800 text-white'
                    : 'text-neutral-200 hover:text-white hover:bg-brand-800/50',
                ].join(' ')}
              >
                <span>{item.label}</span>
                {item.children?.length ? (
                  <svg
                    viewBox="0 0 20 20"
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className={['ml-auto transition-transform', isActive ? 'rotate-90' : ''].join(' ')}
                  >
                    <path d="m7 5 5 5-5 5" />
                  </svg>
                ) : null}
              </Link>

              {item.children?.length && isActive ? (
                <div className="space-y-1 pb-1">
                  {item.children.map((child) => {
                    const childPath = localizedPath(child.to)
                    const childActive = isItemActive(child.to)

                    return (
                      <Link
                        key={childPath}
                        href={childPath}
                        className={[
                          'ml-4 flex items-center gap-2 px-4 py-2 text-sm transition-colors',
                          childActive
                            ? 'text-white'
                            : 'text-neutral-300 hover:text-white',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'h-1.5 w-1.5 rounded-full',
                            childActive ? 'bg-white' : 'bg-neutral-500',
                          ].join(' ')}
                        />
                        <span>{child.label}</span>
                      </Link>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </nav>

      <div className="mt-4 border-t border-brand-800 ">
        <button
          type="button"
          aria-label={t('profile')}
          className="flex w-full  items-center gap-3  bg-white/[0.04] px-3 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_30%,#f472b6_0%,#a855f7_38%,#2563eb_100%)] text-sm font-semibold text-white shadow-[0_0_0_2px_rgba(255,255,255,0.08)]">
            {profileInitials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold leading-5 text-white">
              {profileName}
            </div>
            <div className="truncate text-[15px] leading-5 text-white/80">
              {profileSecondary}
            </div>
          </div>
          <svg
            viewBox="0 0 16 16"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="shrink-0 text-white/85"
          >
            <path d="m5 6 3-3 3 3" />
            <path d="m5 10 3 3 3-3" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
