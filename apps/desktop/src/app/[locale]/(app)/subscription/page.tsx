'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { SubscriptionPlan, SubscriptionStatus } from '@biztrack/types'
import type { CurrentSubscriptionResponse, PlanResourceSummary } from '@biztrack/types'
import { Button } from '@biztrack/ui'
import { Check, CreditCard } from 'lucide-react'
import { cancelPlan, listPlans, mySubscription, upgradePlan } from '@/services/auth.api'
import { getApiErrorMessage } from '@/services/api-response'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { usePlanStore } from '@/stores/plan.store'

const PLAN_ORDER = [
  SubscriptionPlan.FREE,
  SubscriptionPlan.SOLO,
  SubscriptionPlan.BUSINESS,
  SubscriptionPlan.PRO,
]

function getPlanRank(plan: SubscriptionPlan): number {
  return PLAN_ORDER.indexOf(plan)
}

function formatLocalDate(isoString: string | null | undefined, locale: string): string {
  if (!isoString) return ''
  return new Date(isoString).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

type PlanCardProps = {
  plan: PlanResourceSummary
  currentPlan: SubscriptionPlan | null
  pendingPlan: SubscriptionPlan | null
  switching: boolean
  onSelect: (plan: SubscriptionPlan) => void
  onCancelConfirm: () => void
  onCancelPending: () => void
}

function PlanCard({
  plan,
  currentPlan,
  pendingPlan,
  switching,
  onSelect,
  onCancelConfirm,
  onCancelPending,
}: PlanCardProps) {
  const t = useTranslations('app.subscription')
  const isCurrent = plan.name === currentPlan
  const isPending = plan.name === pendingPlan
  const currentRank = currentPlan ? getPlanRank(currentPlan) : 0
  const planRank = getPlanRank(plan.name)
  const isUpgrade = planRank > currentRank
  const isFree = plan.priceXAF === 0

  const quotaItems = [
    plan.quotas.products === null
      ? t('quota_products_unlimited')
      : t('quota_products', { count: plan.quotas.products }),
    plan.quotas.contacts === null
      ? t('quota_contacts_unlimited')
      : t('quota_contacts', { count: plan.quotas.contacts }),
    plan.quotas.categories === null
      ? t('quota_categories_unlimited')
      : t('quota_categories', { count: plan.quotas.categories }),
    plan.quotas.users === null
      ? t('quota_users_unlimited')
      : t('quota_users', { count: plan.quotas.users }),
  ]

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-xl border p-5 transition-shadow',
        isCurrent
          ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
          : 'border-border bg-card hover:shadow-sm',
      )}
    >
      {isCurrent ? (
        <span className="absolute -top-2.5 left-4 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground">
          {t('current_badge')}
        </span>
      ) : null}

      <div className="mb-4">
        <div className="text-[15px] font-semibold text-foreground">{plan.displayName}</div>
        <div className="mt-1 text-sm text-muted-foreground">
          {isFree ? t('price_free') : t('price_per_month', { price: plan.priceXAF.toLocaleString() })}
        </div>
      </div>

      <ul className="mb-5 flex-1 space-y-2">
        {quotaItems.map((item) => (
          <li key={item} className="flex items-center gap-2 text-sm text-foreground/80">
            <Check className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.5} />
            {item}
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <Button variant="secondary" disabled className="w-full">
          {t('current_badge')}
        </Button>
      ) : isPending ? (
        <div className="space-y-2">
          <p className="text-center text-[13px] text-muted-foreground">
            {t('confirm_switch_title', { plan: plan.displayName })}
          </p>
          <p className="text-center text-xs text-muted-foreground">{t('confirm_switch_body')}</p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={onCancelPending}
              disabled={switching}
            >
              {t('confirm_cancel')}
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={onCancelConfirm}
              disabled={switching}
            >
              {switching ? t('upgrading') : t('confirm_action')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant={isUpgrade ? 'primary' : 'secondary'}
          className="w-full"
          onClick={() => onSelect(plan.name)}
          disabled={switching}
        >
          {isUpgrade ? t('upgrade') : t('downgrade')}
        </Button>
      )}
    </div>
  )
}

