import type { ReactNode } from 'react'
import { PaymentMethod, SaleStatus } from '@biztrack/types'
import type { DailySalesSummary, SaleListItem } from '@biztrack/types'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

export type RangeKey = 'today' | 'week' | 'month' | 'year'

export type RangeBounds = {
  start: Date
  end: Date
  days: number
}

export type SummaryTotals = {
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

export type DashboardMetricTone = 'brand' | 'success' | 'warning' | 'danger' | 'info'
export type DashboardBadgeTone = 'neutral' | 'success' | 'warning' | 'danger'
export type TrendDirection = 'up' | 'down' | 'flat'
export type TranslateFn = (key: string, values?: Record<string, string | number>) => string
export type SellTranslateFn = (key: string) => string

export type DashboardMetricCardProps = {
  label: string
  value: string
  hint: string
  tone: DashboardMetricTone
  badge?: {
    label: string
    tone: DashboardBadgeTone
  }
  valueClassName?: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const MAX_ALERTS = 5
export const MAX_CONTACTS = 250
export const MAX_RECENT_SALES = 8
export const MAX_TODAY_CHART_SALES = 250
export const TODAY_BUCKET_SIZE_HOURS = 3
export const TODAY_BUCKET_START_HOURS = Array.from(
  { length: 24 / TODAY_BUCKET_SIZE_HOURS },
  (_, index) => index * TODAY_BUCKET_SIZE_HOURS,
) as readonly number[]
export const MONTH_BUCKET_START_DAYS = [1, 6, 11, 16, 21, 26] as const

export const metricToneStyles: Record<DashboardMetricTone, { container: string; accent: string }> =
  {
    brand: {
      container: 'border-brand-100 bg-brand-50/80 dark:border-brand-800/70 dark:bg-brand-500/10',
      accent: 'bg-brand-400',
    },
    success: {
      container:
        'border-success-100 bg-success-50 dark:border-success-800/70 dark:bg-success-400/10',
      accent: 'bg-success-400',
    },
    warning: {
      container:
        'border-warning-100 bg-warning-50 dark:border-warning-800/70 dark:bg-warning-400/10',
      accent: 'bg-warning-400',
    },
    danger: {
      container: 'border-danger-100 bg-danger-50 dark:border-danger-800/70 dark:bg-danger-400/10',
      accent: 'bg-danger-400',
    },
    info: {
      container: 'border-info-100 bg-info-50 dark:border-info-800/70 dark:bg-info-400/10',
      accent: 'bg-info-400',
    },
  }

export const metricBadgeStyles: Record<DashboardBadgeTone, string> = {
  neutral: 'bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-white/80',
  success: 'bg-success-100 text-success-600 dark:bg-success-400/15 dark:text-success-400',
  warning: 'bg-warning-100 text-warning-600 dark:bg-warning-400/15 dark:text-warning-400',
  danger: 'bg-danger-100 text-danger-600 dark:bg-danger-400/15 dark:text-danger-400',
}

export const paymentFillStyles = [
  'bg-success-400',
  'bg-warning-400',
  'bg-[#D85A30]',
  'bg-brand-400',
  'bg-danger-400',
]

// ─── Date utilities ───────────────────────────────────────────────────────────

export function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date: Date, offset: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + offset)
  return next
}

export function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year || 1970, (month || 1) - 1, day || 1)
}

export function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function buildDateKeys(start: Date, end: Date) {
  const result: string[] = []
  let cursor = startOfLocalDay(start)
  const last = startOfLocalDay(end)

  while (cursor.getTime() <= last.getTime()) {
    result.push(formatDateKey(cursor))
    cursor = addDays(cursor, 1)
  }

  return result
}

export function countRangeDays(start: Date, end: Date) {
  const startTime = startOfLocalDay(start).getTime()
  const endTime = startOfLocalDay(end).getTime()
  return Math.floor((endTime - startTime) / (24 * 60 * 60 * 1000)) + 1
}

export function getRangeBounds(range: RangeKey): RangeBounds {
  const today = startOfLocalDay(new Date())

  if (range === 'today') return { start: today, end: today, days: 1 }

  if (range === 'week') return { start: addDays(today, -6), end: today, days: 7 }

  if (range === 'year') {
    const start = new Date(today.getFullYear(), 0, 1)
    return { start, end: today, days: countRangeDays(start, today) }
  }

  if (range === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    return { start, end: today, days: countRangeDays(start, today) }
  }

  return { start: addDays(today, -29), end: today, days: 30 }
}

