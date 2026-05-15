'use client'

import {
  type ChangeEvent,
  useRef,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  BusinessMemberRole,
  DebtDirection,
  DebtSource,
  DebtStatus,
  PaymentMethod,
  SaleStatus,
  type DailySalesSummary,
  type Debt,
  type JwtPayload,
  type SaleReceipt,
  type SaleListItem,
} from '@biztrack/types'
import { Button, NumberInput, Spinner } from '@biztrack/ui'
import { toast } from 'sonner'
import { ResourceActionMenu } from '@/components/products/ResourceActionMenu'
import { cn } from '@/lib/utils'
import { hasDesktopIpc, ipc } from '@/services/ipc.bridge'
import {
  DebtLocalError,
  getDebtBySourceLocal,
  listAllDebtsByDirectionLocal,
  recordDebtPaymentLocal,
} from '@/services/debts.local'
import {
  buildSaleReceiptLocal,
  getDailySalesSummaryLocal,
  getSaleLocal,
  listSalesLocal,
  SaleLocalError,
  type LocalSaleRecord,
  voidSaleLocal,
} from '@/services/sales.local'
import { decodeJwtPayload } from '@/lib/jwt'
import { useAuthStore } from '@/stores/auth.store'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

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

type PaymentDraftState = {
  amount: string
  date: string
  method: PaymentMethod
  mobileMoneyReference: string
  notes: string
}

type ReceiptCopy = {
  localeTag: string
  saleLabel: string
  dateLabel: string
  cashierLabel: string
  customerLabel: string
  itemsLabel: string
  totalLabel: string
  phoneLabel: string
  referenceLabel: string
  subtotalLabel: string
  discountLabel: string
  chargesLabel: string
  changeDueLabel: string
  thanksLabel: string
  localUserLabel: string
}

const PAGE_SIZE = 10
const MAX_SALES_LIMIT = 1000
const THERMAL_RECEIPT_PAPER_WIDTH_MM = 58
const THERMAL_RECEIPT_PRINTABLE_WIDTH_MM = 48
const THERMAL_RECEIPT_TEXT_COLUMNS = 27

function getTodayDate() {
  return formatLocalDate(startOfLocalDay(new Date()))
}

function createPaymentDraft(): PaymentDraftState {
  return {
    amount: '',
    date: getTodayDate(),
    method: PaymentMethod.CASH,
    mobileMoneyReference: '',
    notes: '',
  }
}

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

function buildSaleDebtLookup(debts: Debt[]) {
  return debts.reduce<Record<string, Debt>>((lookup, debt) => {
    if (debt.sourceType === DebtSource.SALE) {
      lookup[debt.sourceId] = debt
    }

    return lookup
  }, {})
}

