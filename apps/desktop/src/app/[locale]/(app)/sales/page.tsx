'use client'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import {
  PaymentMethod,
  SaleStatus,
  type DailySalesSummary,
  type SaleListItem,
} from '@biztrack/types'
import { Button, Spinner } from '@biztrack/ui'
import { ResourceActionMenu } from '@/components/products/ResourceActionMenu'
import { cn } from '@/lib/utils'
import {
  getDailySalesSummaryLocal,
  listSalesLocal,
} from '@/services/sales.local'
import { useAuthStore } from '@/stores/auth.store'

type RangeKey = 'today' | 'week' | 'month'
type PaymentFilterValue = '' | PaymentMethod | 'MIXED'

type TrendPoint = {
  label: string
  revenue: number
  count: number
}

type SummaryTotals = {
  totalSales: number
  totalRevenue: number
  totalCost: number
  grossProfit: number
  grossMarginPercent: number
  totalDiscounts: number
  cashCollected: number
  mtnMomoCollected: number
  orangeMoneyCollected: number
  cardCollected: number
  creditIssued: number
  creditSales: number
  voidedSales: number
  voidedAmount: number
}

const PAGE_SIZE = 10
const MAX_SALES_LIMIT = 1000

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addHours(date: Date, offset: number) {
  return new Date(date.getTime() + offset * 60 * 60 * 1000)
}

function addDays(date: Date, offset: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + offset)
  return next
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildDateRange(days: number) {
  const today = startOfLocalDay(new Date())
  const dates: string[] = []

  for (let index = days - 1; index >= 0; index -= 1) {
    dates.push(formatLocalDate(addDays(today, -index)))
  }

  return dates
}

function toSummaryTotals(summary: DailySalesSummary): SummaryTotals {
  return {
    totalSales: summary.totalSales,
    totalRevenue: summary.totalRevenue,
    totalCost: summary.totalCost,
    grossProfit: summary.grossProfit,
    grossMarginPercent: summary.grossMarginPercent,
    totalDiscounts: summary.totalDiscounts,
    cashCollected: summary.cashCollected,
    mtnMomoCollected: summary.mtnMomoCollected,
    orangeMoneyCollected: summary.orangeMoneyCollected,
    cardCollected: summary.cardCollected,
    creditIssued: summary.creditIssued,
    creditSales: summary.creditSales,
    voidedSales: summary.voidedSales,
    voidedAmount: summary.voidedAmount,
  }
}

function emptySummaryTotals(): SummaryTotals {
  return {
    totalSales: 0,
    totalRevenue: 0,
    totalCost: 0,
    grossProfit: 0,
    grossMarginPercent: 0,
    totalDiscounts: 0,
    cashCollected: 0,
    mtnMomoCollected: 0,
    orangeMoneyCollected: 0,
    cardCollected: 0,
    creditIssued: 0,
    creditSales: 0,
    voidedSales: 0,
    voidedAmount: 0,
  }
}

function mergeSummaryTotals(summaries: SummaryTotals[]) {
  const totals = emptySummaryTotals()

  for (const summary of summaries) {
    totals.totalSales += summary.totalSales
    totals.totalRevenue += summary.totalRevenue
    totals.totalCost += summary.totalCost
    totals.grossProfit += summary.grossProfit
    totals.totalDiscounts += summary.totalDiscounts
    totals.cashCollected += summary.cashCollected
    totals.mtnMomoCollected += summary.mtnMomoCollected
    totals.orangeMoneyCollected += summary.orangeMoneyCollected
    totals.cardCollected += summary.cardCollected
    totals.creditIssued += summary.creditIssued
    totals.creditSales += summary.creditSales
    totals.voidedSales += summary.voidedSales
    totals.voidedAmount += summary.voidedAmount
  }

  totals.grossMarginPercent =
    totals.totalRevenue > 0 ? (totals.grossProfit / totals.totalRevenue) * 100 : 0

  return totals
}

