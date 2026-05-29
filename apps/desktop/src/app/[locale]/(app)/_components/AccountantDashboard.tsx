'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  DebtDirection,
  type ContactListItem,
  type DailySalesSummary,
  type Debt,
  type DebtDirectionSummary,
  type SaleListItem,
} from '@biztrack/types'
import { Badge, Button, Spinner } from '@biztrack/ui'
import { SurfaceCard } from '@/components/catalog/SurfaceCard'
import { useSyncSnapshot } from '@/hooks/useSyncSnapshot'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { listCustomerContactsLocal, listSupplierContactsLocal } from '@/services/contacts.local'
import { getDebtSummaryLocal, listAllDebtsByDirectionLocal } from '@/services/debts.local'
import { listExpensesLocal } from '@/services/expenses.local'
import { getDailySalesSummaryLocal, listSalesLocal } from '@/services/sales.local'
import { useAuthStore } from '@/stores/auth.store'
import {
  buildChartPoints,
  buildComparisonBadge,
  buildDateKeys,
  DashboardMetricCard,
  EmptySection,
  formatCurrency,
  formatCurrencyCompact,
  formatDateKey,
  formatRangeLabel,
  formatRelativeTime,
  getBalanceLabel,
  getPreviousRangeBounds,
  getRangeBounds,
  MAX_CONTACTS,
  MAX_TODAY_CHART_SALES,
  mergeSummaryTotals,
  paymentFillStyles,
  resolveGreetingKey,
  summarizeCollectionsInRange,
  type RangeKey,
} from './dashboard.shared'

type AccountantData = {
  currentSummaries: DailySalesSummary[]
  previousSummaries: DailySalesSummary[]
  currentExpensesTotal: number
  previousExpensesTotal: number
  receivableSummary: DebtDirectionSummary
  payableSummary: DebtDirectionSummary
  receivableDebts: Debt[]
  debtors: ContactListItem[]
  creditors: ContactListItem[]
  chartSales: SaleListItem[]
}

