'use client'

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  DebtDirection,
  DebtStatus,
  PaymentMethod,
  type Debt,
  type JwtPayload,
} from '@biztrack/types'
import { Button, Input, NumberInput, Spinner } from '@biztrack/ui'
import { toast } from 'sonner'
import { SurfaceCard } from '@/components/catalog/SurfaceCard'
import { ResourceActionMenu } from '@/components/products/ResourceActionMenu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { decodeJwtPayload } from '@/lib/jwt'
import { cn } from '@/lib/utils'
import { getApiErrorMessage } from '@/services/api-response'
import {
  DebtLocalError,
  getDebtByIdLocal,
  recordDebtPaymentLocal,
  writeOffDebtLocal,
} from '@/services/debts.local'
import {
  listSupplierPayablesLocal,
  type LocalSupplierPayable,
} from '@/services/inventory.local'
import { useAuthStore } from '@/stores/auth.store'

type PeriodKey = 'month' | 'quarter' | 'all'
type CreditorStatus = 'OUTSTANDING' | 'PARTIALLY_PAID' | 'SETTLED' | 'WRITTEN_OFF'
type CreditorStatusFilter = 'ALL' | CreditorStatus
type MetricTone = 'default' | 'success' | 'warning' | 'danger' | 'info'
type TranslateFn = (key: string, values?: Record<string, string | number>) => string
type CreditorRow = {
  id: string
  supplierId: string | null
  supplierName: string
  supplierPhone: string | null
  reference: string
  status: CreditorStatus
  originalAmount: number
  paidAmount: number
  outstandingAmount: number
  createdAt: string
  ageDays: number
  olderThanThirtyDays: boolean
}
type SupplierSummary = {
  key: string
  supplierName: string
  amount: number
  count: number
  ratio: number
}
type PaymentDraftState = {
  amount: string
  date: string
  method: PaymentMethod
  mobileMoneyReference: string
  notes: string
}

const PAGE_SIZE = 7

function getTodayDate() {
  return formatDateOnly(new Date())
}

function formatDateOnly(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

function mapDebtToLocalSupplierPayable(debt: Debt): LocalSupplierPayable {
  return {
    id: debt.id,
    businessId: debt.businessId,
    reference: debt.sourceReference || debt.id,
    supplierId: debt.contactId || null,
    supplierName: debt.contact?.name || debt.sourceReference || debt.id,
    supplierPhone: debt.contact?.phone ?? null,
    status: debt.status,
    totalAmount: roundMoney(debt.originalAmount),
    amountPaid: roundMoney(debt.paidAmount),
    outstandingAmount: roundMoney(debt.outstandingAmount),
    notes: debt.notes ?? null,
    createdAt: debt.createdAt,
  }
}

function canRecordPaymentForDebt(debt: Debt | null | undefined) {
  if (!debt) {
    return false
  }

  return (
    debt.outstandingAmount > 0 &&
    (debt.status === DebtStatus.OUTSTANDING || debt.status === DebtStatus.PARTIALLY_PAID)
  )
}

function canWriteOffDebt(debt: Debt | null | undefined) {
  if (!debt) {
    return false
  }

  return (
    debt.outstandingAmount > 0 &&
    (debt.status === DebtStatus.OUTSTANDING || debt.status === DebtStatus.PARTIALLY_PAID)
  )
}

function getDebtStatusBadgeClassName(status: CreditorStatus) {
  if (status === 'PARTIALLY_PAID') {
    return 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
  }

  if (status === 'SETTLED') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
  }

  if (status === 'WRITTEN_OFF') {
    return 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300'
  }

  return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
}

