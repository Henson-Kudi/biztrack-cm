'use client'

import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@biztrack/ui'
import { AuthCard } from '@/components/auth/AuthCard'

export default function AddFirstProductPage() {
  const locale = useLocale()
  const t = useTranslations('auth')
  const router = useRouter()

  const goTo = (path: string) => router.push(`/${locale}${path}`)

  return (
    <AuthCard title={t('first_product.title')} subtitle={t('first_product.subtitle')}>
      <div className="space-y-3">
        <Button onClick={() => goTo('/products')} className="w-full">
          {t('first_product.add')}
        </Button>
        <Button variant="secondary" onClick={() => goTo('/')} className="w-full">
          {t('first_product.skip')}
        </Button>
      </div>
    </AuthCard>
  )
}
