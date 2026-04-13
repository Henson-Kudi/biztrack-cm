'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@biztrack/ui'
import { AuthCard } from '@/components/auth/AuthCard'
import { getInvitePreview } from '@/services/auth.api'
import { useAuthStore } from '@/stores/auth.store'

export default function InvitePreviewPage({ params }: { params: { token: string } }) {
  const locale = useLocale()
  const t = useTranslations('auth')
  const router = useRouter()
  const [invite, setInvite] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const setPending = useAuthStore((s) => s.setPending)

  useEffect(() => {
    getInvitePreview(params.token)
      .then((data) => {
        setInvite(data)
        setPending({ inviteToken: params.token })
      })
      .catch(() => setError(t('invite.invalid')))
  }, [params.token, setPending])

  const goTo = (path: string) => router.push(`/${locale}${path}`)

  return (
    <AuthCard title={t('invite.title')} subtitle={t('invite.subtitle')}>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {invite && (
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
      )}
    </AuthCard>
  )
}