export default function SubscriptionPage() {
  const t = useTranslations('app.subscription')
  const locale = useLocale()
  const accessToken = useAuthStore((state) => state.accessToken)
  const businessId = useAuthStore((state) => state.businessId)
  const refreshPlanState = usePlanStore((state) => state.refreshPlanState)

  const [plans, setPlans] = useState<PlanResourceSummary[]>([])
  const [subscription, setSubscription] = useState<CurrentSubscriptionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [pendingPlan, setPendingPlan] = useState<SubscriptionPlan | null>(null)
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [switchSuccess, setSwitchSuccess] = useState<string | null>(null)

  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [plansData, subData] = await Promise.all([listPlans(), mySubscription()])
      setPlans(plansData.plans)
      setSubscription(subData)
    } catch (err) {
      setLoadError(getApiErrorMessage(err, t('load_error')))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    setSwitchError(null)
    setSwitchSuccess(null)
    setPendingPlan(plan)
  }

  const handleCancelPending = () => {
    setPendingPlan(null)
  }

  const handleConfirmSwitch = async () => {
    if (!pendingPlan) return
    setSwitching(true)
    setSwitchError(null)
    try {
      await upgradePlan({ plan: pendingPlan })
      const targetPlan = plans.find((p) => p.name === pendingPlan)
      setSwitchSuccess(t('upgrade_success', { plan: targetPlan?.displayName ?? pendingPlan }))
      setPendingPlan(null)
      await Promise.all([
        load(),
        refreshPlanState({ businessId, accessToken }),
      ])
    } catch (err) {
      setSwitchError(getApiErrorMessage(err, t('upgrade_error')))
    } finally {
      setSwitching(false)
    }
  }

  const handleCancelSubscription = async () => {
    setCancelling(true)
    setCancelError(null)
    try {
      await cancelPlan()
      setCancelSuccess(t('cancel_success'))
      setShowCancelConfirm(false)
      await load()
    } catch (err) {
      setCancelError(getApiErrorMessage(err, t('cancel_error')))
    } finally {
      setCancelling(false)
    }
  }

  const statusLabel = subscription
    ? {
        [SubscriptionStatus.TRIAL]: t('status_trial'),
        [SubscriptionStatus.ACTIVE]: t('status_active'),
        [SubscriptionStatus.PAST_DUE]: t('status_past_due'),
        [SubscriptionStatus.CANCELLED]: t('status_cancelled'),
        [SubscriptionStatus.SUSPENDED]: t('status_suspended'),
      }[subscription.status] ?? subscription.status
    : null

  const statusVariant = subscription
    ? ({
        [SubscriptionStatus.TRIAL]: 'blue',
        [SubscriptionStatus.ACTIVE]: 'green',
        [SubscriptionStatus.PAST_DUE]: 'amber',
        [SubscriptionStatus.CANCELLED]: 'red',
        [SubscriptionStatus.SUSPENDED]: 'red',
      }[subscription.status] ?? 'default')
    : 'default'

  const statusColorClass = {
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    default: 'bg-secondary text-muted-foreground',
  }[statusVariant]

  const showCancelSection =
    subscription &&
    subscription.plan !== SubscriptionPlan.FREE &&
    subscription.status !== SubscriptionStatus.CANCELLED &&
    subscription.status !== SubscriptionStatus.SUSPENDED &&
    !subscription.cancelAtPeriodEnd

  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5">
          <CreditCard className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
          <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Loading / Error */}
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      ) : loadError ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-destructive">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="text-sm font-medium text-primary underline underline-offset-2"
          >
            {t('retry')}
          </button>
        </div>
      ) : null}

      {/* Current subscription card */}
      {!loading && subscription ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t('current_plan_section')}
          </p>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-2xl font-bold text-foreground">
                  {plans.find((p) => p.name === subscription.plan)?.displayName ?? subscription.plan}
                </span>
                {statusLabel ? (
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', statusColorClass)}>
                    {statusLabel}
                  </span>
                ) : null}
              </div>

              <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                {subscription.status === SubscriptionStatus.TRIAL && subscription.trialEndsAt ? (
                  <>
                    <p>{t('trial_ends', { date: formatLocalDate(subscription.trialEndsAt, locale) })}</p>
                    {subscription.trialDaysRemaining > 0 ? (
                      <p className="font-medium text-foreground">
                        {t('trial_days_left', { count: subscription.trialDaysRemaining })}
                      </p>
                    ) : null}
                  </>
                ) : subscription.currentPeriodEnd && !subscription.cancelAtPeriodEnd ? (
                  <p>{t('billing_renews', { date: formatLocalDate(subscription.currentPeriodEnd, locale) })}</p>
                ) : subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd ? (
                  <p className="font-medium text-amber-600 dark:text-amber-400">
                    {t('cancelled_notice', { date: formatLocalDate(subscription.currentPeriodEnd, locale) })}
                  </p>
                ) : subscription.plan === SubscriptionPlan.FREE ? (
                  <p>{t('no_billing')}</p>
                ) : null}
              </div>
            </div>
          </div>

          {/* Status messages */}
          {switchSuccess ? (
            <p className="mt-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              {switchSuccess}
            </p>
          ) : null}
          {switchError ? (
            <p className="mt-3 text-sm text-destructive">{switchError}</p>
          ) : null}
          {cancelSuccess ? (
            <p className="mt-3 text-sm font-medium text-amber-600 dark:text-amber-400">
              {cancelSuccess}
            </p>
          ) : null}
          {cancelError ? (
            <p className="mt-3 text-sm text-destructive">{cancelError}</p>
          ) : null}
        </div>
      ) : null}

      {/* Plans grid */}
      {!loading && plans.length > 0 ? (
        <div>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t('plans_heading')}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <PlanCard
                key={plan.name}
                plan={plan}
                currentPlan={subscription?.plan ?? null}
                pendingPlan={pendingPlan}
                switching={switching}
                onSelect={handleSelectPlan}
                onCancelConfirm={handleConfirmSwitch}
                onCancelPending={handleCancelPending}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Cancel subscription */}
      {!loading && showCancelSection ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">{t('cancel_section_title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('cancel_section_body')}</p>

          {!showCancelConfirm ? (
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className="mt-3 text-sm font-medium text-destructive underline underline-offset-2 hover:opacity-80"
            >
              {t('cancel_action')}
            </button>
          ) : (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowCancelConfirm(false)}
                disabled={cancelling}
              >
                {t('cancel_cancel_action')}
              </Button>
              <Button
                variant="danger"
                onClick={() => void handleCancelSubscription()}
                disabled={cancelling}
              >
                {cancelling ? t('cancelling') : t('cancel_confirm')}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
