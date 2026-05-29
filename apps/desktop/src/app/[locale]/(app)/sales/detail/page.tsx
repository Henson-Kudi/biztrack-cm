'use client'

import {
  type ChangeEvent,
  Suspense,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import {
  BusinessMemberRole,
  DebtDirection,
  DebtSource,
  DebtStatus,
  PaymentMethod,
  SaleStatus,
  type Debt,
  type DebtPayment,
  type JwtPayload,
} from '@biztrack/types'
import { Button, NumberInput, Spinner } from '@biztrack/ui'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { decodeJwtPayload } from '@/lib/jwt'
import {
  buildPaymentReceiptText,
  buildReceiptPdfBlob,
  buildSaleReceiptText,
  downloadReceiptFile,
  isPrintCancelled,
  isShareCancelled,
  sanitizeReceiptFileName,
  THERMAL_RECEIPT_PAPER_WIDTH_MM,
  type PaymentReceiptCopy,
  type SaleReceiptCopy,
} from '@/lib/sales-receipt'
import { hasDesktopIpc, ipc } from '@/services/ipc.bridge'
import { DebtLocalError, getDebtBySourceLocal, recordDebtPaymentLocal } from '@/services/debts.local'
import {
  buildSaleReceiptLocal,
  getSaleLocal,
  SaleLocalError,
  voidSaleLocal,
  type LocalSaleRecord,
} from '@/services/sales.local'
import { useAuthStore } from '@/stores/auth.store'

type PaymentDraftState = {
  amount: string
  date: string
  method: PaymentMethod
  mobileMoneyReference: string
  notes: string
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

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

function formatInteger(value: number, localeTag: string) {
  return new Intl.NumberFormat(localeTag, { maximumFractionDigits: 0 }).format(Math.round(value))
}

function formatCurrency(value: number, localeTag: string, currency: string) {
  return `${currency} ${formatInteger(value, localeTag)}`
}

function canRecordPaymentForDebt(saleStatus: SaleStatus | undefined, debt: Debt | null | undefined) {
  if (!debt || saleStatus === SaleStatus.VOIDED) return false
  return (
    debt.outstandingAmount > 0 &&
    (debt.status === DebtStatus.OUTSTANDING || debt.status === DebtStatus.PARTIALLY_PAID)
  )
}

function getDebtStatusBadgeClassName(status: DebtStatus) {
  if (status === DebtStatus.SETTLED) return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
  if (status === DebtStatus.WRITTEN_OFF) return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
  if (status === DebtStatus.PARTIALLY_PAID) return 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
  return 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
}

export default function SaleDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[360px] items-center justify-center">
          <Spinner size="sm" />
        </div>
      }
    >
      <SaleDetailContent />
    </Suspense>
  )
}

