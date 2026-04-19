'use client'

import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = {
  to: string
  label: string
  children?: NavItem[]
}

export function Sidebar() {
  const pathname = usePathname()
  const locale = useLocale()
  const t = useTranslations('nav')

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
    </aside>
  )
}