export function AccountantDashboard() {
  const t = useTranslations('app.dashboard')
  const tSell = useTranslations('app.sell')
  const locale = useLocale()
  const localeTag = locale.startsWith('fr') ? 'fr-CM' : 'en-GB'
  const businessId = useAuthStore((state) => state.businessId)
  const businessName = useAuthStore((state) => state.businessName)
  const businessCurrency = useAuthStore((state) => state.businessCurrency)
  const { snapshot } = useSyncSnapshot()
  const [range, setRange] = useState<RangeKey>('today')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [data, setData] = useState<AccountantData | null>(null)

  const businessLabel = businessName?.trim() || tSell('business_fallback')
  const currentRange = useMemo(() => getRangeBounds(range), [range])
  const previousRange = useMemo(
    () => getPreviousRangeBounds(range, currentRange),
    [currentRange, range],
  )
  const startKey = useMemo(() => formatDateKey(currentRange.start), [currentRange.start])
  const endKey = useMemo(() => formatDateKey(currentRange.end), [currentRange.end])
  const previousStartKey = useMemo(() => formatDateKey(previousRange.start), [previousRange.start])
  const previousEndKey = useMemo(() => formatDateKey(previousRange.end), [previousRange.end])

  useEffect(() => {
    if (!businessId) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    let active = true
    const currentBusinessId = businessId

    async function loadData() {
      setLoading(true)
      setError(null)

      try {
        const currentDateKeys = buildDateKeys(currentRange.start, currentRange.end)
        const previousDateKeys = buildDateKeys(previousRange.start, previousRange.end)
        const chartSalesPromise =
          range === 'today'
            ? listSalesLocal(currentBusinessId, {
                page: 1,
                limit: MAX_TODAY_CHART_SALES,
                sortBy: 'createdAt',
                sortOrder: 'DESC',
                dateFrom: previousStartKey,
                dateTo: endKey,
              }).then((result) => result.data)
            : Promise.resolve([] as SaleListItem[])

        const [
          currentSummaries,
          previousSummaries,
          currentExpensesResult,
          previousExpensesResult,
          receivableSummary,
          payableSummary,
          receivableDebts,
          customersResult,
          suppliersResult,
          chartSales,
        ] = await Promise.all([
          Promise.all(
            currentDateKeys.map((dateKey) =>
              getDailySalesSummaryLocal(currentBusinessId, dateKey),
            ),
          ),
          Promise.all(
            previousDateKeys.map((dateKey) =>
              getDailySalesSummaryLocal(currentBusinessId, dateKey),
            ),
          ),
          listExpensesLocal(currentBusinessId, {
            page: 1,
            limit: 1,
            dateFrom: startKey,
            dateTo: endKey,
          }),
          listExpensesLocal(currentBusinessId, {
            page: 1,
            limit: 1,
            dateFrom: previousStartKey,
            dateTo: previousEndKey,
          }),
          getDebtSummaryLocal(currentBusinessId, DebtDirection.RECEIVABLE),
          getDebtSummaryLocal(currentBusinessId, DebtDirection.PAYABLE),
          listAllDebtsByDirectionLocal(currentBusinessId, DebtDirection.RECEIVABLE, {
            includePayments: true,
          }),
          listCustomerContactsLocal(currentBusinessId, { page: 1, limit: MAX_CONTACTS }),
          listSupplierContactsLocal(currentBusinessId, { page: 1, limit: MAX_CONTACTS }),
          chartSalesPromise,
        ])

        if (!active) return

        setData({
          currentSummaries,
          previousSummaries,
          currentExpensesTotal: currentExpensesResult.totalAmount,
          previousExpensesTotal: previousExpensesResult.totalAmount,
          receivableSummary,
          payableSummary,
          receivableDebts,
          debtors: customersResult.data,
          creditors: suppliersResult.data,
          chartSales,
        })
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
  }, [businessId, currentRange, endKey, previousEndKey, previousRange, previousStartKey, range, reloadKey, startKey, t])

  const totals = useMemo(
    () => mergeSummaryTotals(data?.currentSummaries ?? []),
    [data?.currentSummaries],
  )
  const previousTotals = useMemo(
    () => mergeSummaryTotals(data?.previousSummaries ?? []),
    [data?.previousSummaries],
  )
  const collections = useMemo(
    () => summarizeCollectionsInRange(data?.receivableDebts ?? [], startKey, endKey),
    [data?.receivableDebts, endKey, startKey],
  )
  const netPosition = totals.grossProfit - (data?.currentExpensesTotal ?? 0)
  const previousNetPosition = previousTotals.grossProfit - (data?.previousExpensesTotal ?? 0)

  const revenueBadge = useMemo(
    () =>
      buildComparisonBadge(t, totals.totalRevenue, previousTotals.totalRevenue, localeTag, {
        increaseTone: 'success',
        decreaseTone: 'danger',
      }),
    [localeTag, previousTotals.totalRevenue, t, totals.totalRevenue],
  )
  const expensesBadge = useMemo(
    () =>
      buildComparisonBadge(
        t,
        data?.currentExpensesTotal ?? 0,
        data?.previousExpensesTotal ?? 0,
        localeTag,
        { increaseTone: 'danger', decreaseTone: 'success' },
      ),
    [data?.currentExpensesTotal, data?.previousExpensesTotal, localeTag, t],
  )
  const netBadge = useMemo(
    () =>
      buildComparisonBadge(t, netPosition, previousNetPosition, localeTag, {
        increaseTone: 'success',
        decreaseTone: 'danger',
      }),
    [localeTag, netPosition, previousNetPosition, t],
  )
  const receivableBadge = useMemo(
    () =>
      buildComparisonBadge(
        t,
        collections.totalAmount,
        0,
        localeTag,
        { increaseTone: 'success', decreaseTone: 'danger' },
      ),
    [collections.totalAmount, localeTag, t],
  )

  const paymentBreakdown = useMemo(
    () => [
      { label: tSell('cash'), amount: totals.cashCollected },
      { label: tSell('mtn_momo'), amount: totals.mtnMomoCollected },
      { label: tSell('orange_money'), amount: totals.orangeMoneyCollected },
      { label: tSell('card'), amount: totals.cardCollected },
      { label: t('unpaid_credit'), amount: totals.creditIssued },
    ],
    [t, tSell, totals],
  )
  const paymentTotalBase = totals.totalRevenue > 0 ? totals.totalRevenue : 1

  const debtors = useMemo(
    () =>
      [...(data?.debtors ?? [])]
        .filter((contact) => contact.totalReceivable > 0)
        .sort((left, right) => right.totalReceivable - left.totalReceivable)
        .slice(0, 5),
    [data?.debtors],
  )
  const creditors = useMemo(
    () =>
      [...(data?.creditors ?? [])]
        .filter((contact) => contact.totalPayable > 0)
        .sort((left, right) => right.totalPayable - left.totalPayable)
        .slice(0, 5),
    [data?.creditors],
  )

  const chartPoints = useMemo(
    () =>
      buildChartPoints({
        range,
        currentRange,
        previousRange,
        currentSummaries: data?.currentSummaries ?? [],
        previousSummaries: data?.previousSummaries ?? [],
        chartSales: data?.chartSales ?? [],
        localeTag,
        currency: businessCurrency,
      }),
    [currentRange, data?.chartSales, data?.currentSummaries, data?.previousSummaries, localeTag, previousRange, range],
  )
  const chartPeak = useMemo(
    () =>
      chartPoints.reduce(
        (highest, point) => (point.current > highest.current ? point : highest),
        chartPoints[0] ?? {
          label: '',
          current: 0,
          previous: 0,
          currentTitle: formatCurrency(0, localeTag, businessCurrency),
          previousTitle: formatCurrency(0, localeTag, businessCurrency),
        },
      ),
    [chartPoints, localeTag, businessCurrency],
  )
  const chartMaxValue = Math.max(
    1,
    ...chartPoints.map((point) => Math.max(point.current, point.previous)),
  )

  const syncLabel = useMemo(() => {
    if (snapshot.status === 'error') return t('sync_error')
    if (snapshot.status === 'paused' || snapshot.status === 'disabled') return t('sync_disabled')
    if (snapshot.status === 'syncing') return t('sync_pending')
    const relative = formatRelativeTime(snapshot.lastSyncedAt, localeTag)
    if (relative) return t('synced', { time: relative })
    return t('sync_idle')
  }, [localeTag, snapshot.lastSyncedAt, snapshot.status, t])

  const chartTitle =
    range === 'today'
      ? t('chart_today_title')
      : range === 'week'
        ? t('chart_week_title')
        : range === 'month'
          ? t('chart_month_title')
          : t('chart_year_title')
  const chartDescription =
    range === 'today'
      ? t('chart_today_desc')
      : range === 'week'
        ? t('chart_week_desc')
        : range === 'month'
          ? t('chart_month_desc')
          : t('chart_year_desc')
  const headerDateLabel = formatRangeLabel(currentRange, localeTag)

  if (!businessId) {
    return (
      <SurfaceCard
        title={t('title')}
        description={t('business_required')}
        action={
          <Link
            href="/select-business"
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            {t('select_business')}
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
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
          <Button onClick={() => setReloadKey((value) => value + 1)} variant="primary">
            {t('retry')}
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">{error}</p>
      </SurfaceCard>
    )
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-brand-100 bg-[linear-gradient(135deg,#042C53_0%,#185FA5_58%,#85B7EB_100%)] px-6 py-6 text-white shadow-lg">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.28),transparent_55%)]" />
        <div className="absolute -right-10 top-10 h-40 w-40 rounded-full border border-white/15" />
        <div className="absolute right-12 top-24 h-20 w-20 rounded-full bg-white/10 blur-2xl" />
        <div className="relative space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    snapshot.status === 'error'
                      ? 'bg-[#F7C1C1]'
                      : snapshot.status === 'syncing'
                        ? 'bg-[#FAC775]'
                        : 'bg-[#97C459]',
                  )}
                />
                {syncLabel}
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">
                  {t(resolveGreetingKey())}, {businessLabel}
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-white/80">
                  {headerDateLabel} - {t('at_a_glance')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ['today', t('today')],
                  ['week', t('this_week')],
                  ['month', t('this_month')],
                  ['year', t('this_year')],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={range === value}
                  onClick={() => setRange(value)}
                  className={cn(
                    'rounded-full border px-4 py-2 text-sm font-medium transition',
                    range === value
                      ? 'border-white bg-white text-brand-900 shadow-sm'
                      : 'border-white/15 bg-white/8 text-white/85 hover:bg-white/14',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <p className="max-w-3xl text-sm leading-6 text-white/85">{t('accountant_subtitle')}</p>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <DashboardMetricCard
          label={t('revenue')}
          value={formatCurrencyCompact(totals.totalRevenue, localeTag, businessCurrency)}
          hint={t('sales_count', { count: totals.totalSales })}
          tone="success"
          badge={revenueBadge}
        />
        <DashboardMetricCard
          label={t('expenses')}
          value={formatCurrencyCompact(data?.currentExpensesTotal ?? 0, localeTag, businessCurrency)}
          hint={t('total_discount_hint', {
            amount: formatCurrency(totals.totalDiscounts, localeTag, businessCurrency),
          })}
          tone="warning"
          badge={expensesBadge}
        />
        <DashboardMetricCard
          label={t('net_position')}
          value={formatCurrencyCompact(netPosition, localeTag, businessCurrency)}
          hint={
            netPosition > 0
              ? t('net_profit')
              : netPosition < 0
                ? t('net_loss')
                : t('net_break_even')
          }
          tone={netPosition < 0 ? 'danger' : 'info'}
          badge={netBadge}
          valueClassName={netPosition < 0 ? 'text-danger-600 dark:text-danger-400' : undefined}
        />
        <DashboardMetricCard
          label={t('total_receivable')}
          value={formatCurrencyCompact(data?.receivableSummary.totalOutstanding ?? 0, localeTag, businessCurrency)}
          hint={getBalanceLabel(
            data?.receivableSummary.outstandingDebtCount ?? 0,
            'debtors_owe_hint',
            t,
          )}
          tone="warning"
          badge={receivableBadge}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.9fr)]">
        <SurfaceCard title={chartTitle} description={chartDescription}>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-brand-600" />
              {t('legend_current')}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-neutral-300 dark:bg-neutral-600" />
              {t('legend_previous')}
            </span>
            <span className="rounded-full bg-background px-3 py-1 text-xs text-muted-foreground">
              {t('peak_hour', { label: chartPeak.label || t('no_data') })}
            </span>
          </div>

          {chartPoints.every((point) => point.current === 0 && point.previous === 0) ? (
            <div className="mt-6">
              <EmptySection>{t('chart_empty')}</EmptySection>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="flex h-64 items-end gap-2 overflow-x-auto pb-2 biztrack-scrollbar">
                {chartPoints.map((point) => {
                  const currentHeight = Math.max(
                    (point.current / chartMaxValue) * 100,
                    point.current > 0 ? 8 : 0,
                  )
                  const previousHeight = Math.max(
                    (point.previous / chartMaxValue) * 100,
                    point.previous > 0 ? 8 : 0,
                  )

                  return (
                    <div
                      key={point.label}
                      className="flex min-w-[56px] flex-1 flex-col items-center gap-3"
                    >
                      <div className="flex h-52 items-end gap-1.5">
                        <div
                          title={`${t('legend_current')}: ${point.currentTitle}`}
                          className="w-4 rounded-t-full bg-brand-600 shadow-[0_6px_18px_rgba(24,95,165,0.18)]"
                          style={{ height: `${currentHeight}%` }}
                        />
                        <div
                          title={`${t('legend_previous')}: ${point.previousTitle}`}
                          className="w-4 rounded-t-full bg-neutral-300 dark:bg-neutral-600"
                          style={{ height: `${previousHeight}%` }}
                        />
                      </div>
                      <div className="text-xs font-medium text-muted-foreground">{point.label}</div>
                    </div>
                  )
                })}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-background px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t('legend_current')}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {formatCurrency(totals.totalRevenue, localeTag, businessCurrency)}
                  </p>
                </div>
                <div className="rounded-2xl bg-background px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t('legend_previous')}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {formatCurrency(previousTotals.totalRevenue, localeTag, businessCurrency)}
                  </p>
                </div>
                <div className="rounded-2xl bg-background px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t('peak_revenue')}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {chartPeak.currentTitle}
                  </p>
                </div>
              </div>
            </div>
          )}
        </SurfaceCard>

        <div className="space-y-4">
          <SurfaceCard title={t('payments_title')} description={t('payments_desc')}>
            <div className="space-y-4">
              {paymentBreakdown.map((item, index) => {
                const percentage =
                  totals.totalRevenue > 0
                    ? Math.round((item.amount / paymentTotalBase) * 100)
                    : 0

                return (
                  <div key={item.label} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <span
                          className={cn('h-2.5 w-2.5 rounded-full', paymentFillStyles[index])}
                        />
                        {item.label}
                      </span>
                      <span className="font-medium text-foreground">{percentage}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-background">
                      <div
                        className={cn('h-2 rounded-full transition-all', paymentFillStyles[index])}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(item.amount, localeTag, businessCurrency)}
                    </p>
                  </div>
                )
              })}
            </div>
          </SurfaceCard>

          <SurfaceCard title={t('pnl_title')} description={t('pnl_desc')}>
            <div className="mb-3 flex justify-end">
              <Badge variant={netPosition >= 0 ? 'success' : 'danger'}>
                {netPosition >= 0 ? t('net_profit') : t('net_loss')}
              </Badge>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{t('revenue_line')}</span>
                <span className="font-medium text-foreground">
                  {formatCurrency(totals.totalRevenue, localeTag, businessCurrency)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{t('cost_line')}</span>
                <span className="font-medium text-danger-600 dark:text-danger-400">
                  -{formatCurrency(totals.totalCost, localeTag, businessCurrency)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{t('gross_profit_line')}</span>
                <span className="font-medium text-success-600 dark:text-success-400">
                  {formatCurrency(totals.grossProfit, localeTag, businessCurrency)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{t('expenses_line')}</span>
                <span className="font-medium text-danger-600 dark:text-danger-400">
                  -{formatCurrency(data?.currentExpensesTotal ?? 0, localeTag, businessCurrency)}
                </span>
              </div>
              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-base font-semibold text-foreground">
                    {t('net_position')}
                  </span>
                  <span
                    className={cn(
                      'text-base font-semibold',
                      netPosition < 0
                        ? 'text-danger-600 dark:text-danger-400'
                        : 'text-foreground',
                    )}
                  >
                    {formatCurrency(netPosition, localeTag, businessCurrency)}
                  </span>
                </div>
              </div>
            </div>
          </SurfaceCard>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SurfaceCard
          title={t('top_debtors_title')}
          description={t('top_debtors_desc')}
          action={
            <Link
              href={`/${locale}/contacts/debtors`}
              className="text-sm font-medium text-primary transition hover:text-primary/80"
            >
              {t('view_all')}
            </Link>
          }
        >
          <div className="space-y-3">
            {debtors.length > 0 ? (
              debtors.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{contact.name}</p>
                    <div className="mt-2">
                      <Badge variant="success">{t('receivable')}</Badge>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-success-600 dark:text-success-400">
                    {formatCurrency(contact.totalReceivable, localeTag, businessCurrency)}
                  </p>
                </div>
              ))
            ) : (
              <EmptySection>{t('no_debtors')}</EmptySection>
            )}
          </div>
        </SurfaceCard>

        <SurfaceCard
          title={t('top_creditors_title')}
          description={t('top_creditors_desc')}
          action={
            <Link
              href={`/${locale}/contacts/creditors`}
              className="text-sm font-medium text-primary transition hover:text-primary/80"
            >
              {t('view_all')}
            </Link>
          }
        >
          <div className="space-y-3">
            {creditors.length > 0 ? (
              creditors.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{contact.name}</p>
                    <div className="mt-2">
                      <Badge variant="danger">{t('payable')}</Badge>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-danger-600 dark:text-danger-400">
                    {formatCurrency(contact.totalPayable, localeTag, businessCurrency)}
                  </p>
                </div>
              ))
            ) : (
              <EmptySection>{t('no_creditors')}</EmptySection>
            )}
          </div>
        </SurfaceCard>
      </div>
    </div>
  )
}
