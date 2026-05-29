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
  listAllDebtsByDirectionLocal,
  recordDebtPaymentLocal,
  writeOffDebtLocal,
} from '@/services/debts.local'
import { useAuthStore } from '@/stores/auth.store'
import Link from 'next/link'

type PeriodKey = 'month' | 'quarter' | 'all'
type DebtorStatus = 'OUTSTANDING' | 'PARTIALLY_PAID' | 'SETTLED' | 'WRITTEN_OFF'
type DebtorStatusFilter = 'ALL' | DebtorStatus
type MetricTone = 'default' | 'success' | 'warning' | 'danger'
type TranslateFn = (key: string, values?: Record<string, string | number>) => string
type DebtorRow = {
  id: string
  contactId: string | null
  contactName: string
  contactPhone: string | null
  reference: string
  status: DebtorStatus
  originalAmount: number
  paidAmount: number
  outstandingAmount: number
  createdAt: string
  dueDate: string | null
  ageDays: number
  olderThanThirtyDays: boolean
}
type AgingBucket = {
  key: 'bucket_0_7' | 'bucket_8_15' | 'bucket_16_30' | 'bucket_30_plus'
  amount: number
  count: number
  ratio: number
  tone: MetricTone
}
type CollectionSnapshot = {
  currentAmount: number
  previousAmount: number
  currentRate: number
  previousRate: number
  currentCount: number
  previousCount: number
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

function buildDebtorStatus(
  debtStatus: DebtStatus,
  outstandingAmount: number,
  paidAmount: number,
): DebtorStatus {
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

function mapDebtToDebtorRow(debt: Debt): DebtorRow {
  const originalAmount = roundMoney(debt.originalAmount)
  const paidAmount = roundMoney(debt.paidAmount)
  const outstandingAmount = roundMoney(debt.outstandingAmount)
  const status = buildDebtorStatus(debt.status, outstandingAmount, paidAmount)
  const openedAt = debt.createdAt
  const openedDate = new Date(openedAt)
  const today = startOfLocalDay(new Date())
  const ageDays = Number.isNaN(openedDate.getTime())
    ? 0
    : Math.max(
        0,
        Math.floor((today.getTime() - startOfLocalDay(openedDate).getTime()) / (24 * 60 * 60 * 1000)),
      )

  return {
    id: debt.id,
    contactId: debt.contact?.id ?? debt.contactId ?? null,
    contactName: debt.contact?.name || debt.sourceReference || debt.id,
    contactPhone: debt.contact?.phone ?? null,
    reference: debt.sourceReference || debt.id,
    status,
    originalAmount,
    paidAmount,
    outstandingAmount,
    createdAt: openedAt,
    dueDate: debt.dueDate ?? null,
    ageDays,
    olderThanThirtyDays: ageDays > 30,
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

function getDebtStatusBadgeClassName(status: DebtorStatus) {
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

export default function DebtorsPage() {
  const t = useTranslations('app.debtors')
  const locale = useLocale()
  const localeTag = locale.startsWith('fr') ? 'fr-CM' : 'en-GB'
  const businessId = useAuthStore((state) => state.businessId)
  const accessToken = useAuthStore((state) => state.accessToken)
  const businessCurrency = useAuthStore((state) => state.businessCurrency)
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [period, setPeriod] = useState<PeriodKey>('month')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<DebtorStatusFilter>('ALL')
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
      setDebts([])
      setLoading(false)
      setError(null)
      return
    }

    let active = true
    const currentBusinessId = businessId

    async function loadDebts() {
      setLoading(true)
      setError(null)

      try {
        const result = await listAllDebtsByDirectionLocal(currentBusinessId, DebtDirection.RECEIVABLE, {
          includePayments: true,
        })

        if (!active) {
          return
        }

        setDebts(result)
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

    void loadDebts()

    return () => {
      active = false
    }
  }, [businessId, reloadKey, t])

  const getStatusLabel = (status: DebtorStatus) => {
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

  const updateDebtRow = (debt: Debt) => {
    setDebts((current) => {
      let found = false
      const next = current.map((item) => {
        if (item.id !== debt.id) {
          return item
        }

        found = true
        return debt
      })

      return found ? next : [debt, ...next]
    })
  }

  const getDebtPaymentErrorMessage = (errorValue: unknown) => {
    if (errorValue instanceof DebtLocalError) {
      if (errorValue.code === 'DEBT_PAYMENT_LOCKED' || errorValue.code === 'DEBT_ALREADY_SETTLED') {
        return t('detail.record_payment_locked')
      }

      if (errorValue.code === 'DEBT_PAYMENT_AMOUNT_EXCEEDS_OUTSTANDING') {
        return t('detail.record_payment_exceeds')
      }

      if (errorValue.code === 'DEBT_PAYMENT_DATE_INVALID' || errorValue.code === 'INVALID_DATE') {
        return t('detail.record_payment_date_invalid')
      }
    }

    return t('detail.record_payment_error')
  }

  const getWriteOffErrorMessage = (errorValue: unknown) => {
    if (errorValue instanceof DebtLocalError) {
      if (errorValue.code === 'DEBT_ALREADY_SETTLED' || errorValue.code === 'DEBT_ALREADY_WRITTEN_OFF') {
        return t('detail.write_off_locked')
      }

      if (errorValue.code === 'DEBT_WRITE_OFF_REASON_INVALID') {
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
      const debt = await getDebtByIdLocal(businessId, debtId, DebtDirection.RECEIVABLE)
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
      updateDebtRow(updatedDebt)
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
        DebtDirection.RECEIVABLE,
        { reason },
        {
          writtenOffById: actorPayload?.sub ?? null,
        },
      )

      setDetailDebt(updatedDebt)
      updateDebtRow(updatedDebt)
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

  const debtorRows = useMemo(() => debts.map(mapDebtToDebtorRow), [debts])
  const periodRows = useMemo(
    () => debtorRows.filter((row) => isWithinPeriod(row.createdAt, period)),
    [debtorRows, period],
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

      return `${row.contactName} ${row.reference}`.toLowerCase().includes(normalizedSearch)
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

  const totalOutstanding = sumAmount(openRows, 'outstandingAmount')
  const totalDebtors = new Set(openRows.map((row) => row.contactId || row.contactName)).size
  const overdueRows = openRows.filter((row) => row.olderThanThirtyDays)
  const overdueAmount = sumAmount(overdueRows, 'outstandingAmount')
  const collectionSnapshot = useMemo(() => buildMonthlyCollectionSnapshot(debts), [debts])
  const collectedThisMonth = collectionSnapshot.currentAmount
  const writtenOffThisMonthRows = useMemo(
    () =>
      debts.filter(
        (debt) =>
          debt.status === DebtStatus.WRITTEN_OFF &&
          Boolean(debt.writtenOffAt) &&
          isWithinCurrentMonth(debt.writtenOffAt ?? ''),
      ),
    [debts],
  )
  const writtenOffThisMonth = writtenOffThisMonthRows.reduce(
    (sum, debt) => sum + Math.max(0, roundMoney(debt.originalAmount - debt.paidAmount)),
    0,
  )
  const agingBuckets = useMemo(() => buildAgingBuckets(openRows), [openRows])

  const metricMax = Math.max(totalOutstanding, overdueAmount, collectedThisMonth, writtenOffThisMonth, 1)
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
        <DebtorMetricCard
          label={t('metrics.total_outstanding')}
          value={formatCurrency(totalOutstanding, localeTag, businessCurrency)}
          hint={
            totalOutstanding > 0
              ? t('metrics.total_outstanding_hint', { count: totalDebtors })
              : t('metrics.total_outstanding_empty')
          }
          tone="danger"
          ratio={getRatio(totalOutstanding, metricMax)}
        />
        <DebtorMetricCard
          label={t('metrics.overdue')}
          value={formatCurrency(overdueAmount, localeTag, businessCurrency)}
          hint={
            overdueAmount > 0
              ? t('metrics.overdue_hint', { count: overdueRows.length })
              : t('metrics.overdue_empty')
          }
          tone="warning"
          ratio={getRatio(overdueAmount, metricMax)}
        />
        <DebtorMetricCard
          label={t('metrics.collected_this_month')}
          value={formatCurrency(collectedThisMonth, localeTag, businessCurrency)}
          hint={
            collectedThisMonth > 0
              ? t('metrics.collected_this_month_hint', { count: collectionSnapshot.currentCount })
              : t('metrics.collected_this_month_empty')
          }
          tone="success"
          ratio={getRatio(collectedThisMonth, metricMax)}
        />
        <DebtorMetricCard
          label={t('metrics.written_off')}
          value={formatCurrency(writtenOffThisMonth, localeTag, businessCurrency)}
          hint={
            writtenOffThisMonth > 0
              ? t('metrics.written_off_hint', { count: writtenOffThisMonthRows.length })
              : t('metrics.written_off_empty')
          }
          tone="default"
          ratio={getRatio(writtenOffThisMonth, metricMax)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
        <SurfaceCard
          title={t('aging.title')}
          description={t('aging.description')}
          className="h-full"
        >
          <div className="space-y-4">
            {agingBuckets.map((bucket) => (
              <div key={bucket.key} className="flex items-center gap-3">
                <div className="w-20 shrink-0 text-xs text-muted-foreground">
                  {t(`aging.${bucket.key}`)}
                </div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/80">
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width]',
                      bucket.tone === 'danger'
                        ? 'bg-red-500'
                        : bucket.tone === 'warning'
                          ? 'bg-amber-500'
                          : bucket.tone === 'success'
                            ? 'bg-emerald-500'
                            : 'bg-slate-400',
                    )}
                    style={{ width: `${bucket.ratio}%` }}
                  />
                </div>
                <div className="w-28 shrink-0 text-right text-xs font-medium text-foreground">
                  {bucket.amount > 0 ? formatCurrency(bucket.amount, localeTag, businessCurrency) : t('aging.empty_value')}
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard
          title={t('collection.title')}
          description={t('collection.description')}
          className="h-full"
        >
          <div className="space-y-5">
            {collectionSnapshot.currentAmount <= 0 && collectionSnapshot.previousAmount <= 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                {t('collection.empty')}
              </div>
            ) : (
              <>
                <CollectionBar
                  label={t('collection.this_month')}
                  amount={collectionSnapshot.currentAmount}
                  rate={collectionSnapshot.currentRate}
                  ratio={getRatio(
                    collectionSnapshot.currentAmount,
                    Math.max(collectionSnapshot.currentAmount, collectionSnapshot.previousAmount, 1),
                  )}
                  tone="success"
                  locale={localeTag}
                  currency={businessCurrency}
                  t={t}
                />
                <CollectionBar
                  label={t('collection.last_month')}
                  amount={collectionSnapshot.previousAmount}
                  rate={collectionSnapshot.previousRate}
                  ratio={getRatio(
                    collectionSnapshot.previousAmount,
                    Math.max(collectionSnapshot.currentAmount, collectionSnapshot.previousAmount, 1),
                  )}
                  tone="default"
                  locale={localeTag}
                  currency={businessCurrency}
                  t={t}
                />
              </>
            )}
          </div>
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
                onValueChange={(value) => setStatusFilter(value as DebtorStatusFilter)}
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
                  t('table.customer'),
                  t('table.reference'),
                  t('table.status'),
                  t('table.outstanding'),
                  t('table.due_date'),
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
                      <td
                        className="px-4 py-3"
                        onClick={(e)=>e.stopPropagation()}
                      >
                        <Link
                          href={row.contactId ? `/${locale}/contacts/detail?contactId=${row.contactId}` : ''}
                          className=' hover:text-primary hover:underline'
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
                              {getInitials(row.contactName)}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-medium text-foreground">{row.contactName}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {row.contactPhone || t('table.no_phone')}
                              </div>
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {row.reference}
                      </td>
                      <td className="px-4 py-3">
                        <DebtorStatusBadge status={row.status} t={t} />
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
                          {row.dueDate ? formatDateLabel(row.dueDate, localeTag) : t('table.no_due_date')}
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
                      disabled={recordingPayment || writingOff}
                      onClick={() => setFocusPaymentForm(true)}
                    >
                      {t('actions.record_payment')}
                    </Button>
                  ) : null}
                  {detailCanWriteOff ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={recordingPayment || writingOff}
                      onClick={() => setFocusWriteOffForm(true)}
                    >
                      {t('actions.write_off')}
                    </Button>
                  ) : null}
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <section className="rounded-2xl border border-border bg-muted/20 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {t('detail.customer_information')}
                    </p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{t('detail.customer')}</span>
                        <span className="text-right font-medium text-foreground">
                          {detailDebt.contact?.name || t('detail.no_customer')}
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
                        <span className="text-muted-foreground">{t('detail.collected_amount')}</span>
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
                            getDebtStatusBadgeClassName(
                              buildDebtorStatus(
                                detailDebt.status,
                                detailDebt.outstandingAmount,
                                detailDebt.paidAmount,
                              ),
                            ),
                          )}
                        >
                          {getStatusLabel(
                            buildDebtorStatus(
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
                        <span className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300">
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
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300">
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
                            className="h-11 rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/15"
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
                        className="h-11 rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/15"
                      />
                    </label>

                    <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
                      <Button
                        type="button"
                        variant="primary"
                        disabled={recordingPayment || writingOff}
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
                        disabled={recordingPayment || writingOff}
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

function buildAgingBuckets(rows: DebtorRow[]): AgingBucket[] {
  const totalOutstanding = sumAmount(rows, 'outstandingAmount')
  const buckets = [
    {
      key: 'bucket_0_7' as const,
      tone: 'success' as const,
      rows: rows.filter((row) => row.ageDays <= 7),
    },
    {
      key: 'bucket_8_15' as const,
      tone: 'warning' as const,
      rows: rows.filter((row) => row.ageDays >= 8 && row.ageDays <= 15),
    },
    {
      key: 'bucket_16_30' as const,
      tone: 'warning' as const,
      rows: rows.filter((row) => row.ageDays >= 16 && row.ageDays <= 30),
    },
    {
      key: 'bucket_30_plus' as const,
      tone: 'danger' as const,
      rows: rows.filter((row) => row.ageDays > 30),
    },
  ]

  return buckets.map((bucket) => {
    const amount = sumAmount(bucket.rows, 'outstandingAmount')

    return {
      key: bucket.key,
      amount,
      count: bucket.rows.length,
      ratio: getRatio(amount, Math.max(totalOutstanding, 1)),
      tone: bucket.tone,
    }
  })
}

function buildMonthlyCollectionSnapshot(debts: Debt[]): CollectionSnapshot {
  let currentAmount = 0
  let previousAmount = 0
  let currentOriginal = 0
  let previousOriginal = 0
  const currentDebtIds = new Set<string>()
  const previousDebtIds = new Set<string>()

  for (const debt of debts) {
    if (isWithinCurrentMonth(debt.createdAt)) {
      currentOriginal += debt.originalAmount
    } else if (isWithinPreviousMonth(debt.createdAt)) {
      previousOriginal += debt.originalAmount
    }

    for (const payment of debt.payments ?? []) {
      if (isWithinCurrentMonth(payment.paymentDate)) {
        currentAmount += payment.amount
        currentDebtIds.add(debt.id)
      } else if (isWithinPreviousMonth(payment.paymentDate)) {
        previousAmount += payment.amount
        previousDebtIds.add(debt.id)
      }
    }
  }

  return {
    currentAmount: roundMoney(currentAmount),
    previousAmount: roundMoney(previousAmount),
    currentRate:
      currentOriginal > 0 ? Math.round((roundMoney(currentAmount) / roundMoney(currentOriginal)) * 100) : 0,
    previousRate:
      previousOriginal > 0
        ? Math.round((roundMoney(previousAmount) / roundMoney(previousOriginal)) * 100)
        : 0,
    currentCount: currentDebtIds.size,
    previousCount: previousDebtIds.size,
  }
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

function isWithinPreviousMonth(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return false
  }

  const now = new Date()
  const previousMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1
  const previousYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()

  return date.getFullYear() === previousYear && date.getMonth() === previousMonth
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

function DebtorMetricCard({
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
          : 'border-border bg-card'
  const valueClassName =
    tone === 'danger'
      ? 'text-danger-400'
      : tone === 'warning'
        ? 'text-warning-400'
        : tone === 'success'
          ? 'text-emerald-700'
          : 'text-foreground'
  const barClassName =
    tone === 'danger'
      ? 'bg-red-500'
      : tone === 'warning'
        ? 'bg-amber-500'
        : tone === 'success'
          ? 'bg-emerald-500'
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

function CollectionBar({
  label,
  amount,
  rate,
  ratio,
  tone,
  locale,
  currency,
  t,
}: {
  label: string
  amount: number
  rate: number
  ratio: number
  tone: 'default' | 'success'
  locale: string
  currency: string
  t: TranslateFn
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-medium text-foreground">{formatCurrency(amount, locale, currency)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-muted/80">
        <div
          className={cn(
            'h-full rounded-full transition-[width]',
            tone === 'success' ? 'bg-emerald-500' : 'bg-emerald-200',
          )}
          style={{ width: `${ratio}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t('collection.rate', { value: rate })}</p>
    </div>
  )
}

function DebtorStatusBadge({
  status,
  t,
}: {
  status: DebtorStatus
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
