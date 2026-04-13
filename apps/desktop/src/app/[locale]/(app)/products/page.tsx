'use client'

import { useTranslations } from 'next-intl'

export default function ProductsPage() {
  const t = useTranslations('app')
  return (
    <div>
      <h2>{t('products.title')}</h2>
      <p>{t('products.subtitle')}</p>
    </div>
  )
}