function SaleDetailContent() {
  const t = useTranslations('app.sales')
  const tSell = useTranslations('app.sell')
  const locale = useLocale()
  const localeTag = locale.startsWith('fr') ? 'fr-CM' : 'en-GB'
  const router = useRouter()
  const searchParams = useSearchParams()
  const saleId = searchParams.get('saleId') ?? null

  const businessId = useAuthStore((s) => s.businessId)
  const businessName = useAuthStore((s) => s.businessName)
  const businessCurrency = useAuthStore((s) => s.businessCurrency)
  const accessToken = useAuthStore((s) => s.accessToken)
  const role = useAuthStore((s) => s.role)

  const [sale, setSale] = useState<LocalSaleRecord | null>(null)
  const [debt, setDebt] = useState<Debt | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [paymentDraft, setPaymentDraft] = useState<PaymentDraftState>(() => createPaymentDraft())
  const [recordingPayment, setRecordingPayment] = useState(false)
  const [showPaymentForm, setShowPaymentForm] = useState(false)

  const [voidReasonDraft, setVoidReasonDraft] = useState('')
  const [voidingSale, setVoidingSale] = useState(false)

  const [printingSale, setPrintingSale] = useState(false)
  const [sharingSale, setSharingSale] = useState(false)
  const [printingPaymentId, setPrintingPaymentId] = useState<string | null>(null)
  const [sharingPaymentId, setSharingPaymentId] = useState<string | null>(null)

  const paymentAmountRef = useRef<HTMLInputElement | null>(null)
  const voidReasonRef = useRef<HTMLInputElement | null>(null)

  const actorPayload = accessToken ? decodeJwtPayload<JwtPayload>(accessToken) : null
  const canVoidSales = role === BusinessMemberRole.OWNER || role === BusinessMemberRole.MANAGER
  const businessLabel = businessName?.trim() || tSell('business_fallback')

  useEffect(() => {
    if (!businessId || !saleId) {
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)
    setLoadError(null)

    Promise.all([
      getSaleLocal(businessId, saleId),
      getDebtBySourceLocal(businessId, DebtDirection.RECEIVABLE, DebtSource.SALE, saleId, {
        includePayments: true,
      }),
    ])
      .then(([saleResult, debtResult]) => {
        if (!active) return
        setSale(saleResult)
        setDebt(debtResult)
      })
      .catch(() => {
        if (active) setLoadError(t('load_detail_error'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [businessId, saleId, t])

  useEffect(() => {
    if (!showPaymentForm) return
    const timeoutId = window.setTimeout(() => {
      paymentAmountRef.current?.focus()
      paymentAmountRef.current?.select()
    }, 50)
    return () => window.clearTimeout(timeoutId)
  }, [showPaymentForm])

  const paymentLabel = (method: PaymentMethod) => {
    if (method === PaymentMethod.CASH) return tSell('cash')
    if (method === PaymentMethod.MTN_MOMO) return tSell('mtn_momo')
    if (method === PaymentMethod.ORANGE_MONEY) return tSell('orange_money')
    if (method === PaymentMethod.CARD) return tSell('card')
    if (method === PaymentMethod.SAVINGS) return tSell('savings')
    return t('mixed')
  }

  const getDebtStatusLabel = (status: DebtStatus) => {
    if (status === DebtStatus.PARTIALLY_PAID) return t('detail.credit_status_partially_paid')
    if (status === DebtStatus.SETTLED) return t('detail.credit_status_settled')
    if (status === DebtStatus.WRITTEN_OFF) return t('detail.credit_status_written_off')
    return t('detail.credit_status_outstanding')
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

  const saleReceiptCopy: SaleReceiptCopy = {
    localeTag,
    currency: businessCurrency,
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

  const paymentReceiptCopy: PaymentReceiptCopy = {
    localeTag,
    currency: businessCurrency,
    titleLabel: t('detail.payment_receipt_title'),
    saleRefLabel: tSell('sale_no'),
    clientLabel: t('detail.payment_receipt_client'),
    dateLabel: tSell('receipt.date'),
    paidLabel: t('detail.payment_receipt_paid'),
    methodLabel: t('detail.payment_receipt_method'),
    referenceLabel: tSell('receipt.reference'),
    remainingLabel: t('detail.payment_receipt_remaining'),
    thanksLabel: tSell('receipt.thanks'),
  }

  const buildSaleReceiptFile = async (saleRecord: LocalSaleRecord) => {
    const receipt = await buildSaleReceiptLocal(businessLabel, saleRecord)
    const receiptText = buildSaleReceiptText(receipt, saleReceiptCopy, paymentLabel)
    const pdfBlob = buildReceiptPdfBlob(receiptText)
    const filename = sanitizeReceiptFileName(receipt.saleNumber)
    return { pdfBlob, filename }
  }

  const buildPaymentReceiptFile = (
    payment: DebtPayment,
    saleRecord: LocalSaleRecord,
    remainingAfter: number,
  ) => {
    const text = buildPaymentReceiptText(
      payment,
      { saleNumber: saleRecord.saleNumber, customerName: saleRecord.customerName },
      remainingAfter,
      businessLabel,
      paymentReceiptCopy,
      paymentLabel,
    )
    const pdfBlob = buildReceiptPdfBlob(text)
    const filename = sanitizeReceiptFileName(`payment-${saleRecord.saleNumber}-${payment.id.slice(0, 8)}`)
    return { pdfBlob, filename }
  }

  const handlePrintSale = async () => {
    if (!sale || printingSale || sharingSale) return
    setPrintingSale(true)
    try {
      const { pdfBlob, filename } = await buildSaleReceiptFile(sale)
      if (!hasDesktopIpc()) {
        downloadReceiptFile(new File([pdfBlob], filename, { type: 'application/pdf', lastModified: Date.now() }))
        toast(tSell('receipt_print_unavailable'))
        return
      }
      const buffer = Array.from(new Uint8Array(await pdfBlob.arrayBuffer()))
      await ipc.print.receipt({ buffer, filename, paperWidthMm: THERMAL_RECEIPT_PAPER_WIDTH_MM, silent: true })
      toast.success(tSell('receipt_printed'))
    } catch (error) {
      if (!isPrintCancelled(error)) toast.error(tSell('receipt_print_failed'))
    } finally {
      setPrintingSale(false)
    }
  }

  const handleShareSale = async () => {
    if (!sale || printingSale || sharingSale) return
    setSharingSale(true)
    try {
      const { pdfBlob, filename } = await buildSaleReceiptFile(sale)
      const file = new File([pdfBlob], filename, { type: 'application/pdf', lastModified: Date.now() })
      if (hasDesktopIpc()) {
        const buffer = Array.from(new Uint8Array(await pdfBlob.arrayBuffer()))
        const result = await ipc.share.file({ buffer, filename, mimeType: file.type })
        toast(result.shared ? tSell('receipt_shared') : tSell('receipt_share_saved'))
        return
      }
      try {
        await navigator.share({ files: [file] })
      } catch (shareError) {
        if (isShareCancelled(shareError)) return
        downloadReceiptFile(file)
        toast(tSell('receipt_share_unavailable'))
      }
    } catch (error) {
      if (!isShareCancelled(error)) {
        try {
          const { pdfBlob, filename } = await buildSaleReceiptFile(sale)
          downloadReceiptFile(new File([pdfBlob], filename, { type: 'application/pdf', lastModified: Date.now() }))
          toast(tSell('receipt_share_failed'))
        } catch {
          toast.error(t('load_error'))
        }
      }
    } finally {
      setSharingSale(false)
    }
  }

  const handlePrintPayment = async (payment: DebtPayment, remainingAfter: number) => {
    if (!sale || printingPaymentId || sharingPaymentId) return
    setPrintingPaymentId(payment.id)
    try {
      const { pdfBlob, filename } = buildPaymentReceiptFile(payment, sale, remainingAfter)
      if (!hasDesktopIpc()) {
        downloadReceiptFile(new File([pdfBlob], filename, { type: 'application/pdf', lastModified: Date.now() }))
        toast(tSell('receipt_print_unavailable'))
        return
      }
      const buffer = Array.from(new Uint8Array(await pdfBlob.arrayBuffer()))
      await ipc.print.receipt({ buffer, filename, paperWidthMm: THERMAL_RECEIPT_PAPER_WIDTH_MM, silent: true })
      toast.success(tSell('receipt_printed'))
    } catch (error) {
      if (!isPrintCancelled(error)) toast.error(tSell('receipt_print_failed'))
    } finally {
      setPrintingPaymentId(null)
    }
  }

  const handleSharePayment = async (payment: DebtPayment, remainingAfter: number) => {
    if (!sale || printingPaymentId || sharingPaymentId) return
    setSharingPaymentId(payment.id)
    try {
      const { pdfBlob, filename } = buildPaymentReceiptFile(payment, sale, remainingAfter)
      const file = new File([pdfBlob], filename, { type: 'application/pdf', lastModified: Date.now() })
      if (hasDesktopIpc()) {
        const buffer = Array.from(new Uint8Array(await pdfBlob.arrayBuffer()))
        const result = await ipc.share.file({ buffer, filename, mimeType: file.type })
        toast(result.shared ? tSell('receipt_shared') : tSell('receipt_share_saved'))
        return
      }
      try {
        await navigator.share({ files: [file] })
      } catch (shareError) {
        if (isShareCancelled(shareError)) return
        downloadReceiptFile(file)
        toast(tSell('receipt_share_unavailable'))
      }
    } catch (error) {
      if (!isShareCancelled(error)) toast.error(tSell('receipt_share_failed'))
    } finally {
      setSharingPaymentId(null)
    }
  }

  const handleRecordPayment = async () => {
    if (!businessId || !sale || !debt || !canRecordPaymentForDebt(sale.status, debt)) {
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
        debt.id,
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
        { recordedById: actorPayload?.sub ?? null },
      )
      setDebt(updatedDebt)
      setPaymentDraft(createPaymentDraft())
      setShowPaymentForm(false)
      toast.success(t('detail.record_payment_success'))
    } catch (error) {
      toast.error(getDebtPaymentErrorMessage(error))
    } finally {
      setRecordingPayment(false)
    }
  }

  const handleVoidSale = async () => {
    if (!businessId || !sale || sale.status !== SaleStatus.COMPLETED) return
    if (!canVoidSales) {
      toast.error(t('detail.void_forbidden'))
      return
    }
    const trimmedReason = voidReasonDraft.trim()
    if (trimmedReason.length < 10 || trimmedReason.length > 1000) {
      toast.error(t('detail.void_reason_invalid'))
      voidReasonRef.current?.focus()
      return
    }
    setVoidingSale(true)
    try {
      const updatedSale = await voidSaleLocal(businessId, sale.id, trimmedReason, {
        actorId: actorPayload?.sub ?? null,
        actorName: role ? role.toLowerCase() : tSell('local_user'),
      })
      setSale(updatedSale)
      setVoidReasonDraft('')
      const updatedDebt = await getDebtBySourceLocal(
        businessId,
        DebtDirection.RECEIVABLE,
        DebtSource.SALE,
        updatedSale.id,
        { includePayments: true },
      )
      setDebt(updatedDebt)
      toast.success(t('detail.void_success'))
    } catch (error) {
      if (error instanceof SaleLocalError) {
        if (error.code === 'SALE_ALREADY_VOIDED') {
          toast.error(t('detail.void_already_voided'))
          return
        }
        if (error.code === 'SALE_VOID_REASON_INVALID') {
          toast.error(t('detail.void_reason_invalid'))
          voidReasonRef.current?.focus()
          return
        }
      }
      toast.error(t('detail.void_error'))
    } finally {
      setVoidingSale(false)
    }
  }

  const detailCanRecordPayment = canRecordPaymentForDebt(sale?.status, debt)
  const saleReceiptBusy = printingSale || sharingSale
  const paymentReceiptBusy = Boolean(printingPaymentId || sharingPaymentId)

  // Sort follow-up payments chronologically and compute running balance
  const sortedFollowUpPayments = debt?.payments
    ? [...debt.payments].sort(
        (a, b) =>
          new Date(`${a.paymentDate}T00:00:00`).getTime() -
          new Date(`${b.paymentDate}T00:00:00`).getTime(),
      )
    : []

  const paymentsWithRemaining = (() => {
    let runningPaid = 0
    return sortedFollowUpPayments.map((payment) => {
      runningPaid += payment.amount
      const remaining = Math.max((debt?.originalAmount ?? 0) - runningPaid, 0)
      return { payment, remaining }
    })
  })()

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

  if (loadError || !saleId) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">{loadError ?? t('detail.not_found')}</p>
        <Button
          type="button"
          variant="secondary"
          className="mt-4"
          onClick={() => router.push(`/${locale}/sales`)}
        >
          {t('detail.go_to_sales')}
        </Button>
      </div>
    )
  }

  if (!sale) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">{t('detail.not_found')}</p>
        <Button
          type="button"
          variant="secondary"
          className="mt-4"
          onClick={() => router.push(`/${locale}/sales`)}
        >
          {t('detail.go_to_sales')}
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-0.5 flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground"
        >
          <ChevronLeftIcon />
          {t('detail.back')}
        </button>

        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold text-foreground">{sale.saleNumber}</h1>
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
            {sale.priceDriftWarning ? (
              <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                {t('filters.price_warnings')}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {new Intl.DateTimeFormat(localeTag, {
              dateStyle: 'full',
              timeStyle: 'short',
            }).format(new Date(sale.soldAt))}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={saleReceiptBusy}
            onClick={() => void handlePrintSale()}
          >
            {printingSale ? tSell('printing_receipt') : t('actions.print')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={saleReceiptBusy}
            onClick={() => void handleShareSale()}
          >
            {sharingSale ? tSell('sharing_receipt') : t('actions.share')}
          </Button>
        </div>
      </div>

      {sale.priceDriftWarning ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {t('detail.price_warning')}
        </div>
      ) : null}

      {/* Info grid */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Sale info */}
        <section className="rounded-2xl border border-border bg-muted/20 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('detail.sale_info')}
          </p>
          <div className="mt-4 space-y-3 text-sm">
            <InfoRow label={t('detail.date_time')}>
              {new Intl.DateTimeFormat(localeTag, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(sale.soldAt))}
            </InfoRow>
            <InfoRow label={tSell('cashier')}>
              {sale.cashierName || tSell('local_user')}
            </InfoRow>
            <InfoRow label={t('table.customer')}>
              {sale.customerName || t('table.no_customer')}
            </InfoRow>
            {sale.customerPhone ? (
              <InfoRow label={tSell('receipt.phone')}>{sale.customerPhone}</InfoRow>
            ) : null}
            {sale.receiptNumber ? (
              <InfoRow label={t('detail.receipt_number_label')}>{sale.receiptNumber}</InfoRow>
            ) : null}
            <InfoRow label={t('table.sync')}>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    sale.syncedAt ? 'bg-emerald-500' : 'bg-amber-500',
                  )}
                />
                {sale.syncedAt
                  ? t('detail.synced_at', {
                      time: new Intl.DateTimeFormat(localeTag, {
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(sale.syncedAt)),
                    })
                  : t('sync.pending')}
              </span>
            </InfoRow>
            {sale.notes ? (
              <InfoRow label="Notes">
                <span className="text-foreground">{sale.notes}</span>
              </InfoRow>
            ) : null}
          </div>
        </section>

        {/* Financial summary */}
        <section className="rounded-2xl border border-border bg-muted/20 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('detail.financial_summary')}
          </p>
          <div className="mt-4 space-y-3 text-sm">
            {sale.subtotalAmount !== sale.totalAmount ? (
              <InfoRow label={t('detail.sale_subtotal')}>
                {formatCurrency(sale.subtotalAmount, localeTag, businessCurrency)}
              </InfoRow>
            ) : null}
            {sale.discountAmount > 0 ? (
              <InfoRow label={t('detail.sale_discount')}>
                <span className="text-red-600">
                  -{formatCurrency(sale.discountAmount, localeTag, businessCurrency)}
                </span>
              </InfoRow>
            ) : null}
            {sale.chargesAmount > 0 ? (
              <InfoRow label={t('detail.sale_charges')}>
                +{formatCurrency(sale.chargesAmount, localeTag, businessCurrency)}
              </InfoRow>
            ) : null}
            <div className="h-px bg-border" />
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-foreground">{t('detail.total')}</span>
              <span className="font-semibold text-foreground">
                {formatCurrency(sale.totalAmount, localeTag, businessCurrency)}
              </span>
            </div>
            {sale.amountPaid > 0 && sale.amountPaid < sale.totalAmount ? (
              <InfoRow label={t('detail.sale_paid')}>
                {formatCurrency(sale.amountPaid, localeTag, businessCurrency)}
              </InfoRow>
            ) : null}
            {sale.creditAmount > 0 ? (
              <InfoRow label={t('detail.credit_issued')}>
                <span className="font-medium text-sky-700">
                  {formatCurrency(sale.creditAmount, localeTag, businessCurrency)}
                </span>
              </InfoRow>
            ) : null}
            {sale.changeGiven > 0 ? (
              <InfoRow label={t('detail.sale_change')}>
                {formatCurrency(sale.changeGiven, localeTag, businessCurrency)}
              </InfoRow>
            ) : null}
          </div>
        </section>
      </div>

      {/* Items table */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('detail.items')}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('detail.product')}
                </th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('detail.qty')}
                </th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('detail.unit_price')}
                </th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('detail.total')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item) => (
                <tr key={item.id} className="border-b border-border/60">
                  <td className="px-5 py-3 text-foreground">{item.productName}</td>
                  <td className="px-5 py-3 text-right text-foreground">{item.quantity}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">
                    {formatInteger(item.unitPrice, localeTag)}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-foreground">
                    {formatCurrency(item.lineTotal, localeTag, businessCurrency)}
                  </td>
                </tr>
              ))}
              {sale.discountAmount > 0 ? (
                <tr className="border-b border-border/60">
                  <td colSpan={3} className="px-5 py-3 text-muted-foreground">
                    {tSell('discount')}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-red-600">
                    -{formatCurrency(sale.discountAmount, localeTag, businessCurrency)}
                  </td>
                </tr>
              ) : null}
              {sale.chargesAmount > 0 ? (
                <tr className="border-b border-border/60">
                  <td colSpan={3} className="px-5 py-3 text-muted-foreground">
                    {tSell('charges')}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-foreground">
                    +{formatCurrency(sale.chargesAmount, localeTag, businessCurrency)}
                  </td>
                </tr>
              ) : null}
              <tr>
                <td colSpan={3} className="px-5 py-3 text-base font-semibold text-foreground">
                  {tSell('total')}
                </td>
                <td className="px-5 py-3 text-right text-base font-semibold text-foreground">
                  {formatCurrency(sale.totalAmount, localeTag, businessCurrency)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {sale.status === SaleStatus.VOIDED && sale.voidReason ? (
          <div className="border-t border-border bg-red-50 px-5 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            <span className="font-medium">{t('status.voided')}:</span> {sale.voidReason}
          </div>
        ) : null}
      </section>

      {/* Sale payments (made at time of sale) */}
      {(sale.payments.length > 0 || sale.creditAmount > 0) ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('detail.initial_payments')}
          </p>
          <div className="space-y-2">
            {sale.payments.map((payment) => (
              <div
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-medium text-foreground">
                    {formatCurrency(payment.amount, localeTag, businessCurrency)}
                  </span>
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {paymentLabel(payment.method)}
                  </span>
                  {payment.mobileMoneyReference ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      {payment.mobileMoneyReference}
                    </span>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={saleReceiptBusy}
                    onClick={() => void handlePrintSale()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <PrintIcon />
                    {printingSale ? tSell('printing_receipt') : t('detail.print_payment_receipt')}
                  </button>
                  <button
                    type="button"
                    disabled={saleReceiptBusy}
                    onClick={() => void handleShareSale()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ShareIcon />
                    {sharingSale ? tSell('sharing_receipt') : t('detail.share_payment_receipt')}
                  </button>
                </div>
              </div>
            ))}
            {sale.creditAmount > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50/50 px-4 py-3 dark:border-sky-800 dark:bg-sky-950/30">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-medium text-sky-700 dark:text-sky-300">
                    {formatCurrency(sale.creditAmount, localeTag, businessCurrency)}
                  </span>
                  <span className="rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 text-xs text-sky-700 dark:border-sky-800 dark:bg-sky-900 dark:text-sky-300">
                    {t('detail.credit_label')}
                  </span>
                </div>
              </div>
            ) : null}
            {sale.changeGiven > 0 ? (
              <div className="flex items-center justify-between gap-3 px-1 text-sm">
                <span className="text-muted-foreground">{tSell('change_due')}</span>
                <span className="font-medium text-foreground">
                  {formatCurrency(sale.changeGiven, localeTag, businessCurrency)}
                </span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Credit section */}
      {debt ? (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          {/* Credit summary bar */}
          <div className="border-b border-border bg-sky-50/50 px-5 py-4 dark:bg-sky-950/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">
                {t('detail.credit_status')}
              </p>
              <span
                className={cn(
                  'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                  getDebtStatusBadgeClassName(debt.status),
                )}
              >
                {getDebtStatusLabel(debt.status)}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t('detail.credit_issued')}</p>
                <p className="mt-1 font-semibold text-foreground">
                  {formatCurrency(debt.originalAmount, localeTag, businessCurrency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('detail.credit_collected')}</p>
                <p className="mt-1 font-semibold text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(debt.paidAmount, localeTag, businessCurrency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('detail.credit_outstanding')}</p>
                <p
                  className={cn(
                    'mt-1 font-semibold',
                    debt.outstandingAmount > 0
                      ? 'text-sky-700 dark:text-sky-400'
                      : 'text-emerald-700 dark:text-emerald-400',
                  )}
                >
                  {formatCurrency(debt.outstandingAmount, localeTag, businessCurrency)}
                </p>
              </div>
            </div>
          </div>

          {/* Follow-up payments */}
          <div className="p-5">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t('detail.follow_up_payments')}
            </p>

            {paymentsWithRemaining.length > 0 ? (
              <div className="space-y-3">
                {paymentsWithRemaining.map(({ payment, remaining }) => {
                  const isPrinting = printingPaymentId === payment.id
                  const isSharing = sharingPaymentId === payment.id
                  const isBusy = isPrinting || isSharing || paymentReceiptBusy

                  return (
                    <div
                      key={payment.id}
                      className="rounded-xl border border-border bg-background px-4 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <span className="font-medium text-foreground">
                              {formatCurrency(payment.amount, localeTag, businessCurrency)}
                            </span>
                            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {paymentLabel(payment.method)}
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              {new Intl.DateTimeFormat(localeTag, { dateStyle: 'medium' }).format(
                                new Date(`${payment.paymentDate}T00:00:00`),
                              )}
                            </span>
                            {payment.mobileMoneyReference ? (
                              <span className="font-mono">{payment.mobileMoneyReference}</span>
                            ) : null}
                            <span>
                              {t('detail.credit_outstanding')}:{' '}
                              <span className="font-medium text-foreground">
                                {formatCurrency(remaining, localeTag, businessCurrency)}
                              </span>
                            </span>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handlePrintPayment(payment, remaining)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <PrintIcon />
                            {isPrinting ? tSell('printing_receipt') : t('detail.print_payment_receipt')}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleSharePayment(payment, remaining)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <ShareIcon />
                            {isSharing ? tSell('sharing_receipt') : t('detail.share_payment_receipt')}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('detail.no_follow_up_payments')}</p>
            )}

            {/* Record payment form */}
            {detailCanRecordPayment ? (
              <div className="mt-5">
                {showPaymentForm ? (
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">
                        {t('detail.record_payment_title')}
                      </p>
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300">
                        {formatCurrency(debt.outstandingAmount, localeTag, businessCurrency)}
                      </span>
                    </div>
                    <p className="mb-4 text-sm text-muted-foreground">
                      {t('detail.record_payment_description', {
                        amount: formatCurrency(debt.outstandingAmount, localeTag, businessCurrency),
                      })}
                    </p>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-2 text-sm">
                        <span className="font-medium text-foreground">{t('detail.payment_amount')}</span>
                        <NumberInput
                          ref={paymentAmountRef}
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
                        <div className="hidden sm:block" />
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
                        variant="ghost"
                        disabled={recordingPayment}
                        onClick={() => {
                          setShowPaymentForm(false)
                          setPaymentDraft(createPaymentDraft())
                        }}
                      >
                        {t('actions.close')}
                      </Button>
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
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowPaymentForm(true)}
                  >
                    {t('actions.record_payment')}
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Void section */}
      {sale.status === SaleStatus.COMPLETED && canVoidSales ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 dark:border-red-900 dark:bg-red-950">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">
            {t('detail.void_section_title')}
          </p>
          <input
            ref={voidReasonRef}
            value={voidReasonDraft}
            onChange={(event) => setVoidReasonDraft(event.target.value)}
            placeholder={t('detail.void_reason_placeholder')}
            maxLength={1000}
            className="mt-3 h-10 w-full rounded-xl border border-red-200 bg-background px-3 text-sm text-foreground shadow-sm placeholder:text-muted-foreground outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-200 dark:border-red-800"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-red-600 dark:text-red-400">{t('detail.void_helper')}</p>
            <Button
              type="button"
              variant="ghost"
              disabled={
                voidReasonDraft.trim().length < 10 ||
                voidReasonDraft.trim().length > 1000 ||
                voidingSale
              }
              onClick={() => void handleVoidSale()}
              className="border border-red-200 text-red-700 dark:border-red-800 dark:text-red-400"
            >
              {voidingSale ? t('detail.void_submitting') : t('detail.void_submit')}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{children}</span>
    </div>
  )
}

function ChevronLeftIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 12L6 8l4-4" />
    </svg>
  )
}

function PrintIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6V2h8v4" />
      <path d="M4 11H2V7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v4h-2" />
      <rect x="4" y="10" width="8" height="5" rx="1" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="3" r="1.5" />
      <circle cx="4" cy="8" r="1.5" />
      <circle cx="12" cy="13" r="1.5" />
      <path d="M5.5 7.1l5 -3.2M5.5 8.9l5 3.2" />
    </svg>
  )
}