function canRecordPaymentForDebt(saleStatus: SaleStatus | undefined, debt: Debt | null | undefined) {
  if (!debt || saleStatus === SaleStatus.VOIDED) {
    return false
  }

  return (
    debt.outstandingAmount > 0 &&
    (debt.status === DebtStatus.OUTSTANDING || debt.status === DebtStatus.PARTIALLY_PAID)
  )
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

function formatCurrency(value: number, localeTag: string) {
  return `XAF ${formatInteger(value, localeTag)}`
}

function formatCurrencyShort(value: number, localeTag: string) {
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

function getDebtStatusBadgeClassName(status: DebtStatus) {
  if (status === DebtStatus.SETTLED) {
    return 'bg-emerald-50 text-emerald-700'
  }

  if (status === DebtStatus.WRITTEN_OFF) {
    return 'bg-slate-100 text-slate-700'
  }

  if (status === DebtStatus.PARTIALLY_PAID) {
    return 'bg-amber-50 text-amber-700'
  }

  return 'bg-sky-50 text-sky-700'
}

function sanitizeReceiptFileName(value: string) {
  const cleaned = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

  return `${cleaned || 'receipt'}.pdf`
}

function toPdfLiteralString(value: string) {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?')

  return `(${normalized.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`
}

function buildReceiptPdfBlob(
  receiptText: string,
  paperWidthMm = THERMAL_RECEIPT_PAPER_WIDTH_MM,
) {
  const lines = receiptText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const isCompactRoll = paperWidthMm <= THERMAL_RECEIPT_PAPER_WIDTH_MM
  const pageWidth = (paperWidthMm / 25.4) * 72
  const printableWidthMm = isCompactRoll
    ? THERMAL_RECEIPT_PRINTABLE_WIDTH_MM
    : Math.max(paperWidthMm - 12, THERMAL_RECEIPT_PRINTABLE_WIDTH_MM)
  const printableWidth = (printableWidthMm / 25.4) * 72
  const baseHorizontalInset = Math.max((pageWidth - printableWidth) / 2, 0)
  const paddingX = isCompactRoll ? Math.max(baseHorizontalInset + 4, 18) : 14
  const topPaddingY = isCompactRoll ? 24 : 18
  const bottomPaddingY = isCompactRoll ? 34 : 22
  const fontSize = isCompactRoll ? 7.15 : 8.5
  const lineHeight = isCompactRoll ? 9.25 : 11.5
  const pageHeight = Math.max(
    isCompactRoll ? 260 : 320,
    topPaddingY + bottomPaddingY + lines.length * lineHeight,
  )
  const topY = pageHeight - topPaddingY - fontSize
  const streamLines = [
    'BT',
    `/F1 ${fontSize} Tf`,
    ...lines.map((line, index) => {
      const y = topY - index * lineHeight
      return `1 0 0 1 ${paddingX} ${y.toFixed(2)} Tm ${toPdfLiteralString(line)} Tj`
    }),
    'ET',
  ]
  const content = streamLines.join('\n')
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight.toFixed(
      2,
    )}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>\nendobj\n',
    `5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
  ]
  const offsets: number[] = []
  let pdf = '%PDF-1.4\n'

  for (const object of objects) {
    offsets.push(pdf.length)
    pdf += object
  }

  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'

  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return new Blob([pdf], { type: 'application/pdf' })
}

function downloadReceiptFile(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function isShareCancelled(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function isPrintCancelled(error: unknown) {
  return error instanceof Error && /cancelled|canceled|cancel/i.test(error.message)
}

function centerLine(text: string, cols: number) {
  const trimmed = text.slice(0, cols)
  const padding = Math.max(cols - trimmed.length, 0)
  return `${' '.repeat(Math.floor(padding / 2))}${trimmed}`
}

function padLine(left: string, right: string, cols: number) {
  const gap = cols - left.length - right.length
  if (gap <= 1) {
    const truncated = left.slice(0, Math.max(cols - right.length - 2, 0))
    return `${truncated} ${right}`
  }

  return `${left}${' '.repeat(gap)}${right}`
}

function buildReceiptText(
  receipt: SaleReceipt,
  copy: ReceiptCopy,
  paymentLabel: (method: PaymentMethod) => string,
) {
  const cols = THERMAL_RECEIPT_TEXT_COLUMNS
  const divider = '-'.repeat(cols)
  const heavyDivider = '='.repeat(cols)
  const amount = (value: number) => formatInteger(value, copy.localeTag)
  const dateLabel = new Intl.DateTimeFormat(copy.localeTag, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(receipt.soldAt))

  const lines = [
    centerLine(receipt.businessName.toUpperCase(), cols),
    divider,
    centerLine(copy.saleLabel.toUpperCase(), cols),
    divider,
    `${copy.dateLabel}: ${dateLabel}`,
    `${copy.saleLabel}: ${receipt.saleNumber}`,
    `${copy.cashierLabel}: ${receipt.cashierName || copy.localUserLabel}`,
  ]

  if (receipt.customerName) {
    lines.push(`${copy.customerLabel}: ${receipt.customerName}`)
  }

  lines.push(divider)
  lines.push(padLine(copy.itemsLabel, copy.totalLabel, cols))
  lines.push(divider)

  for (const item of receipt.items) {
    lines.push(padLine(item.name, amount(item.total), cols))
    lines.push(`  ${item.qty} x ${amount(item.unitPrice)} XAF`)
  }

  lines.push(divider)
  lines.push(padLine(copy.subtotalLabel, `${amount(receipt.subtotal)} XAF`, cols))

  if (receipt.discountAmount > 0) {
    lines.push(padLine(copy.discountLabel, `-${amount(receipt.discountAmount)} XAF`, cols))
  }

  if (receipt.chargesAmount > 0) {
    lines.push(padLine(copy.chargesLabel, `+${amount(receipt.chargesAmount)} XAF`, cols))
  }

  lines.push(heavyDivider)
  lines.push(padLine(copy.totalLabel, `${amount(receipt.totalAmount)} XAF`, cols))
  lines.push(heavyDivider)

  for (const payment of receipt.payments) {
    lines.push(padLine(paymentLabel(payment.method), `${amount(payment.amount)} XAF`, cols))

    if (payment.mobileMoneyReference) {
      lines.push(`${copy.referenceLabel}: ${payment.mobileMoneyReference}`)
    }
  }

  if (receipt.changeGiven > 0) {
    lines.push(padLine(copy.changeDueLabel, `${amount(receipt.changeGiven)} XAF`, cols))
  }

  if (receipt.customerPhone) {
    lines.push(`${copy.phoneLabel}: ${receipt.customerPhone}`)
  }

  lines.push(divider)
  lines.push(centerLine(copy.thanksLabel, cols))
  lines.push('')

  return lines.join('\n')
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
          {formatCurrencyShort(maxRevenue, localeTag)}
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
  console.log('Current locale:', locale)
  const localeTag = locale.startsWith('fr') ? 'fr-CM' : 'en-GB'
  const businessId = useAuthStore((state) => state.businessId)
  const businessName = useAuthStore((state) => state.businessName)
  const accessToken = useAuthStore((state) => state.accessToken)
  const role = useAuthStore((state) => state.role)
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
  const [saleDebtLookup, setSaleDebtLookup] = useState<Record<string, Debt>>({})
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailSale, setDetailSale] = useState<LocalSaleRecord | null>(null)
  const [detailDebt, setDetailDebt] = useState<Debt | null>(null)
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null)
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraftState>(() => createPaymentDraft())
  const [voidReasonDraft, setVoidReasonDraft] = useState('')
  const [focusVoidReasonInput, setFocusVoidReasonInput] = useState(false)
  const [focusPaymentForm, setFocusPaymentForm] = useState(false)
  const [printingSaleId, setPrintingSaleId] = useState<string | null>(null)
  const [sharingSaleId, setSharingSaleId] = useState<string | null>(null)
  const [voidingSaleId, setVoidingSaleId] = useState<string | null>(null)
  const [recordingPayment, setRecordingPayment] = useState(false)
  const voidReasonInputRef = useRef<HTMLInputElement | null>(null)
  const paymentAmountInputRef = useRef<HTMLInputElement | null>(null)
  const actorPayload = accessToken ? decodeJwtPayload<JwtPayload>(accessToken) : null
  const canVoidSales = role === BusinessMemberRole.OWNER || role === BusinessMemberRole.MANAGER

  const businessLabel = businessName?.trim() || tSell('business_fallback')

  useEffect(() => {
    if (!detailOpen) {
      setVoidReasonDraft('')
      setFocusVoidReasonInput(false)
      setFocusPaymentForm(false)
      setPaymentDraft(createPaymentDraft())
    }
  }, [detailOpen])

  useEffect(() => {
    if (!detailOpen || !focusVoidReasonInput || detailLoading || detailSale?.status !== SaleStatus.COMPLETED) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const input = voidReasonInputRef.current
      if (!input) return
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
      setFocusVoidReasonInput(false)
    }, 30)

    return () => window.clearTimeout(timeoutId)
  }, [detailLoading, detailOpen, detailSale?.status, focusVoidReasonInput])

  useEffect(() => {
    if (!detailOpen || !focusPaymentForm || detailLoading || !canRecordPaymentForDebt(detailSale?.status, detailDebt)) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const input = paymentAmountInputRef.current
      if (!input) return
      input.scrollIntoView({ behavior: 'smooth', block: 'center' })
      input.focus()
      input.select()
      setFocusPaymentForm(false)
    }, 30)

    return () => window.clearTimeout(timeoutId)
  }, [detailDebt, detailLoading, detailOpen, detailSale?.status, focusPaymentForm])

  useEffect(() => {
    setPage(1)
  }, [range, search, statusFilter, paymentFilter, priceWarningOnly])

  useEffect(() => {
    if (!businessId) {
      setSales([])
      setDailySummaries([])
      setSaleDebtLookup({})
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
        const [salesResult, receivableDebts, summariesResult] = await Promise.all([
          listSalesLocal(currentBusinessId, {
            page: 1,
            limit: MAX_SALES_LIMIT,
            sortBy: 'soldAt',
            sortOrder: 'DESC',
          }),
          listAllDebtsByDirectionLocal(currentBusinessId, DebtDirection.RECEIVABLE),
          Promise.all(dates.map((date) => getDailySalesSummaryLocal(currentBusinessId, date))),
        ])

        if (!active) return

        setSales(salesResult.data)
        setSaleDebtLookup(buildSaleDebtLookup(receivableDebts))
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
    return t('mixed')
  }

  const getDebtStatusLabel = (status: DebtStatus) => {
    if (status === DebtStatus.PARTIALLY_PAID) return t('detail.credit_status_partially_paid')
    if (status === DebtStatus.SETTLED) return t('detail.credit_status_settled')
    if (status === DebtStatus.WRITTEN_OFF) return t('detail.credit_status_written_off')
    return t('detail.credit_status_outstanding')
  }

  const updateSaleDebtLookup = (saleId: string, nextDebt: Debt | null) => {
    setSaleDebtLookup((current) => {
      if (!nextDebt) {
        const { [saleId]: _removed, ...rest } = current
        return rest
      }

      return {
        ...current,
        [saleId]: nextDebt,
      }
    })
  }

  const getDebtPaymentErrorMessage = (error: unknown) => {
    if (error instanceof DebtLocalError) {
      if (error.code === 'DEBT_PAYMENT_LOCKED' || error.code === 'DEBT_ALREADY_SETTLED') {
        return t('detail.record_payment_locked')
      }

      if (error.code === 'DEBT_PAYMENT_AMOUNT_EXCEEDS_OUTSTANDING') {
        return t('detail.record_payment_exceeds')
      }

      if (error.code === 'DEBT_PAYMENT_DATE_INVALID' || error.code === 'INVALID_DATE') {
        return t('detail.record_payment_date_invalid')
      }
    }

    return t('detail.record_payment_error')
  }

  const receiptCopy: ReceiptCopy = {
    localeTag,
    saleLabel: tSell('sale_no'),
    dateLabel: tSell('receipt.date'),
    cashierLabel: tSell('cashier'),
    customerLabel: tSell('receipt.customer'),
    itemsLabel: tSell('receipt.items'),
    totalLabel: tSell('receipt.total'),
    phoneLabel: tSell('receipt.phone'),
    referenceLabel: tSell('receipt.reference'),
    subtotalLabel: tSell('subtotal'),
    discountLabel: tSell('discount'),
    chargesLabel: tSell('charges'),
    changeDueLabel: tSell('change_due'),
    thanksLabel: tSell('receipt.thanks'),
    localUserLabel: tSell('local_user'),
  }

  const ensureSaleDetail = async (saleId: string) => {
    if (!businessId) return null
    if (detailSale?.id === saleId) return detailSale

    const sale = await getSaleLocal(businessId, saleId)
    setDetailSale(sale)
    return sale
  }

  const buildReceiptFileForSale = async (sale: LocalSaleRecord) => {
    const receipt = await buildSaleReceiptLocal(businessLabel, sale)
    const receiptText = buildReceiptText(receipt, receiptCopy, paymentLabel)
    const pdfBlob = buildReceiptPdfBlob(receiptText, THERMAL_RECEIPT_PAPER_WIDTH_MM)
    const filename = sanitizeReceiptFileName(receipt.saleNumber)

    return {
      pdfBlob,
      filename,
    }
  }

  const openDetail = async (
    saleId: string,
    options?: {
      focusVoidReason?: boolean
      focusPaymentForm?: boolean
    },
  ) => {
    if (!businessId) return

    setDetailOpen(true)
    setDetailLoading(true)
    setDetailSaleId(saleId)
    setDetailDebt(null)
    setPaymentDraft(createPaymentDraft())
    setFocusVoidReasonInput(Boolean(options?.focusVoidReason))
    setFocusPaymentForm(Boolean(options?.focusPaymentForm))

    try {
      const [sale, debt] = await Promise.all([
        getSaleLocal(businessId, saleId),
        getDebtBySourceLocal(businessId, DebtDirection.RECEIVABLE, DebtSource.SALE, saleId, {
          includePayments: true,
        }),
      ])
      setDetailSale(sale)
      setDetailDebt(debt)
      setVoidReasonDraft('')
    } catch {
      toast.error(t('load_detail_error'))
    } finally {
      setDetailLoading(false)
    }
  }

  const handleOpenVoidSale = async (saleId: string) => {
    if (!canVoidSales) {
      toast.error(t('detail.void_forbidden'))
      return
    }

    await openDetail(saleId, { focusVoidReason: true })
  }

  const handleOpenRecordPayment = async (saleId: string) => {
    await openDetail(saleId, { focusPaymentForm: true })
  }

  const handleVoidSale = async () => {
    if (!businessId || !detailSale || detailSale.status !== SaleStatus.COMPLETED) {
      return
    }

    if (!canVoidSales) {
      toast.error(t('detail.void_forbidden'))
      return
    }

    const trimmedReason = voidReasonDraft.trim()
    if (trimmedReason.length < 10 || trimmedReason.length > 1000) {
      toast.error(t('detail.void_reason_invalid'))
      setFocusVoidReasonInput(true)
      return
    }

    setVoidingSaleId(detailSale.id)

    try {
      const updatedSale = await voidSaleLocal(businessId, detailSale.id, trimmedReason, {
        actorId: actorPayload?.sub ?? null,
        actorName: role ? role.toLowerCase() : tSell('local_user'),
      })

      setDetailSale(updatedSale)
      setVoidReasonDraft('')
      setSales((current) =>
        current.map((sale) =>
          sale.id === updatedSale.id
            ? {
                ...sale,
                status: updatedSale.status,
                syncedAt: updatedSale.syncedAt ?? null,
                updatedAt: updatedSale.updatedAt,
                voidedAt: updatedSale.voidedAt ?? null,
                voidedById: updatedSale.voidedById ?? null,
                voidReason: updatedSale.voidReason ?? null,
              }
            : sale,
        ),
      )
      const updatedDebt = await getDebtBySourceLocal(
        businessId,
        DebtDirection.RECEIVABLE,
        DebtSource.SALE,
        updatedSale.id,
        { includePayments: true },
      )
      setDetailDebt(updatedDebt)
      updateSaleDebtLookup(updatedSale.id, updatedDebt)
      setRefreshKey((value) => value + 1)
      toast.success(t('detail.void_success'))
    } catch (error) {
      if (error instanceof SaleLocalError) {
        if (error.code === 'SALE_ALREADY_VOIDED') {
          toast.error(t('detail.void_already_voided'))
          return
        }

        if (error.code === 'SALE_VOID_REASON_INVALID') {
          toast.error(t('detail.void_reason_invalid'))
          setFocusVoidReasonInput(true)
          return
        }
      }

      toast.error(t('detail.void_error'))
    } finally {
      setVoidingSaleId(null)
    }
  }

  const handlePrint = async (saleId: string) => {
    if (printingSaleId || sharingSaleId) return

    setPrintingSaleId(saleId)

    try {
      const sale = await ensureSaleDetail(saleId)
      if (!sale) return

      const { pdfBlob, filename } = await buildReceiptFileForSale(sale)

      if (!hasDesktopIpc()) {
        const file = new File([pdfBlob], filename, {
          type: 'application/pdf',
          lastModified: Date.now(),
        })
        downloadReceiptFile(file)
        toast(tSell('receipt_print_unavailable'))
        return
      }

      const pdfBytes = Array.from(new Uint8Array(await pdfBlob.arrayBuffer()))
      await ipc.print.receipt({
        buffer: pdfBytes,
        filename,
        paperWidthMm: THERMAL_RECEIPT_PAPER_WIDTH_MM,
        silent: true,
      })
      toast.success(tSell('receipt_printed'))
    } catch (error) {
      if (isPrintCancelled(error)) return
      toast.error(tSell('receipt_print_failed'))
    } finally {
      setPrintingSaleId(null)
    }
  }

  const handleShare = async (saleId: string) => {
    if (printingSaleId || sharingSaleId) return

    setSharingSaleId(saleId)

    try {
      const sale = await ensureSaleDetail(saleId)
      if (!sale) return

      const { pdfBlob, filename } = await buildReceiptFileForSale(sale)
      const receiptFile = new File([pdfBlob], filename, {
        type: 'application/pdf',
        lastModified: Date.now(),
      })

      if (hasDesktopIpc()) {
        const pdfBytes = Array.from(new Uint8Array(await pdfBlob.arrayBuffer()))
        const result = await ipc.share.file({
          buffer: pdfBytes,
          filename,
          mimeType: receiptFile.type,
        })

        if (result.shared) {
          toast.success(tSell('receipt_shared'))
          return
        }

        toast(tSell('receipt_share_saved'))
        return
      }

      downloadReceiptFile(receiptFile)
      toast(tSell('receipt_share_unavailable'))
    } catch (error) {
      if (isShareCancelled(error)) return
      try {
        const sale = await ensureSaleDetail(saleId)
        if (!sale) return
        const { pdfBlob, filename } = await buildReceiptFileForSale(sale)
        const receiptFile = new File([pdfBlob], filename, {
          type: 'application/pdf',
          lastModified: Date.now(),
        })
        downloadReceiptFile(receiptFile)
        toast(tSell('receipt_share_failed'))
      } catch {
        toast.error(t('load_error'))
      }
    } finally {
      setSharingSaleId(null)
    }
  }

  const handleRecordPayment = async () => {
    if (!businessId || !detailSale || !detailDebt || !canRecordPaymentForDebt(detailSale.status, detailDebt)) {
      toast.error(t('detail.record_payment_unavailable'))
      return
    }

    const amount = Number(paymentDraft.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t('detail.record_payment_amount_invalid'))
      return
    }

    setRecordingPayment(true)

    try {
      const updatedDebt = await recordDebtPaymentLocal(
        businessId,
        detailDebt.id,
        DebtDirection.RECEIVABLE,
        {
          amount,
          method: paymentDraft.method,
          paymentDate: paymentDraft.date,
          mobileMoneyReference:
            paymentDraft.method === PaymentMethod.MTN_MOMO ||
            paymentDraft.method === PaymentMethod.ORANGE_MONEY
              ? paymentDraft.mobileMoneyReference.trim() || undefined
              : undefined,
          notes: paymentDraft.notes.trim() || undefined,
        },
        {
          recordedById: actorPayload?.sub ?? null,
        },
      )

      setDetailDebt(updatedDebt)
      updateSaleDebtLookup(detailSale.id, updatedDebt)
      setPaymentDraft(createPaymentDraft())
      toast.success(t('detail.record_payment_success'))
    } catch (error) {
      toast.error(getDebtPaymentErrorMessage(error))
    } finally {
      setRecordingPayment(false)
    }
  }

  const headerSubtitle = `${new Intl.DateTimeFormat(localeTag, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())} - ${businessLabel}`
  const detailCanRecordPayment = canRecordPaymentForDebt(detailSale?.status, detailDebt)

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
    <>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{headerSubtitle}</p>
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
            value={formatCurrency(rangeTotals.totalRevenue, localeTag)}
            hint={t('metrics.transactions_hint', { count: rangeTotals.totalSales })}
            tone="default"
          />
          <SalesMetricCard
            label={t('metrics.gross_profit')}
            value={formatCurrency(rangeTotals.grossProfit, localeTag)}
            hint={t('metrics.margin_hint', { value: rangeTotals.grossMarginPercent.toFixed(1) })}
            tone="positive"
          />
          <SalesMetricCard
            label={t('metrics.cash_collected')}
            value={formatCurrency(rangeTotals.cashCollected, localeTag)}
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
            hint={t('metrics.voided_hint', { amount: formatCurrency(rangeTotals.voidedAmount, localeTag) })}
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
                    amount={formatCurrency(row.amount, localeTag)}
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
                    const saleDebt = saleDebtLookup[sale.id] ?? null
                    const canRecordPayment = canRecordPaymentForDebt(sale.status, saleDebt)
                    const saleBusy =
                      printingSaleId === sale.id ||
                      sharingSaleId === sale.id ||
                      voidingSaleId === sale.id
                    const paymentText = sale.paymentMethod ? paymentLabel(sale.paymentMethod) : '-'

                    return (
                      <tr
                        key={sale.id}
                        onClick={() => void openDetail(sale.id)}
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
                                  onSelect: () => void openDetail(sale.id),
                                },
                                ...(canRecordPayment
                                  ? [
                                      {
                                        label: t('actions.record_payment'),
                                        onSelect: () => void handleOpenRecordPayment(sale.id),
                                      },
                                    ]
                                  : []),
                                {
                                  label:
                                    printingSaleId === sale.id
                                      ? tSell('printing_receipt')
                                      : t('actions.print'),
                                  disabled: saleBusy,
                                  onSelect: () => void handlePrint(sale.id),
                                },
                                {
                                  label:
                                    sharingSaleId === sale.id
                                      ? tSell('sharing_receipt')
                                      : t('actions.share'),
                                  disabled: saleBusy,
                                  onSelect: () => void handleShare(sale.id),
                                },
                                {
                                  label:
                                    voidingSaleId === sale.id
                                      ? t('detail.void_submitting')
                                      : t('actions.void'),
                                  disabled: saleBusy || sale.status === SaleStatus.VOIDED || !canVoidSales,
                                  tone: 'danger',
                                  onSelect: () => void handleOpenVoidSale(sale.id),
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

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent
          className="max-h-[calc(100vh-1rem)] max-w-3xl overflow-hidden p-0 sm:max-h-[calc(100vh-3rem)]"
          closeLabel={t('actions.view')}
        >
          <DialogHeader className="shrink-0 pr-16">
            <DialogTitle>{detailSale?.saleNumber || detailSaleId || t('detail.title')}</DialogTitle>
            <DialogDescription>{t('detail.subtitle')}</DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="flex min-h-[280px] items-center justify-center">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Spinner size="sm" />
                  <span>{t('loading')}</span>
                </div>
              </div>
            </div>
          ) : detailSale ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-5">
                {detailSale.priceDriftWarning ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {t('detail.price_warning')}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  {detailCanRecordPayment ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={recordingPayment || voidingSaleId === detailSale.id}
                      onClick={() => setFocusPaymentForm(true)}
                    >
                      {t('actions.record_payment')}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      printingSaleId === detailSale.id ||
                      Boolean(sharingSaleId) ||
                      voidingSaleId === detailSale.id
                    }
                    onClick={() => void handlePrint(detailSale.id)}
                  >
                    {printingSaleId === detailSale.id ? tSell('printing_receipt') : t('actions.print')}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      sharingSaleId === detailSale.id ||
                      Boolean(printingSaleId) ||
                      voidingSaleId === detailSale.id
                    }
                    onClick={() => void handleShare(detailSale.id)}
                  >
                    {sharingSaleId === detailSale.id ? tSell('sharing_receipt') : t('actions.share')}
                  </Button>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <section className="rounded-2xl border border-border bg-muted/20 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {t('detail.sale_info')}
                    </p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{t('detail.date_time')}</span>
                        <span className="font-medium text-foreground">
                          {new Intl.DateTimeFormat(localeTag, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(detailSale.soldAt))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{tSell('cashier')}</span>
                        <span className="font-medium text-foreground">
                          {detailSale.cashierName || tSell('local_user')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{t('table.customer')}</span>
                        <span className="font-medium text-foreground">
                          {detailSale.customerName || t('table.no_customer')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{t('table.sync')}</span>
                        <span className="font-medium text-foreground">
                          {detailSale.syncedAt
                            ? t('detail.synced_at', {
                                time: new Intl.DateTimeFormat(localeTag, {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                }).format(new Date(detailSale.syncedAt)),
                              })
                            : t('sync.pending')}
                        </span>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-border bg-muted/20 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {t('detail.payment')}
                    </p>
                    <div className="mt-3 space-y-4 text-sm">
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {t('detail.initial_payments')}
                        </p>
                        {detailSale.payments.map((payment) => (
                          <div key={payment.id} className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">{paymentLabel(payment.method)}</span>
                            <span className="font-medium text-foreground">
                              {formatCurrency(payment.amount, localeTag)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {detailDebt ? (
                        <>
                          <div className="h-px bg-border" />

                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">{t('detail.credit_issued')}</span>
                              <span className="font-medium text-foreground">
                                {formatCurrency(detailDebt.originalAmount, localeTag)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">{t('detail.credit_collected')}</span>
                              <span className="font-medium text-foreground">
                                {formatCurrency(detailDebt.paidAmount, localeTag)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">{t('detail.credit_outstanding')}</span>
                              <span className="font-medium text-foreground">
                                {formatCurrency(detailDebt.outstandingAmount, localeTag)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">{t('detail.credit_status')}</span>
                              <span
                                className={cn(
                                  'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                                  getDebtStatusBadgeClassName(detailDebt.status),
                                )}
                              >
                                {getDebtStatusLabel(detailDebt.status)}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              {t('detail.follow_up_payments')}
                            </p>
                            {detailDebt.payments && detailDebt.payments.length > 0 ? (
                              detailDebt.payments.map((payment) => (
                                <div
                                  key={payment.id}
                                  className="rounded-xl border border-border bg-background/80 px-3 py-2 dark:bg-background/60"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="font-medium text-foreground">
                                      {paymentLabel(payment.method)}
                                    </span>
                                    <span className="font-medium text-foreground">
                                      {formatCurrency(payment.amount, localeTag)}
                                    </span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                    <span>
                                      {new Intl.DateTimeFormat(localeTag, {
                                        dateStyle: 'medium',
                                      }).format(new Date(`${payment.paymentDate}T00:00:00`))}
                                    </span>
                                    {payment.mobileMoneyReference ? (
                                      <span>{payment.mobileMoneyReference}</span>
                                    ) : null}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                {t('detail.no_follow_up_payments')}
                              </p>
                            )}
                          </div>
                        </>
                      ) : null}

                      {detailSale.changeGiven > 0 ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">{tSell('change_due')}</span>
                          <span className="font-medium text-foreground">
                            {formatCurrency(detailSale.changeGiven, localeTag)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </section>
                </div>

                <section className="rounded-2xl border border-border bg-card">
                  <div className="border-b border-border px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {t('detail.items')}
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            {t('detail.product')}
                          </th>
                          <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            {t('detail.qty')}
                          </th>
                          <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            {t('detail.unit_price')}
                          </th>
                          <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            {t('detail.total')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailSale.items.map((item) => (
                          <tr key={item.id} className="border-b border-border/70">
                            <td className="px-4 py-3 text-foreground">{item.productName}</td>
                            <td className="px-4 py-3 text-right text-foreground">{item.quantity}</td>
                            <td className="px-4 py-3 text-right text-foreground">
                              {formatInteger(item.unitPrice, localeTag)}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-foreground">
                              {formatInteger(item.lineTotal, localeTag)}
                            </td>
                          </tr>
                        ))}
                        {detailSale.discountAmount > 0 ? (
                          <tr className="border-b border-border/70">
                            <td colSpan={3} className="px-4 py-3 text-muted-foreground">
                              {tSell('discount')}
                            </td>
                            <td className="px-4 py-3 text-right text-red-600">
                              -{formatInteger(detailSale.discountAmount, localeTag)}
                            </td>
                          </tr>
                        ) : null}
                        {detailSale.chargesAmount > 0 ? (
                          <tr className="border-b border-border/70">
                            <td colSpan={3} className="px-4 py-3 text-muted-foreground">
                              {tSell('charges')}
                            </td>
                            <td className="px-4 py-3 text-right text-foreground">
                              +{formatInteger(detailSale.chargesAmount, localeTag)}
                            </td>
                          </tr>
                        ) : null}
                        <tr>
                          <td colSpan={3} className="px-4 py-3 text-base font-semibold text-foreground">
                            {tSell('total')}
                          </td>
                          <td className="px-4 py-3 text-right text-base font-semibold text-foreground">
                            {formatCurrency(detailSale.totalAmount, localeTag)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {detailSale.status === SaleStatus.VOIDED && detailSale.voidReason ? (
                    <div className="border-t border-border bg-red-50 px-4 py-3 text-sm text-red-700">
                      <span className="font-medium">{t('status.voided')}</span>: {detailSale.voidReason}
                    </div>
                  ) : null}
                </section>

                {detailCanRecordPayment && detailDebt ? (
                  <section className="rounded-2xl border border-border bg-card px-4 py-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <span className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300">
                          {t('actions.record_payment')}
                        </span>
                        <p className="mt-3 text-sm font-semibold text-foreground">
                          {t('detail.record_payment_title')}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('detail.record_payment_description', {
                            amount: formatCurrency(detailDebt.outstandingAmount, localeTag),
                          })}
                        </p>
                      </div>
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300">
                        {formatCurrency(detailDebt.outstandingAmount, localeTag)}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="space-y-2 text-sm">
                        <span className="font-medium text-foreground">{t('detail.payment_amount')}</span>
                        <NumberInput
                          ref={paymentAmountInputRef}
                          min="0"
                          step="0.01"
                          value={paymentDraft.amount}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            setPaymentDraft((current) => ({ ...current, amount: event.target.value }))
                          }
                          placeholder="0"
                          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/15"
                        />
                      </label>

                      <label className="space-y-2 text-sm">
                        <span className="font-medium text-foreground">{t('detail.payment_date')}</span>
                        <input
                          type="date"
                          value={paymentDraft.date}
                          onChange={(event) =>
                            setPaymentDraft((current) => ({ ...current, date: event.target.value }))
                          }
                          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/15"
                        />
                      </label>

                      <label className="space-y-2 text-sm">
                        <span className="font-medium text-foreground">{t('detail.payment_method')}</span>
                        <select
                          value={paymentDraft.method}
                          onChange={(event) =>
                            setPaymentDraft((current) => ({
                              ...current,
                              method: event.target.value as PaymentMethod,
                              mobileMoneyReference:
                                event.target.value === PaymentMethod.MTN_MOMO ||
                                event.target.value === PaymentMethod.ORANGE_MONEY
                                  ? current.mobileMoneyReference
                                  : '',
                            }))
                          }
                          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/15"
                        >
                          <option value={PaymentMethod.CASH}>{paymentLabel(PaymentMethod.CASH)}</option>
                          <option value={PaymentMethod.MTN_MOMO}>{paymentLabel(PaymentMethod.MTN_MOMO)}</option>
                          <option value={PaymentMethod.ORANGE_MONEY}>{paymentLabel(PaymentMethod.ORANGE_MONEY)}</option>
                          <option value={PaymentMethod.CARD}>{paymentLabel(PaymentMethod.CARD)}</option>
                        </select>
                      </label>

                      {paymentDraft.method === PaymentMethod.MTN_MOMO ||
                      paymentDraft.method === PaymentMethod.ORANGE_MONEY ? (
                        <label className="space-y-2 text-sm">
                          <span className="font-medium text-foreground">{t('detail.payment_reference')}</span>
                          <input
                            type="text"
                            value={paymentDraft.mobileMoneyReference}
                            onChange={(event) =>
                              setPaymentDraft((current) => ({
                                ...current,
                                mobileMoneyReference: event.target.value,
                              }))
                            }
                            placeholder={t('detail.payment_reference_placeholder')}
                            className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/15"
                          />
                        </label>
                      ) : (
                        <div className="hidden md:block" aria-hidden="true" />
                      )}
                    </div>

                    <label className="mt-4 block space-y-2 text-sm">
                      <span className="font-medium text-foreground">{t('detail.payment_notes')}</span>
                      <input
                        type="text"
                        value={paymentDraft.notes}
                        onChange={(event) =>
                          setPaymentDraft((current) => ({ ...current, notes: event.target.value }))
                        }
                        placeholder={t('detail.payment_notes_placeholder')}
                        className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/15"
                      />
                    </label>

                    <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
                      <Button
                        type="button"
                        variant="primary"
                        disabled={recordingPayment || voidingSaleId === detailSale.id}
                        onClick={() => void handleRecordPayment()}
                      >
                        {recordingPayment
                          ? t('detail.record_payment_submitting')
                          : t('detail.record_payment_submit')}
                      </Button>
                    </div>
                  </section>
                ) : null}

                {detailSale.status === SaleStatus.COMPLETED ? (
                  <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
                    <p className="text-sm font-semibold text-red-700">{t('detail.void_section_title')}</p>
                    <input
                      ref={voidReasonInputRef}
                      value={voidReasonDraft}
                      onChange={(event) => setVoidReasonDraft(event.target.value)}
                      placeholder={t('detail.void_reason_placeholder')}
                      maxLength={1000}
                      className="mt-3 h-10 w-full rounded-xl border border-red-200 bg-background px-3 text-sm text-foreground shadow-sm placeholder:text-muted-foreground outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-200"
                    />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-red-600">{t('detail.void_helper')}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={
                          voidReasonDraft.trim().length < 10 ||
                          voidReasonDraft.trim().length > 1000 ||
                          voidingSaleId === detailSale.id ||
                          printingSaleId === detailSale.id ||
                          sharingSaleId === detailSale.id ||
                          !canVoidSales
                        }
                        onClick={() => void handleVoidSale()}
                        className="border border-red-200 text-red-700"
                      >
                        {voidingSaleId === detailSale.id
                          ? t('detail.void_submitting')
                          : t('detail.void_submit')}
                      </Button>
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="py-12 text-center text-sm text-muted-foreground">{t('detail.empty')}</div>
            </div>
          )}
          <DialogFooter className="shrink-0">
            <Button type="button" variant="ghost" onClick={() => setDetailOpen(false)}>
              {t('actions.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
