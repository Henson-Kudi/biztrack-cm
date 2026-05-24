'use client'

import { useEffect, useMemo, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@biztrack/ui'
import { useAuthStore } from '@/stores/auth.store'
import { usePlanStore } from '@/stores/plan.store'
import { ipc } from '@/services/ipc.bridge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function AuthProvider({ children }: { children: ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate)
  const authHydrated = useAuthStore((s) => s.hydrated)
  const businessId = useAuthStore((s) => s.businessId)
  const accessToken = useAuthStore((s) => s.accessToken)
  const isOffline = useAuthStore((s) => s.isOffline)
  const planState = usePlanStore((s) => s.current)
  const hydratePlanState = usePlanStore((s) => s.hydrateForBusiness)
  const refreshPlanState = usePlanStore((s) => s.refreshPlanState)
  const t = useTranslations('topbar')
  const locale = useLocale()

  useEffect(() => {
    hydrate()
    ipc.sync.onTokensUpdated(() => {
      void hydrate()
    })
  }, [hydrate])

  useEffect(() => {
    if (!authHydrated) {
      return
    }

    void hydratePlanState({
      businessId,
      accessToken: isOffline ? null : accessToken,
    })
  }, [accessToken, authHydrated, businessId, hydratePlanState, isOffline])

  useEffect(() => {
    let lastSyncedAt: string | null = null

    ipc.sync.onSnapshotChange((snapshot) => {
      if (!snapshot.lastSyncedAt || snapshot.lastSyncedAt === lastSyncedAt) {
        return
      }

      lastSyncedAt = snapshot.lastSyncedAt
      const auth = useAuthStore.getState()
      void usePlanStore.getState().refreshQuotaUsage({
        businessId: auth.businessId,
        accessToken: auth.isOffline ? null : auth.accessToken,
      })
    })

    ipc.network.onStatusChange((online) => {
      if (!online) {
        return
      }

      const auth = useAuthStore.getState()
      void usePlanStore.getState().refreshPlanState({
        businessId: auth.businessId,
        accessToken: auth.isOffline ? null : auth.accessToken,
      })
    })
  }, [])

  const expiredTrialDate = useMemo(() => {
    if (!planState?.entitlementExpiresAt) {
      return null
    }

    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(planState.entitlementExpiresAt))
  }, [locale, planState?.entitlementExpiresAt])

  return (
    <>
      {children}
      <Dialog open={Boolean(planState?.offlineExpiredFallback)} onOpenChange={() => {}}>
        <DialogContent className="max-w-lg" closeLabel={t('trial_expired_retry')}>
          <DialogHeader>
            <DialogTitle>{t('trial_expired_title')}</DialogTitle>
            <DialogDescription>
              {t('trial_expired_body', {
                plan: planState?.selectedPlan ?? 'PAID',
                date: expiredTrialDate ?? '--',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="primary"
              onClick={() =>
                void refreshPlanState({
                  businessId,
                  accessToken: isOffline ? null : accessToken,
                })
              }
            >
              {t('trial_expired_retry')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