export function getPreviousRangeBounds(rangeKey: RangeKey, range: RangeBounds): RangeBounds {
  if (rangeKey === 'year') {
    const start = new Date(range.start.getFullYear() - 1, 0, 1)
    const end = new Date(
      range.end.getFullYear() - 1,
      range.end.getMonth(),
      range.end.getDate(),
    )
    return { start, end, days: countRangeDays(start, end) }
  }

  if (rangeKey === 'month') {
    const start = new Date(range.start.getFullYear(), range.start.getMonth() - 1, 1)
    const previousMonthLastDay = new Date(
      range.start.getFullYear(),
      range.start.getMonth(),
      0,
    ).getDate()
    const end = new Date(
      range.start.getFullYear(),
      range.start.getMonth() - 1,
      Math.min(range.end.getDate(), previousMonthLastDay),
    )
    return { start, end, days: countRangeDays(start, end) }
  }

  return {
    start: addDays(range.start, -range.days),
    end: addDays(range.start, -1),
    days: range.days,
  }
}

// ─── Format utilities ─────────────────────────────────────────────────────────

export function formatInteger(value: number, localeTag: string) {
  return new Intl.NumberFormat(localeTag, { maximumFractionDigits: 0 }).format(Math.round(value))
}

export function formatPercentValue(value: number, localeTag: string) {
  return new Intl.NumberFormat(localeTag, { maximumFractionDigits: 0 }).format(Math.abs(value))
}

export function formatCurrency(value: number, localeTag: string, currency = 'XAF') {
  return `${currency} ${formatInteger(value, localeTag)}`
}

