'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { InvitePreviewResponse } from '@biztrack/types'
import { Button } from '@biztrack/ui'
import { AuthCard } from '@/components/auth/AuthCard'
import { getInvitePreview } from '@/services/auth.api'
import { useAuthStore } from '@/stores/auth.store'

export default function InvitePreviewPage() {
  const locale = useLocale()
  const t = useTranslations('auth')
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [invite, setInvite] = useState<InvitePreviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const setPending = useAuthStore((state) => state.setPending)

  useEffect(() => {
    if (!token) {
      setError(t('invite.invalid'))
      return
    }

    getInvitePreview(token)
      .then((data) => {
        setInvite(data)
        // Only store the invite token in pending — contact info travels via URL params
        setPending({ inviteToken: token })
      })
      .catch(() => setError(t('invite.invalid')))
  }, [setPending, t, token])

  const navigateTo = (base: string) => {
    if (!invite) return
    const params = new URLSearchParams()
    if (invite.phone) params.set('phone', invite.phone)
    else if (invite.email) params.set('email', invite.email)
    const qs = params.toString()
    router.push(`/${locale}${base}${qs ? `?${qs}` : ''}`)
  }

  return (
    <AuthCard title={t('invite.title')} subtitle={t('invite.subtitle')}>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {invite ? (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <div className="font-medium text-foreground">{invite.businessName}</div>
            <div>
              {t('invite.role_label')}: {invite.role}
            </div>
            <div>
              {t('invite.invited_by_label')}: {invite.invitedByName ?? t('invite.team_name')}
            </div>
          </div>
          <Button variant="primary" onClick={() => navigateTo('/register')} className="w-full">
            {t('invite.accept')}
          </Button>
          <Button variant="secondary" onClick={() => navigateTo('/login')} className="w-full">
            {t('invite.have_account')}
          </Button>
        </div>
      ) : null}
    </AuthCard>
  )
}
