'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Currency } from '@biztrack/types'
import { Button, Input, PhoneInput } from '@biztrack/ui'
import { Building2, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { setupBusiness } from '@/services/auth.api'
import { getLocalBusiness } from '@/services/local-businesses.local'
import { getApiErrorMessage } from '@/services/api-response'
import { useAuthStore } from '@/stores/auth.store'
import { ipc } from '@/services/ipc.bridge'

export default function GeneralSettingsPage() {
  const t = useTranslations('app.settings.general')
  const businessId = useAuthStore((state) => state.businessId)

  const [isOnline, setIsOnline] = useState(true)
  useEffect(() => {
    ipc.network.isOnline().then(setIsOnline)
    ipc.network.onStatusChange(setIsOnline)
  }, [])

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [currency, setCurrency] = useState('XAF')

  const [loading, setLoading] = useState(true)

  const loadBusiness = useCallback(async () => {
    if (!businessId) {
      setLoading(false)
      return
    }
    try {
      const biz = await getLocalBusiness(businessId)
      if (biz) {
        setName(biz.name ?? '')
        setDescription(biz.description ?? '')
        setPhone(biz.phone ?? '')
        setEmail(biz.email ?? '')
        setAddress(biz.address ?? '')
        setCity(biz.city ?? '')
        setCurrency(biz.currency ?? 'XAF')
      }
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    void loadBusiness()
  }, [loadBusiness])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    setSaving(true)
    setError(null)
    try {
      await setupBusiness({
        name: trimmedName,
        description: description.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        country: country.trim() || undefined,
        currency: currency || undefined,
      })
      toast.success(t('save_success'))
    } catch (err) {
      setError(getApiErrorMessage(err, t('save_error')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <div className="flex items-center gap-2.5">
          <Building2 className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
          <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {!isOnline ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-900/20">
          <WifiOff className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={2} />
          <p className="text-sm text-amber-700 dark:text-amber-400">{t('offline_warning')}</p>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      ) : (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">{t('form_title')}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('field_name')}
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('field_name_placeholder')}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('field_description')}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('field_description_placeholder')}
                rows={3}
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('field_phone')}
              </label>
              <PhoneInput
                value={phone}
                onChange={(value: string | undefined) => setPhone(value ?? '')}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('field_email')}
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('field_email_placeholder')}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('field_address')}
              </label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t('field_address_placeholder')}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('field_city')}
              </label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={t('field_city_placeholder')}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('field_country')}
              </label>
              <Input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder={t('field_country_placeholder')}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('field_currency')}
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {Object.values(Currency).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

          <div className="mt-5 flex justify-end">
            <Button
              variant="primary"
              onClick={() => void handleSave()}
              disabled={saving || !name.trim() || !isOnline}
            >
              {saving ? t('saving') : t('save_action')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