export function formatCurrencyCompact(value: number, localeTag: string, currency = 'XAF') {
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

export function formatRangeLabel(range: RangeBounds, localeTag: string) {
  if (range.days === 1) {
    return new Intl.DateTimeFormat(localeTag, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(range.end)
  }

  const startLabel = new Intl.DateTimeFormat(localeTag, {
    day: 'numeric',
    month: 'short',
  }).format(range.start)

  const endLabel = new Intl.DateTimeFormat(localeTag, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(range.end)

  return `${startLabel} - ${endLabel}`
}

export function formatRelativeTime(value: string | null | undefined, localeTag: string) {
  if (!value) return null

  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return null

  const diffMs = target.getTime() - Date.now()
  const diffMinutes = Math.round(diffMs / (60 * 1000))
  const formatter = new Intl.RelativeTimeFormat(localeTag, { numeric: 'auto' })

  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, 'minute')

  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, 'hour')

  const diffDays = Math.round(diffHours / 24)
  return formatter.format(diffDays, 'day')
}

export function resolveGreetingKey() {
  const hour = new Date().getHours()
  if (hour < 12) return 'good_morning'
  if (hour < 18) return 'good_afternoon'
  return 'good_evening'
}

export function resolveSaleDateKey(sale: SaleListItem) {
  return sale.saleDate || formatDateKey(new Date(sale.soldAt))
}

// ─── Computation utilities ────────────────────────────────────────────────────

export function emptySummaryTotals(): SummaryTotals {
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

export function mergeSummaryTotals(summaries: DailySalesSummary[]) {
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

export function summarizeCollectionsInRange(debts: { payments?: { paymentDate: string; amount: number }[] }[], startKey: string, endKey: string) {
  let totalAmount = 0
  let paymentCount = 0

  for (const debt of debts) {
    for (const payment of debt.payments ?? []) {
      if (payment.paymentDate >= startKey && payment.paymentDate <= endKey) {
        totalAmount += payment.amount
        paymentCount += 1
      }
    }
  }

  return { totalAmount, paymentCount }
}

export function getTrendDirection(current: number, previous: number): TrendDirection {
  if (current === previous) return 'flat'
  return current > previous ? 'up' : 'down'
}

export function buildComparisonBadge(
  t: TranslateFn,
  current: number,
  previous: number,
  localeTag: string,
  options: {
    increaseTone: Exclude<DashboardBadgeTone, 'neutral'>
    decreaseTone: Exclude<DashboardBadgeTone, 'neutral'>
  },
) {
  if (current === 0 && previous === 0) {
    return { label: t('comparison_flat'), tone: 'neutral' as const }
  }

  if (previous === 0) {
    return { label: t('comparison_new'), tone: options.increaseTone }
  }

  const changePercent = ((current - previous) / Math.abs(previous)) * 100
  const direction = getTrendDirection(current, previous)

  if (direction === 'flat') {
    return { label: t('comparison_flat'), tone: 'neutral' as const }
  }

  return {
    label: `${direction === 'up' ? '+' : '-'}${formatPercentValue(changePercent, localeTag)} ${t('vs_previous')}`,
    tone: direction === 'up' ? options.increaseTone : options.decreaseTone,
  }
}

export function getBalanceLabel(count: number, label: string, t: TranslateFn) {
  if (count <= 0) return t('no_activity')
  return t(label, { count })
}

export function getInitials(value: string | null | undefined) {
  return (value || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

export function getPaymentLabel(method: PaymentMethod, tSell: SellTranslateFn, t: TranslateFn) {
  switch (method) {
    case PaymentMethod.CASH:
      return tSell('cash')
    case PaymentMethod.MTN_MOMO:
      return tSell('mtn_momo')
    case PaymentMethod.ORANGE_MONEY:
      return tSell('orange_money')
    case PaymentMethod.CARD:
      return tSell('card')
    case PaymentMethod.MIXED:
    default:
      return t('mixed')
  }
}

export function humanizeSaleStatus(status: SaleStatus, t: TranslateFn) {
  switch (status) {
    case SaleStatus.COMPLETED:
      return t('completed')
    case SaleStatus.VOIDED:
      return t('voided')
    default:
      return status.replace(/_/g, ' ').toLowerCase()
  }
}

export function getSaleStatusBadgeVariant(status: SaleStatus) {
  if (status === SaleStatus.COMPLETED) return 'success' as const
  if (status === SaleStatus.VOIDED) return 'danger' as const
  return 'neutral' as const
}

export function formatHourBucketLabel(startHour: number, endHour: number) {
  const toTwelveHour = (hour: number) => {
    const normalizedHour = ((hour % 24) + 24) % 24
    const suffix = normalizedHour < 12 ? 'AM' : 'PM'
    const displayHour = normalizedHour % 12 || 12
    return `${displayHour}${suffix}`
  }
  return `${toTwelveHour(startHour)}-${toTwelveHour(endHour)}`
}

export function getHourBucketStart(hour: number) {
  return Math.floor(hour / TODAY_BUCKET_SIZE_HOURS) * TODAY_BUCKET_SIZE_HOURS
}

export function buildChartPoints(args: {
  range: RangeKey
  currentRange: RangeBounds
  previousRange: RangeBounds
  currentSummaries: DailySalesSummary[]
  previousSummaries: DailySalesSummary[]
  chartSales: SaleListItem[]
  localeTag: string
  currency?: string
}) {
  const {
    range,
    currentRange,
    previousRange,
    currentSummaries,
    previousSummaries,
    chartSales,
    localeTag,
    currency = 'XAF',
  } = args

  if (range === 'today') {
    const currentDateKey = formatDateKey(currentRange.end)
    const previousDateKey = formatDateKey(previousRange.end)
    const currentBuckets = new Map(TODAY_BUCKET_START_HOURS.map((hour) => [hour, 0]))
    const previousBuckets = new Map(TODAY_BUCKET_START_HOURS.map((hour) => [hour, 0]))

    for (const sale of chartSales) {
      if (sale.status !== SaleStatus.COMPLETED) continue

      const saleDateKey = resolveSaleDateKey(sale)
      const saleBucketStart = getHourBucketStart(new Date(sale.soldAt).getHours())

      if (!currentBuckets.has(saleBucketStart)) continue

      if (saleDateKey === currentDateKey) {
        currentBuckets.set(
          saleBucketStart,
          (currentBuckets.get(saleBucketStart) ?? 0) + sale.totalAmount,
        )
      }

      if (saleDateKey === previousDateKey) {
        previousBuckets.set(
          saleBucketStart,
          (previousBuckets.get(saleBucketStart) ?? 0) + sale.totalAmount,
        )
      }
    }

    return TODAY_BUCKET_START_HOURS.map((startHour) => {
      const current = currentBuckets.get(startHour) ?? 0
      const previous = previousBuckets.get(startHour) ?? 0
      const endHour = startHour + TODAY_BUCKET_SIZE_HOURS - 1

      return {
        label: formatHourBucketLabel(startHour, endHour),
        current,
        previous,
        currentTitle: formatCurrency(current, localeTag, currency),
        previousTitle: formatCurrency(previous, localeTag, currency),
      }
    })
  }

  if (range === 'year') {
    const currentLookup = new Map<string, number>()
    const previousLookup = new Map<string, number>()

    for (const summary of currentSummaries) {
      const monthKey = summary.date.slice(0, 7)
      currentLookup.set(monthKey, (currentLookup.get(monthKey) ?? 0) + summary.totalRevenue)
    }

    for (const summary of previousSummaries) {
      const monthKey = summary.date.slice(0, 7)
      previousLookup.set(monthKey, (previousLookup.get(monthKey) ?? 0) + summary.totalRevenue)
    }

    const monthCount = currentRange.end.getMonth() + 1

    return Array.from({ length: monthCount }, (_, index) => {
      const currentMonthKey = `${currentRange.start.getFullYear()}-${String(index + 1).padStart(2, '0')}`
      const previousMonthKey = `${previousRange.start.getFullYear()}-${String(index + 1).padStart(2, '0')}`
      const current = currentLookup.get(currentMonthKey) ?? 0
      const previous = previousLookup.get(previousMonthKey) ?? 0
      const labelDate = new Date(currentRange.start.getFullYear(), index, 1)

      return {
        label: new Intl.DateTimeFormat(localeTag, { month: 'short' }).format(labelDate),
        current,
        previous,
        currentTitle: formatCurrency(current, localeTag, currency),
        previousTitle: formatCurrency(previous, localeTag, currency),
      }
    })
  }

  if (range === 'month') {
    const currentLookup = new Map(
      currentSummaries.map((summary) => [summary.date, summary.totalRevenue]),
    )
    const previousLookup = new Map(
      previousSummaries.map((summary) => [summary.date, summary.totalRevenue]),
    )
    const currentMonthYear = currentRange.end.getFullYear()
    const currentMonthIndex = currentRange.end.getMonth()
    const previousMonthYear = previousRange.end.getFullYear()
    const previousMonthIndex = previousRange.end.getMonth()
    const currentEndDay = currentRange.end.getDate()
    const previousEndDay = previousRange.end.getDate()

    return MONTH_BUCKET_START_DAYS.filter((startDay) => startDay <= currentEndDay).map(
      (startDay) => {
        const currentBucketEnd =
          startDay === 26 ? currentEndDay : Math.min(startDay + 4, currentEndDay)
        const previousBucketEnd =
          startDay === 26 ? previousEndDay : Math.min(startDay + 4, previousEndDay)
        let current = 0
        let previous = 0

        for (let day = startDay; day <= currentBucketEnd; day += 1) {
          const dateKey = formatDateKey(new Date(currentMonthYear, currentMonthIndex, day))
          current += currentLookup.get(dateKey) ?? 0
        }

        for (let day = startDay; day <= previousBucketEnd; day += 1) {
          const dateKey = formatDateKey(new Date(previousMonthYear, previousMonthIndex, day))
          previous += previousLookup.get(dateKey) ?? 0
        }

        return {
          label:
            startDay === currentBucketEnd
              ? `${startDay}`
              : `${startDay}-${currentBucketEnd}`,
          current,
          previous,
          currentTitle: formatCurrency(current, localeTag),
          previousTitle: formatCurrency(previous, localeTag),
        }
      },
    )
  }

  const currentKeys = buildDateKeys(currentRange.start, currentRange.end)
  const previousKeys = buildDateKeys(previousRange.start, previousRange.end)
  const currentLookup = new Map(currentSummaries.map((summary) => [summary.date, summary]))
  const previousLookup = new Map(previousSummaries.map((summary) => [summary.date, summary]))

  return currentKeys.map((dateKey, index) => {
    const current = currentLookup.get(dateKey)?.totalRevenue ?? 0
    const previous = previousLookup.get(previousKeys[index] ?? '')?.totalRevenue ?? 0
    const labelDate = parseDateKey(dateKey)
    const label =
      range === 'week'
        ? new Intl.DateTimeFormat(localeTag, { weekday: 'short' }).format(labelDate)
        : new Intl.DateTimeFormat(localeTag, { day: 'numeric', month: 'short' }).format(labelDate)

    return {
      label,
      current,
      previous,
      currentTitle: formatCurrency(current, localeTag),
      previousTitle: formatCurrency(previous, localeTag),
    }
  })
}

// ─── Shared components ────────────────────────────────────────────────────────

export function DashboardMetricCard({
  label,
  value,
  hint,
  tone,
  badge,
  valueClassName,
}: DashboardMetricCardProps) {
  const styles = metricToneStyles[tone]

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[24px] border p-4 shadow-sm transition-colors',
        styles.container,
      )}
    >
      <span className={cn('absolute inset-y-0 left-0 w-1.5', styles.accent)} />
      <div className="pl-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
        <p className={cn('mt-2 text-2xl font-semibold text-foreground', valueClassName)}>
          {value}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
        {badge ? (
          <span
            className={cn(
              'mt-3 inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium',
              metricBadgeStyles[badge.tone],
            )}
          >
            {badge.label}
          </span>
        ) : null}
      </div>
    </div>
  )
}

export function EmptySection({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-background/80 px-4 py-5 text-sm text-muted-foreground">
      {children}
    </div>
  )
}