export default function CreditorsPage() {
  const t = useTranslations('app.creditors')
  const locale = useLocale()
  const localeTag = locale.startsWith('fr') ? 'fr-CM' : 'en-GB'
  const businessId = useAuthStore((state) => state.businessId)
  const accessToken = useAuthStore((state) => state.accessToken)
  const businessCurrency = useAuthStore((state) => state.businessCurrency)
  const [payables, setPayables] = useState<LocalSupplierPayable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [period, setPeriod] = useState<PeriodKey>('month')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<CreditorStatusFilter>('ALL')
  const [currentPage, setCurrentPage] = useState(1)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailDebtId, setDetailDebtId] = useState<string | null>(null)
  const [detailDebt, setDetailDebt] = useState<Debt | null>(null)
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraftState>(() => createPaymentDraft())
  const [focusPaymentForm, setFocusPaymentForm] = useState(false)
  const [recordingPayment, setRecordingPayment] = useState(false)
  const [writeOffReasonDraft, setWriteOffReasonDraft] = useState('')
  const [focusWriteOffForm, setFocusWriteOffForm] = useState(false)
  const [writingOff, setWritingOff] = useState(false)
  const paymentAmountInputRef = useRef<HTMLInputElement | null>(null)
  const writeOffReasonInputRef = useRef<HTMLInputElement | null>(null)
  const deferredSearch = useDeferredValue(search)
  const actorPayload = accessToken ? decodeJwtPayload<JwtPayload>(accessToken) : null

  useEffect(() => {
    if (!detailOpen) {
      setDetailDebt(null)
      setDetailDebtId(null)
      setPaymentDraft(createPaymentDraft())
      setFocusPaymentForm(false)
      setWriteOffReasonDraft('')
      setFocusWriteOffForm(false)
    }
  }, [detailOpen])

  useEffect(() => {
    if (!detailOpen || !focusPaymentForm || detailLoading || !canRecordPaymentForDebt(detailDebt)) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const input = paymentAmountInputRef.current
      if (!input) {
        return
      }

      input.scrollIntoView({ behavior: 'smooth', block: 'center' })
      input.focus()
      input.select()
      setFocusPaymentForm(false)
    }, 30)

    return () => window.clearTimeout(timeoutId)
  }, [detailDebt, detailLoading, detailOpen, focusPaymentForm])

  useEffect(() => {
    if (!detailOpen || !focusWriteOffForm || detailLoading || !canWriteOffDebt(detailDebt)) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const input = writeOffReasonInputRef.current
      if (!input) {
        return
      }

      input.scrollIntoView({ behavior: 'smooth', block: 'center' })
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
      setFocusWriteOffForm(false)
    }, 30)

    return () => window.clearTimeout(timeoutId)
  }, [detailDebt, detailLoading, detailOpen, focusWriteOffForm])

  useEffect(() => {
    if (!businessId) {
      setPayables([])
      setLoading(false)
      setError(null)
      return
    }

    let active = true
    const currentBusinessId = businessId

    async function loadPayables() {
      setLoading(true)
      setError(null)

      try {
        const result = await listSupplierPayablesLocal(currentBusinessId)

        if (!active) {
          return
        }

        setPayables(result)
      } catch (loadError) {
        if (!active) {
          return
        }

        setError(getApiErrorMessage(loadError, t('load_error')))
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadPayables()

    return () => {
      active = false
    }
  }, [businessId, reloadKey, t])

  const getStatusLabel = (status: CreditorStatus) => {
    if (status === 'PARTIALLY_PAID') {
      return t('status.partially_paid')
    }

    if (status === 'SETTLED') {
      return t('status.settled')
    }

    if (status === 'WRITTEN_OFF') {
      return t('status.written_off')
    }

    return t('status.outstanding')
  }

  const updatePayableFromDebt = (debt: Debt) => {
    const nextPayable = mapDebtToLocalSupplierPayable(debt)

    setPayables((current) => {
      let found = false
      const next = current.map((payable) => {
        if (payable.id !== debt.id) {
          return payable
        }

        found = true
        return nextPayable
      })

      return found ? next : [nextPayable, ...next]
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

  const getWriteOffErrorMessage = (error: unknown) => {
    if (error instanceof DebtLocalError) {
      if (error.code === 'DEBT_ALREADY_SETTLED' || error.code === 'DEBT_ALREADY_WRITTEN_OFF') {
        return t('detail.write_off_locked')
      }

      if (error.code === 'DEBT_WRITE_OFF_REASON_INVALID') {
        return t('detail.write_off_reason_invalid')
      }
    }

    return t('detail.write_off_error')
  }

  const openDetail = async (
    debtId: string,
    options?: {
      focusPaymentForm?: boolean
      focusWriteOffForm?: boolean
    },
  ) => {
    if (!businessId) {
      return
    }

    setDetailOpen(true)
    setDetailLoading(true)
    setDetailDebtId(debtId)
    setDetailDebt(null)
    setPaymentDraft(createPaymentDraft())
    setFocusPaymentForm(Boolean(options?.focusPaymentForm))
    setWriteOffReasonDraft('')
    setFocusWriteOffForm(Boolean(options?.focusWriteOffForm))

    try {
      const debt = await getDebtByIdLocal(businessId, debtId, DebtDirection.PAYABLE)
      setDetailDebt(debt)
    } catch {
      toast.error(t('load_error'))
    } finally {
      setDetailLoading(false)
    }
  }

  const handleOpenRecordPayment = async (debtId: string) => {
    await openDetail(debtId, { focusPaymentForm: true })
  }

  const handleOpenWriteOff = async (debtId: string) => {
    await openDetail(debtId, { focusWriteOffForm: true })
  }

  const handleRecordPayment = async () => {
    if (!businessId || !detailDebt || !canRecordPaymentForDebt(detailDebt)) {
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
        DebtDirection.PAYABLE,
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
      updatePayableFromDebt(updatedDebt)
      setPaymentDraft(createPaymentDraft())
      toast.success(t('detail.record_payment_success'))
    } catch (paymentError) {
      toast.error(getDebtPaymentErrorMessage(paymentError))
    } finally {
      setRecordingPayment(false)
    }
  }

  const handleWriteOff = async () => {
    if (!businessId || !detailDebt || !canWriteOffDebt(detailDebt)) {
      toast.error(t('detail.write_off_locked'))
      return
    }

    const reason = writeOffReasonDraft.trim()
    if (reason.length < 10 || reason.length > 1000) {
      toast.error(t('detail.write_off_reason_invalid'))
      setFocusWriteOffForm(true)
      return
    }

    setWritingOff(true)

    try {
      const updatedDebt = await writeOffDebtLocal(
        businessId,
        detailDebt.id,
        DebtDirection.PAYABLE,
        { reason },
        {
          writtenOffById: actorPayload?.sub ?? null,
        },
      )

      setDetailDebt(updatedDebt)
      updatePayableFromDebt(updatedDebt)
      setWriteOffReasonDraft('')
      toast.success(t('detail.write_off_success'))
    } catch (writeOffError) {
      toast.error(getWriteOffErrorMessage(writeOffError))
    } finally {
      setWritingOff(false)
    }
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [deferredSearch, period, statusFilter])

  const creditorRows = useMemo(() => buildCreditorRows(payables), [payables])
  const periodRows = useMemo(
    () => creditorRows.filter((row) => isWithinPeriod(row.createdAt, period)),
    [creditorRows, period],
  )
  const openRows = useMemo(
    () => periodRows.filter((row) => row.outstandingAmount > 0),
    [periodRows],
  )

  const filteredRows = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase()

    return periodRows.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      return `${row.supplierName} ${row.reference}`.toLowerCase().includes(normalizedSearch)
    })
  }, [deferredSearch, periodRows, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages))
  }, [totalPages])

  const pageStart = filteredRows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE
  const paginatedRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE)
  const showingStart = filteredRows.length === 0 ? 0 : pageStart + 1
  const showingEnd = filteredRows.length === 0 ? 0 : pageStart + paginatedRows.length
  const pageNumbers = useMemo(() => buildPageNumbers(currentPage, totalPages), [currentPage, totalPages])

  const totalPayable = sumAmount(openRows, 'outstandingAmount')
  const openSuppliers = new Set(openRows.map((row) => row.supplierName)).size
  const partiallyPaidRows = openRows.filter((row) => row.status === 'PARTIALLY_PAID')
  const partiallyPaidAmount = sumAmount(partiallyPaidRows, 'outstandingAmount')
  const paidThisMonthRows = useMemo(
    () => creditorRows.filter((row) => isWithinCurrentMonth(row.createdAt) && row.paidAmount > 0),
    [creditorRows],
  )
  const paidThisMonth = sumAmount(paidThisMonthRows, 'paidAmount')
  const agedRows = openRows.filter((row) => row.olderThanThirtyDays)
  const agedAmount = sumAmount(agedRows, 'outstandingAmount')
  const supplierSummaries = useMemo(() => buildSupplierSummaries(openRows), [openRows])
  const oldestRows = useMemo(
    () =>
      [...openRows]
        .sort((left, right) => {
          if (right.ageDays !== left.ageDays) {
            return right.ageDays - left.ageDays
          }

          return left.createdAt.localeCompare(right.createdAt)
        })
        .slice(0, 5),
    [openRows],
  )
  const metricMax = Math.max(totalPayable, partiallyPaidAmount, paidThisMonth, agedAmount, 1)
  const detailCanRecordPayment = canRecordPaymentForDebt(detailDebt)
  const detailCanWriteOff = canWriteOffDebt(detailDebt)

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground shadow-sm">
          <Spinner size="lg" />
          {t('loading')}
        </div>
      </div>
    )
  }

  if (!businessId) {
    return (
      <SurfaceCard title={t('title')}>
        <p className="text-sm text-muted-foreground">{t('business_required')}</p>
      </SurfaceCard>
    )
  }

  if (error) {
    return (
      <SurfaceCard title={t('title')} description={t('subtitle')}>
        <div className="space-y-4">
          <p className="text-sm text-danger-400">{error}</p>
          <Button variant="secondary" onClick={() => setReloadKey((value) => value + 1)}>
            {t('actions.retry')}
          </Button>
        </div>
      </SurfaceCard>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-foreground">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        <div className="w-full sm:w-[220px]">
          <Select value={period} onValueChange={(value) => setPeriod(value as PeriodKey)}>
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">{t('periods.month')}</SelectItem>
              <SelectItem value="quarter">{t('periods.quarter')}</SelectItem>
              <SelectItem value="all">{t('periods.all')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CreditorMetricCard
          label={t('metrics.total_payable')}
          value={formatCurrency(totalPayable, localeTag, businessCurrency)}
          hint={
            totalPayable > 0
              ? t('metrics.total_payable_hint', { count: openSuppliers })
              : t('metrics.total_payable_empty')
          }
          tone="danger"
          ratio={getRatio(totalPayable, metricMax)}
        />
        <CreditorMetricCard
          label={t('metrics.partially_paid')}
          value={formatCurrency(partiallyPaidAmount, localeTag, businessCurrency)}
          hint={
            partiallyPaidAmount > 0
              ? t('metrics.partially_paid_hint', { count: partiallyPaidRows.length })
              : t('metrics.partially_paid_empty')
          }
          tone="info"
          ratio={getRatio(partiallyPaidAmount, metricMax)}
        />
        <CreditorMetricCard
          label={t('metrics.paid_this_month')}
          value={formatCurrency(paidThisMonth, localeTag, businessCurrency)}
          hint={
            paidThisMonth > 0
              ? t('metrics.paid_this_month_hint', { count: paidThisMonthRows.length })
              : t('metrics.paid_this_month_empty')
          }
          tone="success"
          ratio={getRatio(paidThisMonth, metricMax)}
        />
        <CreditorMetricCard
          label={t('metrics.aged_thirty_days')}
          value={formatCurrency(agedAmount, localeTag, businessCurrency)}
          hint={
            agedAmount > 0
              ? t('metrics.aged_thirty_days_hint', { count: agedRows.length })
              : t('metrics.aged_thirty_days_empty')
          }
          tone="warning"
          ratio={getRatio(agedAmount, metricMax)}
        />
      </div>

      <p className="text-sm text-muted-foreground">{t('messages.derived_from_restocks')}</p>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
        <SurfaceCard
          title={t('suppliers.title')}
          description={t('suppliers.description')}
          className="h-full"
        >
          {supplierSummaries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              {t('suppliers.empty')}
            </div>
          ) : (
            <div className="space-y-4">
              {supplierSummaries.map((supplier) => (
                <div key={supplier.key} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {supplier.supplierName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('suppliers.open_restocks', { count: supplier.count })}
                      </p>
                    </div>
                    <div className="text-right text-sm font-medium text-foreground">
                      {formatCurrency(supplier.amount, localeTag, businessCurrency)}
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted/80">
                    <div
                      className="h-full rounded-full bg-sky-500 transition-[width]"
                      style={{ width: `${supplier.ratio}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard
          title={t('oldest.title')}
          description={t('oldest.description')}
          className="h-full"
        >
          {oldestRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              {t('oldest.empty')}
            </div>
          ) : (
            <div className="space-y-4">
              {oldestRows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-start justify-between gap-3 border-b border-border/70 pb-4 last:border-b-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {row.supplierName}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{row.reference}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatDateLabel(row.createdAt, localeTag)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-danger-400">
                      {formatCurrency(row.outstandingAmount, localeTag, businessCurrency)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t('oldest.open_for_days', { count: row.ageDays })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>
      </div>

      <SurfaceCard className="overflow-hidden p-0">
        <div className="border-b border-border px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="min-w-0 flex-1">
              <Input
                value={search}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
                placeholder={t('filters.search_placeholder')}
                className="h-11 rounded-xl"
              />
            </div>

            <div className="w-full lg:w-[220px]">
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as CreditorStatusFilter)}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('filters.all_statuses')}</SelectItem>
                  <SelectItem value="OUTSTANDING">{t('status.outstanding')}</SelectItem>
                  <SelectItem value="PARTIALLY_PAID">{t('status.partially_paid')}</SelectItem>
                  <SelectItem value="SETTLED">{t('status.settled')}</SelectItem>
                  <SelectItem value="WRITTEN_OFF">{t('status.written_off')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] table-fixed text-sm">
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-[16%]" />
              <col className="w-[14%]" />
              <col className="w-[18%]" />
              <col className="w-[12%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead className="bg-muted/50">
              <tr>
                {[
                  t('table.supplier'),
                  t('table.reference'),
                  t('table.status'),
                  t('table.outstanding'),
                  t('table.opened'),
                  t('table.actions'),
                ].map((label) => (
                  <th
                    key={label}
                    className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-sm text-muted-foreground">
                    {t('table.empty')}
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => {
                  const canRecordPayment =
                    row.outstandingAmount > 0 &&
                    (row.status === 'OUTSTANDING' || row.status === 'PARTIALLY_PAID')

                  return (
                    <tr
                      key={row.id}
                      onClick={() => void openDetail(row.id)}
                      className="cursor-pointer border-t border-border/80 first:border-t-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700">
                            {getInitials(row.supplierName)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">{row.supplierName}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {row.supplierPhone || t('table.no_phone')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {row.reference}
                      </td>
                      <td className="px-4 py-3">
                        <CreditorStatusBadge status={row.status} t={t} />
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className={cn(
                            'font-medium',
                            row.status === 'WRITTEN_OFF'
                              ? 'text-slate-600 dark:text-slate-300'
                              : row.outstandingAmount > 0
                                ? 'text-danger-400'
                                : 'text-emerald-700',
                          )}
                        >
                          {formatCurrency(row.outstandingAmount, localeTag, businessCurrency)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t('table.of_original', {
                            amount: formatCurrency(row.originalAmount, localeTag, businessCurrency),
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-muted-foreground">
                          {formatDateLabel(row.createdAt, localeTag)}
                        </div>
                        {row.olderThanThirtyDays && row.outstandingAmount > 0 ? (
                          <span className="mt-1 inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
                            {t('table.aged_tag')}
                          </span>
                        ) : null}
                      </td>
                      <td
                        className="px-4 py-3"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="flex justify-end">
                          <ResourceActionMenu
                            label={t('actions.more')}
                            orientation="vertical"
                            items={[
                              {
                                label: t('actions.view'),
                                onSelect: () => void openDetail(row.id),
                              },
                              ...(canRecordPayment
                                ? [
                                    {
                                      label: t('actions.record_payment'),
                                      onSelect: () => void handleOpenRecordPayment(row.id),
                                    },
                                  ]
                                : []),
                              ...(row.status !== 'SETTLED' && row.status !== 'WRITTEN_OFF'
                                ? [
                                    {
                                      label: t('actions.write_off'),
                                      onSelect: () => void handleOpenWriteOff(row.id),
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {t('table.showing', {
              start: showingStart,
              end: showingEnd,
              total: filteredRows.length,
            })}
          </p>

          <div className="flex flex-wrap gap-2">
            {pageNumbers.map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                onClick={() => setCurrentPage(pageNumber)}
                className={cn(
                  'rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                  currentPage === pageNumber
                    ? 'border-border bg-secondary text-foreground'
                    : 'border-border/80 bg-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground',
                )}
              >
                {pageNumber}
              </button>
            ))}
          </div>
        </div>
      </SurfaceCard>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent
          className="max-h-[calc(100vh-1rem)] max-w-2xl overflow-hidden p-0 sm:max-h-[calc(100vh-3rem)]"
          closeLabel={t('actions.close')}
        >
          <DialogHeader className="shrink-0 pr-16">
            <DialogTitle>{detailDebt?.sourceReference || detailDebtId || t('detail.title')}</DialogTitle>
            <DialogDescription>{t('detail.subtitle')}</DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="flex min-h-[260px] items-center justify-center">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Spinner size="sm" />
                  <span>{t('loading')}</span>
                </div>
              </div>
            </div>
          ) : detailDebt ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-5">
                <div className="flex flex-wrap gap-3">
                  {detailCanRecordPayment ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={recordingPayment}
                      onClick={() => setFocusPaymentForm(true)}
                    >
                      {t('actions.record_payment')}
                    </Button>
                  ) : null}
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <section className="rounded-2xl border border-border bg-muted/20 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {t('detail.supplier_information')}
                    </p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{t('detail.supplier')}</span>
                        <span className="text-right font-medium text-foreground">
                          {detailDebt.contact?.name || t('detail.no_supplier')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{t('detail.phone')}</span>
                        <span className="text-right font-medium text-foreground">
                          {detailDebt.contact?.phone || t('table.no_phone')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{t('detail.reference')}</span>
                        <span className="font-mono text-xs font-medium text-foreground">
                          {detailDebt.sourceReference}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{t('detail.opened')}</span>
                        <span className="font-medium text-foreground">
                          {formatDateLabel(detailDebt.createdAt, localeTag)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 rounded-xl border border-border/70 bg-background/80 px-3 py-3 dark:bg-background/60">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {t('detail.notes')}
                      </p>
                      <p className="mt-2 text-sm text-foreground">
                        {detailDebt.notes?.trim() || t('detail.no_notes')}
                      </p>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-border bg-muted/20 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {t('detail.balance_summary')}
                    </p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{t('detail.original_balance')}</span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(detailDebt.originalAmount, localeTag, businessCurrency)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{t('detail.paid_amount')}</span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(detailDebt.paidAmount, localeTag, businessCurrency)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{t('detail.outstanding_balance')}</span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(detailDebt.outstandingAmount, localeTag, businessCurrency)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{t('detail.status')}</span>
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                            getDebtStatusBadgeClassName(buildCreditorStatus(detailDebt.status, detailDebt.outstandingAmount, detailDebt.paidAmount)),
                          )}
                        >
                          {getStatusLabel(
                            buildCreditorStatus(
                              detailDebt.status,
                              detailDebt.outstandingAmount,
                              detailDebt.paidAmount,
                            ),
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
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
                                {getPaymentMethodLabel(payment.method, t)}
                              </span>
                              <span className="font-medium text-foreground">
                                {formatCurrency(payment.amount, localeTag, businessCurrency)}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span>{formatDateLabel(`${payment.paymentDate}T00:00:00`, localeTag)}</span>
                              {payment.mobileMoneyReference ? (
                                <span>{payment.mobileMoneyReference}</span>
                              ) : null}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">{t('detail.no_follow_up_payments')}</p>
                      )}
                    </div>
                  </section>
                </div>

                {detailCanRecordPayment ? (
                  <section className="rounded-2xl border border-border bg-card px-4 py-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <span className="inline-flex rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300">
                          {t('actions.record_payment')}
                        </span>
                        <p className="mt-3 text-sm font-semibold text-foreground">
                          {t('detail.record_payment_title')}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('detail.record_payment_description', {
                            amount: formatCurrency(detailDebt.outstandingAmount, localeTag, businessCurrency),
                          })}
                        </p>
                      </div>
                      <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300">
                        {formatCurrency(detailDebt.outstandingAmount, localeTag, businessCurrency)}
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
                          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/15"
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
                          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/15"
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
                          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/15"
                        >
                          <option value={PaymentMethod.CASH}>{getPaymentMethodLabel(PaymentMethod.CASH, t)}</option>
                          <option value={PaymentMethod.MTN_MOMO}>
                            {getPaymentMethodLabel(PaymentMethod.MTN_MOMO, t)}
                          </option>
                          <option value={PaymentMethod.ORANGE_MONEY}>
                            {getPaymentMethodLabel(PaymentMethod.ORANGE_MONEY, t)}
                          </option>
                          <option value={PaymentMethod.CARD}>{getPaymentMethodLabel(PaymentMethod.CARD, t)}</option>
                        </select>
                      </label>

                      {paymentDraft.method === PaymentMethod.MTN_MOMO ||
                      paymentDraft.method === PaymentMethod.ORANGE_MONEY ? (
                        <label className="space-y-2 text-sm">
                          <span className="font-medium text-foreground">{t('detail.payment_reference')}</span>
                          <Input
                            value={paymentDraft.mobileMoneyReference}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              setPaymentDraft((current) => ({
                                ...current,
                                mobileMoneyReference: event.target.value,
                              }))
                            }
                            placeholder={t('detail.payment_reference_placeholder')}
                            className="h-11 rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/15"
                          />
                        </label>
                      ) : (
                        <div className="hidden md:block" aria-hidden="true" />
                      )}
                    </div>

                    <label className="mt-4 block space-y-2 text-sm">
                      <span className="font-medium text-foreground">{t('detail.payment_notes')}</span>
                      <Input
                        value={paymentDraft.notes}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          setPaymentDraft((current) => ({ ...current, notes: event.target.value }))
                        }
                        placeholder={t('detail.payment_notes_placeholder')}
                        className="h-11 rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/15"
                      />
                    </label>

                    <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
                      <Button
                        type="button"
                        variant="primary"
                        disabled={recordingPayment}
                        onClick={() => void handleRecordPayment()}
                      >
                        {recordingPayment
                          ? t('detail.record_payment_submitting')
                          : t('detail.record_payment_submit')}
                      </Button>
                    </div>
                  </section>
                ) : null}

                {detailCanWriteOff ? (
                  <section className="rounded-2xl border border-border bg-card px-4 py-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <span className="inline-flex rounded-full border border-slate-500/20 bg-slate-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700 dark:border-slate-400/30 dark:bg-slate-400/10 dark:text-slate-300">
                          {t('actions.write_off')}
                        </span>
                        <p className="mt-3 text-sm font-semibold text-foreground">
                          {t('detail.write_off_title')}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('detail.write_off_description', {
                            amount: formatCurrency(detailDebt.outstandingAmount, localeTag, businessCurrency),
                          })}
                        </p>
                      </div>
                    </div>

                    <label className="mt-4 block space-y-2 text-sm">
                      <span className="font-medium text-foreground">{t('detail.write_off_reason')}</span>
                      <Input
                        ref={writeOffReasonInputRef}
                        value={writeOffReasonDraft}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          setWriteOffReasonDraft(event.target.value)
                        }
                        placeholder={t('detail.write_off_reason_placeholder')}
                        maxLength={1000}
                        className="h-11 rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-slate-500/40 focus:ring-2 focus:ring-slate-500/15"
                      />
                    </label>

                    <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={writingOff}
                        onClick={() => void handleWriteOff()}
                      >
                        {writingOff ? t('detail.write_off_submitting') : t('detail.write_off_submit')}
                      </Button>
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <p className="text-sm text-muted-foreground">{t('load_error')}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function buildCreditorRows(payables: LocalSupplierPayable[]): CreditorRow[] {
  const today = startOfLocalDay(new Date())

  return payables.map((payable) => {
    const originalAmount = roundMoney(
      Math.max(payable.totalAmount, payable.amountPaid + payable.outstandingAmount),
    )
    const outstandingAmount = roundMoney(Math.max(0, payable.outstandingAmount))
    const paidAmount = roundMoney(Math.max(0, payable.amountPaid))
    const createdDate = new Date(payable.createdAt)
    const ageDays = Number.isNaN(createdDate.getTime())
      ? 0
      : Math.max(
          0,
          Math.floor(
            (today.getTime() - startOfLocalDay(createdDate).getTime()) / (24 * 60 * 60 * 1000),
          ),
        )
    const status = buildCreditorStatus(payable.status, outstandingAmount, paidAmount)

    return {
      id: payable.id,
      supplierId: payable.supplierId,
      supplierName: payable.supplierName,
      supplierPhone: payable.supplierPhone,
      reference: payable.reference,
      status,
      originalAmount,
      paidAmount,
      outstandingAmount,
      createdAt: payable.createdAt,
      ageDays,
      olderThanThirtyDays: ageDays > 30,
    }
  })
}

function buildCreditorStatus(
  debtStatus: DebtStatus,
  outstandingAmount: number,
  paidAmount: number,
): CreditorStatus {
  if (debtStatus === DebtStatus.WRITTEN_OFF) {
    return 'WRITTEN_OFF'
  }

  if (debtStatus === DebtStatus.SETTLED || outstandingAmount <= 0) {
    return 'SETTLED'
  }

  if (debtStatus === DebtStatus.PARTIALLY_PAID || paidAmount > 0) {
    return 'PARTIALLY_PAID'
  }

  return 'OUTSTANDING'
}

function buildSupplierSummaries(rows: CreditorRow[]): SupplierSummary[] {
  const grouped = new Map<string, { supplierName: string; amount: number; count: number }>()

  for (const row of rows) {
    const key = row.supplierId || row.supplierName.trim().toLowerCase()
    const existing = grouped.get(key)

    if (existing) {
      existing.amount += row.outstandingAmount
      existing.count += 1
      continue
    }

    grouped.set(key, {
      supplierName: row.supplierName,
      amount: row.outstandingAmount,
      count: 1,
    })
  }

  const summaries = [...grouped.entries()]
    .map(([key, value]) => ({
      key,
      supplierName: value.supplierName,
      amount: roundMoney(value.amount),
      count: value.count,
      ratio: 0,
    }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 6)

  const maxAmount = Math.max(...summaries.map((summary) => summary.amount), 1)

  return summaries.map((summary) => ({
    ...summary,
    ratio: getRatio(summary.amount, maxAmount),
  }))
}

function isWithinPeriod(value: string, period: PeriodKey) {
  if (period === 'all') {
    return true
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return false
  }

  const now = new Date()
  const start =
    period === 'quarter'
      ? new Date(now.getFullYear(), now.getMonth() - 2, 1)
      : new Date(now.getFullYear(), now.getMonth(), 1)

  return date >= start && date <= now
}

function isWithinCurrentMonth(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return false
  }

  const now = new Date()

  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function sumAmount<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  return rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0)
}

function getRatio(value: number, max: number) {
  if (value <= 0 || max <= 0) {
    return 0
  }

  return Math.max(6, Math.min(100, Math.round((value / max) * 100)))
}

function formatCurrency(value: number, localeTag: string, currency = 'XAF') {
  return `${currency} ${Math.round(value).toLocaleString(localeTag)}`
}

function getPaymentMethodLabel(method: PaymentMethod, t: TranslateFn) {
  if (method === PaymentMethod.MTN_MOMO) {
    return t('detail.payment_method_mtn_momo')
  }

  if (method === PaymentMethod.ORANGE_MONEY) {
    return t('detail.payment_method_orange_money')
  }

  if (method === PaymentMethod.CARD) {
    return t('detail.payment_method_card')
  }

  return t('detail.payment_method_cash')
}

function formatDateLabel(value: string, localeTag: string) {
  return new Intl.DateTimeFormat(localeTag, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function buildPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, 5]
  }

  if (currentPage >= totalPages - 2) {
    return Array.from({ length: 5 }, (_, index) => totalPages - 4 + index)
  }

  return Array.from({ length: 5 }, (_, index) => currentPage - 2 + index)
}

function CreditorMetricCard({
  label,
  value,
  hint,
  tone,
  ratio,
}: {
  label: string
  value: string
  hint: string
  tone: MetricTone
  ratio: number
}) {
  const cardClassName =
    tone === 'danger'
      ? 'border-red-200 bg-red-50'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50'
        : tone === 'success'
          ? 'border-emerald-200 bg-emerald-50'
          : tone === 'info'
            ? 'border-sky-200 bg-sky-50'
            : 'border-border bg-card'
  const valueClassName =
    tone === 'danger'
      ? 'text-danger-400'
      : tone === 'warning'
        ? 'text-warning-400'
        : tone === 'success'
          ? 'text-emerald-700'
          : tone === 'info'
            ? 'text-sky-700'
            : 'text-foreground'
  const barClassName =
    tone === 'danger'
      ? 'bg-red-500'
      : tone === 'warning'
        ? 'bg-amber-500'
        : tone === 'success'
          ? 'bg-emerald-500'
          : tone === 'info'
            ? 'bg-sky-500'
            : 'bg-stone-400'

  return (
    <div className={cn('rounded-2xl border p-4 shadow-sm', cardClassName)}>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className={cn('mt-2 text-2xl font-semibold', valueClassName)}>{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/70">
        <div
          className={cn('h-full rounded-full transition-[width]', barClassName)}
          style={{ width: `${ratio}%` }}
        />
      </div>
    </div>
  )
}

function CreditorStatusBadge({
  status,
  t,
}: {
  status: CreditorStatus
  t: TranslateFn
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
        getDebtStatusBadgeClassName(status),
      )}
    >
      {status === 'PARTIALLY_PAID'
        ? t('status.partially_paid')
        : status === 'SETTLED'
          ? t('status.settled')
          : status === 'WRITTEN_OFF'
            ? t('status.written_off')
            : t('status.outstanding')}
    </span>
  )
}
