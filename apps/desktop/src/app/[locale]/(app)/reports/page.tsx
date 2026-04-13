'use client'

import { useTranslations } from 'next-intl'

export default function ReportsPage() {
  const t = useTranslations('app')
  return (
    <div>
      <h2>{t('reports.title')}</h2>
      <p>{t('reports.subtitle')}</p>
    </div>
  )
}
