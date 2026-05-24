'use client'

import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { AuthNextStep } from '@biztrack/types'
import { Input, Button } from '@biztrack/ui'
import { AuthCard } from '@/components/auth/AuthCard'
import { acceptInvite, getAuthTokens, login } from '@/services/auth.api'
import { getApiErrorMessage } from '@/services/api-response'
import { useAuthStore } from '@/stores/auth.store'
import { routeForNextStep } from '@/lib/auth-routing'
import bcrypt from 'bcryptjs'

export default function PasswordLoginPage() {
  const locale = useLocale()
  const t = useTranslations('auth')
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const pendingIdentifier = useAuthStore((s) => s.pending.identifier)
  const inviteToken = useAuthStore((s) => s.pending.inviteToken)
  const setPending = useAuthStore((s) => s.setPending)
  const setTokens = useAuthStore((s) => s.setTokens)
  const storePasswordHash = useAuthStore((s) => s.storePasswordHash)

  const goTo = (path: string) => router.push(`/${locale}${path}`)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!pendingIdentifier) {
      return goTo('/login')
    }
    setError(null)
    setLoading(true)
    try {
      const response = await login({ identifier: pendingIdentifier, password })
      const tokens = getAuthTokens(response)
      if (tokens) {
        await setTokens(tokens)
      }
      const hash = await bcrypt.hash(password, 10)
      await storePasswordHash(hash)

      if (inviteToken) {
        const inviteResponse = await acceptInvite(inviteToken)
        const inviteTokens = getAuthTokens(inviteResponse)
        if (inviteTokens) {
          await setTokens(inviteTokens)
        }
        setPending({ inviteToken: null })
        return goTo(routeForNextStep(inviteResponse.nextStep))
      }

      if (
        response.nextStep === AuthNextStep.SELECT_BUSINESS ||
        response.nextStep === AuthNextStep.DASHBOARD
      ) {
        return goTo(routeForNextStep(response.nextStep))
      }
      return goTo(routeForNextStep(response.nextStep))
    } catch (error) {
      setError(getApiErrorMessage(error, t('password.error_default')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard title={t('password.title')} subtitle={t('password.subtitle')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground">{t('password.label')}</label>
          <Input
            type="password"
            value={password}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)}
            placeholder={t('password.placeholder')}
            required
          />
        </div>
        {error && <div className="text-sm text-destructive">{error}</div>}
        <Button type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? t('password.loading') : t('password.submit')}
        </Button>
      </form>
    </AuthCard>
  )
}
