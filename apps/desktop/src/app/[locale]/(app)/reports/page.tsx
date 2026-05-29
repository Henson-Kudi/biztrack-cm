'use client'

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import {
  DebtDirection,
  DebtStatus,
  InventoryMovementType,
  PaymentMethod,
  Resource,
  SaleStatus,
  type Debt,
  type Expense,
  type InventoryListItem,
  type InventoryMovement,
  type SubscriptionPlan,
} from '@biztrack/types'
import { Badge, Button, Spinner } from '@biztrack/ui'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import { SurfaceCard } from '@/components/catalog/SurfaceCard'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  buildCompositeReportTemplate,
  buildDebtorsAgeingReportTemplate,
  buildGenericReportTemplate,
  buildProfitLossReportTemplate,
  buildRevenueTrendReportTemplate,
  buildStockLevelsReportTemplate,
  type ReportTemplateDocument,
  type TemplateSection,
  type TemplateTone,
} from '@/reports/templates'
import { listAllDebtsByDirectionLocal } from '@/services/debts.local'
import { listExpensesLocal } from '@/services/expenses.local'
import { listInventoryLocal, listInventoryMovementsLocal } from '@/services/inventory.local'
import { hasDesktopIpc, ipc } from '@/services/ipc.bridge'
import {
  getReportRestocksSnapshotLocal,
  getReportSalesSnapshotLocal,
  type ReportRestockItemRow,
  type ReportRestockPaymentRow,
  type ReportRestockRow,
  type ReportSaleItemRow,
  type ReportSalePaymentRow,
  type ReportSaleRow,
} from '@/services/reports.local'
import { useAuthStore } from '@/stores/auth.store'
import { usePlanStore } from '@/stores/plan.store'
import { getPermissionAccessFromState } from '@/lib/plan-access'

type ReportPreset = 'today' | 'last7' | 'thisMonth' | 'lastMonth' | 'quarter' | 'year' | 'custom'
type ReportSectionKey = 'sales' | 'inventory' | 'financial' | 'credit'
type ReportTone = 'default' | 'positive' | 'warning' | 'danger' | 'info'
type TrendMode = 'day' | 'week' | 'month'

type ReportId =
  | 'daily-sales'
  | 'revenue-trend'
  | 'top-products'
  | 'cashier-performance'
  | 'payment-breakdown'
  | 'voided-sales'
  | 'stock-levels'
  | 'stock-movements'
  | 'low-stock-alerts'
  | 'restock-costs'
  | 'profit-loss'
  | 'expense-breakdown'
  | 'revenue-vs-expenses'
  | 'debtors-ageing'
  | 'creditors-ageing'
  | 'contact-statement'
  | 'credit-activity'

type AppliedRange = {
  preset: ReportPreset
  startDate: string
  endDate: string
}

type ReportDefinition = {
  id: ReportId
  section: ReportSectionKey
  requiredResource: Resource
  badge: string
  badgeTone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  icon: ReportIconName
  name: string
  description: string
  source: string
}

type LockedFeaturePrompt = {
  title: string
  description: string
  requiredPlan: SubscriptionPlan | null
}

type ReportStat = {
  label: string
  value: string
  hint: string
  tone?: ReportTone
}

type TrendPoint = {
  key: string
  label: string
  primary: number
  secondary: number
}

type BarRow = {
  label: string
  valueLabel: string
  percentage: number
  tone: ReportTone
  meta?: string
}

type RankedRow = {
  label: string
  valueLabel: string
  meta?: string
  tone?: ReportTone
}

type WaterfallRow = {
  label: string
  value: number
  tone: 'positive' | 'warning' | 'danger'
  total?: boolean
}

type PreviewTable = {
  columns: string[]
  rows: string[][]
}

type ExportModel = {
  title: string
  description: string
  filenameBase: string
  summaryRows: Array<{ label: string; value: string }>
  table?: PreviewTable
}

type ReportViewModel =
  | {
      kind: 'trend'
      title: string
      description: string
      stats: ReportStat[]
      legend: { primary: string; secondary: string }
      points: TrendPoint[]
      primaryMaxLabel: string
      secondaryMaxLabel: string
      empty: string
      exportModel: ExportModel
    }
  | {
      kind: 'bars'
      title: string
      description: string
      stats: ReportStat[]
      bars: BarRow[]
      empty: string
      exportModel: ExportModel
    }
  | {
      kind: 'ranked'
      title: string
      description: string
      stats: ReportStat[]
      rows: RankedRow[]
      empty: string
      exportModel: ExportModel
    }
  | {
      kind: 'table'
      title: string
      description: string
      stats: ReportStat[]
      table: PreviewTable
      empty: string
      exportModel: ExportModel
    }
  | {
      kind: 'note'
      title: string
      description: string
      stats: ReportStat[]
      note: string
      bullets: string[]
      exportModel: ExportModel
    }

type ReportsWorkspace = {
  sales: ReportSaleRow[]
  saleItems: ReportSaleItemRow[]
  salePayments: ReportSalePaymentRow[]
  restocks: ReportRestockRow[]
  restockItems: ReportRestockItemRow[]
  restockPayments: ReportRestockPaymentRow[]
  expenses: Expense[]
  inventoryItems: InventoryListItem[]
  inventoryMovements: InventoryMovement[]
  receivableDebts: Debt[]
  payableDebts: Debt[]
}

type ProductAggregate = {
  productId: string
  productName: string
  quantity: number
  revenue: number
  cost: number
}

type CashierAggregate = {
  cashierId: string
  cashierName: string
  totalSales: number
  completedSales: number
  voidedSales: number
  revenue: number
}

type ReportIconName =
  | 'receipt'
  | 'trend'
  | 'ranking'
  | 'cashier'
  | 'payments'
  | 'audit'
  | 'snapshot'
  | 'movements'
  | 'alert'
  | 'cost'
  | 'profit'
  | 'expenses'
  | 'ledger'

const MAX_DATASET_SIZE = 5000

const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: 'daily-sales',
    section: 'sales',
    requiredResource: Resource.REPORTS_DAILY,
    badge: 'Daily',
    badgeTone: 'success',
    icon: 'receipt',
    name: 'Daily sales report',
    description: 'All sales for the selected period with totals, cashier breakdown and void visibility.',
    source: 'sales + sale_items + sale_payments',
  },
  {
    id: 'revenue-trend',
    section: 'sales',
    requiredResource: Resource.REPORTS_MONTHLY,
    badge: 'Range',
    badgeTone: 'info',
    icon: 'trend',
    name: 'Revenue trend report',
    description: 'Revenue, gross profit and transaction count over any date range.',
    source: 'sales range aggregation',
  },
  {
    id: 'top-products',
    section: 'sales',
    requiredResource: Resource.REPORTS_WEEKLY,
    badge: 'Ranking',
    badgeTone: 'warning',
    icon: 'ranking',
    name: 'Top products report',
    description: 'Best-selling products ranked by revenue, units sold and gross contribution.',
    source: 'sale_items aggregated',
  },
  {
    id: 'cashier-performance',
    section: 'sales',
    requiredResource: Resource.REPORTS_WEEKLY,
    badge: 'Period',
    badgeTone: 'success',
    icon: 'cashier',
    name: 'Cashier performance',
    description: 'Sales per cashier with revenue, average basket size and void rate.',
    source: 'sales grouped by cashier',
  },
  {
    id: 'payment-breakdown',
    section: 'sales',
    requiredResource: Resource.REPORTS_WEEKLY,
    badge: 'Analysis',
    badgeTone: 'info',
    icon: 'payments',
    name: 'Payment method breakdown',
    description: 'Cash, MTN MoMo, Orange Money, card and unpaid credit distribution.',
    source: 'sale_payments + credit balances',
  },
  {
    id: 'voided-sales',
    section: 'sales',
    requiredResource: Resource.REPORTS_WEEKLY,
    badge: 'Audit',
    badgeTone: 'danger',
    icon: 'audit',
    name: 'Voided sales report',
    description: 'Every voided sale with the reason, timing and value reversed.',
    source: 'sales where status = VOIDED',
  },
  {
    id: 'stock-levels',
    section: 'inventory',
    requiredResource: Resource.REPORTS_WEEKLY,
    badge: 'Snapshot',
    badgeTone: 'warning',
    icon: 'snapshot',
    name: 'Stock levels report',
    description: 'Current quantity, low-stock threshold and reorder point for tracked products.',
    source: 'inventory_levels + products',
  },
  {
    id: 'stock-movements',
    section: 'inventory',
    requiredResource: Resource.REPORTS_WEEKLY,
    badge: 'Movements',
    badgeTone: 'success',
    icon: 'movements',
    name: 'Stock movement report',
    description: 'Stock in/out events across sales, restocks, adjustments and void reversals.',
    source: 'inventory_movements',
  },
  {
    id: 'low-stock-alerts',
    section: 'inventory',
    requiredResource: Resource.REPORTS_WEEKLY,
    badge: 'Alert',
    badgeTone: 'danger',
    icon: 'alert',
    name: 'Low stock alert report',
    description: 'Products below threshold, sorted by urgency and shortfall.',
    source: 'inventory levels filtered',
  },
  {
    id: 'restock-costs',
    section: 'inventory',
    requiredResource: Resource.REPORTS_MONTHLY,
    badge: 'Cost',
    badgeTone: 'info',
    icon: 'cost',
    name: 'Restock cost report',
    description: 'Restock operations with supplier, cost, payments and credit left unpaid.',
    source: 'restock_records + restock_items + restock_payments',
  },
  {
    id: 'profit-loss',
    section: 'financial',
    requiredResource: Resource.REPORTS_FINANCIAL,
    badge: 'P&L',
    badgeTone: 'success',
    icon: 'profit',
    name: 'Profit & loss statement',
    description: 'Revenue, cost of goods, expense breakdown and net result for the period.',
    source: 'sales + expenses',
  },
  {
    id: 'expense-breakdown',
    section: 'financial',
    requiredResource: Resource.REPORTS_FINANCIAL,
    badge: 'Expenses',
    badgeTone: 'warning',
    icon: 'expenses',
    name: 'Expense breakdown report',
    description: 'Expenses grouped by category with recurring versus one-off split.',
    source: 'expenses + expense_categories',
  },
  {
    id: 'revenue-vs-expenses',
    section: 'financial',
    requiredResource: Resource.REPORTS_FINANCIAL,
    badge: 'Trend',
    badgeTone: 'info',
    icon: 'trend',
    name: 'Revenue vs expenses trend',
    description: 'Revenue and expense trend over the selected period to spot pressure points.',
    source: 'sales + expenses grouped over time',
  },
  {
    id: 'debtors-ageing',
    section: 'credit',
    requiredResource: Resource.REPORTS_MONTHLY,
    badge: 'Debtors',
    badgeTone: 'danger',
    icon: 'ledger',
    name: 'Debtors ageing report',
    description: 'Outstanding receivables grouped by age buckets with oldest balances highlighted.',
    source: 'debts where direction = RECEIVABLE',
  },
  {
    id: 'creditors-ageing',
    section: 'credit',
    requiredResource: Resource.REPORTS_MONTHLY,
    badge: 'Creditors',
    badgeTone: 'info',
    icon: 'ledger',
    name: 'Creditors ageing report',
    description: 'Outstanding supplier balances grouped by age and urgency.',
    source: 'debts where direction = PAYABLE',
  },
  {
    id: 'contact-statement',
    section: 'credit',
    requiredResource: Resource.REPORTS_MONTHLY,
    badge: 'Statement',
    badgeTone: 'success',
    icon: 'receipt',
    name: 'Contact statement',
    description: 'Single-contact ledger showing debts, payments, opening and closing balance.',
    source: 'debts + debt_payments per contact',
  },
  {
    id: 'credit-activity',
    section: 'credit',
    requiredResource: Resource.REPORTS_MONTHLY,
    badge: 'Summary',
    badgeTone: 'warning',
    icon: 'payments',
    name: 'Credit activity summary',
    description: 'Credit issued, collected and written off during the selected period.',
    source: 'debts + debt_payments aggregated',
  },
]

const DEFAULT_REPORT: ReportDefinition =
  REPORT_DEFINITIONS.find((report) => report.id === 'daily-sales') ?? REPORT_DEFINITIONS[0]!

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, offset: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + offset)
  return next
}

function startOfWeek(date: Date) {
  const next = startOfLocalDay(date)
  const day = next.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return addDays(next, diff)
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year || 1970, (month || 1) - 1, day || 1)
}

function formatCurrencyBase(value: number, localeTag: string, currency = 'XAF') {
  return `${currency} ${new Intl.NumberFormat(localeTag, {
    maximumFractionDigits: 0,
  }).format(Math.round(value))}`
}

function formatCurrencyCompactBase(value: number, localeTag: string, currency = 'XAF') {
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

  return formatCurrencyBase(value, localeTag, currency)
}

function formatNumber(value: number, localeTag: string) {
  return new Intl.NumberFormat(localeTag, {
    maximumFractionDigits: 0,
  }).format(Math.round(value))
}

function formatPercent(value: number, localeTag: string) {
  return new Intl.NumberFormat(localeTag, {
    maximumFractionDigits: 1,
  }).format(value)
}

function formatDateLabel(dateKey: string, localeTag: string) {
  return new Intl.DateTimeFormat(localeTag, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parseDateKey(dateKey))
}

function formatDateTimeLabel(value: string, localeTag: string) {
  return new Intl.DateTimeFormat(localeTag, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function resolvePresetRange(preset: Exclude<ReportPreset, 'custom'>): AppliedRange {
  const today = startOfLocalDay(new Date())

  if (preset === 'today') {
    const current = formatDateKey(today)
    return {
      preset,
      startDate: current,
      endDate: current,
    }
  }

  if (preset === 'last7') {
    return {
      preset,
      startDate: formatDateKey(addDays(today, -6)),
      endDate: formatDateKey(today),
    }
  }

  if (preset === 'lastMonth') {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const end = new Date(today.getFullYear(), today.getMonth(), 0)
    return {
      preset,
      startDate: formatDateKey(start),
      endDate: formatDateKey(end),
    }
  }

  if (preset === 'quarter') {
    const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3
    const start = new Date(today.getFullYear(), quarterStartMonth, 1)
    return {
      preset,
      startDate: formatDateKey(start),
      endDate: formatDateKey(today),
    }
  }

  if (preset === 'year') {
    const start = new Date(today.getFullYear(), 0, 1)
    return {
      preset,
      startDate: formatDateKey(start),
      endDate: formatDateKey(today),
    }
  }

  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  return {
    preset: 'thisMonth',
    startDate: formatDateKey(start),
    endDate: formatDateKey(today),
  }
}

function toIsoRangeStart(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toISOString()
}

function toIsoRangeEnd(dateKey: string) {
  return new Date(`${dateKey}T23:59:59.999`).toISOString()
}

function buildRangeLabel(startDate: string, endDate: string, localeTag: string) {
  if (startDate === endDate) {
    return formatDateLabel(startDate, localeTag)
  }

  return `${formatDateLabel(startDate, localeTag)} - ${formatDateLabel(endDate, localeTag)}`
}

function daysBetweenInclusive(startDate: string, endDate: string) {
  const diff = startOfLocalDay(parseDateKey(endDate)).getTime() - startOfLocalDay(parseDateKey(startDate)).getTime()
  return Math.floor(diff / (24 * 60 * 60 * 1000)) + 1
}

function getPaymentLabel(
  method: string | PaymentMethod | null | undefined,
  tSell: ReturnType<typeof useTranslations<'app.sell'>>,
) {
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
      return 'Mixed'
    default:
      return 'Unknown'
  }
}

function getMovementTypeLabel(type: InventoryMovementType | string) {
  switch (type) {
    case InventoryMovementType.SALE:
      return 'Sale deduction'
    case InventoryMovementType.RESTOCK_IN:
      return 'Restock'
    case InventoryMovementType.MANUAL_ADJUSTMENT:
      return 'Manual adjustment'
    case InventoryMovementType.VOID_REVERSAL:
      return 'Void reversal'
    case InventoryMovementType.OPENING_STOCK:
      return 'Opening stock'
    case InventoryMovementType.TRANSFER_IN:
      return 'Transfer in'
    case InventoryMovementType.TRANSFER_OUT:
      return 'Transfer out'
    default:
      return String(type).replace(/_/g, ' ')
  }
}

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'report'
  )
}

function sumNumbers(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

function percentageOf(value: number, total: number) {
  if (total <= 0) {
    return 0
  }

  return (value / total) * 100
}

function isOpenDebt(status: DebtStatus, outstandingAmount: number) {
  return (
    outstandingAmount > 0 &&
    (status === DebtStatus.OUTSTANDING || status === DebtStatus.PARTIALLY_PAID)
  )
}

function getAgeDays(value: string) {
  const target = startOfLocalDay(new Date(value))
  const today = startOfLocalDay(new Date())
  return Math.max(0, Math.floor((today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000)))
}

function toTemplateTone(tone?: ReportTone): TemplateTone | undefined {
  if (!tone) {
    return undefined
  }

  if (tone === 'positive') {
    return 'success'
  }

  return tone
}

function getInitials(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  if (parts.length === 0) {
    return 'NA'
  }

  return parts.map((part) => part.charAt(0).toUpperCase()).join('')
}

function formatTimeLabel(value: string, localeTag: string) {
  return new Intl.DateTimeFormat(localeTag, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatMonthKeyLabel(key: string, localeTag: string) {
  const [year, month] = key.split('-').map(Number)
  return new Intl.DateTimeFormat(localeTag, {
    month: 'short',
    year: '2-digit',
  }).format(new Date(year || 1970, (month || 1) - 1, 1))
}

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function getGroupMode(range: AppliedRange): TrendMode {
  const totalDays = daysBetweenInclusive(range.startDate, range.endDate)

  if (totalDays > 120) {
    return 'month'
  }

  if (totalDays > 45) {
    return 'week'
  }

  return 'day'
}

function buildRevenueTrendPoints(
  sales: ReportSaleRow[],
  localeTag: string,
  mode: TrendMode,
) {
  const grouped = new Map<string, TrendPoint>()

  for (const sale of sales) {
    if (sale.status !== SaleStatus.COMPLETED) {
      continue
    }

    const saleDate = sale.sale_date || (sale.sold_at ? sale.sold_at.slice(0, 10) : sale.created_at.slice(0, 10))
    const date = parseDateKey(saleDate)
    let key = saleDate
    let label = new Intl.DateTimeFormat(localeTag, { day: 'numeric', month: 'short' }).format(date)

    if (mode === 'week') {
      key = formatDateKey(startOfWeek(date))
      label = `Wk ${new Intl.DateTimeFormat(localeTag, { day: 'numeric', month: 'short' }).format(parseDateKey(key))}`
    }

    if (mode === 'month') {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      label = new Intl.DateTimeFormat(localeTag, { month: 'short', year: '2-digit' }).format(date)
    }

    const current = grouped.get(key) ?? {
      key,
      label,
      primary: 0,
      secondary: 0,
    }

    current.primary += sale.total_amount ?? 0
    current.secondary += 1
    grouped.set(key, current)
  }

  return Array.from(grouped.values()).sort((left, right) => left.key.localeCompare(right.key))
}

function buildRevenueVsExpensesPoints(
  sales: ReportSaleRow[],
  expenses: Expense[],
  localeTag: string,
) {
  const grouped = new Map<string, TrendPoint>()

  for (const sale of sales) {
    if (sale.status !== SaleStatus.COMPLETED) {
      continue
    }

    const saleDate = sale.sale_date || sale.created_at.slice(0, 10)
    const date = parseDateKey(saleDate)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = new Intl.DateTimeFormat(localeTag, { month: 'short', year: '2-digit' }).format(date)
    const current = grouped.get(key) ?? { key, label, primary: 0, secondary: 0 }
    current.primary += sale.total_amount ?? 0
    grouped.set(key, current)
  }

  for (const expense of expenses) {
    const date = parseDateKey(expense.expenseDate)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = new Intl.DateTimeFormat(localeTag, { month: 'short', year: '2-digit' }).format(date)
    const current = grouped.get(key) ?? { key, label, primary: 0, secondary: 0 }
    current.secondary += expense.amount
    grouped.set(key, current)
  }

  return Array.from(grouped.values()).sort((left, right) => left.key.localeCompare(right.key))
}

function buildAgeingRows(
  debts: Debt[],
): Array<{
  label: string
  amount: number
  count: number
  percentage: number
}> {
  const buckets = [
    { label: '0-7 days', min: 0, max: 7, amount: 0, count: 0 },
    { label: '8-15 days', min: 8, max: 15, amount: 0, count: 0 },
    { label: '16-30 days', min: 16, max: 30, amount: 0, count: 0 },
    { label: '30+ days', min: 31, max: Number.POSITIVE_INFINITY, amount: 0, count: 0 },
  ]

  const openDebts = debts.filter((debt) => isOpenDebt(debt.status, debt.outstandingAmount))
  const totalOutstanding = sumNumbers(openDebts.map((debt) => debt.outstandingAmount))

  for (const debt of openDebts) {
    const ageDays = getAgeDays(debt.createdAt)
    const bucket = buckets.find((entry) => ageDays >= entry.min && ageDays <= entry.max)

    if (!bucket) {
      continue
    }

    bucket.amount += debt.outstandingAmount
    bucket.count += 1
  }

  return buckets.map((bucket) => ({
    label: bucket.label,
    amount: bucket.amount,
    count: bucket.count,
    percentage: Number(percentageOf(bucket.amount, totalOutstanding).toFixed(1)),
  }))
}

function buildRevenueAnalysisRows(
  sales: ReportSaleRow[],
  items: ReportSaleItemRow[],
  localeTag: string,
  mode: TrendMode,
) {
  const costBySaleId = new Map<string, number>()
  for (const item of items) {
    costBySaleId.set(
      item.sale_id,
      (costBySaleId.get(item.sale_id) ?? 0) + (item.cost_price ?? 0) * item.quantity,
    )
  }

  const grouped = new Map<
    string,
    {
      key: string
      label: string
      secondaryLabel: string
      revenue: number
      cost: number
      transactions: number
    }
  >()

  for (const sale of sales) {
    if (sale.status !== SaleStatus.COMPLETED) {
      continue
    }

    const saleDate =
      sale.sale_date || (sale.sold_at ? sale.sold_at.slice(0, 10) : sale.created_at.slice(0, 10))
    const date = parseDateKey(saleDate)
    let key = saleDate
    let label = new Intl.DateTimeFormat(localeTag, {
      day: '2-digit',
      month: 'short',
    }).format(date)
    let secondaryLabel = new Intl.DateTimeFormat(localeTag, {
      weekday: 'short',
    }).format(date)

    if (mode === 'week') {
      key = formatDateKey(startOfWeek(date))
      const weekStart = parseDateKey(key)
      label = new Intl.DateTimeFormat(localeTag, {
        day: '2-digit',
        month: 'short',
      }).format(weekStart)
      secondaryLabel = 'Week'
    }

    if (mode === 'month') {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      label = new Intl.DateTimeFormat(localeTag, {
        month: 'short',
        year: '2-digit',
      }).format(date)
      secondaryLabel = 'Month'
    }

    const current = grouped.get(key) ?? {
      key,
      label,
      secondaryLabel,
      revenue: 0,
      cost: 0,
      transactions: 0,
    }

    current.revenue += sale.total_amount ?? 0
    current.cost += costBySaleId.get(sale.id) ?? 0
    current.transactions += 1
    grouped.set(key, current)
  }

  return Array.from(grouped.values())
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((row) => {
      const grossProfit = row.revenue - row.cost
      return {
        ...row,
        grossProfit,
        marginPercent: Number(percentageOf(grossProfit, row.revenue).toFixed(1)),
        averageBasket: row.transactions > 0 ? row.revenue / row.transactions : 0,
      }
    })
}

function getReportIconWrapperClassName(tone: ReportDefinition['badgeTone']) {
  if (tone === 'success') {
    return 'bg-success-50 text-success-600'
  }
  if (tone === 'warning') {
    return 'bg-warning-50 text-warning-600'
  }
  if (tone === 'danger') {
    return 'bg-danger-50 text-danger-600'
  }
  if (tone === 'info') {
    return 'bg-brand-50 text-brand-600'
  }
  return 'bg-muted text-muted-foreground'
}

function ReportIcon({ name }: { name: ReportIconName }) {
  switch (name) {
    case 'receipt':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 2.5h10v11l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3V2.5Z" />
          <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3.5" />
        </svg>
      )
    case 'trend':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M2 13.5h12" />
          <path d="m3 10 3-3 2 2 5-5" />
        </svg>
      )
    case 'ranking':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 12.5V7.5M8 12.5V4.5M13 12.5V2.5" />
        </svg>
      )
    case 'cashier':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="8" cy="5" r="2.5" />
          <path d="M3 13c1.2-2 3-3 5-3s3.8 1 5 3" />
        </svg>
      )
    case 'payments':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="2.5" y="4" width="11" height="8" rx="1.5" />
          <path d="M2.5 6.5h11M5 9h2.5" />
        </svg>
      )
    case 'audit':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="8" cy="8" r="5.5" />
          <path d="m5.5 5.5 5 5M10.5 5.5l-5 5" />
        </svg>
      )
    case 'snapshot':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M2.5 5.5 8 2.5l5.5 3v5L8 13.5l-5.5-3v-5Z" />
          <path d="M8 2.5v11M2.5 5.5 8 8.5l5.5-3" />
        </svg>
      )
    case 'movements':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 5h7M3 11h7M8 2l3 3-3 3M8 8l3 3-3 3" />
        </svg>
      )
    case 'alert':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M8 2.5 14 13.5H2L8 2.5Z" />
          <path d="M8 6v3.5M8 12h.01" />
        </svg>
      )
    case 'cost':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 4.5h10v7H3z" />
          <path d="M5.5 7.5h5" />
          <path d="M6.5 10h3" />
        </svg>
      )
    case 'profit':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M2.5 13.5h11" />
          <path d="m3.5 10.5 2.2-2.2 2 2 4.3-5.3" />
        </svg>
      )
    case 'expenses':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M4 2.5h8v11H4z" />
          <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
        </svg>
      )
    case 'ledger':
    default:
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 2.5h10v11H3z" />
          <path d="M5 5.5h6M5 8h6M5 10.5h4" />
        </svg>
      )
  }
}

