'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { PrefferedPhoneChannel, type RegisterRequest } from '@biztrack/types'
import { Input, Button, PhoneInput } from '@biztrack/ui'
import { AuthCard } from '@/components/auth/AuthCard'
import {
  getAuthMaskedEmail,
  getAuthMaskedPhone,
  getAuthOtpExpiresIn,
  register,
} from '@/services/auth.api'
import { getApiErrorMessage } from '@/services/api-response'
import { useAuthStore } from '@/stores/auth.store'
import { normalizeAuthNextStep, routeForNextStep } from '@/lib/auth-routing'
import bcrypt from 'bcryptjs'

export default function RegisterPage() {
  const locale = useLocale()
  const t = useTranslations('auth')
  const router = useRouter()
  const [form, setForm] = useState<RegisterRequest>({
    name: '',
    phone: '',
    email: '',
    password: '',
    preferredPhoneChannel: PrefferedPhoneChannel.WHATSAPP,
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const pendingInviteToken = useAuthStore((s) => s.pending.inviteToken)
  const setPending = useAuthStore((s) => s.setPending)
  const storePasswordHash = useAuthStore((s) => s.storePasswordHash)

  const goTo = (path: string) => router.push(`/${locale}${path}`)

  const handleChange = (field: keyof RegisterRequest) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const response = await register({
        name: form.name,
        phone: form.phone,
        email: form.email || undefined,
        password: form.password,
        preferredPhoneChannel: form.preferredPhoneChannel,
        inviteToken: pendingInviteToken ?? undefined,
        locale,
      })
      setPending({
        phone: form.phone,
        email: form.email || undefined,
        inviteToken: pendingInviteToken ?? null,
        otpMessage: null,
        maskedPhone: getAuthMaskedPhone(response),
        maskedEmail: getAuthMaskedEmail(response),
        otpExpiresIn: getAuthOtpExpiresIn(response),
      })
      const hash = await bcrypt.hash(form.password, 10)
      await storePasswordHash(hash)

      const nextStep = normalizeAuthNextStep(response.nextStep)
      return goTo(routeForNextStep(nextStep))
    } catch (error) {
      setError(getApiErrorMessage(error, t('register.error_default')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard title={t('register.title')} subtitle={t('register.subtitle')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground">{t('register.name_label')}</label>
          <Input value={form.name} onChange={handleChange('name')} required />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">{t('register.phone_label')}</label>
          <PhoneInput
            value={form.phone}
            onChange={(value) => setForm((p) => ({ ...p, phone: value || '' }))}
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">{t('register.email_label')}</label>
          <Input
            value={form.email}
            onChange={handleChange('email')}
            placeholder={t('register.email_placeholder')}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">
            {t('register.password_label')}
          </label>
          <Input
            type="password"
            value={form.password}
            onChange={handleChange('password')}
            required
          />
        </div>
        {error && <div className="text-sm text-destructive">{error}</div>}
        <Button type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? t('register.loading') : t('register.continue')}
        </Button>
      </form>
      <div className="mt-6 text-sm text-muted-foreground">
        {t('register.have_account')}{' '}
        <Link className="text-foreground font-medium" href={`/${locale}/login`}>
          {t('register.login_link')}
        </Link>
      </div>
    </AuthCard>
  )
}