function formatInteger(value: number, localeTag: string) {
  return new Intl.NumberFormat(localeTag, {
    maximumFractionDigits: 0,
  }).format(Math.round(value))
}

function formatCurrency(value: number, localeTag: string, currency = 'XAF') {
  return `${currency} ${formatInteger(value, localeTag)}`
}

function formatCurrencyShort(value: number, localeTag: string, currency = 'XAF') {
  if (Math.abs(value) >= 1_000_000) {
    return `${currency} ${(value / 1_000_000).toLocaleString(localeTag, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    })}M`
  }

  if (Math.abs(value) >= 1_000) {
    return `${currency} ${(value / 1_000).toLocaleString(localeTag, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    })}k`
  }

  return formatCurrency(value, localeTag, currency)
}

function SalesMetricCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  hint: string
  tone?: 'default' | 'positive' | 'warning' | 'danger'
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-4',
        tone === 'default' && 'border-border bg-card',
        tone === 'positive' && 'border-emerald-200 bg-emerald-50',
        tone === 'warning' && 'border-amber-200 bg-amber-50',
        tone === 'danger' && 'border-red-200 bg-red-50',
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-2 text-3xl font-semibold tracking-tight text-foreground',
          tone === 'positive' && 'text-emerald-700',
          tone === 'warning' && 'text-amber-700',
          tone === 'danger' && 'text-red-700',
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  )
}

function PaymentBar({
  label,
  amount,
  percentage,
  colorClassName,
}: {
  label: string
  amount: string
  percentage: number
  colorClassName: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{percentage}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full', colorClassName)} style={{ width: `${percentage}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{amount}</p>
    </div>
  )
}

function RevenueTrendChart({
  points,
  localeTag,
}: {
  points: TrendPoint[]
  localeTag: string
}) {
  const width = 720
  const height = 190
  const padding = { top: 18, right: 20, bottom: 28, left: 16 }
  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom
  const maxRevenue = Math.max(...points.map((point) => point.revenue), 1)
  const maxCount = Math.max(...points.map((point) => point.count), 1)
  const slotWidth = innerWidth / Math.max(points.length, 1)
  const barWidth = Math.min(28, Math.max(slotWidth * 0.56, 8))

  const businessCurrency = useAuthStore((state) => state.businessCurrency)

  const revenueBars = points.map((point, index) => {
    const x = padding.left + index * slotWidth + (slotWidth - barWidth) / 2
    const barHeight = (point.revenue / maxRevenue) * innerHeight
    const y = padding.top + innerHeight - barHeight

    return {
      label: point.label,
      x,
      y,
      barHeight,
      barWidth,
      revenue: point.revenue,
    }
  })

  const linePoints = points
    .map((point, index) => {
      const x = padding.left + index * slotWidth + slotWidth / 2
      const y = padding.top + innerHeight - (point.count / maxCount) * innerHeight
      return `${x},${y}`
    })
    .join(' ')

  const yGuides = [0, 0.33, 0.66, 1]

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-muted/20 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[190px] w-full" role="img" aria-label="Revenue trend">
        {yGuides.map((step, index) => {
          const y = padding.top + innerHeight * step
          return (
            <line
              key={`guide-${index}`}
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeOpacity="0.08"
            />
          )
        })}

        {revenueBars.map((bar) => (
          <rect
            key={bar.label}
            x={bar.x}
            y={bar.y}
            width={bar.barWidth}
            height={Math.max(bar.barHeight, 3)}
            rx="4"
            fill="#1D9E75"
          />
        ))}

        {points.length > 1 ? (
          <polyline
            fill="none"
            stroke="#A29F97"
            strokeWidth="2"
            strokeDasharray="4 4"
            points={linePoints}
          />
        ) : null}

        {points.map((point, index) => {
          const x = padding.left + index * slotWidth + slotWidth / 2
          const y = padding.top + innerHeight - (point.count / maxCount) * innerHeight

          return <circle key={`count-${point.label}`} cx={x} cy={y} r="3.5" fill="#A29F97" />
        })}

        {revenueBars.map((bar) => (
          <text
            key={`label-${bar.label}`}
            x={bar.x + bar.barWidth / 2}
            y={height - 8}
            textAnchor="middle"
            fontSize="10"
            fill="currentColor"
            opacity="0.65"
          >
            {bar.label}
          </text>
        ))}

        <text x={padding.left} y="12" fontSize="10" fill="currentColor" opacity="0.6">
          {formatCurrencyShort(maxRevenue, localeTag, businessCurrency)}
        </text>
        <text x={width - padding.right} y="12" fontSize="10" textAnchor="end" fill="currentColor" opacity="0.6">
          {maxCount}
        </text>
      </svg>
    </div>
  )
}

