'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  DebtDirection,
  PaymentMethod,
  SaleStatus,
  type ContactListItem,
  type DailySalesSummary,
  type Debt,
  type DebtDirectionSummary,
  type InventoryAlert,
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
import { listInventoryAlertsLocal } from '@/services/inventory.local'
import { getDailySalesSummaryLocal, listSalesLocal } from '@/services/sales.local'
import { useAuthStore } from '@/stores/auth.store'

type RangeKey = 'today' | 'week' | 'month' | 'year'
type RangeBounds = {
  start: Date
  end: Date
  days: number
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

type DashboardData = {
  currentSummaries: DailySalesSummary[]
  previousSummaries: DailySalesSummary[]
  currentExpensesTotal: number
  previousExpensesTotal: number
  receivableSummary: DebtDirectionSummary
  payableSummary: DebtDirectionSummary
  receivableDebts: Debt[]
  debtors: ContactListItem[]
  creditors: ContactListItem[]
  alerts: InventoryAlert[]
  recentSales: SaleListItem[]
  chartSales: SaleListItem[]
}

type DashboardMetricTone = 'brand' | 'success' | 'warning' | 'danger' | 'info'
type DashboardBadgeTone = 'neutral' | 'success' | 'warning' | 'danger'
type TrendDirection = 'up' | 'down' | 'flat'

type DashboardMetricCardProps = {
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

type DashboardChartPoint = {
  label: string
  current: number
  previous: number
  currentTitle: string
  previousTitle: string
}

type TranslateFn = (key: string, values?: Record<string, string | number>) => string
type SellTranslateFn = (key: string) => string

const MAX_ALERTS = 5
const MAX_CONTACTS = 250
const MAX_RECENT_SALES = 8
const MAX_TODAY_CHART_SALES = 250
const TODAY_BUCKET_SIZE_HOURS = 3
const TODAY_BUCKET_START_HOURS = Array.from(
  { length: 24 / TODAY_BUCKET_SIZE_HOURS },
  (_, index) => index * TODAY_BUCKET_SIZE_HOURS,
) as readonly number[]
const MONTH_BUCKET_START_DAYS = [1, 6, 11, 16, 21, 26] as const

const metricToneStyles: Record<
  DashboardMetricTone,
  { container: string; accent: string }
> = {
  brand: {
    container: 'border-brand-100 bg-brand-50/80 dark:border-brand-800/70 dark:bg-brand-500/10',
    accent: 'bg-brand-400',
  },
  success: {
    container: 'border-success-100 bg-success-50 dark:border-success-800/70 dark:bg-success-400/10',
    accent: 'bg-success-400',
  },
  warning: {
    container: 'border-warning-100 bg-warning-50 dark:border-warning-800/70 dark:bg-warning-400/10',
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

const metricBadgeStyles: Record<DashboardBadgeTone, string> = {
  neutral: 'bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-white/80',
  success: 'bg-success-100 text-success-600 dark:bg-success-400/15 dark:text-success-400',
  warning: 'bg-warning-100 text-warning-600 dark:bg-warning-400/15 dark:text-warning-400',
  danger: 'bg-danger-100 text-danger-600 dark:bg-danger-400/15 dark:text-danger-400',
}

const paymentFillStyles = [
  'bg-success-400',
  'bg-warning-400',
  'bg-[#D85A30]',
  'bg-brand-400',
  'bg-danger-400',
]

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, offset: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + offset)
  return next
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year || 1970, (month || 1) - 1, day || 1)
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildDateKeys(start: Date, end: Date) {
  const result: string[] = []
  let cursor = startOfLocalDay(start)
  const last = startOfLocalDay(end)

  while (cursor.getTime() <= last.getTime()) {
    result.push(formatDateKey(cursor))
    cursor = addDays(cursor, 1)
  }

  return result
}

function countRangeDays(start: Date, end: Date) {
  const startTime = startOfLocalDay(start).getTime()
  const endTime = startOfLocalDay(end).getTime()
  return Math.floor((endTime - startTime) / (24 * 60 * 60 * 1000)) + 1
}

function getRangeBounds(range: RangeKey): RangeBounds {
  const today = startOfLocalDay(new Date())

  if (range === 'today') {
    return {
      start: today,
      end: today,
      days: 1,
    }
  }

  if (range === 'week') {
    return {
      start: addDays(today, -6),
      end: today,
      days: 7,
    }
  }

  if (range === 'year') {
    const start = new Date(today.getFullYear(), 0, 1)
    return {
      start,
      end: today,
      days: countRangeDays(start, today),
    }
  }

  if (range === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    return {
      start,
      end: today,
      days: countRangeDays(start, today),
    }
  }

  return {
    start: addDays(today, -29),
    end: today,
    days: 30,
  }
}

function getPreviousRangeBounds(rangeKey: RangeKey, range: RangeBounds): RangeBounds {
  if (rangeKey === 'year') {
    const start = new Date(range.start.getFullYear() - 1, 0, 1)
    const end = new Date(
      range.end.getFullYear() - 1,
      range.end.getMonth(),
      range.end.getDate(),
    )

    return {
      start,
      end,
      days: countRangeDays(start, end),
    }
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

    return {
      start,
      end,
      days: countRangeDays(start, end),
    }
  }

  return {
    start: addDays(range.start, -range.days),
    end: addDays(range.start, -1),
    days: range.days,
  }
}

function formatHourBucketLabel(startHour: number, endHour: number) {
  const toTwelveHour = (hour: number) => {
    const normalizedHour = ((hour % 24) + 24) % 24
    const suffix = normalizedHour < 12 ? 'AM' : 'PM'
    const displayHour = normalizedHour % 12 || 12
    return `${displayHour}${suffix}`
  }

  return `${toTwelveHour(startHour)}-${toTwelveHour(endHour)}`
}

function getHourBucketStart(hour: number) {
  return Math.floor(hour / TODAY_BUCKET_SIZE_HOURS) * TODAY_BUCKET_SIZE_HOURS
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

function mergeSummaryTotals(summaries: DailySalesSummary[]) {
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

function formatPercentValue(value: number, localeTag: string) {
  return new Intl.NumberFormat(localeTag, {
    maximumFractionDigits: 0,
  }).format(Math.abs(value))
}

function formatCurrency(value: number, localeTag: string) {
  return `XAF ${formatInteger(value, localeTag)}`
}

function formatCurrencyCompact(value: number, localeTag: string) {
  if (Math.abs(value) >= 1_000_000) {
    return `XAF ${(value / 1_000_000).toLocaleString(localeTag, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    })}M`
  }

  if (Math.abs(value) >= 1_000) {
    return `XAF ${(value / 1_000).toLocaleString(localeTag, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    })}k`
  }

  return formatCurrency(value, localeTag)
}

function formatRangeLabel(range: RangeBounds, localeTag: string) {
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

function formatRelativeTime(value: string | null | undefined, localeTag: string) {
  if (!value) {
    return null
  }

  const target = new Date(value)
  if (Number.isNaN(target.getTime())) {
    return null
  }

  const diffMs = target.getTime() - Date.now()
  const diffMinutes = Math.round(diffMs / (60 * 1000))
  const formatter = new Intl.RelativeTimeFormat(localeTag, { numeric: 'auto' })

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, 'minute')
  }

  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, 'hour')
  }

  const diffDays = Math.round(diffHours / 24)
  return formatter.format(diffDays, 'day')
}

function resolveGreetingKey() {
  const hour = new Date().getHours()

  if (hour < 12) {
    return 'good_morning'
  }

  if (hour < 18) {
    return 'good_afternoon'
  }

  return 'good_evening'
}

function resolveSaleDateKey(sale: SaleListItem) {
  return sale.saleDate || formatDateKey(new Date(sale.soldAt))
}

function summarizeCollectionsInRange(debts: Debt[], startKey: string, endKey: string) {
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

  return {
    totalAmount,
    paymentCount,
  }
}

function getTrendDirection(current: number, previous: number): TrendDirection {
  if (current === previous) {
    return 'flat'
  }

  return current > previous ? 'up' : 'down'
}

function buildComparisonBadge(
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
    return {
      label: t('comparison_flat'),
      tone: 'neutral' as const,
    }
  }

  if (previous === 0) {
    return {
      label: t('comparison_new'),
      tone: options.increaseTone,
    }
  }

  const changePercent = ((current - previous) / Math.abs(previous)) * 100
  const direction = getTrendDirection(current, previous)

  if (direction === 'flat') {
    return {
      label: t('comparison_flat'),
      tone: 'neutral' as const,
    }
  }

  return {
    label: `${direction === 'up' ? '+' : '-'}${formatPercentValue(changePercent, localeTag)} ${t(
      'vs_previous',
    )}`,
    tone: direction === 'up' ? options.increaseTone : options.decreaseTone,
  }
}