function ReportMetricCard({ stat }: { stat: ReportStat }) {
  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-4',
        stat.tone === 'positive' && 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10',
        stat.tone === 'warning' && 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10',
        stat.tone === 'danger' && 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10',
        stat.tone === 'info' && 'border-brand-100 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/10',
        (!stat.tone || stat.tone === 'default') && 'border-border bg-card',
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {stat.label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{stat.value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{stat.hint}</p>
    </div>
  )
}


function DualSeriesTrendChart({
  points,
  primaryMaxLabel,
  secondaryMaxLabel,
}: {
  points: TrendPoint[]
  primaryMaxLabel: string
  secondaryMaxLabel: string
}) {
  const width = 760
  const height = 220
  const padding = { top: 18, right: 24, bottom: 34, left: 18 }
  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom
  const maxPrimary = Math.max(...points.map((point) => point.primary), 1)
  const maxSecondary = Math.max(...points.map((point) => point.secondary), 1)
  const slotWidth = innerWidth / Math.max(points.length, 1)
  const barWidth = Math.min(28, Math.max(slotWidth * 0.54, 8))

  const bars = points.map((point, index) => {
    const x = padding.left + index * slotWidth + (slotWidth - barWidth) / 2
    const barHeight = (point.primary / maxPrimary) * innerHeight
    const y = padding.top + innerHeight - barHeight

    return {
      ...point,
      x,
      y,
      barHeight,
      barWidth,
    }
  })

  const linePoints = points
    .map((point, index) => {
      const x = padding.left + index * slotWidth + slotWidth / 2
      const y = padding.top + innerHeight - (point.secondary / maxSecondary) * innerHeight
      return `${x},${y}`
    })
    .join(' ')

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/70 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full" role="img" aria-label="Report trend chart">
        {[0, 0.33, 0.66, 1].map((step, index) => {
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

        {bars.map((bar) => (
          <rect
            key={bar.key}
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
          const y = padding.top + innerHeight - (point.secondary / maxSecondary) * innerHeight
          return <circle key={`point-${point.key}`} cx={x} cy={y} r="3.5" fill="#A29F97" />
        })}

        {bars.map((bar) => (
          <text
            key={`label-${bar.key}`}
            x={bar.x + bar.barWidth / 2}
            y={height - 10}
            textAnchor="middle"
            fontSize="10"
            fill="currentColor"
            opacity="0.65"
          >
            {bar.label}
          </text>
        ))}

        <text x={padding.left} y="12" fontSize="10" fill="currentColor" opacity="0.6">
          {primaryMaxLabel}
        </text>
        <text x={width - padding.right} y="12" fontSize="10" textAnchor="end" fill="currentColor" opacity="0.6">
          {secondaryMaxLabel}
        </text>
      </svg>
    </div>
  )
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 3.5v8" />
      <path d="m6.5 9.5 3.5 3.5 3.5-3.5" />
      <path d="M4 15.5h12" />
    </svg>
  )
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="m5 7.5 5 5 5-5" />
    </svg>
  )
}

export default function ReportsPage() {
  const t = useTranslations('app.reports')
  const planGateT = useTranslations('app.plan_gate')
  const tSell = useTranslations('app.sell')
  const locale = useLocale()
  const router = useRouter()
  const localeTag = locale.startsWith('fr') ? 'fr-CM' : 'en-GB'
  const businessId = useAuthStore((state) => state.businessId)
  const businessName = useAuthStore((state) => state.businessName)
  const businessCurrency = useAuthStore((state) => state.businessCurrency)
  const planState = usePlanStore((state) => state.current)
  const defaultRange = useMemo(() => resolvePresetRange('thisMonth'), [])
  const [previewReportId, setPreviewReportId] = useState<ReportId>(DEFAULT_REPORT.id)
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false)
  const [previewGeneratedAt, setPreviewGeneratedAt] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [appliedRange, setAppliedRange] = useState<AppliedRange>(defaultRange)
  const [draftStartDate, setDraftStartDate] = useState(defaultRange.startDate)
  const [draftEndDate, setDraftEndDate] = useState(defaultRange.endDate)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [workspace, setWorkspace] = useState<ReportsWorkspace | null>(null)
  const [exportingExcel, setExportingExcel] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false)
  const [isProfitLossExpanded, setIsProfitLossExpanded] = useState(true)
  const [isRevenueTrendExpanded, setIsRevenueTrendExpanded] = useState(true)
  const [lockedFeaturePrompt, setLockedFeaturePrompt] = useState<LockedFeaturePrompt | null>(null)

  useEffect(() => {
    if (!businessId) {
      setWorkspace(null)
      setLoading(false)
      setError(null)
      return
    }

    let active = true
    const currentBusinessId = businessId

    async function loadReportsWorkspace() {
      setLoading(true)
      setError(null)

      try {
        const [salesSnapshot, restockSnapshot, expensesResult, inventoryResult, movementResult, receivableDebts, payableDebts] =
          await Promise.all([
            getReportSalesSnapshotLocal(currentBusinessId, appliedRange.startDate, appliedRange.endDate),
            getReportRestocksSnapshotLocal(currentBusinessId, appliedRange.startDate, appliedRange.endDate),
            listExpensesLocal(currentBusinessId, {
              page: 1,
              limit: MAX_DATASET_SIZE,
              sortBy: 'expenseDate',
              sortOrder: 'DESC',
              dateFrom: appliedRange.startDate,
              dateTo: appliedRange.endDate,
            }),
            listInventoryLocal(currentBusinessId, {
              page: 1,
              limit: MAX_DATASET_SIZE,
              sortBy: 'productName',
              sortOrder: 'ASC',
            }),
            listInventoryMovementsLocal(currentBusinessId, {
              page: 1,
              limit: MAX_DATASET_SIZE,
              sortBy: 'createdAt',
              sortOrder: 'DESC',
              dateFrom: toIsoRangeStart(appliedRange.startDate),
              dateTo: toIsoRangeEnd(appliedRange.endDate),
            }),
            listAllDebtsByDirectionLocal(currentBusinessId, DebtDirection.RECEIVABLE, {
              includePayments: true,
            }),
            listAllDebtsByDirectionLocal(currentBusinessId, DebtDirection.PAYABLE, {
              includePayments: true,
            }),
          ])

        if (!active) {
          return
        }

        setWorkspace({
          sales: salesSnapshot.sales,
          saleItems: salesSnapshot.items,
          salePayments: salesSnapshot.payments,
          restocks: restockSnapshot.restocks,
          restockItems: restockSnapshot.items,
          restockPayments: restockSnapshot.payments,
          expenses: expensesResult.data,
          inventoryItems: inventoryResult.data,
          inventoryMovements: movementResult.data,
          receivableDebts,
          payableDebts,
        })
      } catch (loadError) {
        if (!active) {
          return
        }

        setWorkspace(null)
        setError(loadError instanceof Error ? loadError.message : t('load_error'))
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadReportsWorkspace()

    return () => {
      active = false
    }
  }, [appliedRange.endDate, appliedRange.startDate, businessId, reloadKey, t])

  const selectedReport = useMemo<ReportDefinition>(
    () => REPORT_DEFINITIONS.find((report) => report.id === previewReportId) ?? DEFAULT_REPORT,
    [previewReportId],
  )

  const sectionLabels = useMemo<Record<ReportSectionKey, string>>(
    () => ({
      sales: t('sections.sales'),
      inventory: t('sections.inventory'),
      financial: t('sections.financial'),
      credit: t('sections.credit'),
    }),
    [t],
  )

  const reportAccessById = useMemo(
    () =>
      new Map(
        REPORT_DEFINITIONS.map((report) => [
          report.id,
          planState ? getPermissionAccessFromState(planState, report.requiredResource) : null,
        ]),
      ),
    [planState],
  )
  const csvExportAccess = useMemo(
    () =>
      planState ? getPermissionAccessFromState(planState, Resource.REPORTS_EXPORT_CSV) : null,
    [planState],
  )
  const pdfExportAccess = useMemo(
    () =>
      planState ? getPermissionAccessFromState(planState, Resource.REPORTS_EXPORT_PDF) : null,
    [planState],
  )
  const hasLockedReports = REPORT_DEFINITIONS.some((report) => {
    const access = reportAccessById.get(report.id)
    return !(access?.allowed ?? true)
  })
  const canExportCsv = csvExportAccess?.allowed ?? true
  const canExportPdf = pdfExportAccess?.allowed ?? true
  const hasLockedExportFeature = !canExportCsv || !canExportPdf
  const exportRequiredPlan =
    csvExportAccess?.requiredPlan ?? pdfExportAccess?.requiredPlan ?? null
  const exportFeatureLabel = [!canExportPdf ? t('export.pdf') : null, !canExportCsv ? t('export.excel') : null]
    .filter(Boolean)
    .join(', ')

  const filteredReports = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()
    return REPORT_DEFINITIONS.filter((report) => {
      if (!query) {
        return true
      }

      const haystack = [
        report.name,
        report.description,
        report.source,
        report.badge,
        report.id.replace(/-/g, ' '),
        sectionLabels[report.section],
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [deferredSearch, sectionLabels])

  const accessibleFilteredReports = useMemo(
    () =>
      // Preview state must always land on an accessible report. Locked reports
      // remain searchable and visible, but they must not become the active
      // preview after a plan downgrade or cache refresh.
      filteredReports.filter((report) => {
        const access = reportAccessById.get(report.id)
        return access?.allowed ?? true
      }),
    [filteredReports, reportAccessById],
  )

  useEffect(() => {
    const previewAccess = reportAccessById.get(previewReportId)
    if (
      filteredReports.some((report) => report.id === previewReportId) &&
      (previewAccess?.allowed ?? true)
    ) {
      return
    }

    setPreviewReportId(accessibleFilteredReports[0]?.id ?? DEFAULT_REPORT.id)
    setPreviewGeneratedAt(null)
    setIsExportMenuOpen(false)
  }, [accessibleFilteredReports, filteredReports, previewReportId, reportAccessById])

  const openLockedFeaturePrompt = ({
    title,
    description,
    requiredPlan,
  }: LockedFeaturePrompt) => {
    setLockedFeaturePrompt({
      title,
      description,
      requiredPlan,
    })
  }

  const promptForLockedReport = (report: ReportDefinition) => {
    const access = reportAccessById.get(report.id)
    if (access?.allowed ?? true) {
      return false
    }

    // Locked features should never navigate straight into the report. The spec
    // requires an explicit upgrade prompt so the user understands why the
    // feature is unavailable on the current business plan.
    openLockedFeaturePrompt({
      title: planGateT('locked_feature_title'),
      description: planGateT('locked_feature_description', {
        report: report.name,
        section: sectionLabels[report.section],
        plan: access?.requiredPlan ?? 'SOLO',
      }),
      requiredPlan: access?.requiredPlan ?? null,
    })

    return true
  }

  const promptForLockedExport = (formats: string, requiredPlan: SubscriptionPlan | null) => {
    openLockedFeaturePrompt({
      title: planGateT('export_locked_title'),
      description: planGateT('export_locked_description', {
        formats,
        plan: requiredPlan ?? 'SOLO',
      }),
      requiredPlan,
    })
  }

  const derived = useMemo(() => {
    const sales = workspace?.sales ?? []
    const saleItems = workspace?.saleItems ?? []
    const salePayments = workspace?.salePayments ?? []
    const expenses = workspace?.expenses ?? []
    const inventoryItems = workspace?.inventoryItems ?? []
    const inventoryMovements = workspace?.inventoryMovements ?? []
    const restocks = workspace?.restocks ?? []
    const restockItems = workspace?.restockItems ?? []
    const restockPayments = workspace?.restockPayments ?? []
    const receivableDebts = workspace?.receivableDebts ?? []
    const payableDebts = workspace?.payableDebts ?? []

    const completedSales = sales.filter((sale) => sale.status === SaleStatus.COMPLETED)
    const voidedSales = sales.filter((sale) => sale.status === SaleStatus.VOIDED)
    const completedSaleIds = new Set(completedSales.map((sale) => sale.id))
    const completedItems = saleItems.filter((item) => completedSaleIds.has(item.sale_id))
    const completedPayments = salePayments.filter((payment) => completedSaleIds.has(payment.sale_id))
    const totalRevenue = sumNumbers(completedSales.map((sale) => sale.total_amount ?? 0))
    const totalCost = sumNumbers(
      completedItems.map((item) => (item.cost_price ?? 0) * item.quantity),
    )
    const grossProfit = totalRevenue - totalCost
    const totalExpenses = sumNumbers(expenses.map((expense) => expense.amount))
    const netProfit = grossProfit - totalExpenses
    const averageOrderValue = completedSales.length > 0 ? totalRevenue / completedSales.length : 0
    const totalCreditIssued = sumNumbers(completedSales.map((sale) => sale.credit_amount ?? 0))
    const paymentTotals = new Map<string, number>()
    for (const payment of completedPayments) {
      paymentTotals.set(payment.method, (paymentTotals.get(payment.method) ?? 0) + payment.amount)
    }

    const productMap = new Map<string, ProductAggregate>()
    for (const item of completedItems) {
      const current = productMap.get(item.product_id) ?? {
        productId: item.product_id,
        productName: item.product_name,
        quantity: 0,
        revenue: 0,
        cost: 0,
      }

      current.quantity += item.quantity
      current.revenue += item.line_total ?? item.total_price ?? 0
      current.cost += (item.cost_price ?? 0) * item.quantity
      productMap.set(item.product_id, current)
    }

    const topProducts = Array.from(productMap.values()).sort((left, right) => right.revenue - left.revenue)

    const cashierMap = new Map<string, CashierAggregate>()
    for (const sale of sales) {
      const key = sale.cashier_id || 'unknown'
      const current = cashierMap.get(key) ?? {
        cashierId: key,
        cashierName: sale.cashier_name || 'Local user',
        totalSales: 0,
        completedSales: 0,
        voidedSales: 0,
        revenue: 0,
      }

      current.totalSales += 1
      if (sale.status === SaleStatus.COMPLETED) {
        current.completedSales += 1
        current.revenue += sale.total_amount ?? 0
      }
      if (sale.status === SaleStatus.VOIDED) {
        current.voidedSales += 1
      }

      cashierMap.set(key, current)
    }

    const cashierRows = Array.from(cashierMap.values()).sort((left, right) => right.revenue - left.revenue)
    const lowStockItems = inventoryItems
      .filter((item) => item.isLowStock)
      .sort((left, right) => {
        const leftShortfall = (left.lowStockThreshold ?? 0) - left.quantity
        const rightShortfall = (right.lowStockThreshold ?? 0) - right.quantity
        return rightShortfall - leftShortfall
      })
    const expenseByCategory = new Map<string, { name: string; amount: number; recurringAmount: number; count: number }>()
    for (const expense of expenses) {
      const categoryName = expense.category?.name || t('uncategorized')
      const current = expenseByCategory.get(categoryName) ?? {
        name: categoryName,
        amount: 0,
        recurringAmount: 0,
        count: 0,
      }
      current.amount += expense.amount
      if (expense.isRecurring) {
        current.recurringAmount += expense.amount
      }
      current.count += 1
      expenseByCategory.set(categoryName, current)
    }
    const expenseCategoryRows = Array.from(expenseByCategory.values()).sort((left, right) => right.amount - left.amount)

    const movementTypeTotals = new Map<string, { label: string; quantity: number; count: number }>()
    for (const movement of inventoryMovements) {
      const key = movement.type
      const current = movementTypeTotals.get(key) ?? {
        label: getMovementTypeLabel(movement.type),
        quantity: 0,
        count: 0,
      }
      current.quantity += Math.abs(movement.quantityChange)
      current.count += 1
      movementTypeTotals.set(key, current)
    }
    const movementRows = Array.from(movementTypeTotals.values()).sort((left, right) => right.count - left.count)

    const receivableAgeing = buildAgeingRows(receivableDebts)
    const payableAgeing = buildAgeingRows(payableDebts)
    const openReceivableDebts = receivableDebts
      .filter((debt) => isOpenDebt(debt.status, debt.outstandingAmount))
      .sort((left, right) => right.outstandingAmount - left.outstandingAmount)
    const openPayableDebts = payableDebts
      .filter((debt) => isOpenDebt(debt.status, debt.outstandingAmount))
      .sort((left, right) => right.outstandingAmount - left.outstandingAmount)

    const contactBalanceRows = [...openReceivableDebts, ...openPayableDebts]
      .map((debt) => ({
        contactName: debt.contact?.name || debt.sourceReference,
        direction: debt.direction,
        balance: debt.outstandingAmount,
        reference: debt.sourceReference,
      }))
      .sort((left, right) => right.balance - left.balance)

    const collectedReceivable = sumNumbers(
      receivableDebts.flatMap((debt) =>
        (debt.payments ?? [])
          .filter((payment) => payment.paymentDate >= appliedRange.startDate && payment.paymentDate <= appliedRange.endDate)
          .map((payment) => payment.amount),
      ),
    )
    const writtenOffReceivable = sumNumbers(
      receivableDebts
        .filter(
          (debt) =>
            debt.status === DebtStatus.WRITTEN_OFF &&
            debt.writtenOffAt &&
            debt.writtenOffAt.slice(0, 10) >= appliedRange.startDate &&
            debt.writtenOffAt.slice(0, 10) <= appliedRange.endDate,
        )
        .map((debt) => debt.outstandingAmount),
    )
    const issuedReceivable = sumNumbers(
      receivableDebts
        .filter((debt) => debt.createdAt.slice(0, 10) >= appliedRange.startDate && debt.createdAt.slice(0, 10) <= appliedRange.endDate)
        .map((debt) => debt.originalAmount),
    )

    return {
      sales,
      completedSales,
      voidedSales,
      completedItems,
      completedPayments,
      totalRevenue,
      totalCost,
      grossProfit,
      totalExpenses,
      netProfit,
      averageOrderValue,
      totalCreditIssued,
      paymentTotals,
      topProducts,
      cashierRows,
      lowStockItems,
      expenseCategoryRows,
      movementRows,
      receivableAgeing,
      payableAgeing,
      openReceivableDebts,
      openPayableDebts,
      contactBalanceRows,
      collectedReceivable,
      writtenOffReceivable,
      issuedReceivable,
      restocks,
      restockItems,
      restockPayments,
      inventoryItems,
      inventoryMovements,
      expenses,
      receivableDebts,
      payableDebts,
    }
  }, [appliedRange.endDate, appliedRange.startDate, t, workspace])

  const pnlRows = useMemo(() => {
    const expenseRows = [...derived.expenseCategoryRows]
    const topExpenseRows = expenseRows.slice(0, 5)
    const remainingExpenses = expenseRows.slice(5)
    const otherAmount = sumNumbers(remainingExpenses.map((row) => row.amount))

    const rows: WaterfallRow[] = [
      {
        label: t('waterfall.revenue'),
        value: derived.totalRevenue,
        tone: 'positive' as const,
      },
      {
        label: t('waterfall.cogs'),
        value: -derived.totalCost,
        tone: 'danger' as const,
      },
      {
        label: t('waterfall.gross_profit'),
        value: derived.grossProfit,
        tone: derived.grossProfit >= 0 ? ('positive' as const) : ('danger' as const),
        total: true,
      },
      ...topExpenseRows.map((row) => ({
        label: row.name,
        value: -row.amount,
        tone: 'warning' as const,
      })),
      ...(otherAmount > 0
        ? [
            {
              label: t('waterfall.other_expenses'),
              value: -otherAmount,
              tone: 'warning' as const,
            },
          ]
        : []),
      {
        label: t('waterfall.total_expenses'),
        value: -derived.totalExpenses,
        tone: 'danger' as const,
        total: true,
      },
      {
        label: t('waterfall.net_profit'),
        value: derived.netProfit,
        tone: derived.netProfit >= 0 ? ('positive' as const) : ('danger' as const),
        total: true,
      },
    ]

    const maxMagnitude = Math.max(
      derived.totalRevenue,
      ...rows.map((row) => Math.abs(row.value)),
      1,
    )

    return rows.map((row) => ({
      ...row,
      percent: Math.max(6, Math.round((Math.abs(row.value) / maxMagnitude) * 100)),
    }))
  }, [derived.expenseCategoryRows, derived.grossProfit, derived.netProfit, derived.totalCost, derived.totalExpenses, derived.totalRevenue, t])

  const trendMode = useMemo(() => getGroupMode(appliedRange), [appliedRange])

  const revenueTrendPoints = useMemo(
    () => buildRevenueTrendPoints(derived.completedSales, localeTag, trendMode),
    [derived.completedSales, localeTag, trendMode],
  )

  const revenueAnalysisRows = useMemo(
    () =>
      buildRevenueAnalysisRows(
        derived.completedSales,
        derived.completedItems,
        localeTag,
        trendMode,
      ),
    [derived.completedItems, derived.completedSales, localeTag, trendMode],
  )

  const revenuePaymentRows = useMemo(
    () => [
      {
        label: getPaymentLabel(PaymentMethod.CASH, tSell),
        amount: derived.paymentTotals.get(PaymentMethod.CASH) ?? 0,
        tone: 'success' as const,
      },
      {
        label: getPaymentLabel(PaymentMethod.MTN_MOMO, tSell),
        amount: derived.paymentTotals.get(PaymentMethod.MTN_MOMO) ?? 0,
        tone: 'warning' as const,
      },
      {
        label: getPaymentLabel(PaymentMethod.ORANGE_MONEY, tSell),
        amount: derived.paymentTotals.get(PaymentMethod.ORANGE_MONEY) ?? 0,
        tone: 'info' as const,
      },
      {
        label: getPaymentLabel(PaymentMethod.CARD, tSell),
        amount: derived.paymentTotals.get(PaymentMethod.CARD) ?? 0,
        tone: 'default' as const,
      },
      {
        label: 'Unpaid credit',
        amount: derived.totalCreditIssued,
        tone: 'danger' as const,
      },
    ],
    [derived.paymentTotals, derived.totalCreditIssued, tSell],
  )

  const reportViewModel = useMemo<ReportViewModel>(() => {
    const rangeLabel = buildRangeLabel(appliedRange.startDate, appliedRange.endDate, localeTag)
    const exportBase = `${slugify(selectedReport.name)}-${appliedRange.startDate}-${appliedRange.endDate}`

    if (selectedReport.id === 'revenue-trend') {
      const points = buildRevenueTrendPoints(derived.completedSales, localeTag, getGroupMode(appliedRange))

      return {
        kind: 'trend',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.revenue'),
            value: formatCurrencyCompactBase(derived.totalRevenue, localeTag, businessCurrency),
            hint: `${formatNumber(derived.completedSales.length, localeTag)} ${t('stats.transactions_hint')}`,
            tone: 'positive',
          },
          {
            label: t('stats.gross_profit'),
            value: formatCurrencyCompactBase(derived.grossProfit, localeTag, businessCurrency),
            hint: `${formatPercent(percentageOf(derived.grossProfit, derived.totalRevenue), localeTag)}% ${t('stats.margin_hint')}`,
            tone: derived.grossProfit >= 0 ? 'info' : 'danger',
          },
          {
            label: t('stats.avg_basket'),
            value: formatCurrencyCompactBase(derived.averageOrderValue, localeTag, businessCurrency),
            hint: t('stats.avg_basket_hint'),
            tone: 'default',
          },
        ],
        legend: {
          primary: t('preview.legend_revenue'),
          secondary: t('preview.legend_transactions'),
        },
        points,
        primaryMaxLabel: formatCurrencyCompactBase(Math.max(...points.map((point) => point.primary), 0), localeTag, businessCurrency),
        secondaryMaxLabel: formatNumber(Math.max(...points.map((point) => point.secondary), 0), localeTag),
        empty: t('preview.no_sales_data'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.revenue'), value: formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency) },
            { label: t('stats.gross_profit'), value: formatCurrencyBase(derived.grossProfit, localeTag, businessCurrency) },
            { label: t('stats.avg_basket'), value: formatCurrencyBase(derived.averageOrderValue, localeTag, businessCurrency) },
          ],
          table: {
            columns: [t('table.period'), t('preview.legend_revenue'), t('preview.legend_transactions')],
            rows: points.map((point) => [
              point.label,
              formatCurrencyBase(point.primary, localeTag, businessCurrency),
              formatNumber(point.secondary, localeTag),
            ]),
          },
        },
      }
    }

    if (selectedReport.id === 'daily-sales') {
      const table: PreviewTable = {
        columns: [
          t('table.sale_no'),
          t('table.time'),
          t('table.customer'),
          t('table.payment'),
          t('table.total'),
          t('table.status'),
        ],
        rows: derived.sales.slice(0, 12).map((sale) => [
          sale.sale_number || sale.receipt_number || sale.id,
          sale.sold_at ? new Intl.DateTimeFormat(localeTag, { hour: '2-digit', minute: '2-digit' }).format(new Date(sale.sold_at)) : '-',
          sale.customer_name || t('walk_in'),
          getPaymentLabel(sale.payment_method, tSell),
          formatCurrencyBase(sale.total_amount ?? 0, localeTag, businessCurrency),
          sale.status === SaleStatus.VOIDED ? 'Voided' : 'Completed',
        ]),
      }

      return {
        kind: 'table',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.transactions'),
            value: formatNumber(derived.sales.length, localeTag),
            hint: t('stats.all_sales_hint'),
            tone: 'info',
          },
          {
            label: t('stats.completed'),
            value: formatNumber(derived.completedSales.length, localeTag),
            hint: t('stats.completed_sales_hint'),
            tone: 'positive',
          },
          {
            label: t('stats.voided'),
            value: formatNumber(derived.voidedSales.length, localeTag),
            hint: formatCurrencyBase(sumNumbers(derived.voidedSales.map((sale) => sale.total_amount ?? 0)), localeTag, businessCurrency),
            tone: 'danger',
          },
        ],
        table,
        empty: t('preview.no_sales_data'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.transactions'), value: formatNumber(derived.sales.length, localeTag) },
            { label: t('stats.completed'), value: formatNumber(derived.completedSales.length, localeTag) },
            { label: t('stats.voided'), value: formatNumber(derived.voidedSales.length, localeTag) },
          ],
          table,
        },
      }
    }

    if (selectedReport.id === 'top-products') {
      const rows = derived.topProducts.slice(0, 10).map((product) => ({
        label: product.productName,
        valueLabel: formatCurrencyBase(product.revenue, localeTag, businessCurrency),
        meta: `${formatNumber(product.quantity, localeTag)} ${t('stats.units_sold_hint')} · ${formatCurrencyBase(product.revenue - product.cost, localeTag, businessCurrency)} ${t('stats.gross_contribution_hint')}`,
        tone: 'positive' as const,
      }))

      return {
        kind: 'ranked',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.products'),
            value: formatNumber(derived.topProducts.length, localeTag),
            hint: t('stats.products_ranked_hint'),
            tone: 'info',
          },
          {
            label: t('stats.best_seller'),
            value: rows[0]?.label || '-',
            hint: rows[0]?.valueLabel || t('preview.no_sales_data'),
            tone: 'positive',
          },
          {
            label: t('stats.units_sold'),
            value: formatNumber(sumNumbers(derived.topProducts.map((product) => product.quantity)), localeTag),
            hint: t('stats.units_sold_hint'),
            tone: 'default',
          },
        ],
        rows,
        empty: t('preview.no_sales_data'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.products'), value: formatNumber(derived.topProducts.length, localeTag) },
            { label: t('stats.units_sold'), value: formatNumber(sumNumbers(derived.topProducts.map((product) => product.quantity)), localeTag) },
            { label: t('stats.revenue'), value: formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency) },
          ],
          table: {
            columns: [t('table.product'), t('table.revenue'), t('table.units'), t('table.margin')],
            rows: derived.topProducts.slice(0, 12).map((product) => [
              product.productName,
              formatCurrencyBase(product.revenue, localeTag, businessCurrency),
              formatNumber(product.quantity, localeTag),
              formatCurrencyBase(product.revenue - product.cost, localeTag, businessCurrency),
            ]),
          },
        },
      }
    }

    if (selectedReport.id === 'cashier-performance') {
      const table: PreviewTable = {
        columns: [t('table.cashier'), t('table.revenue'), t('table.completed'), t('table.void_rate')],
        rows: derived.cashierRows.slice(0, 10).map((cashier) => [
          cashier.cashierName,
          formatCurrencyBase(cashier.revenue, localeTag, businessCurrency),
          formatNumber(cashier.completedSales, localeTag),
          `${formatPercent(percentageOf(cashier.voidedSales, cashier.totalSales), localeTag)}%`,
        ]),
      }

      return {
        kind: 'table',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.cashiers'),
            value: formatNumber(derived.cashierRows.length, localeTag),
            hint: t('stats.active_cashiers_hint'),
            tone: 'info',
          },
          {
            label: t('stats.top_cashier'),
            value: derived.cashierRows[0]?.cashierName || '-',
            hint: derived.cashierRows[0] ? formatCurrencyBase(derived.cashierRows[0].revenue, localeTag, businessCurrency) : t('preview.no_sales_data'),
            tone: 'positive',
          },
          {
            label: t('stats.avg_basket'),
            value: formatCurrencyCompactBase(derived.averageOrderValue, localeTag, businessCurrency),
            hint: t('stats.avg_basket_hint'),
            tone: 'default',
          },
        ],
        table,
        empty: t('preview.no_sales_data'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.cashiers'), value: formatNumber(derived.cashierRows.length, localeTag) },
            { label: t('stats.revenue'), value: formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency) },
            { label: t('stats.avg_basket'), value: formatCurrencyBase(derived.averageOrderValue, localeTag, businessCurrency) },
          ],
          table,
        },
      }
    }

    if (selectedReport.id === 'payment-breakdown') {
      const paymentRows = [
        { label: getPaymentLabel(PaymentMethod.CASH, tSell), method: PaymentMethod.CASH, tone: 'positive' as const },
        { label: getPaymentLabel(PaymentMethod.MTN_MOMO, tSell), method: PaymentMethod.MTN_MOMO, tone: 'warning' as const },
        { label: getPaymentLabel(PaymentMethod.ORANGE_MONEY, tSell), method: PaymentMethod.ORANGE_MONEY, tone: 'info' as const },
        { label: getPaymentLabel(PaymentMethod.CARD, tSell), method: PaymentMethod.CARD, tone: 'default' as const },
      ]
      const bars: BarRow[] = paymentRows.map((row) => {
        const amount = derived.paymentTotals.get(row.method) ?? 0
        return {
          label: row.label,
          valueLabel: formatCurrencyBase(amount, localeTag, businessCurrency),
          percentage: Number(percentageOf(amount, derived.totalRevenue).toFixed(1)),
          tone: row.tone,
          meta: `${formatPercent(percentageOf(amount, derived.totalRevenue), localeTag)}%`,
        }
      })
      bars.push({
        label: 'Unpaid credit',
        valueLabel: formatCurrencyBase(derived.totalCreditIssued, localeTag, businessCurrency),
        percentage: Number(percentageOf(derived.totalCreditIssued, derived.totalRevenue).toFixed(1)),
        tone: 'danger',
      })

      return {
        kind: 'bars',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.collected'),
            value: formatCurrencyCompactBase(sumNumbers(Array.from(derived.paymentTotals.values())), localeTag, businessCurrency),
            hint: t('stats.cash_in_hand_hint'),
            tone: 'positive',
          },
          {
            label: t('stats.credit_issued'),
            value: formatCurrencyCompactBase(derived.totalCreditIssued, localeTag, businessCurrency),
            hint: t('stats.unpaid_credit_hint'),
            tone: 'danger',
          },
          {
            label: t('stats.methods'),
            value: formatNumber(bars.filter((bar) => bar.percentage > 0).length, localeTag),
            hint: t('stats.methods_used_hint'),
            tone: 'info',
          },
        ],
        bars,
        empty: t('preview.no_sales_data'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.collected'), value: formatCurrencyBase(sumNumbers(Array.from(derived.paymentTotals.values())), localeTag, businessCurrency) },
            { label: t('stats.credit_issued'), value: formatCurrencyBase(derived.totalCreditIssued, localeTag, businessCurrency) },
            { label: t('stats.revenue'), value: formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency) },
          ],
          table: {
            columns: [t('table.method'), t('table.amount'), t('table.share')],
            rows: bars.map((bar) => [bar.label, bar.valueLabel, `${bar.percentage}%`]),
          },
        },
      }
    }

    if (selectedReport.id === 'voided-sales') {
      const table: PreviewTable = {
        columns: [t('table.sale_no'), t('table.time'), t('table.customer'), t('table.total'), t('table.reason')],
        rows: derived.voidedSales.slice(0, 12).map((sale) => [
          sale.sale_number || sale.receipt_number || sale.id,
          sale.sold_at ? formatDateTimeLabel(sale.sold_at, localeTag) : '-',
          sale.customer_name || t('walk_in'),
          formatCurrencyBase(sale.total_amount ?? 0, localeTag, businessCurrency),
          sale.void_reason || t('not_set'),
        ]),
      }

      return {
        kind: 'table',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.voided'),
            value: formatNumber(derived.voidedSales.length, localeTag),
            hint: t('stats.voided_sales_hint'),
            tone: 'danger',
          },
          {
            label: t('stats.voided_value'),
            value: formatCurrencyCompactBase(sumNumbers(derived.voidedSales.map((sale) => sale.total_amount ?? 0)), localeTag, businessCurrency),
            hint: t('stats.reversed_value_hint'),
            tone: 'warning',
          },
          {
            label: t('stats.price_warnings'),
            value: formatNumber(derived.voidedSales.filter((sale) => Boolean(sale.price_drift_warning)).length, localeTag),
            hint: t('stats.price_warnings_hint'),
            tone: 'default',
          },
        ],
        table,
        empty: t('preview.no_voided_sales'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.voided'), value: formatNumber(derived.voidedSales.length, localeTag) },
            { label: t('stats.voided_value'), value: formatCurrencyBase(sumNumbers(derived.voidedSales.map((sale) => sale.total_amount ?? 0)), localeTag, businessCurrency) },
          ],
          table,
        },
      }
    }

    if (selectedReport.id === 'stock-levels') {
      const table: PreviewTable = {
        columns: [t('table.product'), t('table.category'), t('table.quantity'), t('table.threshold'), t('table.reorder_point')],
        rows: derived.inventoryItems
          .slice()
          .sort((left, right) => left.quantity - right.quantity)
          .slice(0, 16)
          .map((item) => [
            item.productName || t('untitled_product'),
            item.categoryName || t('uncategorized'),
            formatNumber(item.quantity, localeTag),
            item.lowStockThreshold !== null ? formatNumber(item.lowStockThreshold, localeTag) : t('not_set'),
            item.reorderPoint !== null ? formatNumber(item.reorderPoint, localeTag) : t('not_set'),
          ]),
      }

      return {
        kind: 'table',
        title: selectedReport.name,
        description: `${selectedReport.description}`,
        stats: [
          {
            label: t('stats.tracked_products'),
            value: formatNumber(derived.inventoryItems.length, localeTag),
            hint: t('stats.tracked_products_hint'),
            tone: 'info',
          },
          {
            label: t('stats.low_stock'),
            value: formatNumber(derived.lowStockItems.length, localeTag),
            hint: t('stats.low_stock_hint'),
            tone: 'warning',
          },
          {
            label: t('stats.out_of_stock'),
            value: formatNumber(derived.inventoryItems.filter((item) => item.quantity <= 0).length, localeTag),
            hint: t('stats.out_of_stock_hint'),
            tone: 'danger',
          },
        ],
        table,
        empty: t('preview.no_inventory_data'),
        exportModel: {
          title: selectedReport.name,
          description: selectedReport.description,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.tracked_products'), value: formatNumber(derived.inventoryItems.length, localeTag) },
            { label: t('stats.low_stock'), value: formatNumber(derived.lowStockItems.length, localeTag) },
            { label: t('stats.out_of_stock'), value: formatNumber(derived.inventoryItems.filter((item) => item.quantity <= 0).length, localeTag) },
          ],
          table,
        },
      }
    }

    if (selectedReport.id === 'stock-movements') {
      return {
        kind: 'ranked',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.movements'),
            value: formatNumber(derived.inventoryMovements.length, localeTag),
            hint: t('stats.movements_hint'),
            tone: 'info',
          },
          {
            label: t('stats.movement_types'),
            value: formatNumber(derived.movementRows.length, localeTag),
            hint: t('stats.movement_types_hint'),
            tone: 'default',
          },
          {
            label: t('stats.low_stock'),
            value: formatNumber(derived.lowStockItems.length, localeTag),
            hint: t('stats.current_alerts_hint'),
            tone: 'warning',
          },
        ],
        rows: derived.movementRows.map((row) => ({
          label: row.label,
          valueLabel: `${formatNumber(row.count, localeTag)} ${t('stats.events_hint')}`,
          meta: `${formatNumber(row.quantity, localeTag)} ${t('stats.units_moved_hint')}`,
          tone: 'info',
        })),
        empty: t('preview.no_movement_data'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.movements'), value: formatNumber(derived.inventoryMovements.length, localeTag) },
            { label: t('stats.movement_types'), value: formatNumber(derived.movementRows.length, localeTag) },
          ],
          table: {
            columns: [t('table.type'), t('table.events'), t('table.quantity')],
            rows: derived.movementRows.map((row) => [
              row.label,
              formatNumber(row.count, localeTag),
              formatNumber(row.quantity, localeTag),
            ]),
          },
        },
      }
    }

    if (selectedReport.id === 'low-stock-alerts') {
      const rows = derived.lowStockItems.slice(0, 12).map((item) => {
        const shortfall = (item.lowStockThreshold ?? 0) - item.quantity
        return {
          label: item.productName || t('untitled_product'),
          valueLabel: `${formatNumber(item.quantity, localeTag)} ${t('stats.units_left_hint')}`,
          meta: `${t('table.threshold')}: ${item.lowStockThreshold ?? 0} · ${t('stats.shortfall_hint')}: ${formatNumber(shortfall, localeTag)}`,
          tone: shortfall > 0 ? ('danger' as const) : ('warning' as const),
        }
      })

      return {
        kind: 'ranked',
        title: selectedReport.name,
        description: selectedReport.description,
        stats: [
          {
            label: t('stats.alerts'),
            value: formatNumber(derived.lowStockItems.length, localeTag),
            hint: t('stats.current_alerts_hint'),
            tone: 'danger',
          },
          {
            label: t('stats.tracked_products'),
            value: formatNumber(derived.inventoryItems.length, localeTag),
            hint: t('stats.tracked_products_hint'),
            tone: 'info',
          },
          {
            label: t('stats.out_of_stock'),
            value: formatNumber(derived.inventoryItems.filter((item) => item.quantity <= 0).length, localeTag),
            hint: t('stats.out_of_stock_hint'),
            tone: 'warning',
          },
        ],
        rows,
        empty: t('preview.no_low_stock_alerts'),
        exportModel: {
          title: selectedReport.name,
          description: selectedReport.description,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.alerts'), value: formatNumber(derived.lowStockItems.length, localeTag) },
            { label: t('stats.out_of_stock'), value: formatNumber(derived.inventoryItems.filter((item) => item.quantity <= 0).length, localeTag) },
          ],
          table: {
            columns: [t('table.product'), t('table.quantity'), t('table.threshold'), t('table.shortfall')],
            rows: derived.lowStockItems.slice(0, 20).map((item) => [
              item.productName || t('untitled_product'),
              formatNumber(item.quantity, localeTag),
              formatNumber(item.lowStockThreshold ?? 0, localeTag),
              formatNumber((item.lowStockThreshold ?? 0) - item.quantity, localeTag),
            ]),
          },
        },
      }
    }

    if (selectedReport.id === 'restock-costs') {
      const table: PreviewTable = {
        columns: [t('table.reference'), t('table.supplier'), t('table.total_cost'), t('table.paid'), t('table.credit')],
        rows: derived.restocks.slice(0, 14).map((restock) => [
          restock.reference_number || restock.id,
          restock.supplier_name || t('not_set'),
          formatCurrencyBase(restock.total_cost ?? restock.total_amount ?? 0, localeTag, businessCurrency),
          formatCurrencyBase(restock.amount_paid ?? 0, localeTag, businessCurrency),
          formatCurrencyBase(restock.credit_amount ?? 0, localeTag, businessCurrency),
        ]),
      }

      return {
        kind: 'table',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.restocks'),
            value: formatNumber(derived.restocks.length, localeTag),
            hint: t('stats.restocks_hint'),
            tone: 'info',
          },
          {
            label: t('stats.total_cost'),
            value: formatCurrencyCompactBase(sumNumbers(derived.restocks.map((restock) => restock.total_cost ?? restock.total_amount ?? 0)), localeTag, businessCurrency),
            hint: t('stats.stock_investment_hint'),
            tone: 'warning',
          },
          {
            label: t('stats.credit_issued'),
            value: formatCurrencyCompactBase(sumNumbers(derived.restocks.map((restock) => restock.credit_amount ?? 0)), localeTag, businessCurrency),
            hint: t('stats.supplier_credit_hint'),
            tone: 'danger',
          },
        ],
        table,
        empty: t('preview.no_restock_data'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.restocks'), value: formatNumber(derived.restocks.length, localeTag) },
            { label: t('stats.total_cost'), value: formatCurrencyBase(sumNumbers(derived.restocks.map((restock) => restock.total_cost ?? restock.total_amount ?? 0)), localeTag, businessCurrency) },
          ],
          table,
        },
      }
    }

    if (selectedReport.id === 'profit-loss') {
      return {
        kind: 'bars',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.revenue'),
            value: formatCurrencyCompactBase(derived.totalRevenue, localeTag, businessCurrency),
            hint: t('stats.topline_hint'),
            tone: 'positive',
          },
          {
            label: t('stats.expenses'),
            value: formatCurrencyCompactBase(derived.totalExpenses, localeTag, businessCurrency),
            hint: t('stats.total_expense_hint'),
            tone: 'warning',
          },
          {
            label: t('stats.net_profit'),
            value: formatCurrencyCompactBase(derived.netProfit, localeTag, businessCurrency),
            hint: `${formatPercent(percentageOf(derived.netProfit, derived.totalRevenue), localeTag)}% ${t('stats.net_margin_hint')}`,
            tone: derived.netProfit >= 0 ? 'positive' : 'danger',
          },
        ],
        bars: pnlRows.map((row) => ({
          label: row.label,
          valueLabel: formatCurrencyBase(row.value, localeTag, businessCurrency),
          percentage: row.percent,
          tone: row.tone,
        })),
        empty: t('preview.no_sales_data'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.revenue'), value: formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency) },
            { label: t('stats.cogs'), value: formatCurrencyBase(derived.totalCost, localeTag, businessCurrency) },
            { label: t('stats.expenses'), value: formatCurrencyBase(derived.totalExpenses, localeTag, businessCurrency) },
            { label: t('stats.net_profit'), value: formatCurrencyBase(derived.netProfit, localeTag, businessCurrency) },
          ],
          table: {
            columns: [t('table.line_item'), t('table.amount')],
            rows: pnlRows.map((row) => [row.label, formatCurrencyBase(row.value, localeTag, businessCurrency)]),
          },
        },
      }
    }

    if (selectedReport.id === 'expense-breakdown') {
      const bars = derived.expenseCategoryRows.map((row) => ({
        label: row.name,
        valueLabel: formatCurrencyBase(row.amount, localeTag, businessCurrency),
        percentage: Number(percentageOf(row.amount, derived.totalExpenses).toFixed(1)),
        tone: row.recurringAmount > 0 ? ('warning' as const) : ('default' as const),
        meta: `${formatNumber(row.count, localeTag)} ${t('stats.entries_hint')} · ${formatCurrencyBase(row.recurringAmount, localeTag, businessCurrency)} ${t('stats.recurring_hint')}`,
      }))

      return {
        kind: 'bars',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.expenses'),
            value: formatCurrencyCompactBase(derived.totalExpenses, localeTag, businessCurrency),
            hint: `${formatNumber(derived.expenses.length, localeTag)} ${t('stats.entries_hint')}`,
            tone: 'warning',
          },
          {
            label: t('stats.recurring'),
            value: formatCurrencyCompactBase(sumNumbers(derived.expenses.filter((expense) => expense.isRecurring).map((expense) => expense.amount)), localeTag, businessCurrency),
            hint: t('stats.recurring_expenses_hint'),
            tone: 'info',
          },
          {
            label: t('stats.categories'),
            value: formatNumber(derived.expenseCategoryRows.length, localeTag),
            hint: t('stats.categories_hint'),
            tone: 'default',
          },
        ],
        bars,
        empty: t('preview.no_expense_data'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.expenses'), value: formatCurrencyBase(derived.totalExpenses, localeTag, businessCurrency) },
            { label: t('stats.categories'), value: formatNumber(derived.expenseCategoryRows.length, localeTag) },
          ],
          table: {
            columns: [t('table.category'), t('table.amount'), t('table.share')],
            rows: derived.expenseCategoryRows.map((row) => [
              row.name,
              formatCurrencyBase(row.amount, localeTag, businessCurrency),
              `${formatPercent(percentageOf(row.amount, derived.totalExpenses), localeTag)}%`,
            ]),
          },
        },
      }
    }

    if (selectedReport.id === 'revenue-vs-expenses') {
      const points = buildRevenueVsExpensesPoints(derived.completedSales, derived.expenses, localeTag)

      return {
        kind: 'trend',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.revenue'),
            value: formatCurrencyCompactBase(derived.totalRevenue, localeTag, businessCurrency),
            hint: t('stats.topline_hint'),
            tone: 'positive',
          },
          {
            label: t('stats.expenses'),
            value: formatCurrencyCompactBase(derived.totalExpenses, localeTag, businessCurrency),
            hint: t('stats.total_expense_hint'),
            tone: 'warning',
          },
          {
            label: t('stats.net_profit'),
            value: formatCurrencyCompactBase(derived.netProfit, localeTag, businessCurrency),
            hint: t('stats.range_result_hint'),
            tone: derived.netProfit >= 0 ? 'positive' : 'danger',
          },
        ],
        legend: {
          primary: t('preview.legend_revenue'),
          secondary: t('preview.legend_expenses'),
        },
        points,
        primaryMaxLabel: formatCurrencyCompactBase(Math.max(...points.map((point) => point.primary), 0), localeTag, businessCurrency),
        secondaryMaxLabel: formatCurrencyCompactBase(Math.max(...points.map((point) => point.secondary), 0), localeTag, businessCurrency),
        empty: t('preview.no_expense_data'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.revenue'), value: formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency) },
            { label: t('stats.expenses'), value: formatCurrencyBase(derived.totalExpenses, localeTag, businessCurrency) },
            { label: t('stats.net_profit'), value: formatCurrencyBase(derived.netProfit, localeTag, businessCurrency) },
          ],
          table: {
            columns: [t('table.period'), t('preview.legend_revenue'), t('preview.legend_expenses')],
            rows: points.map((point) => [
              point.label,
              formatCurrencyBase(point.primary, localeTag, businessCurrency),
              formatCurrencyBase(point.secondary, localeTag, businessCurrency),
            ]),
          },
        },
      }
    }

    if (selectedReport.id === 'debtors-ageing' || selectedReport.id === 'creditors-ageing') {
      const isReceivable = selectedReport.id === 'debtors-ageing'
      const ageingRows = isReceivable ? derived.receivableAgeing : derived.payableAgeing
      const openRows = (isReceivable ? derived.openReceivableDebts : derived.openPayableDebts).slice(0, 12)
      const totalOutstanding = sumNumbers(openRows.map((debt) => debt.outstandingAmount))
      const bars = ageingRows.map((row) => ({
        label: row.label,
        valueLabel: formatCurrencyBase(row.amount, localeTag, businessCurrency),
        percentage: row.percentage,
        tone: row.label === '30+ days' ? ('danger' as const) : row.label === '16-30 days' ? ('warning' as const) : ('info' as const),
        meta: `${formatNumber(row.count, localeTag)} ${t('stats.balances_hint')}`,
      }))

      return {
        kind: 'bars',
        title: selectedReport.name,
        description: selectedReport.description,
        stats: [
          {
            label: t('stats.open_balances'),
            value: formatNumber(openRows.length, localeTag),
            hint: t('stats.open_balances_hint'),
            tone: 'info',
          },
          {
            label: t('stats.outstanding'),
            value: formatCurrencyCompactBase(totalOutstanding, localeTag, businessCurrency),
            hint: t('stats.current_exposure_hint'),
            tone: isReceivable ? 'danger' : 'warning',
          },
          {
            label: t('stats.oldest_bucket'),
            value: formatCurrencyCompactBase(ageingRows[3]?.amount ?? 0, localeTag, businessCurrency),
            hint: t('stats.oldest_bucket_hint'),
            tone: 'danger',
          },
        ],
        bars,
        empty: t('preview.no_debt_data'),
        exportModel: {
          title: selectedReport.name,
          description: selectedReport.description,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.open_balances'), value: formatNumber(openRows.length, localeTag) },
            { label: t('stats.outstanding'), value: formatCurrencyBase(totalOutstanding, localeTag, businessCurrency) },
          ],
          table: {
            columns: [t('table.bucket'), t('table.amount'), t('table.count')],
            rows: ageingRows.map((row) => [
              row.label,
              formatCurrencyBase(row.amount, localeTag, businessCurrency),
              formatNumber(row.count, localeTag),
            ]),
          },
        },
      }
    }

    if (selectedReport.id === 'contact-statement') {
      const topContacts = derived.contactBalanceRows.slice(0, 12)
      const note = t('preview.contact_statement_note')

      return {
        kind: 'note',
        title: selectedReport.name,
        description: selectedReport.description,
        stats: [
          {
            label: t('stats.contacts'),
            value: formatNumber(topContacts.length, localeTag),
            hint: t('stats.contacts_with_balances_hint'),
            tone: 'info',
          },
          {
            label: t('stats.receivables'),
            value: formatCurrencyCompactBase(sumNumbers(derived.openReceivableDebts.map((debt) => debt.outstandingAmount)), localeTag, businessCurrency),
            hint: t('stats.customer_balances_hint'),
            tone: 'positive',
          },
          {
            label: t('stats.payables'),
            value: formatCurrencyCompactBase(sumNumbers(derived.openPayableDebts.map((debt) => debt.outstandingAmount)), localeTag, businessCurrency),
            hint: t('stats.supplier_balances_hint'),
            tone: 'warning',
          },
        ],
        note,
        bullets: topContacts.slice(0, 5).map((contact) => `${contact.contactName} · ${contact.direction === DebtDirection.RECEIVABLE ? 'Receivable' : 'Payable'} · ${formatCurrencyBase(contact.balance, localeTag, businessCurrency)} · ${contact.reference}`),
        exportModel: {
          title: selectedReport.name,
          description: selectedReport.description,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.contacts'), value: formatNumber(topContacts.length, localeTag) },
            { label: t('stats.receivables'), value: formatCurrencyBase(sumNumbers(derived.openReceivableDebts.map((debt) => debt.outstandingAmount)), localeTag, businessCurrency) },
            { label: t('stats.payables'), value: formatCurrencyBase(sumNumbers(derived.openPayableDebts.map((debt) => debt.outstandingAmount)), localeTag, businessCurrency) },
          ],
          table: {
            columns: [t('table.contact'), t('table.direction'), t('table.balance'), t('table.reference')],
            rows: topContacts.map((contact) => [
              contact.contactName,
              contact.direction === DebtDirection.RECEIVABLE ? 'Receivable' : 'Payable',
              formatCurrencyBase(contact.balance, localeTag, businessCurrency),
              contact.reference,
            ]),
          },
        },
      }
    }

    const bars = [
      {
        label: t('stats.credit_issued'),
        valueLabel: formatCurrencyBase(derived.issuedReceivable, localeTag, businessCurrency),
        percentage: Number(percentageOf(derived.issuedReceivable, Math.max(derived.issuedReceivable, derived.collectedReceivable, derived.writtenOffReceivable, 1)).toFixed(1)),
        tone: 'warning' as const,
      },
      {
        label: t('stats.collected'),
        valueLabel: formatCurrencyBase(derived.collectedReceivable, localeTag, businessCurrency),
        percentage: Number(percentageOf(derived.collectedReceivable, Math.max(derived.issuedReceivable, derived.collectedReceivable, derived.writtenOffReceivable, 1)).toFixed(1)),
        tone: 'positive' as const,
      },
      {
        label: t('stats.written_off'),
        valueLabel: formatCurrencyBase(derived.writtenOffReceivable, localeTag, businessCurrency),
        percentage: Number(percentageOf(derived.writtenOffReceivable, Math.max(derived.issuedReceivable, derived.collectedReceivable, derived.writtenOffReceivable, 1)).toFixed(1)),
        tone: 'danger' as const,
      },
    ]

    return {
      kind: 'bars',
      title: selectedReport.name,
      description: `${selectedReport.description} Range: ${rangeLabel}.`,
      stats: [
        {
          label: t('stats.credit_issued'),
          value: formatCurrencyCompactBase(derived.issuedReceivable, localeTag, businessCurrency),
          hint: t('stats.new_credit_hint'),
          tone: 'warning',
        },
        {
          label: t('stats.collected'),
          value: formatCurrencyCompactBase(derived.collectedReceivable, localeTag, businessCurrency),
          hint: t('stats.collection_hint'),
          tone: 'positive',
        },
        {
          label: t('stats.written_off'),
          value: formatCurrencyCompactBase(derived.writtenOffReceivable, localeTag, businessCurrency),
          hint: t('stats.write_off_hint'),
          tone: 'danger',
        },
      ],
      bars,
      empty: t('preview.no_debt_data'),
      exportModel: {
        title: selectedReport.name,
        description: `${selectedReport.description} (${rangeLabel})`,
        filenameBase: exportBase,
        summaryRows: [
          { label: t('stats.credit_issued'), value: formatCurrencyBase(derived.issuedReceivable, localeTag, businessCurrency) },
          { label: t('stats.collected'), value: formatCurrencyBase(derived.collectedReceivable, localeTag, businessCurrency) },
          { label: t('stats.written_off'), value: formatCurrencyBase(derived.writtenOffReceivable, localeTag, businessCurrency) },
        ],
        table: {
          columns: [t('table.metric'), t('table.amount')],
          rows: bars.map((bar) => [bar.label, bar.valueLabel]),
        },
      },
    }
  }, [appliedRange, derived, localeTag, pnlRows, selectedReport, t, tSell])

  const rangeLabel = useMemo(
    () => buildRangeLabel(appliedRange.startDate, appliedRange.endDate, localeTag),
    [appliedRange.endDate, appliedRange.startDate, localeTag],
  )

  const previewGeneratedLabel = useMemo(
    () => formatDateTimeLabel(previewGeneratedAt ?? new Date().toISOString(), localeTag),
    [localeTag, previewGeneratedAt],
  )

  const activeReportDocument = useMemo<ReportTemplateDocument | null>(() => {
    const fallbackBusinessName = businessName || 'BizTrack Business'
    const filenameBase = reportViewModel.exportModel.filenameBase
    const saleById = new Map(derived.sales.map((sale) => [sale.id, sale]))
    const inventoryByProductId = new Map(
      derived.inventoryItems.map((item) => [item.productId, item]),
    )
    const restockItemsByRestockId = new Map<string, typeof derived.restockItems>()
    const latestUnitCostByProductId = new Map<string, number>()

    for (const item of derived.restockItems) {
      const current = restockItemsByRestockId.get(item.restock_record_id) ?? []
      current.push(item)
      restockItemsByRestockId.set(item.restock_record_id, current)

      if (item.unit_cost !== null && item.unit_cost !== undefined) {
        if (!latestUnitCostByProductId.has(item.product_id)) {
          latestUnitCostByProductId.set(item.product_id, item.unit_cost)
        }
      }
    }

    if (selectedReport.id === 'profit-loss') {
      const recurringMap = new Map<string, number>()
      const oneOffMap = new Map<string, number>()

      for (const expense of derived.expenses) {
        const key = expense.category?.name || t('uncategorized')
        const target = expense.isRecurring ? recurringMap : oneOffMap
        target.set(key, (target.get(key) ?? 0) + expense.amount)
      }

      const toExpenseGroup = (
        title: string,
        source: Map<string, number>,
        subtotalLabel: string,
      ) => {
        const entries = Array.from(source.entries())
          .sort((left, right) => right[1] - left[1])
          .map(([label, amount]) => ({
            label,
            amount: formatCurrencyBase(amount, localeTag, businessCurrency),
            share: `${formatPercent(percentageOf(amount, derived.totalRevenue), localeTag)}%`,
          }))

        const subtotal = sumNumbers(entries.map((entry) => {
          const raw = source.get(entry.label)
          return raw ?? 0
        }))

        return {
          title,
          rows: entries,
          subtotalLabel,
          subtotalAmount: formatCurrencyBase(subtotal, localeTag, businessCurrency),
          subtotalShare: `${formatPercent(percentageOf(subtotal, derived.totalRevenue), localeTag)}%`,
        }
      }

      const recurringGroup = toExpenseGroup('Recurring expenses', recurringMap, 'Subtotal recurring')
      const oneOffGroup = toExpenseGroup('One-off expenses', oneOffMap, 'Subtotal one-off')
      const netResultAmount =
        derived.netProfit < 0
          ? `-${formatCurrencyBase(Math.abs(derived.netProfit), localeTag, businessCurrency)}`
          : formatCurrencyBase(derived.netProfit, localeTag, businessCurrency)

      return buildProfitLossReportTemplate({
        businessName: fallbackBusinessName,
        reportLabel: 'Financial statement',
        title: selectedReport.name,
        description: selectedReport.description,
        rangeLabel,
        generatedLabel: previewGeneratedLabel,
        filenameBase,
        meta: [
          { label: 'Period', value: rangeLabel },
          {
            label: 'Transactions',
            value: formatNumber(derived.completedSales.length, localeTag),
          },
          {
            label: 'Expense categories',
            value: formatNumber(derived.expenseCategoryRows.length, localeTag),
          },
          { label: 'Currency', value: businessCurrency, tone: 'info' },
        ],
        summaryRows: reportViewModel.exportModel.summaryRows,
        excelSections: [
          {
            title: 'Profit and loss',
            columns: ['Line item', 'Amount', 'Share'],
            rows: [
              ['Completed sales revenue', formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency), '100.0%'],
              [
                'Cost of goods sold',
                formatCurrencyBase(derived.totalCost, localeTag, businessCurrency),
                `${formatPercent(percentageOf(derived.totalCost, derived.totalRevenue), localeTag)}%`,
              ],
              [
                'Gross profit',
                formatCurrencyBase(derived.grossProfit, localeTag, businessCurrency),
                `${formatPercent(percentageOf(derived.grossProfit, derived.totalRevenue), localeTag)}%`,
              ],
              [
                'Operating expenses',
                formatCurrencyBase(derived.totalExpenses, localeTag, businessCurrency),
                `${formatPercent(percentageOf(derived.totalExpenses, derived.totalRevenue), localeTag)}%`,
              ],
              [
                derived.netProfit >= 0 ? 'Net profit' : 'Net loss',
                netResultAmount,
                `${formatPercent(percentageOf(derived.netProfit, derived.totalRevenue), localeTag)}%`,
              ],
            ],
          },
          {
            title: 'Expense breakdown',
            columns: ['Category', 'Amount', 'Share'],
            rows: derived.expenseCategoryRows.map((row) => [
              row.name,
              formatCurrencyBase(row.amount, localeTag, businessCurrency),
              `${formatPercent(percentageOf(row.amount, derived.totalRevenue), localeTag)}%`,
            ]),
          },
        ],
        stats: [
          {
            label: t('stats.revenue'),
            value: formatCurrencyCompactBase(derived.totalRevenue, localeTag, businessCurrency),
            hint: t('stats.topline_hint'),
            tone: 'success',
          },
          {
            label: t('stats.gross_profit'),
            value: formatCurrencyCompactBase(derived.grossProfit, localeTag, businessCurrency),
            hint: `${formatPercent(percentageOf(derived.grossProfit, derived.totalRevenue), localeTag)}% ${t(
              'stats.margin_hint',
            )}`,
            tone: derived.grossProfit >= 0 ? 'info' : 'danger',
          },
          {
            label: t('stats.expenses'),
            value: formatCurrencyCompactBase(derived.totalExpenses, localeTag, businessCurrency),
            hint: t('stats.total_expense_hint'),
            tone: 'warning',
          },
          {
            label: t('stats.net_profit'),
            value: formatCurrencyCompactBase(derived.netProfit, localeTag, businessCurrency),
            hint: `${formatPercent(percentageOf(derived.netProfit, derived.totalRevenue), localeTag)}% ${t(
              'stats.net_margin_hint',
            )}`,
            tone: derived.netProfit >= 0 ? 'success' : 'danger',
          },
        ],
        revenueRows: [
          {
            label: 'Completed sales revenue',
            amount: formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency),
            share: '100.0%',
          },
        ],
        cogsRows: [
          {
            label: 'Cost of goods sold',
            amount: formatCurrencyBase(derived.totalCost, localeTag, businessCurrency),
            share: `${formatPercent(percentageOf(derived.totalCost, derived.totalRevenue), localeTag)}%`,
          },
        ],
        recurringGroup,
        oneOffGroup,
        grossProfit: {
          amount: formatCurrencyBase(derived.grossProfit, localeTag, businessCurrency),
          share: `${formatPercent(percentageOf(derived.grossProfit, derived.totalRevenue), localeTag)}%`,
          positive: derived.grossProfit >= 0,
        },
        totalExpenses: {
          amount: formatCurrencyBase(derived.totalExpenses, localeTag, businessCurrency),
          share: `${formatPercent(percentageOf(derived.totalExpenses, derived.totalRevenue), localeTag)}%`,
        },
        netResult: {
          label: derived.netProfit >= 0 ? 'Net profit for the period' : 'Net loss for the period',
          amount: netResultAmount,
          share: `${formatPercent(percentageOf(derived.netProfit, derived.totalRevenue), localeTag)}%`,
          positive: derived.netProfit >= 0,
        },
        notes: [
          'Revenue is based on completed sales in the selected range.',
          'Gross profit is calculated from cost snapshots stored on sale items.',
          'Operating expenses come from booked expenses on this device for the same period.',
        ],
      })
    }

    if (selectedReport.id === 'revenue-trend') {
      const highestRevenue = Math.max(...revenueAnalysisRows.map((row) => row.revenue), 0)
      const lowestRevenue =
        revenueAnalysisRows.length > 0
          ? Math.min(...revenueAnalysisRows.map((row) => row.revenue))
          : 0
      const paymentTotalBase = Math.max(derived.totalRevenue, 1)

      const detailTable: TemplateSection = {
        columns: ['Period', 'Group', 'Revenue', 'COGS', 'Gross profit', 'Margin', 'Transactions', 'Avg basket', 'Note'],
        rows: revenueAnalysisRows.map((row) => [
          row.label,
          row.secondaryLabel,
          formatCurrencyBase(row.revenue, localeTag, businessCurrency),
          formatCurrencyBase(row.cost, localeTag, businessCurrency),
          formatCurrencyBase(row.grossProfit, localeTag, businessCurrency),
          `${formatPercent(row.marginPercent, localeTag)}%`,
          formatNumber(row.transactions, localeTag),
          formatCurrencyBase(row.averageBasket, localeTag, businessCurrency),
          row.revenue === highestRevenue
            ? 'Peak period'
            : row.revenue === lowestRevenue
              ? 'Softest period'
              : '-',
        ]),
      }

      return buildRevenueTrendReportTemplate({
        businessName: fallbackBusinessName,
        reportLabel: 'Sales analysis',
        title: selectedReport.name,
        description: selectedReport.description,
        rangeLabel,
        generatedLabel: previewGeneratedLabel,
        filenameBase,
        meta: [
          { label: 'Period', value: rangeLabel },
          {
            label: 'Trading buckets',
            value: formatNumber(revenueAnalysisRows.length, localeTag),
          },
          {
            label: 'Transactions',
            value: formatNumber(derived.completedSales.length, localeTag),
          },
          { label: 'Currency', value: businessCurrency, tone: 'info' },
        ],
        summaryRows: reportViewModel.exportModel.summaryRows,
        excelSections: [
          detailTable,
          {
            title: 'Payment mix',
            columns: ['Method', 'Amount', 'Share'],
            rows: revenuePaymentRows.map((row) => [
              row.label,
              formatCurrencyBase(row.amount, localeTag, businessCurrency),
              `${formatPercent(percentageOf(row.amount, paymentTotalBase), localeTag)}%`,
            ]),
          },
        ],
        stats: [
          {
            label: t('stats.revenue'),
            value: formatCurrencyCompactBase(derived.totalRevenue, localeTag, businessCurrency),
            hint: `${formatNumber(derived.completedSales.length, localeTag)} ${t(
              'stats.transactions_hint',
            )}`,
            tone: 'success',
          },
          {
            label: t('stats.gross_profit'),
            value: formatCurrencyCompactBase(derived.grossProfit, localeTag, businessCurrency),
            hint: `${formatPercent(percentageOf(derived.grossProfit, derived.totalRevenue), localeTag)}% ${t(
              'stats.margin_hint',
            )}`,
            tone: derived.grossProfit >= 0 ? 'info' : 'danger',
          },
          {
            label: t('stats.avg_basket'),
            value: formatCurrencyCompactBase(derived.averageOrderValue, localeTag, businessCurrency),
            hint: t('stats.avg_basket_hint'),
            tone: 'default',
          },
          {
            label: t('stats.transactions'),
            value: formatNumber(derived.completedSales.length, localeTag),
            hint: 'completed sales in range',
            tone: 'info',
          },
        ],
        chartPoints: revenueAnalysisRows.map((row) => ({
          label: row.label,
          revenue: row.revenue,
          grossProfit: row.grossProfit,
          transactions: row.transactions,
        })),
        table: detailTable,
        paymentRows: revenuePaymentRows.map((row) => ({
          label: row.label,
          amount: formatCurrencyBase(row.amount, localeTag, businessCurrency),
          share: `${formatPercent(percentageOf(row.amount, paymentTotalBase), localeTag)}% of revenue`,
          percent: Number(percentageOf(row.amount, paymentTotalBase).toFixed(1)),
          tone: row.tone,
        })),
        notes: [
          'Revenue excludes voided sales and is grouped by the current report range.',
          'Gross profit uses cost snapshots stored on sale items at the time of sale.',
          'Credit issued is part of revenue, but unpaid credit is not part of collected cash.',
        ],
      })
    }

    if (selectedReport.id === 'stock-levels') {
      const stockRows = derived.inventoryItems
        .slice()
        .sort((left, right) => left.quantity - right.quantity)
        .map((item) => {
          const threshold = item.lowStockThreshold ?? 0
          const shortfall = threshold > item.quantity ? threshold - item.quantity : 0
          const statusTone: TemplateTone =
            item.quantity <= 0
              ? 'danger'
              : item.isLowStock
                ? 'warning'
                : 'success'

          return {
            product: item.productName || t('untitled_product'),
            sku: item.sku || '-',
            category: item.categoryName || t('uncategorized'),
            quantity: formatNumber(item.quantity, localeTag),
            threshold:
              item.lowStockThreshold !== null
                ? formatNumber(item.lowStockThreshold, localeTag)
                : t('not_set'),
            reorderPoint:
              item.reorderPoint !== null
                ? formatNumber(item.reorderPoint, localeTag)
                : t('not_set'),
            shortfall: shortfall > 0 ? formatNumber(shortfall, localeTag) : '-',
            statusLabel:
              statusTone === 'danger'
                ? 'Critical'
                : statusTone === 'warning'
                  ? 'Low stock'
                  : 'Healthy',
            statusTone,
          }
        })

      return buildStockLevelsReportTemplate({
        businessName: fallbackBusinessName,
        reportLabel: 'Inventory snapshot',
        title: selectedReport.name,
        description: selectedReport.description,
        rangeLabel,
        generatedLabel: previewGeneratedLabel,
        filenameBase,
        meta: [
          {
            label: 'Tracked products',
            value: formatNumber(derived.inventoryItems.length, localeTag),
          },
          {
            label: 'Low stock',
            value: formatNumber(derived.lowStockItems.length, localeTag),
            tone: 'warning',
          },
          {
            label: 'Out of stock',
            value: formatNumber(
              derived.inventoryItems.filter((item) => item.quantity <= 0).length,
              localeTag,
            ),
            tone: 'danger',
          },
          { label: 'Range', value: rangeLabel },
        ],
        summaryRows: reportViewModel.exportModel.summaryRows,
        excelSections: [
          {
            title: 'Stock levels',
            columns: ['Product', 'SKU', 'Category', 'In stock', 'Threshold', 'Reorder point', 'Shortfall', 'Status'],
            rows: stockRows.map((row) => [
              row.product,
              row.sku,
              row.category,
              row.quantity,
              row.threshold,
              row.reorderPoint,
              row.shortfall,
              row.statusLabel,
            ]),
          },
        ],
        stats: [
          {
            label: t('stats.tracked_products'),
            value: formatNumber(derived.inventoryItems.length, localeTag),
            hint: t('stats.tracked_products_hint'),
            tone: 'info',
          },
          {
            label: t('stats.low_stock'),
            value: formatNumber(derived.lowStockItems.length, localeTag),
            hint: t('stats.low_stock_hint'),
            tone: 'warning',
          },
          {
            label: t('stats.out_of_stock'),
            value: formatNumber(
              derived.inventoryItems.filter((item) => item.quantity <= 0).length,
              localeTag,
            ),
            hint: t('stats.out_of_stock_hint'),
            tone: 'danger',
          },
          {
            label: t('table.quantity'),
            value: formatNumber(
              sumNumbers(derived.inventoryItems.map((item) => item.quantity)),
              localeTag,
            ),
            hint: 'units currently on hand',
            tone: 'success',
          },
        ],
        rows: stockRows,
        notes: [
          'This report uses the current inventory snapshot available on this device.',
          'Shortfall is shown only when quantity is below the configured threshold.',
          'Reorder point is informational and does not create purchase orders automatically.',
        ],
      })
    }

    if (selectedReport.id === 'debtors-ageing') {
      const openDebts = derived.openReceivableDebts
      const totalOutstanding = sumNumbers(openDebts.map((debt) => debt.outstandingAmount))
      const overdueCount = openDebts.filter((debt) => getAgeDays(debt.createdAt) > 30).length
      const collectionRate = percentageOf(
        derived.collectedReceivable,
        Math.max(derived.issuedReceivable, 1),
      )

      return buildDebtorsAgeingReportTemplate({
        businessName: fallbackBusinessName,
        reportLabel: 'Credit management',
        title: selectedReport.name,
        description: selectedReport.description,
        rangeLabel,
        generatedLabel: previewGeneratedLabel,
        filenameBase,
        meta: [
          {
            label: 'Total outstanding',
            value: formatCurrencyBase(totalOutstanding, localeTag, businessCurrency),
            tone: 'danger',
          },
          {
            label: 'Active debtors',
            value: formatNumber(openDebts.length, localeTag),
          },
          {
            label: 'Overdue',
            value: formatNumber(overdueCount, localeTag),
            tone: 'danger',
          },
          {
            label: 'Collection rate',
            value: `${formatPercent(collectionRate, localeTag)}%`,
            tone: 'success',
          },
        ],
        summaryRows: reportViewModel.exportModel.summaryRows,
        excelSections: [
          {
            title: 'Ageing buckets',
            columns: ['Bucket', 'Amount', 'Count', 'Share'],
            rows: derived.receivableAgeing.map((row) => [
              row.label,
              formatCurrencyBase(row.amount, localeTag, businessCurrency),
              formatNumber(row.count, localeTag),
              `${formatPercent(row.percentage, localeTag)}%`,
            ]),
          },
          {
            title: 'Receivables detail',
            columns: ['Customer', 'Reference', 'Sale date', 'Age', 'Original', 'Paid', 'Outstanding', 'Status', 'Collected'],
            rows: openDebts.map((debt) => {
              const ageDays = getAgeDays(debt.createdAt)
              return [
                debt.contact?.name || debt.sourceReference,
                debt.sourceReference,
                formatDateLabel(debt.createdAt.slice(0, 10), localeTag),
                `${ageDays}d`,
                formatCurrencyBase(debt.originalAmount, localeTag, businessCurrency),
                formatCurrencyBase(debt.paidAmount, localeTag, businessCurrency),
                formatCurrencyBase(debt.outstandingAmount, localeTag, businessCurrency),
                ageDays > 30
                  ? 'Overdue'
                  : debt.status === DebtStatus.PARTIALLY_PAID
                    ? 'Partial'
                    : 'Outstanding',
                `${formatPercent(percentageOf(debt.paidAmount, debt.originalAmount), localeTag)}%`,
              ]
            }),
          },
        ],
        stats: [
          {
            label: t('stats.open_balances'),
            value: formatNumber(openDebts.length, localeTag),
            hint: t('stats.open_balances_hint'),
            tone: 'info',
          },
          {
            label: t('stats.outstanding'),
            value: formatCurrencyCompactBase(totalOutstanding, localeTag, businessCurrency),
            hint: t('stats.current_exposure_hint'),
            tone: 'danger',
          },
          {
            label: t('stats.oldest_bucket'),
            value: formatCurrencyCompactBase(derived.receivableAgeing[3]?.amount ?? 0, localeTag, businessCurrency),
            hint: t('stats.oldest_bucket_hint'),
            tone: 'warning',
          },
          {
            label: t('stats.collected'),
            value: formatCurrencyCompactBase(derived.collectedReceivable, localeTag, businessCurrency),
            hint: `${formatPercent(collectionRate, localeTag)}% collection rate`,
            tone: 'success',
          },
        ],
        ageingCards: derived.receivableAgeing.map((row, index) => ({
          label: row.label,
          value: formatCurrencyBase(row.amount, localeTag, businessCurrency),
          hint: `${formatNumber(row.count, localeTag)} balances · ${formatPercent(
            row.percentage,
            localeTag,
          )}%`,
          tone:
            index === 3 ? 'danger' : index === 2 ? 'warning' : index === 1 ? 'info' : 'success',
        })),
        rows: openDebts.map((debt) => {
          const ageDays = getAgeDays(debt.createdAt)
          return {
            customer: debt.contact?.name || debt.sourceReference,
            reference: debt.sourceReference,
            saleDate: formatDateLabel(debt.createdAt.slice(0, 10), localeTag),
            age: `${ageDays}d`,
            originalAmount: formatCurrencyBase(debt.originalAmount, localeTag, businessCurrency),
            paidAmount: formatCurrencyBase(debt.paidAmount, localeTag, businessCurrency),
            outstandingAmount: formatCurrencyBase(debt.outstandingAmount, localeTag, businessCurrency),
            statusLabel:
              ageDays > 30
                ? 'Overdue'
                : debt.status === DebtStatus.PARTIALLY_PAID
                  ? 'Partial'
                  : 'Outstanding',
            statusTone:
              ageDays > 30
                ? 'danger'
                : debt.status === DebtStatus.PARTIALLY_PAID
                  ? 'info'
                  : 'warning',
            collectedLabel: `${formatPercent(
              percentageOf(debt.paidAmount, debt.originalAmount),
              localeTag,
            )}%`,
          }
        }),
        notes: [
          'Ageing is calculated from the debt creation date stored on this device.',
          'Only open receivables are included in this report.',
          'Use the exported detail sheet for collection follow-up and reconciliation.',
        ],
      })
    }

    if (selectedReport.id === 'daily-sales') {
      const totalCollected = sumNumbers(Array.from(derived.paymentTotals.values()))
      const creditSalesCount = derived.completedSales.filter(
        (sale) => (sale.credit_amount ?? 0) > 0,
      ).length
      const syncPendingCount = derived.sales.filter((sale) => !sale.synced_at).length
      const cashierProfiles = derived.cashierRows.slice(0, 4).map((cashier, index) => {
        const cashierSales = derived.sales.filter((sale) => sale.cashier_id === cashier.cashierId)
        const cashierCompletedSales = cashierSales.filter(
          (sale) => sale.status === SaleStatus.COMPLETED,
        )
        const cashierPayments = derived.completedPayments.filter(
          (payment) => saleById.get(payment.sale_id)?.cashier_id === cashier.cashierId,
        )
        const paymentMap = new Map<string, number>()
        for (const payment of cashierPayments) {
          paymentMap.set(payment.method, (paymentMap.get(payment.method) ?? 0) + payment.amount)
        }

        return {
          initials: getInitials(cashier.cashierName),
          name: cashier.cashierName,
          subtitle: `${formatNumber(cashierCompletedSales.length, localeTag)} completed sales in range`,
          value: formatCurrencyBase(cashier.revenue, localeTag, businessCurrency),
          hint: `${formatPercent(percentageOf(cashier.revenue, derived.totalRevenue), localeTag)}% of revenue`,
          accent:
            index === 0
              ? ('success' as const)
              : index === 1
                ? ('info' as const)
                : ('warning' as const),
          stats: [
            {
              label: 'Sales',
              value: formatNumber(cashier.totalSales, localeTag),
            },
            {
              label: 'Revenue',
              value: formatCurrencyCompactBase(cashier.revenue, localeTag, businessCurrency),
            },
            {
              label: 'Avg basket',
              value: formatCurrencyCompactBase(
                cashier.completedSales > 0 ? cashier.revenue / cashier.completedSales : 0,
                localeTag, businessCurrency),
            },
            {
              label: 'Voids',
              value: formatNumber(cashier.voidedSales, localeTag),
              tone: cashier.voidedSales > 0 ? ('danger' as const) : ('default' as const),
            },
          ],
          rows: [
            PaymentMethod.CASH,
            PaymentMethod.MTN_MOMO,
            PaymentMethod.ORANGE_MONEY,
          ]
            .map((method) => {
              const amount = paymentMap.get(method) ?? 0
              return {
                label: getPaymentLabel(method, tSell),
                value: formatCurrencyBase(amount, localeTag, businessCurrency),
                hint: `${formatPercent(percentageOf(amount, Math.max(cashier.revenue, 1)), localeTag)}% of cashier revenue`,
                percent: percentageOf(amount, Math.max(cashier.revenue, 1)),
                tone:
                  method === PaymentMethod.CASH
                    ? ('success' as const)
                    : method === PaymentMethod.MTN_MOMO
                      ? ('warning' as const)
                      : ('info' as const),
              }
            })
            .filter((row) => row.percent > 0),
        }
      })

      const transactionTable: TemplateSection = {
        columns: [
          'Sale no.',
          'Date',
          'Time',
          'Customer',
          'Cashier',
          'Total',
          'Payment',
          'Credit',
          'Sync',
        ],
        rows: derived.completedSales.slice(0, 30).map((sale) => [
          sale.sale_number || sale.receipt_number || sale.id,
          sale.sale_date ? formatDateLabel(sale.sale_date, localeTag) : '-',
          sale.sold_at ? formatTimeLabel(sale.sold_at, localeTag) : '-',
          sale.customer_name || t('walk_in'),
          sale.cashier_name || 'Local user',
          formatCurrencyBase(sale.total_amount ?? 0, localeTag, businessCurrency),
          getPaymentLabel(sale.payment_method, tSell),
          formatCurrencyBase(sale.credit_amount ?? 0, localeTag, businessCurrency),
          sale.synced_at ? 'Synced' : 'Pending',
        ]),
        footer: [
          `Total - ${formatNumber(derived.completedSales.length, localeTag)} completed`,
          '',
          '',
          '',
          '',
          formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency),
          '',
          formatCurrencyBase(derived.totalCreditIssued, localeTag, businessCurrency),
          '',
        ],
      }

      const voidedTable: TemplateSection = {
        columns: ['Sale no.', 'Time', 'Cashier', 'Amount', 'Voided by', 'Reason'],
        rows: derived.voidedSales.slice(0, 16).map((sale) => [
          sale.sale_number || sale.receipt_number || sale.id,
          sale.sold_at ? formatTimeLabel(sale.sold_at, localeTag) : '-',
          sale.cashier_name || 'Local user',
          formatCurrencyBase(sale.total_amount ?? 0, localeTag, businessCurrency),
          'Recorded on device',
          sale.void_reason || t('not_set'),
        ]),
        footer: [
          'Total voided',
          '',
          '',
          formatCurrencyBase(
            sumNumbers(derived.voidedSales.map((sale) => sale.total_amount ?? 0)),
            localeTag, businessCurrency),
          '',
          '',
        ],
      }

      return buildCompositeReportTemplate({
        businessName: fallbackBusinessName,
        reportLabel: 'Sales operations',
        title: selectedReport.name,
        description: selectedReport.description,
        rangeLabel,
        generatedLabel: previewGeneratedLabel,
        filenameBase,
        meta: [
          {
            label: 'Completed sales',
            value: formatNumber(derived.completedSales.length, localeTag),
          },
          {
            label: 'Total revenue',
            value: formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency),
            tone: 'success',
          },
          {
            label: 'Voided sales',
            value: formatNumber(derived.voidedSales.length, localeTag),
            tone: 'danger',
          },
          {
            label: 'Active cashiers',
            value: formatNumber(derived.cashierRows.length, localeTag),
          },
        ],
        summaryRows: [
          { label: 'Completed sales', value: formatNumber(derived.completedSales.length, localeTag) },
          { label: 'Revenue', value: formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency) },
          { label: 'Collected cash', value: formatCurrencyBase(totalCollected, localeTag, businessCurrency) },
          { label: 'Credit issued', value: formatCurrencyBase(derived.totalCreditIssued, localeTag, businessCurrency) },
        ],
        excelSections: [
          transactionTable,
          {
            title: 'Payment breakdown',
            columns: ['Method', 'Amount', 'Share'],
            rows: revenuePaymentRows.map((row) => [
              row.label,
              formatCurrencyBase(row.amount, localeTag, businessCurrency),
              `${formatPercent(percentageOf(row.amount, Math.max(totalCollected, 1)), localeTag)}%`,
            ]),
          },
          ...(derived.voidedSales.length > 0 ? [voidedTable] : []),
        ],
        sections: [
          {
            kind: 'stats',
            cards: [
              {
                label: t('stats.transactions'),
                value: formatNumber(derived.completedSales.length, localeTag),
                hint: 'completed sales in range',
                tone: 'info',
              },
              {
                label: t('stats.revenue'),
                value: formatCurrencyCompactBase(derived.totalRevenue, localeTag, businessCurrency),
                hint: `${formatCurrencyBase(totalCollected, localeTag, businessCurrency)} collected`,
                tone: 'success',
              },
              {
                label: t('stats.credit_issued'),
                value: formatCurrencyCompactBase(derived.totalCreditIssued, localeTag, businessCurrency),
                hint: `${formatNumber(creditSalesCount, localeTag)} credit sales`,
                tone: 'warning',
              },
              {
                label: t('stats.avg_basket'),
                value: formatCurrencyCompactBase(derived.averageOrderValue, localeTag, businessCurrency),
                hint: `${formatNumber(syncPendingCount, localeTag)} pending sync`,
                tone: syncPendingCount > 0 ? 'warning' : 'default',
              },
            ],
          },
          {
            kind: 'mini_cards',
            title: 'Day summary',
            columns: 5,
            cards: [
              {
                label: 'Revenue',
                value: formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency),
                hint: 'completed sales only',
              },
              {
                label: 'Gross profit',
                value: formatCurrencyBase(derived.grossProfit, localeTag, businessCurrency),
                hint: `${formatPercent(percentageOf(derived.grossProfit, derived.totalRevenue), localeTag)}% margin`,
                tone: derived.grossProfit >= 0 ? 'success' : 'danger',
              },
              {
                label: 'Collected cash',
                value: formatCurrencyBase(totalCollected, localeTag, businessCurrency),
                hint: 'payments recorded on completed sales',
                tone: 'success',
              },
              {
                label: 'Credit issued',
                value: formatCurrencyBase(derived.totalCreditIssued, localeTag, businessCurrency),
                hint: `${formatNumber(creditSalesCount, localeTag)} credit sales`,
                tone: 'warning',
              },
              {
                label: 'Avg basket',
                value: formatCurrencyBase(derived.averageOrderValue, localeTag, businessCurrency),
                hint: 'per completed sale',
              },
            ],
          },
          {
            kind: 'profiles',
            title: 'Cashier performance',
            profiles: cashierProfiles,
          },
          {
            kind: 'table',
            title: 'All transactions',
            table: transactionTable,
          },
          {
            kind: 'progress_rows',
            title: 'Payment method breakdown',
            rows: revenuePaymentRows
              .filter((row) => row.amount > 0)
              .map((row) => ({
                label: row.label,
                value: formatCurrencyBase(row.amount, localeTag, businessCurrency),
                hint:
                  row.label === 'Unpaid credit'
                    ? 'included in revenue, not in collected cash'
                    : `${formatPercent(percentageOf(row.amount, Math.max(totalCollected, 1)), localeTag)}% of collected payments`,
                percent: percentageOf(row.amount, Math.max(totalCollected, 1)),
                tone: row.tone,
              })),
          },
          ...(derived.voidedSales.length > 0
            ? [
                {
                  kind: 'table' as const,
                  title: 'Voided transactions',
                  table: voidedTable,
                },
              ]
            : []),
          {
            kind: 'note',
            title: 'Notes',
            tone: syncPendingCount > 0 ? 'warning' : 'info',
            lines: [
              'Credit sales are included in revenue but excluded from collected cash until payment is recorded.',
              'Voided sales remain visible for audit review and are separated from completed sales in this preview.',
              syncPendingCount > 0
                ? `${formatNumber(syncPendingCount, localeTag)} sales are still pending sync on this device.`
                : 'All visible sales in this range are already synced on this device.',
            ],
          },
        ],
      })
    }

    if (selectedReport.id === 'top-products') {
      const categoryByProductId = new Map(
        derived.inventoryItems.map((item) => [item.productId, item.categoryName || t('uncategorized')]),
      )
      const bestMarginProduct = derived.topProducts
        .slice()
        .sort(
          (left, right) =>
            percentageOf(right.revenue - right.cost, Math.max(right.revenue, 1)) -
            percentageOf(left.revenue - left.cost, Math.max(left.revenue, 1)),
        )[0]

      const productTable: TemplateSection = {
        columns: [
          '#',
          'Product',
          'Category',
          'Units sold',
          'Unit price',
          'Revenue',
          '% of total',
          'COGS',
          'Gross profit',
          'Margin',
        ],
        rows: derived.topProducts.slice(0, 15).map((product, index) => {
          const marginPercent = percentageOf(product.revenue - product.cost, Math.max(product.revenue, 1))
          return [
            formatNumber(index + 1, localeTag),
            product.productName,
            categoryByProductId.get(product.productId) || t('uncategorized'),
            formatNumber(product.quantity, localeTag),
            formatCurrencyBase(product.quantity > 0 ? product.revenue / product.quantity : 0, localeTag, businessCurrency),
            formatCurrencyBase(product.revenue, localeTag, businessCurrency),
            `${formatPercent(percentageOf(product.revenue, Math.max(derived.totalRevenue, 1)), localeTag)}%`,
            formatCurrencyBase(product.cost, localeTag, businessCurrency),
            formatCurrencyBase(product.revenue - product.cost, localeTag, businessCurrency),
            `${formatPercent(marginPercent, localeTag)}%`,
          ]
        }),
        footer: [
          `Total - ${formatNumber(derived.topProducts.length, localeTag)} products`,
          '',
          '',
          formatNumber(sumNumbers(derived.topProducts.map((product) => product.quantity)), localeTag),
          '',
          formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency),
          '100.0%',
          formatCurrencyBase(sumNumbers(derived.topProducts.map((product) => product.cost)), localeTag, businessCurrency),
          formatCurrencyBase(
            sumNumbers(derived.topProducts.map((product) => product.revenue - product.cost)),
            localeTag,
            businessCurrency),
          `${formatPercent(
            percentageOf(
              sumNumbers(derived.topProducts.map((product) => product.revenue - product.cost)),
              Math.max(derived.totalRevenue, 1),
            ),
            localeTag,
          )}%`,
        ],
      }

      return buildCompositeReportTemplate({
        businessName: fallbackBusinessName,
        reportLabel: 'Sales analysis',
        title: selectedReport.name,
        description: selectedReport.description,
        rangeLabel,
        generatedLabel: previewGeneratedLabel,
        filenameBase,
        meta: [
          { label: 'Products analysed', value: formatNumber(derived.topProducts.length, localeTag) },
          { label: 'Total revenue', value: formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency) },
          {
            label: 'Units sold',
            value: formatNumber(
              sumNumbers(derived.topProducts.map((product) => product.quantity)),
              localeTag,
            ),
          },
          {
            label: 'Best margin product',
            value: bestMarginProduct?.productName || '-',
          },
        ],
        summaryRows: [
          { label: 'Products analysed', value: formatNumber(derived.topProducts.length, localeTag) },
          { label: 'Total revenue', value: formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency) },
          {
            label: 'Units sold',
            value: formatNumber(
              sumNumbers(derived.topProducts.map((product) => product.quantity)),
              localeTag,
            ),
          },
        ],
        excelSections: [productTable],
        sections: [
          {
            kind: 'stats',
            cards: [
              {
                label: t('stats.products'),
                value: formatNumber(derived.topProducts.length, localeTag),
                hint: t('stats.products_ranked_hint'),
                tone: 'info',
              },
              {
                label: t('stats.best_seller'),
                value: derived.topProducts[0]?.productName || '-',
                hint: derived.topProducts[0]
                  ? formatCurrencyBase(derived.topProducts[0].revenue, localeTag, businessCurrency)
                  : t('preview.no_sales_data'),
                tone: 'success',
              },
              {
                label: t('stats.units_sold'),
                value: formatNumber(
                  sumNumbers(derived.topProducts.map((product) => product.quantity)),
                  localeTag,
                ),
                hint: t('stats.units_sold_hint'),
              },
              {
                label: 'Gross contribution',
                value: formatCurrencyCompactBase(
                  sumNumbers(derived.topProducts.map((product) => product.revenue - product.cost)),
                  localeTag,
                  businessCurrency),
                hint: `${formatPercent(
                  percentageOf(
                    sumNumbers(derived.topProducts.map((product) => product.revenue - product.cost)),
                    Math.max(derived.totalRevenue, 1),
                  ),
                  localeTag,
                )}% overall margin`,
                tone: 'success',
              },
            ],
          },
          {
            kind: 'table',
            title: 'Products ranked by revenue',
            table: productTable,
          },
          {
            kind: 'note',
            title: 'Notes and methodology',
            tone: 'info',
            lines: [
              'Products are ranked by gross revenue generated from completed sales in the selected range.',
              'Gross profit per product uses the cost snapshots stored on sale items at the time of sale.',
              'Contribution percentages are based on the total completed-sales revenue for this range.',
            ],
          },
        ],
      })
    }

    if (selectedReport.id === 'cashier-performance') {
      const cashierProfiles = derived.cashierRows.slice(0, 6).map((cashier, index) => {
        const cashierCompletedSales = derived.completedSales.filter(
          (sale) => sale.cashier_id === cashier.cashierId,
        )
        const cashierPayments = derived.completedPayments.filter(
          (payment) => saleById.get(payment.sale_id)?.cashier_id === cashier.cashierId,
        )
        const paymentMap = new Map<string, number>()
        const hourlyMap = new Map<number, number>()

        for (const payment of cashierPayments) {
          paymentMap.set(payment.method, (paymentMap.get(payment.method) ?? 0) + payment.amount)
        }

        for (const sale of cashierCompletedSales) {
          if (!sale.sold_at) {
            continue
          }

          const hour = new Date(sale.sold_at).getHours()
          const bucketStart = Math.floor(hour / 3) * 3
          hourlyMap.set(bucketStart, (hourlyMap.get(bucketStart) ?? 0) + 1)
        }

        const peakBucket = Array.from(hourlyMap.entries()).sort((left, right) => right[1] - left[1])[0]
        const peakHours = peakBucket
          ? `${String(peakBucket[0]).padStart(2, '0')}:00-${String((peakBucket[0] + 2) % 24).padStart(2, '0')}:59`
          : 'N/A'

        return {
          initials: getInitials(cashier.cashierName),
          name: cashier.cashierName,
          subtitle: 'Cashier profile for the selected range',
          value: formatCurrencyBase(cashier.revenue, localeTag, businessCurrency),
          hint: `${formatPercent(percentageOf(cashier.revenue, Math.max(derived.totalRevenue, 1)), localeTag)}% of period revenue`,
          accent:
            index === 0
              ? ('success' as const)
              : index === 1
                ? ('info' as const)
                : ('warning' as const),
          stats: [
            { label: 'Sales', value: formatNumber(cashier.totalSales, localeTag) },
            {
              label: 'Avg. basket',
              value: formatCurrencyBase(
                cashier.completedSales > 0 ? cashier.revenue / cashier.completedSales : 0,
                localeTag,
                businessCurrency),
            },
            {
              label: 'Voids',
              value: formatNumber(cashier.voidedSales, localeTag),
              tone: cashier.voidedSales > 0 ? ('danger' as const) : ('default' as const),
            },
            {
              label: 'Void rate',
              value: `${formatPercent(percentageOf(cashier.voidedSales, Math.max(cashier.totalSales, 1)), localeTag)}%`,
              tone: cashier.voidedSales > 0 ? ('warning' as const) : ('default' as const),
            },
            {
              label: 'Credit issued',
              value: formatCurrencyBase(
                sumNumbers(cashierCompletedSales.map((sale) => sale.credit_amount ?? 0)),
                localeTag,
                businessCurrency),
              tone: 'warning' as const,
            },
            {
              label: 'Peak hours',
              value: peakHours,
            },
          ],
          rows: [
            PaymentMethod.CASH,
            PaymentMethod.MTN_MOMO,
            PaymentMethod.ORANGE_MONEY,
          ]
            .map((method) => {
              const amount = paymentMap.get(method) ?? 0
              return {
                label: getPaymentLabel(method, tSell),
                value: formatCurrencyBase(amount, localeTag, businessCurrency),
                hint: `${formatPercent(percentageOf(amount, Math.max(cashier.revenue, 1)), localeTag)}% of cashier revenue`,
                percent: percentageOf(amount, Math.max(cashier.revenue, 1)),
                tone:
                  method === PaymentMethod.CASH
                    ? ('success' as const)
                    : method === PaymentMethod.MTN_MOMO
                      ? ('warning' as const)
                      : ('info' as const),
              }
            })
            .filter((row) => row.percent > 0),
        }
      })

      const summaryTable: TemplateSection = {
        columns: [
          'Cashier',
          'Transactions',
          'Revenue',
          '% of total',
          'Avg. basket',
          'Voids',
          'Void rate',
          'Credit issued',
        ],
        rows: derived.cashierRows.map((cashier) => [
          cashier.cashierName,
          formatNumber(cashier.totalSales, localeTag),
          formatCurrencyBase(cashier.revenue, localeTag, businessCurrency),
          `${formatPercent(percentageOf(cashier.revenue, Math.max(derived.totalRevenue, 1)), localeTag)}%`,
          formatCurrencyBase(
            cashier.completedSales > 0 ? cashier.revenue / cashier.completedSales : 0,
            localeTag,
            businessCurrency),
          formatNumber(cashier.voidedSales, localeTag),
          `${formatPercent(percentageOf(cashier.voidedSales, Math.max(cashier.totalSales, 1)), localeTag)}%`,
          formatCurrencyBase(
            sumNumbers(
              derived.completedSales
                .filter((sale) => sale.cashier_id === cashier.cashierId)
                .map((sale) => sale.credit_amount ?? 0),
            ),
            localeTag,
            businessCurrency),
        ]),
        footer: [
          'Total',
          formatNumber(sumNumbers(derived.cashierRows.map((cashier) => cashier.totalSales)), localeTag),
          formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency),
          '100.0%',
          formatCurrencyBase(derived.averageOrderValue, localeTag, businessCurrency),
          formatNumber(sumNumbers(derived.cashierRows.map((cashier) => cashier.voidedSales)), localeTag),
          `${formatPercent(
            percentageOf(
              sumNumbers(derived.cashierRows.map((cashier) => cashier.voidedSales)),
              Math.max(sumNumbers(derived.cashierRows.map((cashier) => cashier.totalSales)), 1),
            ),
            localeTag,
          )}%`,
          formatCurrencyBase(derived.totalCreditIssued, localeTag, businessCurrency),
        ],
      }

      return buildCompositeReportTemplate({
        businessName: fallbackBusinessName,
        reportLabel: 'Human resources',
        title: selectedReport.name,
        description: selectedReport.description,
        rangeLabel,
        generatedLabel: previewGeneratedLabel,
        filenameBase,
        meta: [
          { label: 'Active cashiers', value: formatNumber(derived.cashierRows.length, localeTag) },
          {
            label: 'Total transactions',
            value: formatNumber(derived.completedSales.length, localeTag),
          },
          { label: 'Total revenue', value: formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency) },
          {
            label: 'Overall void rate',
            value: `${formatPercent(percentageOf(derived.voidedSales.length, Math.max(derived.sales.length, 1)), localeTag)}%`,
            tone: 'warning',
          },
        ],
        summaryRows: [
          { label: 'Active cashiers', value: formatNumber(derived.cashierRows.length, localeTag) },
          { label: 'Transactions', value: formatNumber(derived.completedSales.length, localeTag) },
          { label: 'Revenue', value: formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency) },
          { label: 'Credit issued', value: formatCurrencyBase(derived.totalCreditIssued, localeTag, businessCurrency) },
        ],
        excelSections: [summaryTable],
        sections: [
          {
            kind: 'stats',
            cards: [
              {
                label: t('stats.cashiers'),
                value: formatNumber(derived.cashierRows.length, localeTag),
                hint: t('stats.active_cashiers_hint'),
                tone: 'info',
              },
              {
                label: t('stats.top_cashier'),
                value: derived.cashierRows[0]?.cashierName || '-',
                hint: derived.cashierRows[0]
                  ? formatCurrencyBase(derived.cashierRows[0].revenue, localeTag, businessCurrency)
                  : t('preview.no_sales_data'),
                tone: 'success',
              },
              {
                label: t('stats.avg_basket'),
                value: formatCurrencyCompactBase(derived.averageOrderValue, localeTag, businessCurrency),
                hint: t('stats.avg_basket_hint'),
              },
              {
                label: 'Void rate',
                value: `${formatPercent(percentageOf(derived.voidedSales.length, Math.max(derived.sales.length, 1)), localeTag)}%`,
                hint: `${formatNumber(derived.voidedSales.length, localeTag)} voided sales`,
                tone: 'warning',
              },
            ],
          },
          {
            kind: 'profiles',
            title: 'Individual cashier profiles',
            profiles: cashierProfiles,
          },
          {
            kind: 'table',
            title: 'Comparative summary table',
            table: summaryTable,
          },
          {
            kind: 'note',
            title: 'Notes',
            tone: 'info',
            lines: [
              'Void rate is calculated as voided transactions divided by total transactions recorded by the cashier.',
              'Revenue is attributed to the cashier who recorded the completed sale on this device.',
              'Credit issued shows the unpaid portion opened at the moment of sale for that cashier.',
            ],
          },
        ],
      })
    }

    if (selectedReport.id === 'payment-breakdown') {
      const totalCollected = sumNumbers(Array.from(derived.paymentTotals.values()))
      const dailyPaymentMap = new Map<
        string,
        {
          date: string
          revenue: number
          cash: number
          mtn: number
          orange: number
          card: number
          credit: number
        }
      >()

      for (const sale of derived.completedSales) {
        const saleDate = sale.sale_date || sale.created_at.slice(0, 10)
        const current = dailyPaymentMap.get(saleDate) ?? {
          date: saleDate,
          revenue: 0,
          cash: 0,
          mtn: 0,
          orange: 0,
          card: 0,
          credit: 0,
        }

        current.revenue += sale.total_amount ?? 0
        current.credit += sale.credit_amount ?? 0
        dailyPaymentMap.set(saleDate, current)
      }

      for (const payment of derived.completedPayments) {
        const sale = saleById.get(payment.sale_id)
        if (!sale) {
          continue
        }

        const saleDate = sale.sale_date || sale.created_at.slice(0, 10)
        const current = dailyPaymentMap.get(saleDate)
        if (!current) {
          continue
        }

        if (payment.method === PaymentMethod.CASH) {
          current.cash += payment.amount
        } else if (payment.method === PaymentMethod.MTN_MOMO) {
          current.mtn += payment.amount
        } else if (payment.method === PaymentMethod.ORANGE_MONEY) {
          current.orange += payment.amount
        } else if (payment.method === PaymentMethod.CARD) {
          current.card += payment.amount
        }
      }

      const dailyPaymentTable: TemplateSection = {
        columns: [
          'Date',
          'Revenue',
          'Cash',
          'MTN MoMo',
          'Orange Money',
          'Card',
          'Credit issued',
          '% credit',
        ],
        rows: Array.from(dailyPaymentMap.values())
          .sort((left, right) => left.date.localeCompare(right.date))
          .map((row) => [
            formatDateLabel(row.date, localeTag),
            formatCurrencyBase(row.revenue, localeTag, businessCurrency),
            formatCurrencyBase(row.cash, localeTag, businessCurrency),
            formatCurrencyBase(row.mtn, localeTag, businessCurrency),
            formatCurrencyBase(row.orange, localeTag, businessCurrency),
            formatCurrencyBase(row.card, localeTag, businessCurrency),
            formatCurrencyBase(row.credit, localeTag, businessCurrency),
            `${formatPercent(percentageOf(row.credit, Math.max(row.revenue, 1)), localeTag)}%`,
          ]),
        footer: [
          'Total',
          formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency),
          formatCurrencyBase(derived.paymentTotals.get(PaymentMethod.CASH) ?? 0, localeTag, businessCurrency),
          formatCurrencyBase(derived.paymentTotals.get(PaymentMethod.MTN_MOMO) ?? 0, localeTag, businessCurrency),
          formatCurrencyBase(derived.paymentTotals.get(PaymentMethod.ORANGE_MONEY) ?? 0, localeTag, businessCurrency),
          formatCurrencyBase(derived.paymentTotals.get(PaymentMethod.CARD) ?? 0, localeTag, businessCurrency),
          formatCurrencyBase(derived.totalCreditIssued, localeTag, businessCurrency),
          `${formatPercent(percentageOf(derived.totalCreditIssued, Math.max(derived.totalRevenue, 1)), localeTag)}%`,
        ],
      }

      return buildCompositeReportTemplate({
        businessName: fallbackBusinessName,
        reportLabel: 'Financial analysis',
        title: selectedReport.name,
        description: selectedReport.description,
        rangeLabel,
        generatedLabel: previewGeneratedLabel,
        filenameBase,
        meta: [
          { label: 'Total revenue', value: formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency) },
          { label: 'Cash collected', value: formatCurrencyBase(totalCollected, localeTag, businessCurrency), tone: 'success' },
          { label: 'Credit issued', value: formatCurrencyBase(derived.totalCreditIssued, localeTag, businessCurrency), tone: 'warning' },
          {
            label: 'Collection rate',
            value: `${formatPercent(percentageOf(totalCollected, Math.max(derived.totalRevenue, 1)), localeTag)}%`,
          },
        ],
        summaryRows: [
          { label: 'Revenue', value: formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency) },
          { label: 'Cash collected', value: formatCurrencyBase(totalCollected, localeTag, businessCurrency) },
          { label: 'Credit issued', value: formatCurrencyBase(derived.totalCreditIssued, localeTag, businessCurrency) },
        ],
        excelSections: [dailyPaymentTable],
        sections: [
          {
            kind: 'stats',
            cards: [
              {
                label: t('stats.revenue'),
                value: formatCurrencyCompactBase(derived.totalRevenue, localeTag, businessCurrency),
                hint: t('stats.topline_hint'),
                tone: 'success',
              },
              {
                label: t('stats.collected'),
                value: formatCurrencyCompactBase(totalCollected, localeTag, businessCurrency),
                hint: t('stats.cash_in_hand_hint'),
                tone: 'success',
              },
              {
                label: t('stats.credit_issued'),
                value: formatCurrencyCompactBase(derived.totalCreditIssued, localeTag, businessCurrency),
                hint: t('stats.unpaid_credit_hint'),
                tone: 'warning',
              },
              {
                label: 'Collection rate',
                value: `${formatPercent(percentageOf(totalCollected, Math.max(derived.totalRevenue, 1)), localeTag)}%`,
                hint: 'cash collected versus total revenue',
              },
            ],
          },
          {
            kind: 'mini_cards',
            title: 'Payment method summary',
            columns: 4,
            cards: revenuePaymentRows.map((row) => ({
              label: row.label,
              value: formatCurrencyBase(row.amount, localeTag, businessCurrency),
              hint:
                row.label === 'Unpaid credit'
                  ? `${formatPercent(percentageOf(row.amount, Math.max(derived.totalRevenue, 1)), localeTag)}% of revenue`
                  : `${formatPercent(percentageOf(row.amount, Math.max(totalCollected, 1)), localeTag)}% of collected cash`,
              tone: row.tone,
            })),
          },
          {
            kind: 'mini_cards',
            title: 'Credit analysis',
            columns: 2,
            cards: [
              {
                label: 'Credit issued',
                value: formatCurrencyBase(derived.totalCreditIssued, localeTag, businessCurrency),
                hint: `${formatPercent(percentageOf(derived.totalCreditIssued, Math.max(derived.totalRevenue, 1)), localeTag)}% of revenue`,
                tone: 'warning',
              },
              {
                label: 'Credit collected',
                value: formatCurrencyBase(derived.collectedReceivable, localeTag, businessCurrency),
                hint: `${formatPercent(
                  percentageOf(derived.collectedReceivable, Math.max(derived.issuedReceivable, 1)),
                  localeTag,
                )}% of receivables recovered`,
                tone: 'success',
              },
            ],
          },
          {
            kind: 'table',
            title: 'Daily payment breakdown',
            table: dailyPaymentTable,
          },
          {
            kind: 'note',
            title: 'Notes',
            tone: 'info',
            lines: [
              'Credit issued is included in revenue but excluded from collected cash until payment is recorded.',
              'Mobile money totals come from completed sale payments stored on this device for the selected period.',
              'Collection rate compares cash collected in period against total completed-sales revenue.',
            ],
          },
        ],
      })
    }

    if (selectedReport.id === 'voided-sales') {
      const voidReversalRefs = new Set(
        derived.inventoryMovements
          .filter((movement) => movement.type === InventoryMovementType.VOID_REVERSAL)
          .map((movement) => movement.referenceId)
          .filter((value): value is string => Boolean(value)),
      )
      const totalVoidedValue = sumNumbers(
        derived.voidedSales.map((sale) => sale.total_amount ?? 0),
      )
      const confirmedReversals = derived.voidedSales.filter((sale) =>
        voidReversalRefs.has(sale.id),
      ).length
      const voidedTable: TemplateSection = {
        columns: [
          'Sale no.',
          'Date',
          'Time',
          'Cashier',
          'Amount',
          'Voided by',
          'Reason',
          'Inventory',
        ],
        rows: derived.voidedSales.slice(0, 20).map((sale) => [
          sale.sale_number || sale.receipt_number || sale.id,
          sale.sale_date ? formatDateLabel(sale.sale_date, localeTag) : '-',
          sale.sold_at ? formatTimeLabel(sale.sold_at, localeTag) : '-',
          sale.cashier_name || 'Local user',
          formatCurrencyBase(sale.total_amount ?? 0, localeTag, businessCurrency),
          'Recorded on device',
          sale.void_reason || t('not_set'),
          voidReversalRefs.has(sale.id) ? 'Confirmed' : 'Pending review',
        ]),
        footer: [
          `Total value reversed - ${formatNumber(derived.voidedSales.length, localeTag)} sales`,
          '',
          '',
          '',
          formatCurrencyBase(totalVoidedValue, localeTag, businessCurrency),
          '',
          '',
          `${formatNumber(confirmedReversals, localeTag)} / ${formatNumber(derived.voidedSales.length, localeTag)} confirmed`,
        ],
      }

      return buildCompositeReportTemplate({
        businessName: fallbackBusinessName,
        reportLabel: 'Audit and compliance',
        title: selectedReport.name,
        description: selectedReport.description,
        rangeLabel,
        generatedLabel: previewGeneratedLabel,
        filenameBase,
        meta: [
          { label: 'Total voided', value: formatNumber(derived.voidedSales.length, localeTag), tone: 'danger' },
          { label: 'Value reversed', value: formatCurrencyBase(totalVoidedValue, localeTag, businessCurrency), tone: 'danger' },
          {
            label: 'Void rate',
            value: `${formatPercent(percentageOf(derived.voidedSales.length, Math.max(derived.sales.length, 1)), localeTag)}%`,
            tone: 'warning',
          },
          {
            label: 'Inventory reversed',
            value: `${formatNumber(confirmedReversals, localeTag)} / ${formatNumber(derived.voidedSales.length, localeTag)}`,
            tone: confirmedReversals === derived.voidedSales.length ? 'success' : 'warning',
          },
        ],
        summaryRows: [
          { label: 'Voided sales', value: formatNumber(derived.voidedSales.length, localeTag) },
          { label: 'Value reversed', value: formatCurrencyBase(totalVoidedValue, localeTag, businessCurrency) },
          {
            label: 'Inventory reversals confirmed',
            value: formatNumber(confirmedReversals, localeTag),
          },
        ],
        excelSections: [voidedTable],
        sections: [
          {
            kind: 'stats',
            cards: [
              {
                label: t('stats.voided'),
                value: formatNumber(derived.voidedSales.length, localeTag),
                hint: t('stats.voided_sales_hint'),
                tone: 'danger',
              },
              {
                label: t('stats.voided_value'),
                value: formatCurrencyCompactBase(totalVoidedValue, localeTag, businessCurrency),
                hint: t('stats.reversed_value_hint'),
                tone: 'warning',
              },
              {
                label: 'Void rate',
                value: `${formatPercent(percentageOf(derived.voidedSales.length, Math.max(derived.sales.length, 1)), localeTag)}%`,
                hint: `${formatNumber(derived.sales.length, localeTag)} total recorded sales`,
                tone: 'warning',
              },
              {
                label: 'Inventory reversed',
                value: `${formatNumber(confirmedReversals, localeTag)} / ${formatNumber(derived.voidedSales.length, localeTag)}`,
                hint: 'void reversal movements logged',
                tone: confirmedReversals === derived.voidedSales.length ? 'success' : 'warning',
              },
            ],
          },
          {
            kind: 'table',
            title: 'All voided transactions',
            table: voidedTable,
          },
          {
            kind: 'note',
            title: 'Audit notes',
            tone: 'danger',
            lines: [
              'Voided sales remain separated from completed sales and should be reviewed alongside their reasons.',
              'Inventory reversal status is based on VOID_REVERSAL movements logged against the sale reference on this device.',
              'Any sale marked pending review should be checked against the inventory movement log before closeout.',
            ],
          },
        ],
      })
    }

    if (selectedReport.id === 'stock-movements') {
      const movementsTable: TemplateSection = {
        columns: [
          'Product',
          'Date',
          'Type',
          'Reference',
          'Performed by',
          'Change',
          'Before',
          'After',
          'Balance',
          'Notes',
        ],
        rows: derived.inventoryMovements.slice(0, 40).map((movement) => [
          inventoryByProductId.get(movement.productId)?.productName || movement.productId,
          formatDateTimeLabel(movement.createdAt, localeTag),
          getMovementTypeLabel(movement.type),
          movement.referenceLabel || movement.referenceId || '-',
          movement.performedBy?.name || 'System',
          formatNumber(movement.quantityChange, localeTag),
          formatNumber(movement.quantityBefore, localeTag),
          formatNumber(movement.quantityAfter, localeTag),
          formatNumber(movement.quantityAfter, localeTag),
          movement.notes || '-',
        ]),
      }
      const unitsSoldOut = sumNumbers(
        derived.inventoryMovements
          .filter((movement) => movement.type === InventoryMovementType.SALE)
          .map((movement) => Math.abs(movement.quantityChange)),
      )
      const unitsRestockedIn = sumNumbers(
        derived.inventoryMovements
          .filter((movement) => movement.type === InventoryMovementType.RESTOCK_IN)
          .map((movement) => Math.abs(movement.quantityChange)),
      )
      const netChange = sumNumbers(
        derived.inventoryMovements.map((movement) => movement.quantityChange),
      )

      return buildCompositeReportTemplate({
        businessName: fallbackBusinessName,
        reportLabel: 'Inventory management',
        title: selectedReport.name,
        description: selectedReport.description,
        rangeLabel,
        generatedLabel: previewGeneratedLabel,
        filenameBase,
        meta: [
          { label: 'Total movements', value: formatNumber(derived.inventoryMovements.length, localeTag) },
          { label: 'Units sold out', value: formatNumber(unitsSoldOut, localeTag), tone: 'danger' },
          { label: 'Units restocked', value: formatNumber(unitsRestockedIn, localeTag), tone: 'success' },
          {
            label: 'Net change',
            value: formatNumber(netChange, localeTag),
            tone: netChange >= 0 ? 'success' : 'warning',
          },
        ],
        summaryRows: [
          { label: 'Total movements', value: formatNumber(derived.inventoryMovements.length, localeTag) },
          { label: 'Units sold out', value: formatNumber(unitsSoldOut, localeTag) },
          { label: 'Units restocked', value: formatNumber(unitsRestockedIn, localeTag) },
          { label: 'Net change', value: formatNumber(netChange, localeTag) },
        ],
        excelSections: [movementsTable],
        sections: [
          {
            kind: 'stats',
            cards: [
              {
                label: t('stats.movements'),
                value: formatNumber(derived.inventoryMovements.length, localeTag),
                hint: t('stats.movements_hint'),
                tone: 'info',
              },
              {
                label: 'Units sold out',
                value: formatNumber(unitsSoldOut, localeTag),
                hint: 'sale deductions',
                tone: 'danger',
              },
              {
                label: 'Units restocked',
                value: formatNumber(unitsRestockedIn, localeTag),
                hint: 'restock inflow',
                tone: 'success',
              },
              {
                label: 'Net change',
                value: formatNumber(netChange, localeTag),
                hint: `${formatNumber(derived.movementRows.length, localeTag)} movement types`,
                tone: netChange >= 0 ? 'success' : 'warning',
              },
            ],
          },
          {
            kind: 'table',
            title: 'Movement log by product',
            table: movementsTable,
          },
          {
            kind: 'note',
            title: 'Notes',
            tone: 'info',
            lines: [
              'Movement types include sale deductions, restocks, manual adjustments, void reversals and opening stock changes.',
              'This preview shows the most recent movement rows while Excel export includes the same detailed section.',
              'Reference labels come from the stored movement record and may reflect sales, restocks or manual actions.',
            ],
          },
        ],
      })
    }

    if (selectedReport.id === 'low-stock-alerts') {
      const alertRows = derived.lowStockItems.slice(0, 20).map((item) => {
        const threshold = Math.max(item.lowStockThreshold ?? 0, 1)
        const targetQuantity = Math.max(item.reorderPoint ?? 0, threshold * 2)
        const restockQty = Math.max(targetQuantity - item.quantity, threshold - item.quantity, 0)
        const unitCost = latestUnitCostByProductId.get(item.productId) ?? 0
        const estimatedCost = restockQty * unitCost
        const stockPercent = percentageOf(item.quantity, threshold)
        const tone: TemplateTone =
          item.quantity <= 0 ? 'danger' : stockPercent < 30 ? 'danger' : 'warning'

        return {
          product: item.productName || t('untitled_product'),
          category: item.categoryName || t('uncategorized'),
          quantity: formatNumber(item.quantity, localeTag),
          threshold: formatNumber(threshold, localeTag),
          shortfall: formatNumber(Math.max(threshold - item.quantity, 0), localeTag),
          thresholdShare: `${formatPercent(stockPercent, localeTag)}%`,
          urgency: item.quantity <= 0 ? 'Out of stock' : stockPercent < 30 ? 'Critical' : 'Low stock',
          restockQty: formatNumber(restockQty, localeTag),
          estimatedCost,
          estimatedCostLabel:
            estimatedCost > 0 ? formatCurrencyBase(estimatedCost, localeTag, businessCurrency) : 'No cost history',
          tone,
        }
      })
      const totalRestockCost = sumNumbers(alertRows.map((row) => row.estimatedCost))
      const alertTable: TemplateSection = {
        columns: [
          'Product',
          'Category',
          'In stock',
          'Threshold',
          'Shortfall',
          '% of threshold',
          'Urgency',
          'Est. restock qty',
          'Est. cost',
        ],
        rows: alertRows.map((row) => [
          row.product,
          row.category,
          row.quantity,
          row.threshold,
          row.shortfall,
          row.thresholdShare,
          row.urgency,
          row.restockQty,
          row.estimatedCostLabel,
        ]),
        footer: [
          `Total alerts - ${formatNumber(alertRows.length, localeTag)} products`,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          formatCurrencyBase(totalRestockCost, localeTag, businessCurrency),
        ],
      }

      return buildCompositeReportTemplate({
        businessName: fallbackBusinessName,
        reportLabel: 'Inventory alert',
        title: selectedReport.name,
        description: selectedReport.description,
        rangeLabel,
        generatedLabel: previewGeneratedLabel,
        filenameBase,
        meta: [
          { label: 'Products below threshold', value: formatNumber(alertRows.length, localeTag), tone: 'danger' },
          {
            label: 'Out of stock',
            value: formatNumber(
              derived.inventoryItems.filter((item) => item.quantity <= 0).length,
              localeTag,
            ),
            tone: 'danger',
          },
          { label: 'Est. restock cost', value: formatCurrencyBase(totalRestockCost, localeTag, businessCurrency) },
          { label: 'Highest urgency', value: alertRows[0]?.product || '-' },
        ],
        summaryRows: [
          { label: 'Low-stock alerts', value: formatNumber(alertRows.length, localeTag) },
          { label: 'Out of stock', value: formatNumber(derived.inventoryItems.filter((item) => item.quantity <= 0).length, localeTag) },
          { label: 'Estimated restock cost', value: formatCurrencyBase(totalRestockCost, localeTag, businessCurrency) },
        ],
        excelSections: [alertTable],
        sections: [
          {
            kind: 'stats',
            cards: [
              {
                label: t('stats.alerts'),
                value: formatNumber(alertRows.length, localeTag),
                hint: t('stats.current_alerts_hint'),
                tone: 'danger',
              },
              {
                label: t('stats.out_of_stock'),
                value: formatNumber(
                  derived.inventoryItems.filter((item) => item.quantity <= 0).length,
                  localeTag,
                ),
                hint: t('stats.out_of_stock_hint'),
                tone: 'danger',
              },
              {
                label: 'Restock estimate',
                value: formatCurrencyCompactBase(totalRestockCost, localeTag, businessCurrency),
                hint: 'based on latest known unit cost',
                tone: 'warning',
              },
              {
                label: t('stats.tracked_products'),
                value: formatNumber(derived.inventoryItems.length, localeTag),
                hint: t('stats.tracked_products_hint'),
                tone: 'info',
              },
            ],
          },
          {
            kind: 'table',
            title: 'Alert listing - sorted by urgency',
            table: alertTable,
          },
          {
            kind: 'note',
            title: 'Action required',
            tone: 'warning',
            lines: [
              alertRows[0]
                ? `${alertRows[0].product} currently has the highest urgency in this range.`
                : 'No critical stock alerts are available for this range.',
              totalRestockCost > 0
                ? `Estimated restock investment is ${formatCurrencyBase(totalRestockCost, localeTag, businessCurrency)} across visible alert products.`
                : 'Estimated restock costs are unavailable until at least one unit-cost history exists for the affected products.',
            ],
          },
        ],
      })
    }

    if (selectedReport.id === 'restock-costs') {
      const supplierMap = new Map<
        string,
        { supplier: string; deliveries: number; units: number; totalCost: number; onCredit: number }
      >()
      const restockTable: TemplateSection = {
        columns: [
          'Reference',
          'Date',
          'Supplier',
          'Products',
          'Units',
          'Total cost',
          'Paid',
          'On credit',
        ],
        rows: derived.restocks.map((restock) => {
          const items = restockItemsByRestockId.get(restock.id) ?? []
          const supplier = restock.supplier_name || t('not_set')
          const units = sumNumbers(items.map((item) => item.quantity))
          const totalCost = restock.total_cost ?? restock.total_amount ?? 0
          const onCredit = restock.credit_amount ?? Math.max(totalCost - (restock.amount_paid ?? 0), 0)
          const summary = supplierMap.get(supplier) ?? {
            supplier,
            deliveries: 0,
            units: 0,
            totalCost: 0,
            onCredit: 0,
          }

          summary.deliveries += 1
          summary.units += units
          summary.totalCost += totalCost
          summary.onCredit += onCredit
          supplierMap.set(supplier, summary)

          return [
            restock.reference_number || restock.id,
            formatDateLabel(restock.created_at.slice(0, 10), localeTag),
            supplier,
            items
              .slice(0, 3)
              .map((item) => item.product_name || item.product_id)
              .join(', ') || '-',
            formatNumber(units, localeTag),
            formatCurrencyBase(totalCost, localeTag, businessCurrency),
            formatCurrencyBase(restock.amount_paid ?? 0, localeTag, businessCurrency),
            formatCurrencyBase(onCredit, localeTag, businessCurrency),
          ]
        }),
      }
      const supplierTable: TemplateSection = {
        title: 'Supplier summary',
        columns: ['Supplier', 'Deliveries', 'Units', 'Total cost', 'On credit'],
        rows: Array.from(supplierMap.values())
          .sort((left, right) => right.totalCost - left.totalCost)
          .map((row) => [
            row.supplier,
            formatNumber(row.deliveries, localeTag),
            formatNumber(row.units, localeTag),
            formatCurrencyBase(row.totalCost, localeTag, businessCurrency),
            formatCurrencyBase(row.onCredit, localeTag, businessCurrency),
          ]),
      }

      return buildCompositeReportTemplate({
        businessName: fallbackBusinessName,
        reportLabel: 'Purchasing',
        title: selectedReport.name,
        description: selectedReport.description,
        rangeLabel,
        generatedLabel: previewGeneratedLabel,
        filenameBase,
        meta: [
          { label: 'Restock records', value: formatNumber(derived.restocks.length, localeTag) },
          {
            label: 'Units received',
            value: formatNumber(
              sumNumbers(derived.restockItems.map((item) => item.quantity)),
              localeTag,
            ),
          },
          {
            label: 'Total cost',
            value: formatCurrencyBase(
              sumNumbers(
                derived.restocks.map((restock) => restock.total_cost ?? restock.total_amount ?? 0),
              ),
              localeTag,
              businessCurrency),
            tone: 'warning',
          },
          {
            label: 'On credit',
            value: formatCurrencyBase(
              sumNumbers(derived.restocks.map((restock) => restock.credit_amount ?? 0)),
              localeTag,
              businessCurrency),
            tone: 'danger',
          },
        ],
        summaryRows: [
          { label: 'Restock records', value: formatNumber(derived.restocks.length, localeTag) },
          {
            label: 'Units received',
            value: formatNumber(
              sumNumbers(derived.restockItems.map((item) => item.quantity)),
              localeTag,
            ),
          },
          {
            label: 'Total cost',
            value: formatCurrencyBase(
              sumNumbers(
                derived.restocks.map((restock) => restock.total_cost ?? restock.total_amount ?? 0),
              ),
              localeTag,
              businessCurrency),
          },
        ],
        excelSections: [restockTable, supplierTable],
        sections: [
          {
            kind: 'stats',
            cards: [
              {
                label: t('stats.restocks'),
                value: formatNumber(derived.restocks.length, localeTag),
                hint: t('stats.restocks_hint'),
                tone: 'info',
              },
              {
                label: t('stats.total_cost'),
                value: formatCurrencyCompactBase(
                  sumNumbers(
                    derived.restocks.map((restock) => restock.total_cost ?? restock.total_amount ?? 0),
                  ),
                  localeTag,
                  businessCurrency),
                hint: t('stats.stock_investment_hint'),
                tone: 'warning',
              },
              {
                label: t('stats.credit_issued'),
                value: formatCurrencyCompactBase(
                  sumNumbers(derived.restocks.map((restock) => restock.credit_amount ?? 0)),
                  localeTag,
                  businessCurrency),
                hint: t('stats.supplier_credit_hint'),
                tone: 'danger',
              },
              {
                label: 'Units received',
                value: formatNumber(
                  sumNumbers(derived.restockItems.map((item) => item.quantity)),
                  localeTag,
                ),
                hint: 'sum of restock item quantities',
                tone: 'success',
              },
            ],
          },
          {
            kind: 'table',
            title: 'Restock records detail',
            table: restockTable,
          },
          {
            kind: 'table',
            title: 'Supplier summary',
            table: supplierTable,
          },
          {
            kind: 'note',
            title: 'Notes',
            tone: 'info',
            lines: [
              'Product summaries are based on restock item rows linked to each restock record.',
              'On-credit amounts come from the stored credit balance for the restock, or are inferred from paid versus total cost.',
              'Supplier totals help identify where the current purchasing exposure is concentrated.',
            ],
          },
        ],
      })
    }

    if (selectedReport.id === 'expense-breakdown') {
      const recurringTotal = sumNumbers(
        derived.expenses
          .filter((expense) => expense.isRecurring)
          .map((expense) => expense.amount),
      )
      const oneOffTotal = derived.totalExpenses - recurringTotal
      const largestExpenseCategory = derived.expenseCategoryRows[0]
      const expenseTable: TemplateSection = {
        columns: ['Description', 'Date', 'Category', 'Vendor', 'Amount', 'Type', 'Recorded by'],
        rows: derived.expenses
          .slice()
          .sort((left, right) => right.expenseDate.localeCompare(left.expenseDate))
          .slice(0, 40)
          .map((expense) => [
            expense.description,
            formatDateLabel(expense.expenseDate, localeTag),
            expense.category?.name || t('uncategorized'),
            expense.vendor || '-',
            formatCurrencyBase(expense.amount, localeTag, businessCurrency),
            expense.isRecurring ? 'Recurring' : 'One-off',
            expense.recordedBy?.name || 'Local user',
          ]),
      }

      return buildCompositeReportTemplate({
        businessName: fallbackBusinessName,
        reportLabel: 'Financial',
        title: selectedReport.name,
        description: selectedReport.description,
        rangeLabel,
        generatedLabel: previewGeneratedLabel,
        filenameBase,
        meta: [
          { label: 'Total expenses', value: formatCurrencyBase(derived.totalExpenses, localeTag, businessCurrency), tone: 'danger' },
          {
            label: 'Recurring',
            value: `${formatCurrencyBase(recurringTotal, localeTag, businessCurrency)} (${formatPercent(
              percentageOf(recurringTotal, Math.max(derived.totalExpenses, 1)),
              localeTag,
            )}%)`,
          },
          {
            label: 'One-off',
            value: `${formatCurrencyBase(oneOffTotal, localeTag, businessCurrency)} (${formatPercent(
              percentageOf(oneOffTotal, Math.max(derived.totalExpenses, 1)),
              localeTag,
            )}%)`,
          },
          {
            label: 'Categories',
            value: formatNumber(derived.expenseCategoryRows.length, localeTag),
          },
        ],
        summaryRows: [
          { label: 'Total expenses', value: formatCurrencyBase(derived.totalExpenses, localeTag, businessCurrency) },
          { label: 'Recurring', value: formatCurrencyBase(recurringTotal, localeTag, businessCurrency) },
          { label: 'One-off', value: formatCurrencyBase(oneOffTotal, localeTag, businessCurrency) },
        ],
        excelSections: [
          {
            title: 'Expense by category',
            columns: ['Category', 'Amount', 'Share', 'Entries'],
            rows: derived.expenseCategoryRows.map((row) => [
              row.name,
              formatCurrencyBase(row.amount, localeTag, businessCurrency),
              `${formatPercent(percentageOf(row.amount, Math.max(derived.totalExpenses, 1)), localeTag)}%`,
              formatNumber(row.count, localeTag),
            ]),
          },
          expenseTable,
        ],
        sections: [
          {
            kind: 'stats',
            cards: [
              {
                label: t('stats.expenses'),
                value: formatCurrencyCompactBase(derived.totalExpenses, localeTag, businessCurrency),
                hint: `${formatNumber(derived.expenses.length, localeTag)} ${t('stats.entries_hint')}`,
                tone: 'warning',
              },
              {
                label: t('stats.recurring'),
                value: formatCurrencyCompactBase(recurringTotal, localeTag, businessCurrency),
                hint: t('stats.recurring_expenses_hint'),
                tone: 'info',
              },
              {
                label: 'One-off',
                value: formatCurrencyCompactBase(oneOffTotal, localeTag, businessCurrency),
                hint: 'variable or one-time entries',
                tone: 'default',
              },
              {
                label: t('stats.categories'),
                value: formatNumber(derived.expenseCategoryRows.length, localeTag),
                hint: t('stats.categories_hint'),
              },
            ],
          },
          {
            kind: 'progress_rows',
            title: 'Expense by category',
            rows: derived.expenseCategoryRows.map((row) => ({
              label: row.name,
              value: formatCurrencyBase(row.amount, localeTag, businessCurrency),
              hint: `${formatPercent(percentageOf(row.amount, Math.max(derived.totalExpenses, 1)), localeTag)}% of expenses · ${formatNumber(row.count, localeTag)} entries`,
              percent: percentageOf(row.amount, Math.max(derived.totalExpenses, 1)),
              tone: row.recurringAmount > 0 ? 'warning' : 'info',
            })),
          },
          {
            kind: 'mini_cards',
            title: 'Expense mix',
            columns: 2,
            cards: [
              {
                label: 'Fixed / recurring total',
                value: formatCurrencyBase(recurringTotal, localeTag, businessCurrency),
                hint: `${formatPercent(percentageOf(recurringTotal, Math.max(derived.totalExpenses, 1)), localeTag)}% of expenses`,
                tone: 'info',
              },
              {
                label: 'Variable / one-off total',
                value: formatCurrencyBase(oneOffTotal, localeTag, businessCurrency),
                hint: `${formatPercent(percentageOf(oneOffTotal, Math.max(derived.totalExpenses, 1)), localeTag)}% of expenses`,
              },
            ],
          },
          {
            kind: 'table',
            title: 'Full expense listing',
            table: expenseTable,
          },
          {
            kind: 'note',
            title: 'Notes',
            tone: 'info',
            lines: [
              'Recurring flags are informational and depend on how the expense was recorded on this device.',
              largestExpenseCategory
                ? `Largest expense category in range is ${largestExpenseCategory.name} at ${formatCurrencyBase(largestExpenseCategory.amount, localeTag, businessCurrency)}.`
                : 'No expense categories were recorded in this range.',
              'Use the exported detail sheet to review vendors, categories and one-off spending outliers.',
            ],
          },
        ],
      })
    }

    if (selectedReport.id === 'revenue-vs-expenses') {
      const costBySaleId = new Map<string, number>()
      for (const item of derived.completedItems) {
        costBySaleId.set(
          item.sale_id,
          (costBySaleId.get(item.sale_id) ?? 0) + (item.cost_price ?? 0) * item.quantity,
        )
      }

      const monthlyMap = new Map<
        string,
        { key: string; label: string; revenue: number; cogs: number; expenses: number }
      >()

      for (const sale of derived.completedSales) {
        const saleDate = sale.sale_date || sale.created_at.slice(0, 10)
        const key = saleDate.slice(0, 7)
        const current = monthlyMap.get(key) ?? {
          key,
          label: formatMonthKeyLabel(key, localeTag),
          revenue: 0,
          cogs: 0,
          expenses: 0,
        }
        current.revenue += sale.total_amount ?? 0
        current.cogs += costBySaleId.get(sale.id) ?? 0
        monthlyMap.set(key, current)
      }

      for (const expense of derived.expenses) {
        const key = expense.expenseDate.slice(0, 7)
        const current = monthlyMap.get(key) ?? {
          key,
          label: formatMonthKeyLabel(key, localeTag),
          revenue: 0,
          cogs: 0,
          expenses: 0,
        }
        current.expenses += expense.amount
        monthlyMap.set(key, current)
      }

      const monthlyRows = Array.from(monthlyMap.values()).sort((left, right) =>
        left.key.localeCompare(right.key),
      )
      const highestRevenueRow = monthlyRows.slice().sort((left, right) => right.revenue - left.revenue)[0]
      const weakestNetRow = monthlyRows
        .slice()
        .sort(
          (left, right) =>
            left.revenue - left.cogs - left.expenses - (right.revenue - right.cogs - right.expenses),
        )[0]
      const trendTable: TemplateSection = {
        columns: ['Month', 'Revenue', 'COGS', 'Gross profit', 'Margin', 'Expenses', 'Net profit', 'Net margin'],
        rows: monthlyRows.map((row) => {
          const grossProfit = row.revenue - row.cogs
          const netProfit = grossProfit - row.expenses
          return [
            row.label,
            formatCurrencyBase(row.revenue, localeTag, businessCurrency),
            formatCurrencyBase(row.cogs, localeTag, businessCurrency),
            formatCurrencyBase(grossProfit, localeTag, businessCurrency),
            `${formatPercent(percentageOf(grossProfit, Math.max(row.revenue, 1)), localeTag)}%`,
            formatCurrencyBase(row.expenses, localeTag, businessCurrency),
            formatCurrencyBase(netProfit, localeTag, businessCurrency),
            `${formatPercent(percentageOf(netProfit, Math.max(row.revenue, 1)), localeTag)}%`,
          ]
        }),
        footer: [
          'Total / Avg.',
          formatCurrencyBase(sumNumbers(monthlyRows.map((row) => row.revenue)), localeTag, businessCurrency),
          formatCurrencyBase(sumNumbers(monthlyRows.map((row) => row.cogs)), localeTag, businessCurrency),
          formatCurrencyBase(
            sumNumbers(monthlyRows.map((row) => row.revenue - row.cogs)),
            localeTag,
            businessCurrency),
          `${formatPercent(percentageOf(derived.grossProfit, Math.max(derived.totalRevenue, 1)), localeTag)}%`,
          formatCurrencyBase(sumNumbers(monthlyRows.map((row) => row.expenses)), localeTag, businessCurrency),
          formatCurrencyBase(
            sumNumbers(monthlyRows.map((row) => row.revenue - row.cogs - row.expenses)),
            localeTag,
            businessCurrency),
          `${formatPercent(percentageOf(derived.netProfit, Math.max(derived.totalRevenue, 1)), localeTag)}%`,
        ],
      }

      return buildCompositeReportTemplate({
        businessName: fallbackBusinessName,
        reportLabel: 'Financial trend',
        title: selectedReport.name,
        description: selectedReport.description,
        rangeLabel,
        generatedLabel: previewGeneratedLabel,
        filenameBase,
        meta: [
          { label: 'Period', value: rangeLabel },
          { label: 'Total revenue', value: formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency), tone: 'success' },
          { label: 'Total expenses', value: formatCurrencyBase(derived.totalExpenses, localeTag, businessCurrency), tone: 'danger' },
          {
            label: 'Net result',
            value: formatCurrencyBase(derived.netProfit, localeTag, businessCurrency),
            tone: derived.netProfit >= 0 ? 'success' : 'danger',
          },
        ],
        summaryRows: [
          { label: 'Revenue', value: formatCurrencyBase(derived.totalRevenue, localeTag, businessCurrency) },
          { label: 'COGS', value: formatCurrencyBase(derived.totalCost, localeTag, businessCurrency) },
          { label: 'Expenses', value: formatCurrencyBase(derived.totalExpenses, localeTag, businessCurrency) },
          { label: 'Net profit', value: formatCurrencyBase(derived.netProfit, localeTag, businessCurrency) },
        ],
        excelSections: [trendTable],
        sections: [
          {
            kind: 'stats',
            cards: [
              {
                label: t('stats.revenue'),
                value: formatCurrencyCompactBase(derived.totalRevenue, localeTag, businessCurrency),
                hint: t('stats.topline_hint'),
                tone: 'success',
              },
              {
                label: t('stats.gross_profit'),
                value: formatCurrencyCompactBase(derived.grossProfit, localeTag, businessCurrency),
                hint: `${formatPercent(percentageOf(derived.grossProfit, Math.max(derived.totalRevenue, 1)), localeTag)}% gross margin`,
                tone: derived.grossProfit >= 0 ? 'info' : 'danger',
              },
              {
                label: t('stats.expenses'),
                value: formatCurrencyCompactBase(derived.totalExpenses, localeTag, businessCurrency),
                hint: t('stats.total_expense_hint'),
                tone: 'warning',
              },
              {
                label: t('stats.net_profit'),
                value: formatCurrencyCompactBase(derived.netProfit, localeTag, businessCurrency),
                hint: t('stats.range_result_hint'),
                tone: derived.netProfit >= 0 ? 'success' : 'danger',
              },
            ],
          },
          {
            kind: 'chart',
            title: 'Monthly P&L trend',
            legend: [
              { label: 'Revenue', tone: 'success' },
              { label: 'Gross profit', tone: 'info' },
              { label: 'Expenses', tone: 'danger' },
            ],
            points: monthlyRows.map((row) => ({
              label: row.label,
              revenue: row.revenue,
              grossProfit: row.revenue - row.cogs,
              expenses: row.expenses,
            })),
          },
          {
            kind: 'table',
            title: 'Monthly breakdown table',
            table: trendTable,
          },
          {
            kind: 'note',
            title: 'Analysis',
            tone: derived.netProfit >= 0 ? 'info' : 'warning',
            lines: [
              highestRevenueRow
                ? `Highest revenue month in range: ${highestRevenueRow.label} with ${formatCurrencyBase(highestRevenueRow.revenue, localeTag, businessCurrency)}.`
                : 'No monthly revenue row is available for the selected range.',
              weakestNetRow
                ? `Weakest net month in range: ${weakestNetRow.label} with ${formatCurrencyBase(
                    weakestNetRow.revenue - weakestNetRow.cogs - weakestNetRow.expenses,
                    localeTag,
                    businessCurrency)}.`
                : 'No monthly expense row is available for the selected range.',
              'Use this report to compare gross profit generation against expense pressure month over month.',
            ],
          },
        ],
      })
    }

    if (selectedReport.id === 'creditors-ageing') {
      const openDebts = derived.openPayableDebts
      const totalOutstanding = sumNumbers(openDebts.map((debt) => debt.outstandingAmount))
      const todayKey = formatDateKey(startOfLocalDay(new Date()))
      const overdueCount = openDebts.filter((debt) => {
        if (debt.dueDate) {
          return debt.dueDate < todayKey
        }

        return getAgeDays(debt.createdAt) > 30
      }).length
      const dueWithinSevenDays = sumNumbers(
        openDebts
          .filter((debt) => debt.dueDate && debt.dueDate >= todayKey)
          .filter((debt) => daysBetweenInclusive(todayKey, debt.dueDate || todayKey) <= 7)
          .map((debt) => debt.outstandingAmount),
      )
      const detailTable: TemplateSection = {
        columns: [
          'Supplier',
          'Reference',
          'Restock date',
          'Age',
          'Original',
          'Paid',
          'Outstanding',
          'Status',
          'Due date',
        ],
        rows: openDebts.map((debt) => {
          const ageDays = getAgeDays(debt.createdAt)
          const isOverdue = debt.dueDate ? debt.dueDate < todayKey : ageDays > 30
          return [
            debt.contact?.name || debt.sourceReference,
            debt.sourceReference,
            formatDateLabel(debt.createdAt.slice(0, 10), localeTag),
            `${ageDays}d`,
            formatCurrencyBase(debt.originalAmount, localeTag, businessCurrency),
            formatCurrencyBase(debt.paidAmount, localeTag, businessCurrency),
            formatCurrencyBase(debt.outstandingAmount, localeTag, businessCurrency),
            isOverdue
              ? 'Overdue'
              : debt.status === DebtStatus.PARTIALLY_PAID
                ? 'Partial'
                : 'Outstanding',
            debt.dueDate ? formatDateLabel(debt.dueDate, localeTag) : '-',
          ]
        }),
        footer: [
          'Total outstanding',
          '',
          '',
          '',
          formatCurrencyBase(sumNumbers(openDebts.map((debt) => debt.originalAmount)), localeTag, businessCurrency),
          formatCurrencyBase(sumNumbers(openDebts.map((debt) => debt.paidAmount)), localeTag, businessCurrency),
          formatCurrencyBase(totalOutstanding, localeTag, businessCurrency),
          '',
          '',
        ],
      }

      return buildCompositeReportTemplate({
        businessName: fallbackBusinessName,
        reportLabel: 'Credit management',
        title: selectedReport.name,
        description: selectedReport.description,
        rangeLabel,
        generatedLabel: previewGeneratedLabel,
        filenameBase,
        meta: [
          { label: 'Total payable', value: formatCurrencyBase(totalOutstanding, localeTag, businessCurrency), tone: 'danger' },
          { label: 'Active creditors', value: formatNumber(openDebts.length, localeTag) },
          { label: 'Overdue', value: formatNumber(overdueCount, localeTag), tone: 'danger' },
          { label: 'Due within 7 days', value: formatCurrencyBase(dueWithinSevenDays, localeTag, businessCurrency), tone: 'warning' },
        ],
        summaryRows: [
          { label: 'Total payable', value: formatCurrencyBase(totalOutstanding, localeTag, businessCurrency) },
          { label: 'Active creditors', value: formatNumber(openDebts.length, localeTag) },
          { label: 'Overdue', value: formatNumber(overdueCount, localeTag) },
        ],
        excelSections: [
          {
            title: 'Ageing buckets',
            columns: ['Bucket', 'Amount', 'Count', 'Share'],
            rows: derived.payableAgeing.map((row) => [
              row.label,
              formatCurrencyBase(row.amount, localeTag, businessCurrency),
              formatNumber(row.count, localeTag),
              `${formatPercent(row.percentage, localeTag)}%`,
            ]),
          },
          detailTable,
        ],
        sections: [
          {
            kind: 'stats',
            cards: [
              {
                label: t('stats.open_balances'),
                value: formatNumber(openDebts.length, localeTag),
                hint: t('stats.open_balances_hint'),
                tone: 'info',
              },
              {
                label: t('stats.outstanding'),
                value: formatCurrencyCompactBase(totalOutstanding, localeTag, businessCurrency),
                hint: t('stats.current_exposure_hint'),
                tone: 'warning',
              },
              {
                label: 'Overdue',
                value: formatNumber(overdueCount, localeTag),
                hint: 'payables past due date or older than 30 days',
                tone: 'danger',
              },
              {
                label: 'Due soon',
                value: formatCurrencyCompactBase(dueWithinSevenDays, localeTag, businessCurrency),
                hint: 'due within the next 7 days',
                tone: 'warning',
              },
            ],
          },
          {
            kind: 'mini_cards',
            title: 'Payables by age bucket',
            columns: 4,
            cards: derived.payableAgeing.map((row, index) => ({
              label: row.label,
              value: formatCurrencyBase(row.amount, localeTag, businessCurrency),
              hint: `${formatNumber(row.count, localeTag)} debts · ${formatPercent(row.percentage, localeTag)}%`,
              tone:
                index === 3 ? ('danger' as const) : index === 2 ? ('warning' as const) : ('info' as const),
            })),
          },
          {
            kind: 'table',
            title: 'Detailed payables listing',
            table: detailTable,
          },
          {
            kind: 'note',
            title: 'Action required',
            tone: overdueCount > 0 ? 'danger' : 'warning',
            lines: [
              overdueCount > 0
                ? `${formatNumber(overdueCount, localeTag)} supplier balances are currently overdue and should be prioritised.`
                : 'No supplier balances are currently overdue on this device.',
              dueWithinSevenDays > 0
                ? `${formatCurrencyBase(dueWithinSevenDays, localeTag, businessCurrency)} is due within the next 7 days.`
                : 'No supplier balances are falling due within the next 7 days.',
            ],
          },
        ],
      })
    }

    if (selectedReport.id === 'contact-statement') {
      const primaryDebt =
        derived.receivableDebts
          .slice()
          .sort((left, right) => right.outstandingAmount - left.outstandingAmount)[0] ||
        derived.payableDebts
          .slice()
          .sort((left, right) => right.outstandingAmount - left.outstandingAmount)[0]

      if (primaryDebt) {
        const statementDirection = primaryDebt.direction
        const sourceDebts =
          statementDirection === DebtDirection.RECEIVABLE
            ? derived.receivableDebts
            : derived.payableDebts
        const contactKey = primaryDebt.contactId || primaryDebt.contact?.name || primaryDebt.sourceReference
        const contactDebts = sourceDebts.filter((debt) => {
          const debtKey = debt.contactId || debt.contact?.name || debt.sourceReference
          return debtKey === contactKey
        })

        const events: Array<{
          date: string
          reference: string
          type: string
          description: string
          debit: number
          credit: number
        }> = []

        for (const debt of contactDebts) {
          events.push({
            date: debt.createdAt.slice(0, 10),
            reference: debt.sourceReference,
            type: 'Debt created',
            description:
              statementDirection === DebtDirection.RECEIVABLE
                ? 'Credit sale recorded'
                : 'Supplier credit recorded',
            debit: statementDirection === DebtDirection.RECEIVABLE ? debt.originalAmount : 0,
            credit: statementDirection === DebtDirection.PAYABLE ? debt.originalAmount : 0,
          })

          for (const payment of debt.payments ?? []) {
            events.push({
              date: payment.paymentDate,
              reference: debt.sourceReference,
              type: 'Payment',
              description:
                statementDirection === DebtDirection.RECEIVABLE
                  ? 'Payment received'
                  : 'Payment made',
              debit: statementDirection === DebtDirection.PAYABLE ? payment.amount : 0,
              credit: statementDirection === DebtDirection.RECEIVABLE ? payment.amount : 0,
            })
          }

          if (debt.writtenOffAt && debt.status === DebtStatus.WRITTEN_OFF) {
            events.push({
              date: debt.writtenOffAt.slice(0, 10),
              reference: debt.sourceReference,
              type: 'Write-off',
              description: debt.writtenOffReason || 'Written off',
              debit: statementDirection === DebtDirection.PAYABLE ? debt.outstandingAmount : 0,
              credit: statementDirection === DebtDirection.RECEIVABLE ? debt.outstandingAmount : 0,
            })
          }
        }

        events.sort((left, right) => left.date.localeCompare(right.date))

        let openingBalance = 0
        for (const event of events) {
          if (event.date < appliedRange.startDate) {
            openingBalance += event.debit - event.credit
          }
        }

        let runningBalance = openingBalance
        const statementRows = events
          .filter((event) => event.date >= appliedRange.startDate && event.date <= appliedRange.endDate)
          .map((event) => {
            runningBalance += event.debit - event.credit
            return [
              formatDateLabel(event.date, localeTag),
              event.reference,
              event.type,
              event.description,
              event.debit > 0 ? formatCurrencyBase(event.debit, localeTag, businessCurrency) : '-',
              event.credit > 0 ? formatCurrencyBase(event.credit, localeTag, businessCurrency) : '-',
              formatCurrencyBase(Math.abs(runningBalance), localeTag, businessCurrency),
            ]
          })

        const closingBalance = sumNumbers(contactDebts.map((debt) => debt.outstandingAmount))
        const statementTable: TemplateSection = {
          columns: ['Date', 'Reference', 'Type', 'Description', 'Debit', 'Credit', 'Balance'],
          rows: statementRows,
          footer: [
            `Closing balance - ${formatDateLabel(appliedRange.endDate, localeTag)}`,
            '',
            '',
            '',
            '',
            '',
            formatCurrencyBase(closingBalance, localeTag, businessCurrency),
          ],
        }

        return buildCompositeReportTemplate({
          businessName: fallbackBusinessName,
          reportLabel: 'Account statement',
          title: selectedReport.name,
          description: selectedReport.description,
          rangeLabel,
          generatedLabel: previewGeneratedLabel,
          filenameBase,
          meta: [
            {
              label: 'Contact type',
              value:
                statementDirection === DebtDirection.RECEIVABLE ? 'Customer' : 'Supplier',
            },
            { label: 'Phone', value: primaryDebt.contact?.phone || '-' },
            { label: 'Opening balance', value: formatCurrencyBase(Math.abs(openingBalance), localeTag, businessCurrency) },
            {
              label: 'Closing balance',
              value: formatCurrencyBase(closingBalance, localeTag, businessCurrency),
              tone: closingBalance > 0 ? 'danger' : 'success',
            },
          ],
          summaryRows: [
            { label: 'Contact', value: primaryDebt.contact?.name || primaryDebt.sourceReference },
            { label: 'Opening balance', value: formatCurrencyBase(Math.abs(openingBalance), localeTag, businessCurrency) },
            { label: 'Closing balance', value: formatCurrencyBase(closingBalance, localeTag, businessCurrency) },
          ],
          excelSections: [statementTable],
          sections: [
            {
              kind: 'stats',
              cards: [
                {
                  label: t('stats.contacts'),
                  value: primaryDebt.contact?.name || primaryDebt.sourceReference,
                  hint:
                    statementDirection === DebtDirection.RECEIVABLE
                      ? 'largest receivable contact in range'
                      : 'largest payable contact in range',
                  tone: 'info',
                },
                {
                  label: 'Entries',
                  value: formatNumber(statementRows.length, localeTag),
                  hint: 'ledger rows in selected range',
                },
                {
                  label: t('stats.outstanding'),
                  value: formatCurrencyCompactBase(closingBalance, localeTag, businessCurrency),
                  hint:
                    statementDirection === DebtDirection.RECEIVABLE
                      ? 'still owed to the business'
                      : 'still owed to supplier',
                  tone: 'warning',
                },
                {
                  label: 'Opening balance',
                  value: formatCurrencyCompactBase(Math.abs(openingBalance), localeTag, businessCurrency),
                  hint: 'balance brought into range',
                },
              ],
            },
            {
              kind: 'table',
              title: `Account ledger - ${primaryDebt.contact?.name || primaryDebt.sourceReference}`,
              table: statementTable,
            },
            {
              kind: 'note',
              title: 'Statement notes',
              tone: 'warning',
              lines: [
                statementDirection === DebtDirection.RECEIVABLE
                  ? 'Debit rows increase what the contact owes to the business; credit rows reduce it.'
                  : 'Credit rows increase what the business owes to the supplier; debit rows reduce it.',
                'This preview is generated from the contact with the largest current balance available on this device.',
              ],
            },
          ],
        })
      }
    }

    if (selectedReport.id === 'credit-activity') {
      const receivableOutstanding = sumNumbers(
        derived.openReceivableDebts.map((debt) => debt.outstandingAmount),
      )
      const payableIssued = sumNumbers(
        derived.payableDebts
          .filter(
            (debt) =>
              debt.createdAt.slice(0, 10) >= appliedRange.startDate &&
              debt.createdAt.slice(0, 10) <= appliedRange.endDate,
          )
          .map((debt) => debt.originalAmount),
      )
      const payableCollected = sumNumbers(
        derived.payableDebts.flatMap((debt) =>
          (debt.payments ?? [])
            .filter(
              (payment) =>
                payment.paymentDate >= appliedRange.startDate &&
                payment.paymentDate <= appliedRange.endDate,
            )
            .map((payment) => payment.amount),
        ),
      )
      const payableOutstanding = sumNumbers(
        derived.openPayableDebts.map((debt) => debt.outstandingAmount),
      )
      const avgReceivableDays = (() => {
        const ages = derived.receivableDebts
          .map((debt) => {
            const settledAt = debt.settledAt || debt.writtenOffAt
            if (!settledAt) {
              return null
            }
            return Math.max(
              0,
              Math.floor(
                (new Date(settledAt).getTime() - new Date(debt.createdAt).getTime()) /
                  (24 * 60 * 60 * 1000),
              ),
            )
          })
          .filter((value): value is number => value !== null)

        return ages.length > 0 ? sumNumbers(ages) / ages.length : 0
      })()
      const avgPayableDays = (() => {
        const ages = derived.payableDebts
          .map((debt) => {
            const settledAt = debt.settledAt || debt.writtenOffAt
            if (!settledAt) {
              return null
            }
            return Math.max(
              0,
              Math.floor(
                (new Date(settledAt).getTime() - new Date(debt.createdAt).getTime()) /
                  (24 * 60 * 60 * 1000),
              ),
            )
          })
          .filter((value): value is number => value !== null)

        return ages.length > 0 ? sumNumbers(ages) / ages.length : 0
      })()

      const receivableByContact = new Map<
        string,
        { label: string; original: number; paid: number; outstanding: number; count: number }
      >()
      for (const debt of derived.receivableDebts) {
        const key = debt.contactId || debt.contact?.name || debt.sourceReference
        const current = receivableByContact.get(key) ?? {
          label: debt.contact?.name || debt.sourceReference,
          original: 0,
          paid: 0,
          outstanding: 0,
          count: 0,
        }
        current.original += debt.originalAmount
        current.paid += debt.paidAmount
        current.outstanding += debt.outstandingAmount
        current.count += 1
        receivableByContact.set(key, current)
      }
      const collectionRows = Array.from(receivableByContact.values())
        .sort((left, right) => right.outstanding - left.outstanding)
        .slice(0, 6)
        .map((row) => ({
          label: row.label,
          value: formatCurrencyBase(row.outstanding, localeTag, businessCurrency),
          hint: `${formatNumber(row.count, localeTag)} debts · ${formatPercent(
            percentageOf(row.paid, Math.max(row.original, 1)),
            localeTag,
          )}% collected`,
          percent: percentageOf(row.paid, Math.max(row.original, 1)),
          tone:
            row.outstanding > 0
              ? row.paid > 0
                ? ('warning' as const)
                : ('danger' as const)
              : ('success' as const),
        }))

      return buildCompositeReportTemplate({
        businessName: fallbackBusinessName,
        reportLabel: 'Credit overview',
        title: selectedReport.name,
        description: selectedReport.description,
        rangeLabel,
        generatedLabel: previewGeneratedLabel,
        filenameBase,
        meta: [
          { label: 'Credit issued', value: formatCurrencyBase(derived.issuedReceivable, localeTag, businessCurrency), tone: 'warning' },
          { label: 'Collected', value: formatCurrencyBase(derived.collectedReceivable, localeTag, businessCurrency), tone: 'success' },
          {
            label: 'Collection rate',
            value: `${formatPercent(
              percentageOf(derived.collectedReceivable, Math.max(derived.issuedReceivable, 1)),
              localeTag,
            )}%`,
          },
          {
            label: 'Avg. days to settle',
            value: `${formatNumber(avgReceivableDays, localeTag)} days`,
          },
        ],
        summaryRows: [
          { label: 'Credit issued', value: formatCurrencyBase(derived.issuedReceivable, localeTag, businessCurrency) },
          { label: 'Collected', value: formatCurrencyBase(derived.collectedReceivable, localeTag, businessCurrency) },
          { label: 'Outstanding', value: formatCurrencyBase(receivableOutstanding, localeTag, businessCurrency) },
          { label: 'Written off', value: formatCurrencyBase(derived.writtenOffReceivable, localeTag, businessCurrency) },
        ],
        excelSections: [
          {
            title: 'Collection by customer',
            columns: ['Contact', 'Original', 'Paid', 'Outstanding', 'Collection rate'],
            rows: Array.from(receivableByContact.values()).map((row) => [
              row.label,
              formatCurrencyBase(row.original, localeTag, businessCurrency),
              formatCurrencyBase(row.paid, localeTag, businessCurrency),
              formatCurrencyBase(row.outstanding, localeTag, businessCurrency),
              `${formatPercent(percentageOf(row.paid, Math.max(row.original, 1)), localeTag)}%`,
            ]),
          },
        ],
        sections: [
          {
            kind: 'stats',
            cards: [
              {
                label: t('stats.credit_issued'),
                value: formatCurrencyCompactBase(derived.issuedReceivable, localeTag, businessCurrency),
                hint: t('stats.new_credit_hint'),
                tone: 'warning',
              },
              {
                label: t('stats.collected'),
                value: formatCurrencyCompactBase(derived.collectedReceivable, localeTag, businessCurrency),
                hint: t('stats.collection_hint'),
                tone: 'success',
              },
              {
                label: t('stats.written_off'),
                value: formatCurrencyCompactBase(derived.writtenOffReceivable, localeTag, businessCurrency),
                hint: t('stats.write_off_hint'),
                tone: 'danger',
              },
              {
                label: 'Avg. days to settle',
                value: `${formatNumber(avgReceivableDays, localeTag)} days`,
                hint: 'settled receivable balances',
              },
            ],
          },
          {
            kind: 'mini_cards',
            title: 'Receivables activity',
            columns: 4,
            cards: [
              {
                label: 'Credit issued',
                value: formatCurrencyBase(derived.issuedReceivable, localeTag, businessCurrency),
                hint: `${formatNumber(
                  derived.receivableDebts.filter(
                    (debt) =>
                      debt.createdAt.slice(0, 10) >= appliedRange.startDate &&
                      debt.createdAt.slice(0, 10) <= appliedRange.endDate,
                  ).length,
                  localeTag,
                )} receivable debts`,
                tone: 'warning',
              },
              {
                label: 'Collected',
                value: formatCurrencyBase(derived.collectedReceivable, localeTag, businessCurrency),
                hint: `${formatPercent(
                  percentageOf(derived.collectedReceivable, Math.max(derived.issuedReceivable, 1)),
                  localeTag,
                )}% recovery`,
                tone: 'success',
              },
              {
                label: 'Still outstanding',
                value: formatCurrencyBase(receivableOutstanding, localeTag, businessCurrency),
                hint: `${formatNumber(derived.openReceivableDebts.length, localeTag)} open debts`,
                tone: 'warning',
              },
              {
                label: 'Written off',
                value: formatCurrencyBase(derived.writtenOffReceivable, localeTag, businessCurrency),
                hint: 'receivables written off in range',
                tone: 'danger',
              },
            ],
          },
          {
            kind: 'progress_rows',
            title: 'Collection rate by customer',
            rows: collectionRows,
          },
          {
            kind: 'mini_cards',
            title: 'Payables activity',
            columns: 4,
            cards: [
              {
                label: 'Credit taken',
                value: formatCurrencyBase(payableIssued, localeTag, businessCurrency),
                hint: `${formatNumber(
                  derived.payableDebts.filter(
                    (debt) =>
                      debt.createdAt.slice(0, 10) >= appliedRange.startDate &&
                      debt.createdAt.slice(0, 10) <= appliedRange.endDate,
                  ).length,
                  localeTag,
                )} payable debts`,
                tone: 'warning',
              },
              {
                label: 'Paid to suppliers',
                value: formatCurrencyBase(payableCollected, localeTag, businessCurrency),
                hint: `${formatPercent(
                  percentageOf(payableCollected, Math.max(payableIssued, 1)),
                  localeTag,
                )}% settled`,
                tone: 'success',
              },
              {
                label: 'Still owed',
                value: formatCurrencyBase(payableOutstanding, localeTag, businessCurrency),
                hint: `${formatNumber(derived.openPayableDebts.length, localeTag)} open payables`,
                tone: 'warning',
              },
              {
                label: 'Avg. days to pay',
                value: `${formatNumber(avgPayableDays, localeTag)} days`,
                hint: `vs ${formatNumber(avgReceivableDays, localeTag)} days to collect`,
              },
            ],
          },
          {
            kind: 'note',
            title: 'Credit health insight',
            tone: 'warning',
            lines: [
              avgPayableDays > 0 && avgReceivableDays > 0 && avgPayableDays < avgReceivableDays
                ? 'The business is paying suppliers faster than it collects from customers, which can widen the cash gap.'
                : 'Supplier and customer credit cycles are relatively aligned in the visible data range.',
              `Open customer exposure is ${formatCurrencyBase(receivableOutstanding, localeTag, businessCurrency)} while open supplier exposure is ${formatCurrencyBase(payableOutstanding, localeTag, businessCurrency)}.`,
            ],
          },
        ],
      })
    }

    return buildGenericReportTemplate({
      businessName: fallbackBusinessName,
      reportLabel: selectedReport.badge,
      title: selectedReport.name,
      description: selectedReport.description,
      rangeLabel,
      generatedLabel: previewGeneratedLabel,
      filenameBase,
      meta: [
        { label: 'Period', value: rangeLabel },
        { label: 'Report', value: selectedReport.badge },
        { label: 'Source', value: selectedReport.source },
        { label: 'Currency', value: businessCurrency, tone: 'info' },
      ],
      summaryRows: reportViewModel.exportModel.summaryRows,
      excelSections: reportViewModel.exportModel.table
        ? [reportViewModel.exportModel.table]
        : [],
      stats: reportViewModel.stats.map((stat) => ({
        label: stat.label,
        value: stat.value,
        hint: stat.hint,
        tone: toTemplateTone(stat.tone) ?? 'default',
      })),
      table: reportViewModel.exportModel.table,
      emptyMessage: reportViewModel.kind === 'note' ? reportViewModel.note : reportViewModel.empty,
    })
  }, [
    appliedRange.endDate,
    appliedRange.startDate,
    businessName,
    derived,
    localeTag,
    previewGeneratedLabel,
    rangeLabel,
    reportViewModel,
    revenueAnalysisRows,
    revenuePaymentRows,
    selectedReport,
    t,
    tSell,
  ])

  const revenueTrendInlineStats = useMemo<ReportStat[]>(
    () => [
      {
        label: t('stats.revenue'),
        value: formatCurrencyCompactBase(derived.totalRevenue, localeTag, businessCurrency),
        hint: `${formatNumber(derived.completedSales.length, localeTag)} ${t(
          'stats.transactions_hint',
        )}`,
        tone: 'positive',
      },
      {
        label: t('stats.gross_profit'),
        value: formatCurrencyCompactBase(derived.grossProfit, localeTag, businessCurrency),
        hint: `${formatPercent(percentageOf(derived.grossProfit, derived.totalRevenue), localeTag)}% ${t(
          'stats.margin_hint',
        )}`,
        tone: derived.grossProfit >= 0 ? 'info' : 'danger',
      },
      {
        label: t('stats.avg_basket'),
        value: formatCurrencyCompactBase(derived.averageOrderValue, localeTag, businessCurrency),
        hint: t('stats.avg_basket_hint'),
        tone: 'default',
      },
    ],
    [
      derived.averageOrderValue,
      derived.completedSales.length,
      derived.grossProfit,
      derived.totalRevenue,
      localeTag,
      t,
    ],
  )

  const profitLossReportDefinition =
    REPORT_DEFINITIONS.find((report) => report.id === 'profit-loss') ?? DEFAULT_REPORT
  const revenueTrendReportDefinition =
    REPORT_DEFINITIONS.find((report) => report.id === 'revenue-trend') ?? DEFAULT_REPORT
  const profitLossAccess = reportAccessById.get(profitLossReportDefinition.id)
  const revenueTrendAccess = reportAccessById.get(revenueTrendReportDefinition.id)
  const canOpenProfitLoss = profitLossAccess?.allowed ?? true
  const canOpenRevenueTrend = revenueTrendAccess?.allowed ?? true

  const handlePresetSelect = (preset: Exclude<ReportPreset, 'custom'>) => {
    const nextRange = resolvePresetRange(preset)
    setDraftStartDate(nextRange.startDate)
    setDraftEndDate(nextRange.endDate)
    setAppliedRange(nextRange)
  }

  const handleRunReport = () => {
    if (!draftStartDate || !draftEndDate) {
      toast.error(t('errors.missing_dates'))
      return
    }

    if (draftStartDate > draftEndDate) {
      toast.error(t('errors.invalid_range'))
      return
    }

    setAppliedRange({
      preset: 'custom',
      startDate: draftStartDate,
      endDate: draftEndDate,
    })
  }

  const handleOpenReportPreview = (reportId: ReportId) => {
    const report = REPORT_DEFINITIONS.find((entry) => entry.id === reportId)
    if (report && promptForLockedReport(report)) {
      return
    }

    setPreviewReportId(reportId)
    setPreviewGeneratedAt(new Date().toISOString())
    setIsExportMenuOpen(false)
    setIsPreviewDialogOpen(true)
  }

  const handleExportExcel = async () => {
    if (!activeReportDocument) {
      return
    }

    if (!canExportCsv) {
      promptForLockedExport(t('export.excel'), csvExportAccess?.requiredPlan ?? null)
      return
    }

    setExportingExcel(true)

    try {
      if (hasDesktopIpc()) {
        const result = await ipc.documents.exportFile({
          content: activeReportDocument.excelContent,
          filename: activeReportDocument.excelFilename,
          filters: [{ name: 'CSV file', extensions: ['csv'] }],
        })

        if (result.success) {
          toast.success(t('export.excel_ready'))
          return
        }

        if (!result.canceled) {
          toast.error(result.error || t('export.excel_error'))
        }

        return
      }

      downloadFile(
        new Blob([activeReportDocument.excelContent], {
          type: 'text/csv;charset=utf-8',
        }),
        activeReportDocument.excelFilename,
      )
      toast.success(t('export.excel_ready'))
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : t('export.excel_error'))
    } finally {
      setExportingExcel(false)
    }
  }

  const handleExportPdf = async () => {
    if (!activeReportDocument) {
      return
    }

    if (!canExportPdf) {
      promptForLockedExport(t('export.pdf'), pdfExportAccess?.requiredPlan ?? null)
      return
    }

    if (!hasDesktopIpc()) {
      toast.error(t('export.pdf_desktop_only'))
      return
    }

    setExportingPdf(true)

    try {
      const result = await ipc.documents.exportPdf({
        html: activeReportDocument.html,
        filename: activeReportDocument.pdfFilename,
      })

      if (result.success) {
        toast.success(t('export.pdf_ready'))
        return
      }

      if (!result.canceled) {
        toast.error(result.error || t('export.pdf_error'))
      }
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : t('export.pdf_error'))
    } finally {
      setExportingPdf(false)
    }
  }

  if (!businessId) {
    return (
      <SurfaceCard title={t('title')} description={t('business_required')}>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </SurfaceCard>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground shadow-sm">
          <Spinner size="lg" />
          {t('loading')}
        </div>
      </div>
    )
  }

  if (error || !workspace) {
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
        <p className="text-sm text-muted-foreground">{error || t('load_error')}</p>
      </SurfaceCard>
    )
  }

  const sections: Array<{ key: ReportSectionKey; title: string }> = [
    { key: 'sales', title: sectionLabels.sales },
    { key: 'inventory', title: sectionLabels.inventory },
    { key: 'financial', title: sectionLabels.financial },
    { key: 'credit', title: sectionLabels.credit },
  ]
  const visibleSections = sections
    .map((section) => ({
      ...section,
      reports: filteredReports.filter((report) => report.section === section.key),
    }))
    .filter((section) => section.reports.length > 0)

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-muted-foreground">{t('range_label')}</span>
            {([
              ['today', t('presets.today')],
              ['last7', t('presets.last7')],
              ['thisMonth', t('presets.this_month')],
              ['lastMonth', t('presets.last_month')],
              ['quarter', t('presets.quarter')],
              ['year', t('presets.year')],
            ] as const).map(([preset, label]) => (
              <button
                key={preset}
                type="button"
                onClick={() => handlePresetSelect(preset)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                  appliedRange.preset === preset
                    ? 'border-success-400 bg-success-400 text-white'
                    : 'border-border bg-background text-muted-foreground hover:border-border/80 hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('search.placeholder')}
            className="h-10 w-full max-w-xs rounded-xl border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-border/80 hover:text-foreground"
            >
              {t('search.clear')}
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="reports-start-date">
            {t('start_date')}
          </label>
          <input
            id="reports-start-date"
            type="date"
            value={draftStartDate}
            onChange={(event) => setDraftStartDate(event.target.value)}
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">{t('to')}</span>
          <input
            type="date"
            value={draftEndDate}
            onChange={(event) => setDraftEndDate(event.target.value)}
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button onClick={handleRunReport} variant="primary">
            {t('run_report')}
          </Button>
        </div>

        {hasLockedReports || hasLockedExportFeature ? (
          <p className="text-sm text-muted-foreground">
            {t.rich('upgrade_hint', {
              link: (chunks) => (
                <a
                  href={`/${locale}/subscription`}
                  className="font-medium text-primary underline underline-offset-2"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        ) : null}
      </section>

      {canOpenProfitLoss ? (
        <Collapsible open={isProfitLossExpanded} onOpenChange={setIsProfitLossExpanded}>
          <SurfaceCard
            title={t('waterfall.title')}
            description={t('waterfall.description', {
              range: buildRangeLabel(appliedRange.startDate, appliedRange.endDate, localeTag),
            })}
            action={
              <CollapsibleTrigger
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-border/80 hover:text-foreground"
                aria-label={`${isProfitLossExpanded ? t('collapsible.collapse') : t('collapsible.expand')} ${t('waterfall.title')}`}
              >
                <span>{isProfitLossExpanded ? t('collapsible.collapse') : t('collapsible.expand')}</span>
                <ChevronDownIcon
                  className={cn(
                    'transition-transform duration-300 ease-in-out',
                    isProfitLossExpanded && 'rotate-180',
                  )}
                />
              </CollapsibleTrigger>
            }
          >
            <CollapsibleContent>
              <div className="space-y-3 pt-1">
                {pnlRows.map((row, index) => (
                  <div key={`${row.label}-${index}`} className="space-y-2">
                    {row.total ? <div className="h-px bg-border" /> : null}
                    <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_140px] md:items-center">
                      <div className={cn('text-sm text-muted-foreground md:text-right', row.total && 'font-semibold text-foreground')}>
                        {row.label}
                      </div>
                      <div className="h-6 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'flex h-full items-center justify-end rounded-full px-3 text-[11px] font-semibold text-white',
                            row.tone === 'positive' && 'bg-success-400',
                            row.tone === 'warning' && 'bg-warning-400',
                            row.tone === 'danger' && 'bg-danger-400',
                          )}
                          style={{ width: `${row.percent}%` }}
                        >
                          {row.value >= 0 ? '' : '-'}
                          {formatPercent(Math.abs(percentageOf(row.value, Math.max(derived.totalRevenue, 1))), localeTag)}%
                        </div>
                      </div>
                      <div
                        className={cn(
                          'text-sm font-semibold md:text-right',
                          row.tone === 'positive' && 'text-success-600 dark:text-success-400',
                          row.tone === 'warning' && 'text-warning-600 dark:text-warning-400',
                          row.tone === 'danger' && 'text-danger-600 dark:text-danger-400',
                        )}
                      >
                        {formatCurrencyBase(row.value, localeTag, businessCurrency)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </SurfaceCard>
        </Collapsible>
      ) : null}

      {canOpenRevenueTrend ? (
        <Collapsible open={isRevenueTrendExpanded} onOpenChange={setIsRevenueTrendExpanded}>
          <SurfaceCard
            title={revenueTrendReportDefinition.name}
            description={`${revenueTrendReportDefinition.description} Range: ${rangeLabel}.`}
            action={
              <CollapsibleTrigger
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-border/80 hover:text-foreground"
                aria-label={`${isRevenueTrendExpanded ? t('collapsible.collapse') : t('collapsible.expand')} ${revenueTrendReportDefinition.name}`}
              >
                <span>{isRevenueTrendExpanded ? t('collapsible.collapse') : t('collapsible.expand')}</span>
                <ChevronDownIcon
                  className={cn(
                    'transition-transform duration-300 ease-in-out',
                    isRevenueTrendExpanded && 'rotate-180',
                  )}
                />
              </CollapsibleTrigger>
            }
          >
            <CollapsibleContent>
              <div className="pt-1">
                <div className="grid gap-3 md:grid-cols-3">
                  {revenueTrendInlineStats.map((stat) => (
                    <ReportMetricCard key={`inline-revenue-${stat.label}`} stat={stat} />
                  ))}
                </div>

                <div className="mt-6">
                  {revenueTrendPoints.length > 0 ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full bg-success-400" />
                          {t('preview.legend_revenue')}
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full bg-[#A29F97]" />
                          {t('preview.legend_transactions')}
                        </span>
                      </div>
                      <DualSeriesTrendChart
                        points={revenueTrendPoints}
                        primaryMaxLabel={formatCurrencyCompactBase(
                          Math.max(...revenueTrendPoints.map((point) => point.primary), 0),
                          localeTag,
                          businessCurrency)}
                        secondaryMaxLabel={formatNumber(
                          Math.max(...revenueTrendPoints.map((point) => point.secondary), 0),
                          localeTag,
                        )}
                      />
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border bg-background/80 px-4 py-5 text-sm text-muted-foreground">
                      {t('preview.no_sales_data')}
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </SurfaceCard>
        </Collapsible>
      ) : null}

      {visibleSections.length > 0 ? (
        <>
          {visibleSections.map((section) => (
            <section key={section.key} className="space-y-3">
              <div className="border-b border-border pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {section.title}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {section.reports.map((report) => {
                  const access = reportAccessById.get(report.id)
                  const isLocked = !(access?.allowed ?? true)

                  return (
                    <button
                      key={report.id}
                      type="button"
                      onClick={() => handleOpenReportPreview(report.id)}
                      className={cn(
                        'rounded-[22px] border p-4 text-left shadow-sm transition',
                        isLocked
                          ? 'border-amber-200 bg-amber-50/70 hover:border-amber-300 hover:shadow-md'
                          : 'border-border bg-card hover:border-border/80 hover:shadow-md',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div
                          className={cn(
                            'flex h-10 w-10 items-center justify-center rounded-2xl',
                            isLocked
                              ? 'bg-amber-100 text-amber-800'
                              : getReportIconWrapperClassName(report.badgeTone),
                          )}
                        >
                          {isLocked ? <Lock className="h-4 w-4" strokeWidth={2.2} /> : <ReportIcon name={report.icon} />}
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Badge variant={report.badgeTone}>{report.badge}</Badge>
                          {isLocked ? <Badge variant="warning">{t('locked_badge')}</Badge> : null}
                        </div>
                      </div>

                      <div className="mt-4 space-y-2">
                        <h3 className={cn('text-sm font-semibold', isLocked ? 'text-amber-950' : 'text-foreground')}>
                          {report.name}
                        </h3>
                        <p
                          className={cn(
                            'text-sm leading-6',
                            isLocked ? 'text-amber-900/85' : 'text-muted-foreground',
                          )}
                        >
                          {isLocked
                            ? planGateT('locked_feature_description', {
                                report: report.name,
                                section: sectionLabels[report.section],
                                plan: access?.requiredPlan ?? 'SOLO',
                              })
                            : report.description}
                        </p>
                      </div>

                      <div
                        className={cn(
                          'mt-4 flex items-center justify-between gap-3 border-t pt-3',
                          isLocked ? 'border-amber-200/80' : 'border-border',
                        )}
                      >
                        <span className={cn('text-[11px]', isLocked ? 'text-amber-900/75' : 'text-muted-foreground')}>
                          {report.source}
                        </span>
                        <span className={cn('text-sm font-medium', isLocked ? 'text-amber-800' : 'text-primary')}>
                          {isLocked ? planGateT('upgrade_action') : t('generate')}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </>
      ) : (
        <SurfaceCard
          title={t('search.empty_title')}
          description={t('search.empty_description')}
          action={
            <button
              type="button"
              onClick={() => setSearch('')}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-border/80 hover:text-foreground"
            >
              {t('search.clear')}
            </button>
          }
        >
          <p className="text-sm text-muted-foreground">
            {t('search.results', {
              count: filteredReports.length,
              total: REPORT_DEFINITIONS.length,
            })}
          </p>
        </SurfaceCard>
      )}

      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent
          className="h-[calc(100vh-2rem)] max-h-[90vh] max-w-6xl overflow-hidden p-0 sm:h-[90vh] sm:max-h-[calc(100vh-3rem)]"
          closeLabel="Close"
        >
          {canExportCsv || canExportPdf ? (
            <Popover open={isExportMenuOpen} onOpenChange={setIsExportMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={t('export.title')}
                  disabled={!activeReportDocument || exportingExcel || exportingPdf}
                  className={cn(
                    'absolute right-20 top-5 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors',
                    !activeReportDocument || exportingExcel || exportingPdf
                      ? 'cursor-not-allowed opacity-50'
                      : 'hover:border-primary/30 hover:text-foreground',
                  )}
                >
                  <DownloadIcon />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-1">
                <div className="space-y-1">
                  {canExportPdf ? (
                    <button
                      type="button"
                      disabled={exportingPdf || !activeReportDocument}
                      onClick={() => {
                        setIsExportMenuOpen(false)
                        void handleExportPdf()
                      }}
                      className={cn(
                        'flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        exportingPdf || !activeReportDocument
                          ? 'cursor-not-allowed text-muted-foreground/50'
                          : 'text-foreground hover:bg-accent hover:text-accent-foreground',
                      )}
                    >
                      {exportingPdf ? t('export.exporting_pdf') : t('export.pdf')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!activeReportDocument}
                      onClick={() => {
                        setIsExportMenuOpen(false)
                        promptForLockedExport(t('export.pdf'), pdfExportAccess?.requiredPlan ?? null)
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        !activeReportDocument
                          ? 'cursor-not-allowed text-muted-foreground/50'
                          : 'bg-amber-50 text-amber-900 hover:bg-amber-100',
                      )}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Lock className="h-3.5 w-3.5" strokeWidth={2.2} />
                        {t('export.pdf')}
                      </span>
                      <Badge variant="warning">{t('locked_badge')}</Badge>
                    </button>
                  )}

                  {canExportCsv ? (
                    <button
                      type="button"
                      disabled={exportingExcel || !activeReportDocument}
                      onClick={() => {
                        setIsExportMenuOpen(false)
                        void handleExportExcel()
                      }}
                      className={cn(
                        'flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        exportingExcel || !activeReportDocument
                          ? 'cursor-not-allowed text-muted-foreground/50'
                          : 'text-foreground hover:bg-accent hover:text-accent-foreground',
                      )}
                    >
                      {exportingExcel ? t('export.exporting_excel') : t('export.excel')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!activeReportDocument}
                      onClick={() => {
                        setIsExportMenuOpen(false)
                        promptForLockedExport(t('export.excel'), csvExportAccess?.requiredPlan ?? null)
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        !activeReportDocument
                          ? 'cursor-not-allowed text-muted-foreground/50'
                          : 'bg-amber-50 text-amber-900 hover:bg-amber-100',
                      )}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Lock className="h-3.5 w-3.5" strokeWidth={2.2} />
                        {t('export.excel')}
                      </span>
                      <Badge variant="warning">{t('locked_badge')}</Badge>
                    </button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <button
              type="button"
              aria-label={t('export.title')}
              disabled={!activeReportDocument || exportingExcel || exportingPdf}
              onClick={() =>
                promptForLockedExport(exportFeatureLabel || t('export.title'), exportRequiredPlan)
              }
              className={cn(
                'absolute right-20 top-5 z-10 inline-flex h-10 items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 text-sm font-medium text-amber-900 transition-colors',
                !activeReportDocument || exportingExcel || exportingPdf
                  ? 'cursor-not-allowed opacity-50'
                  : 'hover:bg-amber-100',
              )}
            >
              <Lock className="h-4 w-4" strokeWidth={2.2} />
              {planGateT('upgrade_action')}
            </button>
          )}

          <DialogHeader className="shrink-0 pr-32">
            <DialogTitle>{selectedReport.name}</DialogTitle>
            <DialogDescription>
              {selectedReport.description} Range: {rangeLabel}.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-hidden bg-[#ece8df] p-4">
            {activeReportDocument ? (
              <iframe
                title={selectedReport.name}
                srcDoc={activeReportDocument.html}
                className="h-full w-full rounded-[20px] border border-border bg-white"
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-[20px] border border-dashed border-border bg-background text-sm text-muted-foreground">
                {t('load_error')}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(lockedFeaturePrompt)}
        onOpenChange={(open) => {
          if (!open) {
            setLockedFeaturePrompt(null)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{lockedFeaturePrompt?.title ?? planGateT('locked_feature_title')}</DialogTitle>
            <DialogDescription>
              {lockedFeaturePrompt?.description ?? planGateT('title')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
                <Lock className="h-4 w-4" strokeWidth={2.2} />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold">{planGateT('locked_feature_title')}</p>
                <p className="text-sm leading-6 text-amber-900/85">
                  {planGateT('locked_modal_hint')}
                </p>
                {lockedFeaturePrompt?.requiredPlan ? (
                  <Badge variant="warning" className="bg-amber-100 text-amber-900 border-amber-200">
                    {lockedFeaturePrompt.requiredPlan}+
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setLockedFeaturePrompt(null)}
              >
                {t('dialog.cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setLockedFeaturePrompt(null)
                  router.push(`/${locale}/subscription`)
                }}
              >
                {planGateT('upgrade_action')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
