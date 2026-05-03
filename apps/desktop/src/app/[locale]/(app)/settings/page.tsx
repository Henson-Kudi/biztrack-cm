'use client'

import { useTranslations } from 'next-intl'

export default function SettingsPage() {
  const t = useTranslations('app')
  return (
    <div>
      <h2>{t('settings.title')}</h2>
      <p>{t('settings.subtitle')}</p>
    </div>
  )
}