function getBalanceLabel(count: number, label: string, t: TranslateFn) {
  if (count <= 0) {
    return t('no_activity')
  }

  return t(label, { count })
}

function getInitials(value: string | null | undefined) {
  return (value || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function getPaymentLabel(method: PaymentMethod, tSell: SellTranslateFn, t: TranslateFn) {
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

function humanizeSaleStatus(status: SaleStatus, t: TranslateFn) {
  switch (status) {
    case SaleStatus.COMPLETED:
      return t('completed')
    case SaleStatus.VOIDED:
      return t('voided')
    default:
      return status.replace(/_/g, ' ').toLowerCase()
  }
}

function getSaleStatusBadgeVariant(status: SaleStatus) {
  if (status === SaleStatus.COMPLETED) {
    return 'success' as const
  }

  if (status === SaleStatus.VOIDED) {
    return 'danger' as const
  }

  return 'neutral' as const
}

function buildChartPoints(args: {
  range: RangeKey
  currentRange: RangeBounds
  previousRange: RangeBounds
  currentSummaries: DailySalesSummary[]
  previousSummaries: DailySalesSummary[]
  chartSales: SaleListItem[]
  localeTag: string
}) {
  const {
    range,
    currentRange,
    previousRange,
    currentSummaries,
    previousSummaries,
    chartSales,
    localeTag,
  } = args

  if (range === 'today') {
    const currentDateKey = formatDateKey(currentRange.end)
    const previousDateKey = formatDateKey(previousRange.end)
    const currentBuckets = new Map(TODAY_BUCKET_START_HOURS.map((hour) => [hour, 0]))
    const previousBuckets = new Map(TODAY_BUCKET_START_HOURS.map((hour) => [hour, 0]))

    for (const sale of chartSales) {
      if (sale.status !== SaleStatus.COMPLETED) {
        continue
      }

      const saleDateKey = resolveSaleDateKey(sale)
      const saleBucketStart = getHourBucketStart(new Date(sale.soldAt).getHours())

      if (!currentBuckets.has(saleBucketStart)) {
        continue
      }

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
        currentTitle: formatCurrency(current, localeTag),
        previousTitle: formatCurrency(previous, localeTag),
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
        currentTitle: formatCurrency(current, localeTag),
        previousTitle: formatCurrency(previous, localeTag),
      }
    })
  }

  if (range === 'month') {
    const currentLookup = new Map(currentSummaries.map((summary) => [summary.date, summary.totalRevenue]))
    const previousLookup = new Map(previousSummaries.map((summary) => [summary.date, summary.totalRevenue]))
    const currentMonthYear = currentRange.end.getFullYear()
    const currentMonthIndex = currentRange.end.getMonth()
    const previousMonthYear = previousRange.end.getFullYear()
    const previousMonthIndex = previousRange.end.getMonth()
    const currentEndDay = currentRange.end.getDate()
    const previousEndDay = previousRange.end.getDate()

    return MONTH_BUCKET_START_DAYS.filter((startDay) => startDay <= currentEndDay).map((startDay) => {
      const currentBucketEnd = startDay === 26 ? currentEndDay : Math.min(startDay + 4, currentEndDay)
      const previousBucketEnd = startDay === 26 ? previousEndDay : Math.min(startDay + 4, previousEndDay)
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
        label: startDay === currentBucketEnd ? `${startDay}` : `${startDay}-${currentBucketEnd}`,
        current,
        previous,
        currentTitle: formatCurrency(current, localeTag),
        previousTitle: formatCurrency(previous, localeTag),
      }
    })
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

function DashboardMetricCard({
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
        <p className={cn('mt-2 text-2xl font-semibold text-foreground', valueClassName)}>{value}</p>
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

function EmptySection({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-background/80 px-4 py-5 text-sm text-muted-foreground">
      {children}
    </div>
  )
}

export default function DashboardPage() {
  const t = useTranslations('app.dashboard')
  const tSell = useTranslations('app.sell')
  const locale = useLocale()
  const localeTag = locale.startsWith('fr') ? 'fr-CM' : 'en-GB'
  const businessId = useAuthStore((state) => state.businessId)
  const businessName = useAuthStore((state) => state.businessName)
  const { snapshot } = useSyncSnapshot()
  const [range, setRange] = useState<RangeKey>('today')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [data, setData] = useState<DashboardData | null>(null)

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

    async function loadDashboard() {
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
          alertsResult,
          recentSalesResult,
          chartSales,
        ] = await Promise.all([
          Promise.all(currentDateKeys.map((dateKey) => getDailySalesSummaryLocal(currentBusinessId, dateKey))),
          Promise.all(previousDateKeys.map((dateKey) => getDailySalesSummaryLocal(currentBusinessId, dateKey))),
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
          listCustomerContactsLocal(currentBusinessId, {
            page: 1,
            limit: MAX_CONTACTS,
          }),
          listSupplierContactsLocal(currentBusinessId, {
            page: 1,
            limit: MAX_CONTACTS,
          }),
          listInventoryAlertsLocal(currentBusinessId, {
            page: 1,
            limit: MAX_ALERTS,
            sortBy: 'shortfall',
            sortOrder: 'DESC',
          }),
          listSalesLocal(currentBusinessId, {
            page: 1,
            limit: MAX_RECENT_SALES,
            sortBy: 'createdAt',
            sortOrder: 'DESC',
            dateFrom: startKey,
            dateTo: endKey,
          }),
          chartSalesPromise,
        ])

        if (!active) {
          return
        }

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
          alerts: alertsResult.data,
          recentSales: recentSalesResult.data,
          chartSales,
        })
      } catch (loadError) {
        if (!active) {
          return
        }

        setData(null)
        setError(loadError instanceof Error ? loadError.message : t('load_error'))
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadDashboard()

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
  const revenueBadge = useMemo(
    () =>
      buildComparisonBadge(t, totals.totalRevenue, previousTotals.totalRevenue, localeTag, {
        increaseTone: 'success',
        decreaseTone: 'danger',
      }),
    [localeTag, previousTotals.totalRevenue, t, totals.totalRevenue],
  )
  const grossProfitBadge = useMemo(
    () =>
      buildComparisonBadge(t, totals.grossProfit, previousTotals.grossProfit, localeTag, {
        increaseTone: 'success',
        decreaseTone: 'danger',
      }),
    [localeTag, previousTotals.grossProfit, t, totals.grossProfit],
  )
  const expensesBadge = useMemo(
    () =>
      buildComparisonBadge(t, data?.currentExpensesTotal ?? 0, data?.previousExpensesTotal ?? 0, localeTag, {
        increaseTone: 'danger',
        decreaseTone: 'success',
      }),
    [data?.currentExpensesTotal, data?.previousExpensesTotal, localeTag, t],
  )
  const netPosition = totals.grossProfit - (data?.currentExpensesTotal ?? 0)
  const previousNetPosition = previousTotals.grossProfit - (data?.previousExpensesTotal ?? 0)
  const netBadge = useMemo(
    () =>
      buildComparisonBadge(t, netPosition, previousNetPosition, localeTag, {
        increaseTone: 'success',
        decreaseTone: 'danger',
      }),
    [localeTag, netPosition, previousNetPosition, t],
  )
  const paymentBreakdown = useMemo(
    () => [
      { label: tSell('cash'), amount: totals.cashCollected },
      { label: tSell('mtn_momo'), amount: totals.mtnMomoCollected },
      { label: tSell('orange_money'), amount: totals.orangeMoneyCollected },
      { label: tSell('card'), amount: totals.cardCollected },
      { label: t('unpaid_credit'), amount: totals.creditIssued },
    ],
    [t, tSell, totals.cardCollected, totals.cashCollected, totals.creditIssued, totals.mtnMomoCollected, totals.orangeMoneyCollected],
  )
  const paymentTotalBase = totals.totalRevenue > 0 ? totals.totalRevenue : 1
  const debtors = useMemo(
    () =>
      [...(data?.debtors ?? [])]
        .filter((contact) => contact.totalReceivable > 0)
        .sort((left, right) => right.totalReceivable - left.totalReceivable)
        .slice(0, 4),
    [data?.debtors],
  )
  const creditors = useMemo(
    () =>
      [...(data?.creditors ?? [])]
        .filter((contact) => contact.totalPayable > 0)
        .sort((left, right) => right.totalPayable - left.totalPayable)
        .slice(0, 4),
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
          currentTitle: formatCurrency(0, localeTag),
          previousTitle: formatCurrency(0, localeTag),
        },
      ),
    [chartPoints, localeTag],
  )
  const chartMaxValue = Math.max(
    1,
    ...chartPoints.map((point) => Math.max(point.current, point.previous)),
  )
  const syncLabel = useMemo(() => {
    if (snapshot.status === 'error') {
      return t('sync_error')
    }

    if (snapshot.status === 'paused' || snapshot.status === 'disabled') {
      return t('sync_disabled')
    }

    if (snapshot.status === 'syncing') {
      return t('sync_pending')
    }

    const relative = formatRelativeTime(snapshot.lastSyncedAt, localeTag)
    if (relative) {
      return t('synced', { time: relative })
    }

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
              {([
                ['today', t('today')],
                ['week', t('this_week')],
                ['month', t('this_month')],
                ['year', t('this_year')],
              ] as const).map(([value, label]) => (
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

          <p className="max-w-3xl text-sm leading-6 text-white/85">{t('subtitle')}</p>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <DashboardMetricCard
          label={t('revenue')}
          value={formatCurrencyCompact(totals.totalRevenue, localeTag)}
          hint={t('sales_count', { count: totals.totalSales })}
          tone="success"
          badge={revenueBadge}
        />
        <DashboardMetricCard
          label={t('gross_profit')}
          value={formatCurrencyCompact(totals.grossProfit, localeTag)}
          hint={t('margin_hint', {
            percent: new Intl.NumberFormat(localeTag, { maximumFractionDigits: 1 }).format(
              totals.grossMarginPercent,
            ),
          })}
          tone="brand"
          badge={grossProfitBadge}
        />
        <DashboardMetricCard
          label={t('expenses')}
          value={formatCurrencyCompact(data?.currentExpensesTotal ?? 0, localeTag)}
          hint={t('total_discount_hint', {
            amount: formatCurrency(totals.totalDiscounts, localeTag),
          })}
          tone="warning"
          badge={expensesBadge}
        />
        <DashboardMetricCard
          label={t('net_position')}
          value={formatCurrencyCompact(netPosition, localeTag)}
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
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <DashboardMetricCard
          label={t('credit_issued')}
          value={formatCurrencyCompact(totals.creditIssued, localeTag)}
          hint={t('credit_sales_hint', { count: totals.creditSales })}
          tone="danger"
        />
        <DashboardMetricCard
          label={t('credit_collected')}
          value={formatCurrencyCompact(collections.totalAmount, localeTag)}
          hint={t('payments_received_hint', { count: collections.paymentCount })}
          tone="success"
        />
        <DashboardMetricCard
          label={t('total_receivable')}
          value={formatCurrencyCompact(data?.receivableSummary.totalOutstanding ?? 0, localeTag)}
          hint={getBalanceLabel(
            data?.receivableSummary.outstandingDebtCount ?? 0,
            'debtors_owe_hint',
            t,
          )}
          tone="warning"
        />
        <DashboardMetricCard
          label={t('total_payable')}
          value={formatCurrencyCompact(data?.payableSummary.totalOutstanding ?? 0, localeTag)}
          hint={getBalanceLabel(
            data?.payableSummary.outstandingDebtCount ?? 0,
            'creditors_owe_hint',
            t,
          )}
          tone="danger"
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
                  const currentHeight = Math.max((point.current / chartMaxValue) * 100, point.current > 0 ? 8 : 0)
                  const previousHeight = Math.max((point.previous / chartMaxValue) * 100, point.previous > 0 ? 8 : 0)

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
                    {formatCurrency(totals.totalRevenue, localeTag)}
                  </p>
                </div>
                <div className="rounded-2xl bg-background px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t('legend_previous')}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {formatCurrency(previousTotals.totalRevenue, localeTag)}
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

        <SurfaceCard title={t('payments_title')} description={t('payments_desc')}>
          <div className="space-y-4">
            {paymentBreakdown.map((item, index) => {
              const percentage = totals.totalRevenue > 0 ? Math.round((item.amount / paymentTotalBase) * 100) : 0

              return (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <span className={cn('h-2.5 w-2.5 rounded-full', paymentFillStyles[index])} />
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
                  <p className="text-xs text-muted-foreground">{formatCurrency(item.amount, localeTag)}</p>
                </div>
              )
            })}
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-card-foreground">{t('pnl_title')}</h3>
                <p className="text-sm text-muted-foreground">{t('pnl_desc')}</p>
              </div>
              <Badge variant={netPosition >= 0 ? 'success' : 'danger'}>
                {netPosition >= 0 ? t('net_profit') : t('net_loss')}
              </Badge>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{t('revenue_line')}</span>
                <span className="font-medium text-foreground">{formatCurrency(totals.totalRevenue, localeTag)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{t('cost_line')}</span>
                <span className="font-medium text-danger-600 dark:text-danger-400">
                  -{formatCurrency(totals.totalCost, localeTag)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{t('gross_profit_line')}</span>
                <span className="font-medium text-success-600 dark:text-success-400">
                  {formatCurrency(totals.grossProfit, localeTag)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{t('expenses_line')}</span>
                <span className="font-medium text-danger-600 dark:text-danger-400">
                  -{formatCurrency(data?.currentExpensesTotal ?? 0, localeTag)}
                </span>
              </div>
              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-base font-semibold text-foreground">{t('net_position')}</span>
                  <span
                    className={cn(
                      'text-base font-semibold',
                      netPosition < 0
                        ? 'text-danger-600 dark:text-danger-400'
                        : 'text-foreground',
                    )}
                  >
                    {formatCurrency(netPosition, localeTag)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </SurfaceCard>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SurfaceCard
          title={t('low_stock_title')}
          description={t('low_stock_desc', { count: data?.alerts.length ?? 0 })}
          action={
            <Badge variant="warning">
              {t('alerts_badge', { count: data?.alerts.length ?? 0 })}
            </Badge>
          }
        >
          <div className="space-y-3">
            {(data?.alerts.length ?? 0) > 0 ? (
              data?.alerts.map((alert) => (
                <div
                  key={alert.productId}
                  className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/70 px-3 py-3"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-warning-50 text-sm font-semibold text-warning-600">
                    {getInitials(alert.productName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/${locale}/products/detail?productId=${alert.productId}`} className="truncate text-sm font-medium text-foreground">
                      {alert.productName || t('untitled_product')}
                    </Link>
                    <p className="mt-1 text-xs text-danger-600 dark:text-danger-400">
                      {t('units_left', { count: alert.currentQuantity })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      {t('threshold')}
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {alert.lowStockThreshold ?? 0}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <EmptySection>{t('no_low_stock')}</EmptySection>
            )}
          </div>
        </SurfaceCard>

        <SurfaceCard
          title={t('top_debtors_title')}
          description={t('top_debtors_desc')}
          action={
            <Link href={`/${locale}/contacts/debtors`} className="text-sm font-medium text-primary transition hover:text-primary/80">
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
                    {formatCurrency(contact.totalReceivable, localeTag)}
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
            <Link href={`/${locale}/contacts/creditors`} className="text-sm font-medium text-primary transition hover:text-primary/80">
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
                    {formatCurrency(contact.totalPayable, localeTag)}
                  </p>
                </div>
              ))
            ) : (
              <EmptySection>{t('no_creditors')}</EmptySection>
            )}
          </div>
        </SurfaceCard>
      </div>

      <SurfaceCard
        title={t('recent_title')}
        description={t('recent_desc')}
        action={
          <Link href={`/${locale}/sales`} className="text-sm font-medium text-primary transition hover:text-primary/80">
            {t('view_all_sales')}
          </Link>
        }
      >
        {(data?.recentSales.length ?? 0) > 0 ? (
          <div className="overflow-auto biztrack-scrollbar">
            <table className="min-w-full table-fixed border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  <th className="border-b border-border px-3 py-3 font-semibold">{t('sale_no')}</th>
                  <th className="border-b border-border px-3 py-3 font-semibold">{t('time')}</th>
                  <th className="border-b border-border px-3 py-3 font-semibold">{t('customer')}</th>
                  <th className="border-b border-border px-3 py-3 font-semibold">{t('payment')}</th>
                  <th className="border-b border-border px-3 py-3 text-right font-semibold">{t('total')}</th>
                  <th className="border-b border-border px-3 py-3 font-semibold">{t('status')}</th>
                  <th className="border-b border-border px-3 py-3 text-center font-semibold">{t('credit')}</th>
                  <th className="border-b border-border px-3 py-3 text-center font-semibold">{t('sync')}</th>
                </tr>
              </thead>
              <tbody>
                {data?.recentSales.map((sale) => (
                  <tr key={sale.id} className="transition hover:bg-background/80">
                    <td className="border-b border-border/70 px-3 py-3 font-mono text-xs text-muted-foreground">
                      {sale.saleNumber}
                    </td>
                    <td className="border-b border-border/70 px-3 py-3">
                      {new Intl.DateTimeFormat(localeTag, {
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(sale.soldAt))}
                    </td>
                    <td className="border-b border-border/70 px-3 py-3 text-foreground">
                      {sale.customerName || t('walk_in')}
                    </td>
                    <td className="border-b border-border/70 px-3 py-3">
                      <Badge variant="neutral">
                        {getPaymentLabel(sale.paymentMethod ?? PaymentMethod.CASH, tSell, t)}
                      </Badge>
                    </td>
                    <td className="border-b border-border/70 px-3 py-3 text-right font-medium text-foreground">
                      {formatInteger(sale.totalAmount, localeTag)}
                    </td>
                    <td className="border-b border-border/70 px-3 py-3">
                      <Badge variant={getSaleStatusBadgeVariant(sale.status)}>
                        {humanizeSaleStatus(sale.status, t)}
                      </Badge>
                    </td>
                    <td className="border-b border-border/70 px-3 py-3 text-center">
                      {sale.creditAmount > 0 ? (
                        <span className="font-medium text-danger-600 dark:text-danger-400">
                          {formatCurrencyCompact(sale.creditAmount, localeTag)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="border-b border-border/70 px-3 py-3 text-center">
                      <span
                        title={sale.syncedAt ? t('online_sync') : t('offline_sync')}
                        className={cn(
                          'inline-block h-2.5 w-2.5 rounded-full',
                          sale.syncedAt ? 'bg-success-400' : 'bg-warning-400',
                        )}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptySection>{t('no_recent_sales')}</EmptySection>
        )}
      </SurfaceCard>
    </div>
  )
}
