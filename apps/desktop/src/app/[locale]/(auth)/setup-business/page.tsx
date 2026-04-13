'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Input, Button } from '@biztrack/ui'
import { AuthCard } from '@/components/auth/AuthCard'
import { setupBusiness } from '@/services/auth.api'

export default function SetupBusinessPage() {
  const locale = useLocale()
  const t = useTranslations('auth')
  const router = useRouter()
  const [form, setForm] = useState({ name: '', city: '', address: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const goTo = (path: string) => router.push(`/${locale}${path}`)

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await setupBusiness({
        name: form.name,
        city: form.city || undefined,
        address: form.address || undefined,
      })
      return goTo('/select-plan')
    } catch (err: any) {
      setError(err?.response?.data?.message ?? t('setup_business.error_default'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard title={t('setup_business.title')} subtitle={t('setup_business.subtitle')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground">{t('setup_business.name_label')}</label>
          <Input value={form.name} onChange={handleChange('name')} required />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">{t('setup_business.city_label')}</label>
          <Input value={form.city} onChange={handleChange('city')} placeholder={t('setup_business.city_placeholder')} />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">{t('setup_business.address_label')}</label>
          <Input value={form.address} onChange={handleChange('address')} placeholder={t('setup_business.address_placeholder')} />
        </div>
        {error && <div className="text-sm text-destructive">{error}</div>}
        <Button type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? t('setup_business.loading') : t('setup_business.continue')}
        </Button>
      </form>
    </AuthCard>
  )
}




