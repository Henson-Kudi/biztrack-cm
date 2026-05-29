'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { CashierShiftSummary } from '@biztrack/types'
import { Button, Spinner } from '@biztrack/ui'
import { ShoppingCart, X } from 'lucide-react'
import { SurfaceCard } from '@/components/catalog/SurfaceCard'
import { cn } from '@/lib/utils'
import { getCashierShiftSummaryLocal } from '@/services/cashier.local'
import { useAuthStore } from '@/stores/auth.store'
import {
  DashboardMetricCard,
  EmptySection,
  formatCurrency,
  formatCurrencyCompact,
  formatDateKey,
  formatRelativeTime,
  getInitials,
  resolveGreetingKey,
  startOfLocalDay,
} from './dashboard.shared'

function HourlyBarChart({
  hourlyCounts,
}: {
  hourlyCounts: Array<{ hour: number; count: number }>
}) {
  if (hourlyCounts.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">—</div>
    )
  }

  const max = Math.max(...hourlyCounts.map((h) => h.count), 1)

  const toAmPm = (hour: number) => {
    const suffix = hour < 12 ? 'AM' : 'PM'
    const h = hour % 12 || 12
    return `${h}${suffix}`
  }

  return (
    <div className="flex h-20 w-full items-end gap-1">
      {hourlyCounts.map(({ hour, count }) => {
        const pct = (count / max) * 100
        return (
          <div key={hour} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-end justify-center" style={{ height: 56 }}>
              <div
                className="w-full rounded-t-[3px]"
                style={{ height: `${Math.max(pct, 6)}%`, background: '#7F77DD' }}
                title={`${toAmPm(hour)}: ${count}`}
              />
            </div>
            <span className="w-full truncate text-center text-[9px] text-muted-foreground">
              {toAmPm(hour)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function CashierDashboard() {
  const t = useTranslations('app.dashboard')
  const locale = useLocale()
  const localeTag = locale.startsWith('fr') ? 'fr-CM' : 'en-GB'
  const businessId = useAuthStore((state) => state.businessId)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const businessCurrency = useAuthStore((state) => state.businessCurrency)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [data, setData] = useState<CashierShiftSummary | null>(null)

  const todayKey = useMemo(() => formatDateKey(startOfLocalDay(new Date())), [])

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(localeTag, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date()),
    [localeTag],
  )

  useEffect(() => {
    if (!businessId || !userId) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    let active = true

    async function loadData() {
      setLoading(true)
      setError(null)

      try {
        const summary = await getCashierShiftSummaryLocal(businessId!, userId!, todayKey)
        if (!active) return
        setData(summary)
      } catch (loadError) {
        if (!active) return
        setData(null)
        setError(loadError instanceof Error ? loadError.message : t('load_error'))
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadData()

    return () => {
      active = false
    }
  }, [businessId, userId, reloadKey, t, todayKey])

  const cashierInitials = getInitials(data?.cashierName ?? null)
  const paymentTotal = useMemo(
    () => (data?.paymentSplit.reduce((sum, p) => sum + p.amount, 0) ?? 0),
    [data],
  )
  const topItemMax = useMemo(() => data?.topItems[0]?.quantity ?? 1, [data])

  if (!businessId) {
    return (
      <SurfaceCard
        title={t('title')}
        description={t('business_required')}
      >
        <p className="text-sm text-muted-foreground">{t('cashier_subtitle')}</p>
      </SurfaceCard>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-[28px] border border-border bg-card shadow-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          <Spinner size="lg" />
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <SurfaceCard
        title={t('title')}
        description={t('load_error')}
        action={
          <Button onClick={() => setReloadKey((v) => v + 1)} variant="primary">
            {t('retry')}
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">{error}</p>
      </SurfaceCard>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between px-1 pt-1">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#EEEDFE] text-sm font-semibold text-[#3C3489] dark:bg-[#3C3489]/30 dark:text-[#AFA9EC]">
            {cashierInitials}
          </div>
          <div>
            <p className="text-[15px] font-medium leading-tight text-foreground">
              {t(resolveGreetingKey())}, {data?.cashierName || '—'}
            </p>
            <p className="text-xs text-muted-foreground">{todayLabel}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardMetricCard
          label={t('cashier_shift_sales')}
          value={formatCurrencyCompact(data?.shiftRevenue ?? 0, localeTag, businessCurrency)}
          hint={t('sales_count', { count: data?.transactionCount ?? 0 })}
          tone="success"
        />
        <DashboardMetricCard
          label={t('cashier_transactions')}
          value={String(data?.transactionCount ?? 0)}
          hint={t('cashier_void_of_shift', { count: data?.voidCount ?? 0 })}
          tone="brand"
        />
        <DashboardMetricCard
          label={t('cashier_avg_order')}
          value={formatCurrencyCompact(data?.avgOrderValue ?? 0, localeTag, businessCurrency)}
          hint={t('sales_count', { count: data?.transactionCount ?? 0 })}
          tone="info"
        />
        <DashboardMetricCard
          label={t('cashier_voids')}
          value={String(data?.voidCount ?? 0)}
          hint={t('cashier_voided_total', {
            amount: formatCurrency(data?.voidAmount ?? 0, localeTag, businessCurrency),
          })}
          tone={data?.voidCount ? 'warning' : 'info'}
        />
      </div>

      <SurfaceCard title={t('cashier_hourly_title')}>
        <HourlyBarChart hourlyCounts={data?.hourlyCounts ?? []} />
      </SurfaceCard>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <SurfaceCard title={t('cashier_activity_title')}>
          {(data?.recentActivity.length ?? 0) > 0 ? (
            <div className="flex flex-col">
              {data?.recentActivity.map((item) => {
                const isVoid = item.type === 'void'
                const timeLabel = new Intl.DateTimeFormat(localeTag, {
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(item.soldAt))

                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 border-b border-border/60 py-2.5 last:border-0"
                  >
                    <div
                      className={cn(
                        'mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full',
                        isVoid
                          ? 'bg-danger-50 text-danger-600 dark:bg-danger-400/15 dark:text-danger-400'
                          : 'bg-success-50 text-success-700 dark:bg-success-400/15 dark:text-success-400',
                      )}
                    >
                      {isVoid ? <X size={14} /> : <ShoppingCart size={14} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-foreground">
                        {item.saleNumber}
                        {item.customerName ? (
                          <span className="font-normal text-muted-foreground">
                            {' '}
                            · {item.customerName}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {item.itemSummary || '—'} · {timeLabel}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'flex-shrink-0 text-[13px] font-medium',
                        isVoid ? 'text-danger-600 dark:text-danger-400' : 'text-success-700 dark:text-success-400',
                      )}
                    >
                      {isVoid ? '–' : '+'}
                      {formatCurrencyCompact(item.totalAmount, localeTag, businessCurrency)}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptySection>{t('cashier_no_activity')}</EmptySection>
          )}
        </SurfaceCard>

        <div className="space-y-4">
          <SurfaceCard title={t('cashier_top_items_title')}>
            {(data?.topItems.length ?? 0) > 0 ? (
              <div className="flex flex-col gap-2.5">
                {data?.topItems.map((item, index) => {
                  const pct = topItemMax > 0 ? Math.round((item.quantity / topItemMax) * 100) : 0
                  return (
                    <div key={item.productId} className="flex items-center gap-2.5">
                      <span className="w-4 flex-shrink-0 text-right text-xs text-muted-foreground">
                        {index + 1}
                      </span>
                      <span className="w-20 flex-shrink-0 truncate text-xs text-foreground">
                        {item.productName}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-background/80">
                        <div
                          className="h-2 rounded-full"
                          style={{ width: `${pct}%`, background: '#7F77DD' }}
                        />
                      </div>
                      <span className="w-8 flex-shrink-0 text-right text-xs text-muted-foreground">
                        {item.quantity}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptySection>{t('cashier_no_top_items')}</EmptySection>
            )}
          </SurfaceCard>

          <SurfaceCard title={t('cashier_payment_split_title')}>
            {(data?.paymentSplit.length ?? 0) > 0 ? (
              <div className="flex flex-col gap-3">
                {data?.paymentSplit.map((item, index) => {
                  const pct =
                    paymentTotal > 0 ? Math.round((item.amount / paymentTotal) * 100) : 0
                  return (
                    <div key={item.method} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <span
                            className={cn(
                              'h-2.5 w-2.5 rounded-[3px]',
                              index === 0
                                ? 'bg-[#534AB7]'
                                : index === 1
                                  ? 'bg-[#9FE1CB]'
                                  : index === 2
                                    ? 'bg-[#AFA9EC]'
                                    : 'bg-brand-300',
                            )}
                          />
                          {item.method}
                        </span>
                        <span className="font-medium text-foreground">{pct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-background/80">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background:
                              index === 0
                                ? '#534AB7'
                                : index === 1
                                  ? '#9FE1CB'
                                  : index === 2
                                    ? '#AFA9EC'
                                    : '#7F77DD',
                          }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.amount, localeTag, businessCurrency)}
                      </p>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptySection>{t('cashier_no_payment_split')}</EmptySection>
            )}
          </SurfaceCard>
        </div>
      </div>
    </div>
  )
}
