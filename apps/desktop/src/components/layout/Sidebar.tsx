'use client'

import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Sidebar() {
  const pathname = usePathname()
  const locale = useLocale()
  const t = useTranslations('nav')

  const navItems = [
    { to: '/', label: t('home') },
    { to: '/sell', label: t('sell') },
    { to: '/products', label: t('products') },
    { to: '/expenses', label: t('expenses') },
    { to: '/reports', label: t('reports') },
    { to: '/settings', label: t('settings') },
  ]

  return (
    <aside className="w-[220px] bg-brand-900 text-white flex flex-col py-4">
      <div className="px-4 pb-6 border-b border-brand-800">
        <span className="font-semibold text-lg text-brand-100">BizTrack CM</span>
      </div>
      <nav className="flex-1 mt-4">
        {navItems.map(({ to, label }) => {
          const isActive = pathname === to
          return (
            <Link
              key={`/${locale}${to}`}
              href={`/${locale}${to}`}
              className={[
                'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                isActive ? 'bg-brand-800 text-white' : 'text-neutral-200 hover:text-white hover:bg-brand-800/50',
              ].join(' ')}
            >
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