export default function SalesPage() {
  const t = useTranslations('app.sales')
  const tSell = useTranslations('app.sell')
  const locale = useLocale()
  const localeTag = locale.startsWith('fr') ? 'fr-CM' : 'en-GB'
  const router = useRouter()
  const businessId = useAuthStore((state) => state.businessId)
  const businessCurrency = useAuthStore((state) => state.businessCurrency)
  const [range, setRange] = useState<RangeKey>('today')
  const [sales, setSales] = useState<SaleListItem[]>([])
  const [dailySummaries, setDailySummaries] = useState<DailySalesSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilterValue>('')
  const [priceWarningOnly, setPriceWarningOnly] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [range, search, statusFilter, paymentFilter, priceWarningOnly])

  useEffect(() => {
    if (!businessId) {
      setSales([])
      setDailySummaries([])
      setLoading(false)
      setError(null)
      return
    }

    let active = true
    const currentBusinessId = businessId

    async function loadWorkspace() {
      setLoading(true)
      setError(null)

      try {
        const dates = buildDateRange(30)
        const [salesResult, summariesResult] = await Promise.all([
          listSalesLocal(currentBusinessId, {
            page: 1,
            limit: MAX_SALES_LIMIT,
            sortBy: 'soldAt',
            sortOrder: 'DESC',
          }),
          Promise.all(dates.map((date) => getDailySalesSummaryLocal(currentBusinessId, date))),
        ])

        if (!active) return

        setSales(salesResult.data)
        setDailySummaries(summariesResult)
      } catch (loadError) {
        if (!active) return

        setError(loadError instanceof Error ? loadError.message : t('load_error'))
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadWorkspace()

    return () => {
      active = false
    }
  }, [businessId, refreshKey, t])

  const rangeDates = useMemo(() => {
    if (range === 'today') return buildDateRange(1)
    if (range === 'week') return buildDateRange(7)
    return buildDateRange(30)
  }, [range])

  const rangeStart = rangeDates[0] ?? formatLocalDate(startOfLocalDay(new Date()))
  const rangeEnd = rangeDates[rangeDates.length - 1] ?? rangeStart

  const summaryByDate = useMemo(
    () => new Map(dailySummaries.map((summary) => [summary.date, summary])),
    [dailySummaries],
  )

  const rangeSummaries = useMemo(
    () => rangeDates.map((date) => summaryByDate.get(date) ?? { date, ...emptySummaryTotals() }),
    [rangeDates, summaryByDate],
  )

  const rangeTotals = useMemo(
    () => mergeSummaryTotals(rangeSummaries.map(toSummaryTotals)),
    [rangeSummaries],
  )

  const filteredSales = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return sales.filter((sale) => {
      if (sale.saleDate < rangeStart || sale.saleDate > rangeEnd) return false
      if (statusFilter && sale.status !== statusFilter) return false
      if (paymentFilter) {
        if (paymentFilter === 'MIXED') {
          if (sale.paymentMethod !== PaymentMethod.MIXED) return false
        } else if (sale.paymentMethod !== paymentFilter) {
          return false
        }
      }
      if (priceWarningOnly && !sale.priceDriftWarning) return false
      if (!normalizedSearch) return true

      const haystack = [sale.saleNumber, sale.customerName, sale.customerPhone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedSearch)
    })
  }, [paymentFilter, priceWarningOnly, rangeEnd, rangeStart, sales, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginatedSales = filteredSales.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useEffect(() => {
    if (page !== currentPage) {
      setPage(currentPage)
    }
  }, [currentPage, page])

  const chartPoints = useMemo(() => {
    if (range === 'today') {
      const now = new Date()
      const currentHour = new Date(now)
      currentHour.setMinutes(0, 0, 0)
      const windowStart = addHours(currentHour, -11)
      const bucketStarts = Array.from({ length: 12 }, (_, index) => addHours(windowStart, index))
      const hourLabelFormatter = new Intl.DateTimeFormat(localeTag, {
        hour: '2-digit',
      })

      return bucketStarts.map((bucketStart, index) => {
        const bucketEnd = index === bucketStarts.length - 1 ? now : bucketStarts[index + 1]!
        const hourSales = sales.filter((sale) => {
          if (sale.status !== SaleStatus.COMPLETED) return false

          const soldAt = new Date(sale.soldAt)
          return soldAt >= bucketStart && soldAt < bucketEnd
        })

        return {
          label: hourLabelFormatter.format(bucketStart),
          revenue: hourSales.reduce((sum, sale) => sum + sale.totalAmount, 0),
          count: hourSales.length,
        }
      })
    }

    if (range === 'week') {
      return rangeDates.map((date) => {
        const summary = summaryByDate.get(date)
        const label = new Intl.DateTimeFormat(localeTag, {
          weekday: 'short',
        }).format(new Date(`${date}T00:00:00`))

        return {
          label,
          revenue: summary?.totalRevenue ?? 0,
          count: summary?.totalSales ?? 0,
        }
      })
    }

    const bucketSize = 5
    const buckets: TrendPoint[] = []

    for (let index = 0; index < rangeDates.length; index += bucketSize) {
      const bucketDates = rangeDates.slice(index, index + bucketSize)
      const bucketSummaries = bucketDates.map(
        (date) => summaryByDate.get(date) ?? { date, ...emptySummaryTotals() },
      )
      const bucketTotals = mergeSummaryTotals(
        bucketSummaries.map(toSummaryTotals),
      )

      const firstDate = bucketDates[0]
      const lastDate = bucketDates[bucketDates.length - 1]
      const firstLabel = new Intl.DateTimeFormat(localeTag, {
        month: 'short',
        day: 'numeric',
      }).format(new Date(`${firstDate}T00:00:00`))
      const lastLabel = new Intl.DateTimeFormat(localeTag, {
        month: 'short',
        day: 'numeric',
      }).format(new Date(`${lastDate}T00:00:00`))

      buckets.push({
        label: firstDate === lastDate ? firstLabel : `${firstLabel} - ${lastLabel}`,
        revenue: bucketTotals.totalRevenue,
        count: bucketTotals.totalSales,
      })
    }

    return buckets
  }, [localeTag, range, rangeDates, sales, summaryByDate])

  const paymentRows = useMemo(() => {
    const rows = [
      {
        label: tSell('cash'),
        amount: rangeTotals.cashCollected,
        colorClassName: 'bg-emerald-600',
      },
      {
        label: tSell('mtn_momo'),
        amount: rangeTotals.mtnMomoCollected,
        colorClassName: 'bg-amber-500',
      },
      {
        label: tSell('orange_money'),
        amount: rangeTotals.orangeMoneyCollected,
        colorClassName: 'bg-orange-500',
      },
      {
        label: tSell('card'),
        amount: rangeTotals.cardCollected,
        colorClassName: 'bg-slate-500',
      },
    ].filter((row) => row.amount > 0)

    const total = rows.reduce((sum, row) => sum + row.amount, 0)

    return rows.map((row) => ({
      ...row,
      percentage: total > 0 ? Math.round((row.amount / total) * 100) : 0,
    }))
  }, [
    rangeTotals.cardCollected,
    rangeTotals.cashCollected,
    rangeTotals.mtnMomoCollected,
    rangeTotals.orangeMoneyCollected,
    tSell,
  ])

  const paymentLabel = (method: PaymentMethod) => {
    if (method === PaymentMethod.CASH) return tSell('cash')
    if (method === PaymentMethod.MTN_MOMO) return tSell('mtn_momo')
    if (method === PaymentMethod.ORANGE_MONEY) return tSell('orange_money')
    if (method === PaymentMethod.CARD) return tSell('card')
    if (method === PaymentMethod.SAVINGS) return tSell('savings')
    return t('mixed')
  }

  if (!businessId) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-10 text-center">
        <h2 className="text-xl font-semibold text-foreground">{t('title')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('business_required')}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-border bg-card">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Spinner size="sm" />
          <span>{t('loading')}</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-border bg-card px-6 py-10 text-center">
        <h2 className="text-xl font-semibold text-foreground">{t('title')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button type="button" variant="secondary" className="mt-4" onClick={() => setRefreshKey((value) => value + 1)}>
          {t('retry')}
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
        </div>

        <div className="inline-flex w-full rounded-2xl border border-border bg-card p-1 sm:w-auto">
          {(['today', 'week', 'month'] as RangeKey[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRange(option)}
              className={cn(
                'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                range === option
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option === 'today' ? t('tabs.today') : option === 'week' ? t('tabs.week') : t('tabs.month')}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SalesMetricCard
          label={t('metrics.revenue')}
          value={formatCurrency(rangeTotals.totalRevenue, localeTag, businessCurrency)}
          hint={t('metrics.transactions_hint', { count: rangeTotals.totalSales })}
          tone="default"
        />
        <SalesMetricCard
          label={t('metrics.gross_profit')}
          value={formatCurrency(rangeTotals.grossProfit, localeTag, businessCurrency)}
          hint={t('metrics.margin_hint', { value: rangeTotals.grossMarginPercent.toFixed(1) })}
          tone="positive"
        />
        <SalesMetricCard
          label={t('metrics.cash_collected')}
          value={formatCurrency(rangeTotals.cashCollected, localeTag, businessCurrency)}
          hint={t('metrics.cash_share_hint', {
            value:
              rangeTotals.totalRevenue > 0
                ? ((rangeTotals.cashCollected / rangeTotals.totalRevenue) * 100).toFixed(1)
                : '0.0',
          })}
          tone="warning"
        />
        <SalesMetricCard
          label={t('metrics.voided')}
          value={t('metrics.voided_value', { count: rangeTotals.voidedSales })}
          hint={t('metrics.voided_hint', { amount: formatCurrency(rangeTotals.voidedAmount, localeTag, businessCurrency) })}
          tone="danger"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="rounded-3xl border border-border bg-card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t('trend.title')}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-sm bg-[#1D9E75]" />
                  {t('trend.revenue_legend')}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-sm border border-dashed border-[#A29F97] bg-transparent" />
                  {t('trend.transactions_legend')}
                </span>
              </div>
            </div>
          </div>
          <RevenueTrendChart points={chartPoints} localeTag={localeTag} />
        </div>

        <div className="rounded-3xl border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('payments.title')}
          </p>
          <div className="mt-4 space-y-4">
            {paymentRows.length > 0 ? (
              paymentRows.map((row) => (
                <PaymentBar
                  key={row.label}
                  label={row.label}
                  amount={formatCurrency(row.amount, localeTag, businessCurrency)}
                  percentage={row.percentage}
                  colorClassName={row.colorClassName}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t('payments.empty')}</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('filters.search_placeholder')}
            className="h-11 flex-1 rounded-2xl border border-input bg-background px-4 text-sm text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-11 rounded-2xl border border-input bg-background px-4 text-sm text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
          >
            <option value="">{t('filters.all_status')}</option>
            <option value={SaleStatus.COMPLETED}>{t('status.completed')}</option>
            <option value={SaleStatus.VOIDED}>{t('status.voided')}</option>
          </select>

          <select
            value={paymentFilter}
            onChange={(event) => setPaymentFilter(event.target.value as PaymentFilterValue)}
            className="h-11 rounded-2xl border border-input bg-background px-4 text-sm text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
          >
            <option value="">{t('filters.all_payments')}</option>
            <option value={PaymentMethod.CASH}>{tSell('cash')}</option>
            <option value={PaymentMethod.MTN_MOMO}>{tSell('mtn_momo')}</option>
            <option value={PaymentMethod.ORANGE_MONEY}>{tSell('orange_money')}</option>
            <option value={PaymentMethod.CARD}>{tSell('card')}</option>
            <option value="MIXED">{t('mixed')}</option>
          </select>

          <button
            type="button"
            onClick={() => setPriceWarningOnly((value) => !value)}
            className={cn(
              'h-11 rounded-2xl border px-4 text-sm font-medium transition-colors',
              priceWarningOnly
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-border bg-background text-muted-foreground hover:text-foreground',
            )}
          >
            {t('filters.price_warnings')}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('table.sale_no')}
                </th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('table.time')}
                </th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('table.customer')}
                </th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('table.items')}
                </th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('table.payment')}
                </th>
                <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('table.total')}
                </th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('table.status')}
                </th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('table.sync')}
                </th>
                <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('table.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedSales.length > 0 ? (
                paginatedSales.map((sale) => {
                  const paymentText = sale.paymentMethod ? paymentLabel(sale.paymentMethod) : '-'

                  return (
                    <tr
                      key={sale.id}
                      onClick={() => router.push(`/${locale}/sales/detail?saleId=${sale.id}`)}
                      className="cursor-pointer border-b border-border/80 transition-colors hover:bg-muted/30"
                    >
                      <td className="px-3 py-3">
                        <div className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground">
                          <span>{sale.saleNumber}</span>
                          {sale.priceDriftWarning ? (
                            <span className="h-2 w-2 rounded-full bg-amber-500" title={t('filters.price_warnings')} />
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-foreground">
                        {new Intl.DateTimeFormat(localeTag, {
                          hour: '2-digit',
                          minute: '2-digit',
                        }).format(new Date(sale.soldAt))}
                      </td>
                      <td className="px-3 py-3 text-foreground">{sale.customerName || t('table.no_customer')}</td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {t('table.items_count', { count: sale.itemCount })}
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                          {paymentText}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-foreground">
                        {formatInteger(sale.totalAmount, localeTag)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                            sale.status === SaleStatus.VOIDED
                              ? 'bg-red-50 text-red-700'
                              : 'bg-emerald-50 text-emerald-700',
                          )}
                        >
                          {sale.status === SaleStatus.VOIDED ? t('status.voided') : t('status.completed')}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                          <span
                            className={cn(
                              'h-2 w-2 rounded-full',
                              sale.syncedAt ? 'bg-emerald-600' : 'bg-amber-500',
                            )}
                          />
                          {sale.syncedAt ? t('sync.synced') : t('sync.pending')}
                        </span>
                      </td>
                      <td
                        className="relative px-3 py-3 text-right"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="flex justify-end">
                          <ResourceActionMenu
                            label={t('actions.more')}
                            orientation="vertical"
                            items={[
                              {
                                label: t('actions.view'),
                                onSelect: () => router.push(`/${locale}/sales/detail?saleId=${sale.id}`),
                              },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center">
                    <p className="text-base font-medium text-foreground">{t('empty.title')}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{t('empty.subtitle')}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            {filteredSales.length > 0
              ? t('pagination.showing', {
                  start: (currentPage - 1) * PAGE_SIZE + 1,
                  end: Math.min(currentPage * PAGE_SIZE, filteredSales.length),
                  total: filteredSales.length,
                })
              : t('pagination.none')}
          </span>

          <div className="flex flex-wrap gap-2">
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                onClick={() => setPage(pageNumber)}
                className={cn(
                  'rounded-xl border px-3 py-1.5 text-sm transition-colors',
                  pageNumber === currentPage
                    ? 'border-border bg-muted text-foreground'
                    : 'border-border/60 text-muted-foreground hover:text-foreground',
                )}
              >
                {pageNumber}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
