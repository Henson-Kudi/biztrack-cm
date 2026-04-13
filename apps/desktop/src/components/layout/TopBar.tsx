'use client'

import { useTranslations } from 'next-intl'

export function TopBar() {
  const t = useTranslations('topbar')

  return (
    <header className="h-[52px] bg-card border-b border-border flex items-center justify-between px-6">
      <div className="text-xs text-muted-foreground">{t('last_sync')}</div>
      <div className="text-sm text-foreground">Jean Kamga</div>
    </header>
  )
}
