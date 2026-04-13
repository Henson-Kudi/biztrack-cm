'use client'

import { useTranslations } from 'next-intl'

export default function SellPage() {
  const t = useTranslations('app')
  return (
    <div>
      <h2>{t('sell.title')}</h2>
      <p>{t('sell.subtitle')}</p>
    </div>
  )
}
