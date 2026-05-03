'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Input, Button, PhoneInput } from '@biztrack/ui'
import { AuthCard } from '@/components/auth/AuthCard'
import {
  getAuthMaskedEmail,
  getAuthMaskedPhone,
  getAuthOtpExpiresIn,
  requestLogin,
} from '@/services/auth.api'
import { getApiErrorDetails, getApiErrorMessage } from '@/services/api-response'
import { useAuthStore } from '@/stores/auth.store'
import { normalizeAuthNextStep, routeForNextStep } from '@/lib/auth-routing'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { getLastBusinessContext } from '@/stores/auth.store'
import type { AuthNextStep } from '@biztrack/types'
import bcrypt from 'bcryptjs'

export default function LoginPage() {
  const locale = useLocale()
  const t = useTranslations('auth')
  const router = useRouter()
  const [mode, setMode] = useState<'phone' | 'email'>('phone')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const online = useNetworkStatus()

  const setPending = useAuthStore((s) => s.setPending)
  const getPasswordHash = useAuthStore((s) => s.getPasswordHash)
  const setOfflineSession = useAuthStore((s) => s.setOfflineSession)

  const goTo = (path: string) => router.push(`/${locale}${path}`)

  const handleOnlineSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const trimmed = identifier.trim()
      const isEmail = mode === 'email'
      const response = await requestLogin({ identifier: trimmed })
      setPending({
        identifier: trimmed,
        email: isEmail ? trimmed : undefined,
        phone: !isEmail ? trimmed : undefined,
        otpMessage: null,
        maskedPhone: getAuthMaskedPhone(response),
        maskedEmail: getAuthMaskedEmail(response),
        otpExpiresIn: getAuthOtpExpiresIn(response),
      })

      const nextStep = normalizeAuthNextStep(response.nextStep)
      return goTo(routeForNextStep(nextStep))
    } catch (error) {
      const apiNextStep = getApiErrorDetails<{ nextStep?: AuthNextStep }>(error)?.nextStep
      if (apiNextStep) {
        return goTo(routeForNextStep(normalizeAuthNextStep(apiNextStep)))
      }
      setError(getApiErrorMessage(error, t('login.error_default')))
    } finally {
      setLoading(false)
    }
  }

  const handleOfflineLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const storedHash = await getPasswordHash()
      if (!storedHash) {
        setError(t('login.offline_no_hash'))
        return
      }
      const matches = await bcrypt.compare(password, storedHash)
      if (!matches) {
        setError(t('login.offline_incorrect'))
        return
      }
      const { businessId, role } = await getLastBusinessContext()
      setOfflineSession(businessId ?? null, role)
      goTo('/')
    } catch {
      setError(t('login.offline_failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard
      title={t('login.title')}
      subtitle={online ? t('login.subtitle_online') : t('login.subtitle_offline')}
    >
      <form onSubmit={online ? handleOnlineSubmit : handleOfflineLogin} className="space-y-4">
        {online && mode === 'phone' && (
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">
                {t('login.phone_label')}
              </label>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setMode('email')
                  setIdentifier('')
                }}
              >
                {t('login.use_email')}
              </button>
            </div>
            <PhoneInput
              value={identifier}
              onChange={(value) => setIdentifier(value || '')}
              disabled={!online}
              required={online}
            />
          </div>
        )}
        {online && mode === 'email' && (
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">
                {t('login.email_label')}
              </label>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setMode('phone')
                  setIdentifier('')
                }}
              >
                {t('login.use_phone')}
              </button>
            </div>
            <Input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={t('login.email_placeholder')}
              disabled={!online}
              required={online}
            />
          </div>
        )}
        {!online && (
          <div>
            <label className="text-sm font-medium text-foreground">
              {t('login.password_label')}
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('login.password_placeholder')}
              required
            />
          </div>
        )}
        {error && <div className="text-sm text-destructive">{error}</div>}
        <Button type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? t('login.loading') : online ? t('login.continue') : t('login.offline_submit')}
        </Button>
      </form>
      <div className="mt-6 text-sm text-muted-foreground">
        {t('login.no_account')}{' '}
        <Link className="text-foreground font-medium" href={`/${locale}/register`}>
          {t('login.create_account')}
        </Link>
      </div>
    </AuthCard>
  )
}
