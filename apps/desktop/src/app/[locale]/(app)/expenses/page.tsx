'use client'

import { useTranslations } from 'next-intl'

export default function ExpensesPage() {
  const t = useTranslations('app')
  return (
    <div>
      <h2>{t('expenses.title')}</h2>
      <p>{t('expenses.subtitle')}</p>
    </div>
  )
}
