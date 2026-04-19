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
        setPending({ inviteToken: token })
      })
      .catch(() => setError(t('invite.invalid')))
  }, [setPending, t, token])

  const goTo = (path: string) => router.push(`/${locale}${path}`)

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
          <Button variant="primary" onClick={() => goTo('/register')} className="w-full">
            {t('invite.accept')}
          </Button>
          <Button variant="secondary" onClick={() => goTo('/login')} className="w-full">
            {t('invite.have_account')}
          </Button>
        </div>
      ) : null}
    </AuthCard>
  )
}
