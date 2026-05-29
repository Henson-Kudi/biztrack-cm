'use client'

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import {
  ContactStatementEntryType,
  ContactType,
  DebtDirection,
  DebtStatus,
  PaymentMethod,
  Resource,
  type JwtPayload,
} from '@biztrack/types'
import { Button, Input, NumberInput, Spinner } from '@biztrack/ui'
import { toast } from 'sonner'
import { MetricCard } from '@/components/catalog/MetricCard'
import { SurfaceCard } from '@/components/catalog/SurfaceCard'
import { ContactCreateDialog } from '@/components/contacts/ContactCreateDialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { decodeJwtPayload } from '@/lib/jwt'
import { getPermissionAccessFromState } from '@/lib/plan-access'
import { cn } from '@/lib/utils'
import { getApiErrorMessage } from '@/services/api-response'
import {
  deleteOpeningBalanceLocal,
  getContactDetailLocal,
  upsertOpeningBalanceLocal,
  type LocalContactDebtRecord,
  type LocalContactDetailRecord,
  type LocalContactDirectionSummary,
  type LocalContactStatementRecord,
} from '@/services/contacts.local'
import { DebtLocalError, recordDebtPaymentLocal, writeOffDebtLocal } from '@/services/debts.local'
import { hasDesktopIpc, ipc } from '@/services/ipc.bridge'
import { useAuthStore } from '@/stores/auth.store'
import { usePlanStore } from '@/stores/plan.store'

type DirectionTone = 'customer' | 'supplier'
type PaymentDraftState = {
  selectedDebtId: string
  amount: string
  date: string
  method: PaymentMethod
  notes: string
  momoReference: string
  writeOffReason: string
}

const EMPTY_PAYMENT_DRAFT: PaymentDraftState = {
  selectedDebtId: '',
  amount: '',
  date: '',
  method: PaymentMethod.CASH,
  notes: '',
  momoReference: '',
  writeOffReason: '',
}

export default function ContactDetailPage() {
  return (
    <Suspense fallback={<ContactDetailPageFallback />}>
      <ContactDetailPageContent />
    </Suspense>
  )
}

function ContactDetailPageContent() {
  const searchParams = useSearchParams()
  const locale = useLocale()
  const router = useRouter()
  const t = useTranslations('app.contactDetail')
  const planGateT = useTranslations('app.plan_gate')
  const localeTag = locale.startsWith('fr') ? 'fr-CM' : 'en-GB'
  const businessId = useAuthStore((state) => state.businessId)
  const accessToken = useAuthStore((state) => state.accessToken)
  const businessCurrency = useAuthStore((state) => state.businessCurrency)
  const planState = usePlanStore((state) => state.current)
  const [detail, setDetail] = useState<LocalContactDetailRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [receivableDraft, setReceivableDraft] = useState<PaymentDraftState>({
    ...EMPTY_PAYMENT_DRAFT,
    date: getTodayDate(),
  })
  const [payableDraft, setPayableDraft] = useState<PaymentDraftState>({
    ...EMPTY_PAYMENT_DRAFT,
    date: getTodayDate(),
  })
  const [bothPaymentTone, setBothPaymentTone] = useState<DirectionTone | null>(null)
  const [paymentSubmittingTone, setPaymentSubmittingTone] = useState<DirectionTone | null>(null)
  const [writeOffSubmittingTone, setWriteOffSubmittingTone] = useState<DirectionTone | null>(null)
  const [exportingCsvTone, setExportingCsvTone] = useState<DirectionTone | null>(null)
  const [exportingPdfTone, setExportingPdfTone] = useState<DirectionTone | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [obDraft, setObDraft] = useState<{ direction: DebtDirection; amount: string; asOfDate: string; notes: string } | null>(null)
  const [obSubmitting, setObSubmitting] = useState(false)
  const [obDeleting, setObDeleting] = useState<DebtDirection | null>(null)

  const contactId = searchParams.get('contactId')?.trim() ?? ''

  const actorPayload = accessToken ? decodeJwtPayload<JwtPayload>(accessToken) : null

  useEffect(() => {
    if (!businessId) {
      setDetail(null)
      setLoading(false)
      setError(null)
      return
    }

    if (!contactId) {
      setDetail(null)
      setLoading(false)
      setError(t('not_found'))
      return
    }

    let active = true
    const currentBusinessId = businessId

    async function loadDetail() {
      setLoading(true)
      setError(null)

      try {
        const result = await getContactDetailLocal(currentBusinessId, contactId)

        if (!active) {
          return
        }

        if (!result) {
          setDetail(null)
          setError(t('not_found'))
          return
        }

        setDetail(result)
      } catch (loadError) {
        if (!active) {
          return
        }

        setDetail(null)
        setError(getApiErrorMessage(loadError, t('load_error')))
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadDetail()

    return () => {
      active = false
    }
  }, [businessId, contactId, reloadKey, t])

  const openReceivableDebts = useMemo(
    () => detail?.receivableDebts.filter((debt) => debt.outstandingAmount > 0) ?? [],
    [detail],
  )
  const openPayableDebts = useMemo(
    () => detail?.payableDebts.filter((debt) => debt.outstandingAmount > 0) ?? [],
    [detail],
  )

  const statementReportAccess = useMemo(
    () => (planState ? getPermissionAccessFromState(planState, Resource.REPORTS_MONTHLY) : null),
    [planState],
  )
  const csvExportAccess = useMemo(
    () => (planState ? getPermissionAccessFromState(planState, Resource.REPORTS_EXPORT_CSV) : null),
    [planState],
  )
  const pdfExportAccess = useMemo(
    () => (planState ? getPermissionAccessFromState(planState, Resource.REPORTS_EXPORT_PDF) : null),
    [planState],
  )
  const openingBalanceAccess = useMemo(
    () => (planState ? getPermissionAccessFromState(planState, Resource.OPENING_BALANCES) : null),
    [planState],
  )
  // Contact statements are another report surface. They must obey the same
  // report/export plan matrix as the dedicated reports page so users cannot
  // bypass plan restrictions by exporting from a contact detail screen.
  const canViewStatementReports = statementReportAccess?.allowed ?? true
  const canExportStatementCsv = csvExportAccess?.allowed ?? true
  const canExportStatementPdf = pdfExportAccess?.allowed ?? true
  const canManageOpeningBalances = openingBalanceAccess?.allowed ?? false

  useEffect(() => {
    setReceivableDraft((current) => ({
      ...current,
      selectedDebtId: resolveSelectedDebtId(current.selectedDebtId, openReceivableDebts),
      date: current.date || getTodayDate(),
    }))
  }, [openReceivableDebts])

  useEffect(() => {
    setPayableDraft((current) => ({
      ...current,
      selectedDebtId: resolveSelectedDebtId(current.selectedDebtId, openPayableDebts),
      date: current.date || getTodayDate(),
    }))
  }, [openPayableDebts])

  useEffect(() => {
    setBothPaymentTone(null)
  }, [contactId])

  useEffect(() => {
    if (detail?.type !== ContactType.BOTH || bothPaymentTone !== null) {
      return
    }

    setBothPaymentTone(getDefaultPaymentTone(openReceivableDebts, openPayableDebts))
  }, [bothPaymentTone, detail?.type, openPayableDebts, openReceivableDebts])

  const getDebtPaymentErrorMessage = (errorValue: unknown) => {
    if (errorValue instanceof DebtLocalError) {
      if (errorValue.code === 'DEBT_PAYMENT_LOCKED' || errorValue.code === 'DEBT_ALREADY_SETTLED') {
        return t('forms.payment_locked')
      }

      if (errorValue.code === 'DEBT_PAYMENT_AMOUNT_EXCEEDS_OUTSTANDING') {
        return t('forms.payment_exceeds')
      }

      if (errorValue.code === 'DEBT_PAYMENT_DATE_INVALID' || errorValue.code === 'INVALID_DATE') {
        return t('forms.payment_date_invalid')
      }
    }

    return t('forms.payment_error')
  }

  const getWriteOffErrorMessage = (errorValue: unknown) => {
    if (errorValue instanceof DebtLocalError) {
      if (errorValue.code === 'DEBT_ALREADY_SETTLED' || errorValue.code === 'DEBT_ALREADY_WRITTEN_OFF') {
        return t('forms.write_off_locked')
      }

      if (errorValue.code === 'DEBT_WRITE_OFF_REASON_INVALID') {
        return t('forms.write_off_reason_invalid')
      }
    }

    return t('forms.write_off_error')
  }

  const refreshDetail = async () => {
    if (!businessId || !contactId) {
      return
    }

    const nextDetail = await getContactDetailLocal(businessId, contactId)
    if (nextDetail) {
      setDetail(nextDetail)
    }
  }

  const handleSaveOpeningBalance = async () => {
    if (!businessId || !contactId || !obDraft || !actorPayload?.sub) {
      return
    }

    const amount = Number(obDraft.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t('opening_balance.amount_invalid'))
      return
    }

    if (!obDraft.asOfDate) {
      toast.error(t('opening_balance.date_required'))
      return
    }

    setObSubmitting(true)
    try {
      await upsertOpeningBalanceLocal(businessId, contactId, actorPayload.sub, {
        direction: obDraft.direction,
        amount,
        asOfDate: obDraft.asOfDate,
        notes: obDraft.notes.trim() || undefined,
      })
      setObDraft(null)
      await refreshDetail()
      toast.success(t('opening_balance.saved'))
    } catch {
      toast.error(t('opening_balance.save_error'))
    } finally {
      setObSubmitting(false)
    }
  }

  const handleDeleteOpeningBalance = async (direction: DebtDirection) => {
    if (!businessId || !contactId) return

    setObDeleting(direction)
    try {
      await deleteOpeningBalanceLocal(businessId, contactId, direction)
      await refreshDetail()
      toast.success(t('opening_balance.deleted'))
    } catch {
      toast.error(t('opening_balance.delete_error'))
    } finally {
      setObDeleting(null)
    }
  }

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

  if (error || !detail) {
    return (
      <SurfaceCard title={t('title')}>
        <div className="space-y-4">
          <p className="text-sm text-danger-400">{error || t('not_found')}</p>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={()=> router.back()}
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-border/80 hover:bg-accent hover:text-foreground"
            >
              {t('back_to_contacts')}
            </Button>
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              className="inline-flex items-center rounded-xl border border-border bg-secondary px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
            >
              {t('actions.retry')}
            </button>
          </div>
        </div>
      </SurfaceCard>
    )
  }

  const detailTone = getContactTone(detail.type)
  const pageEyebrow = getContactEyebrow(detail.type, t)
  const currentBalanceAmount =
    detail.type === ContactType.SUPPLIER ? detail.totalPayable : detail.totalReceivable
  const currentBalanceLabel =
    detail.type === ContactType.SUPPLIER ? t('hero.we_owe') : t('hero.balance_owed')
  const paymentTone =
    detail.type === ContactType.BOTH
      ? bothPaymentTone ?? getDefaultPaymentTone(openReceivableDebts, openPayableDebts)
      : detail.type === ContactType.CUSTOMER
        ? 'customer'
        : 'supplier'
  const paymentTitle =
    detail.type === ContactType.BOTH
      ? t('forms.shared.title')
      : paymentTone === 'customer'
        ? t('forms.receivable.title')
        : t('forms.payable.title')
  const paymentDescription =
    detail.type === ContactType.BOTH
      ? t('forms.shared.description')
      : paymentTone === 'customer'
        ? t('forms.receivable.description')
        : t('forms.payable.description')
  const paymentButtonLabel =
    paymentTone === 'customer' ? t('forms.receivable.submit') : t('forms.payable.submit')
  const paymentOpenDebts = paymentTone === 'customer' ? openReceivableDebts : openPayableDebts
  const paymentDraft = paymentTone === 'customer' ? receivableDraft : payableDraft
  const setPaymentDraft = paymentTone === 'customer' ? setReceivableDraft : setPayableDraft
  const selectedPaymentDebt =
    paymentOpenDebts.find((debt) => debt.id === paymentDraft.selectedDebtId) ?? paymentOpenDebts[0] ?? null
  const paymentDirection =
    paymentTone === 'customer' ? DebtDirection.RECEIVABLE : DebtDirection.PAYABLE
  const isRecordingPayment = paymentSubmittingTone === paymentTone
  const isWritingOff = writeOffSubmittingTone === paymentTone

  const handleRecordPayment = async () => {
    if (!businessId || !selectedPaymentDebt) {
      toast.error(t('forms.payment_unavailable'))
      return
    }

    const amount = Number(paymentDraft.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t('forms.payment_amount_invalid'))
      return
    }

    setPaymentSubmittingTone(paymentTone)

    try {
      await recordDebtPaymentLocal(
        businessId,
        selectedPaymentDebt.id,
        paymentDirection,
        {
          amount,
          method: paymentDraft.method,
          paymentDate: paymentDraft.date,
          mobileMoneyReference:
            paymentDraft.method === PaymentMethod.MTN_MOMO ||
            paymentDraft.method === PaymentMethod.ORANGE_MONEY
              ? paymentDraft.momoReference.trim() || undefined
              : undefined,
          notes: paymentDraft.notes.trim() || undefined,
        },
        {
          recordedById: actorPayload?.sub ?? null,
        },
      )

      setPaymentDraft((current) => ({
        ...EMPTY_PAYMENT_DRAFT,
        selectedDebtId: current.selectedDebtId,
        date: getTodayDate(),
      }))
      await refreshDetail()
      toast.success(t('forms.payment_success'))
    } catch (paymentError) {
      toast.error(getDebtPaymentErrorMessage(paymentError))
    } finally {
      setPaymentSubmittingTone(null)
    }
  }

  const handleWriteOff = async () => {
    if (!businessId || !selectedPaymentDebt) {
      toast.error(t('forms.write_off_locked'))
      return
    }

    const reason = paymentDraft.writeOffReason.trim()
    if (reason.length < 10 || reason.length > 1000) {
      toast.error(t('forms.write_off_reason_invalid'))
      return
    }

    setWriteOffSubmittingTone(paymentTone)

    try {
      await writeOffDebtLocal(
        businessId,
        selectedPaymentDebt.id,
        paymentDirection,
        { reason },
        {
          writtenOffById: actorPayload?.sub ?? null,
        },
      )

      setPaymentDraft(() => ({
        ...EMPTY_PAYMENT_DRAFT,
        date: getTodayDate(),
      }))
      await refreshDetail()
      toast.success(t('forms.write_off_success'))
    } catch (writeOffError) {
      toast.error(getWriteOffErrorMessage(writeOffError))
    } finally {
      setWriteOffSubmittingTone(null)
    }
  }

  const handleExportStatementCsv = async (tone: DirectionTone) => {
    if (!canViewStatementReports) {
      toast.error(
        planGateT('locked_feature_description', {
          report: getStatementTitle(detail.type, tone, t),
          section: t('statement.account_title'),
          plan: statementReportAccess?.requiredPlan ?? 'SOLO',
        }),
      )
      return
    }

    if (!canExportStatementCsv) {
      toast.error(
        planGateT('export_locked_description', {
          formats: 'CSV',
          plan: csvExportAccess?.requiredPlan ?? 'SOLO',
        }),
      )
      return
    }

    const statementSnapshot =
      tone === 'customer'
        ? { summary: detail.receivableSummary, entries: detail.receivableStatement }
        : { summary: detail.payableSummary, entries: detail.payableStatement }
    const generatedAt = new Date()
    const title = getStatementTitle(detail.type, tone, t)
    const rows = buildStatementExportRows(statementSnapshot.entries, localeTag, businessCurrency, t)
    const csv = buildContactStatementCsv({
      title,
      description: getStatementCardDescription(tone, t),
      contactName: detail.name,
      contactPhone: detail.phone ?? null,
      contactTypeLabel: getContactTypeLabel(detail.type, t),
      directionLabel: title,
      generatedOn: formatDateTimeLabel(generatedAt, localeTag),
      summary: statementSnapshot.summary,
      rows,
      labels: {
        contact: t('fields.name'),
        phone: t('fields.primary_phone'),
        type: t('fields.type'),
        direction: t('statement.export.direction'),
        generatedOn: t('statement.export.generated_on'),
        totalAmount: t('metrics.total_amount'),
        totalPaid: tone === 'customer' ? t('metrics.collected') : t('metrics.paid'),
        outstanding: t('metrics.outstanding'),
        lastPayment: t('metrics.last_payment'),
        noPayment: t('metrics.no_payment'),
        noPhone: t('fields.not_set'),
        closingBalance: t('statement.closing_balance'),
        table: {
          date: t('statement.table.date'),
          reference: t('statement.table.reference'),
          type: t('statement.table.type'),
          description: t('statement.table.description'),
          debit: getStatementDebitLabel(tone, t),
          credit: getStatementCreditLabel(tone, t),
          balance: t('statement.table.balance'),
        },
      },
    })
    const filename = `${buildStatementFilenameBase(detail.name, tone)}.csv`

    setExportingCsvTone(tone)

    try {
      if (hasDesktopIpc()) {
        const result = await ipc.documents.exportFile({
          content: csv,
          filename,
          filters: [{ name: 'CSV file', extensions: ['csv'] }],
        })

        if (result.success) {
          toast.success(t('statement.export.csv_ready'))
          return
        }

        if (!result.canceled) {
          toast.error(result.error || t('statement.export.csv_error'))
        }

        return
      }

      downloadTextFile(filename, csv, 'text/csv;charset=utf-8')
      toast.success(t('statement.export.csv_ready'))
    } catch (exportError) {
      toast.error(getApiErrorMessage(exportError, t('statement.export.csv_error')))
    } finally {
      setExportingCsvTone(null)
    }
  }

  const handleExportStatementPdf = async (tone: DirectionTone) => {
    if (!canViewStatementReports) {
      toast.error(
        planGateT('locked_feature_description', {
          report: getStatementTitle(detail.type, tone, t),
          section: t('statement.account_title'),
          plan: statementReportAccess?.requiredPlan ?? 'SOLO',
        }),
      )
      return
    }

    if (!canExportStatementPdf) {
      toast.error(
        planGateT('export_locked_description', {
          formats: 'PDF',
          plan: pdfExportAccess?.requiredPlan ?? 'SOLO',
        }),
      )
      return
    }

    if (!hasDesktopIpc()) {
      toast.error(t('statement.export.pdf_desktop_only'))
      return
    }

    const statementSnapshot =
      tone === 'customer'
        ? { summary: detail.receivableSummary, entries: detail.receivableStatement }
        : { summary: detail.payableSummary, entries: detail.payableStatement }
    const generatedAt = new Date()
    const title = getStatementTitle(detail.type, tone, t)
    const rows = buildStatementExportRows(statementSnapshot.entries, localeTag, businessCurrency, t)
    const html = buildContactStatementPdfHtml({
      title,
      description: getStatementCardDescription(tone, t),
      contactName: detail.name,
      contactPhone: detail.phone ?? null,
      contactTypeLabel: getContactTypeLabel(detail.type, t),
      directionLabel: title,
      generatedOn: formatDateTimeLabel(generatedAt, localeTag),
      tone,
      balanceLabel: getStatementBalanceLabel(tone, t),
      summary: statementSnapshot.summary,
      rows,
      localeTag,
      currency: businessCurrency,
      labels: {
        contact: t('fields.name'),
        phone: t('fields.primary_phone'),
        type: t('fields.type'),
        direction: t('statement.export.direction'),
        generatedOn: t('statement.export.generated_on'),
        totalAmount: t('metrics.total_amount'),
        totalPaid: tone === 'customer' ? t('metrics.collected') : t('metrics.paid'),
        outstanding: t('metrics.outstanding'),
        lastPayment: t('metrics.last_payment'),
        noPayment: t('metrics.no_payment'),
        noPhone: t('fields.not_set'),
        empty: t('statement.empty'),
        footer: t('statement.footer', { count: statementSnapshot.entries.length }),
        closingBalance: t('statement.closing_balance'),
        table: {
          date: t('statement.table.date'),
          reference: t('statement.table.reference'),
          type: t('statement.table.type'),
          description: t('statement.table.description'),
          debit: getStatementDebitLabel(tone, t),
          credit: getStatementCreditLabel(tone, t),
          balance: t('statement.table.balance'),
        },
      },
    })

    setExportingPdfTone(tone)

    try {
      const result = await ipc.documents.exportPdf({
        html,
        filename: `${buildStatementFilenameBase(detail.name, tone)}.pdf`,
      })

      if (result.success) {
        toast.success(t('statement.export.pdf_ready'))
        return
      }

      if (!result.canceled) {
        toast.error(result.error || t('statement.export.pdf_error'))
      }
    } catch (exportError) {
      toast.error(getApiErrorMessage(exportError, t('statement.export.pdf_error')))
    } finally {
      setExportingPdfTone(null)
    }
  }

  return (
    <>
      <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={()=> router.back()}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <BackIcon />
          <span>{t('back')}</span>
        </Button>

        <div className="flex flex-wrap gap-2">
          <GhostActionButton onClick={() => setIsEditOpen(true)}>
            {t('actions.edit_contact')}
          </GhostActionButton>
        </div>
      </div>

      <section
        className={cn(
          'overflow-hidden rounded-3xl border bg-card shadow-sm',
          detailTone === 'customer'
            ? 'border-emerald-200/70'
            : detailTone === 'supplier'
              ? 'border-sky-200/70'
              : 'border-amber-200/70',
        )}
      >
        <div
          className={cn(
            'h-1.5 w-full',
            detailTone === 'customer'
              ? 'bg-emerald-500'
              : detailTone === 'supplier'
                ? 'bg-sky-500'
                : 'bg-amber-500',
          )}
        />
        <div className="flex flex-col gap-6 p-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 flex-1 gap-4">
            <div
              className={cn(
                'flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold',
                detail.type === ContactType.CUSTOMER
                  ? 'bg-emerald-100 text-emerald-700'
                  : detail.type === ContactType.SUPPLIER
                    ? 'bg-sky-100 text-sky-700'
                    : 'bg-amber-100 text-amber-800',
              )}
            >
              {getInitials(detail.name)}
            </div>

            <div className="min-w-0 space-y-4">
              <div className="space-y-2">
                <p
                  className={cn(
                    'text-xs font-medium uppercase tracking-[0.18em]',
                    detailTone === 'customer'
                      ? 'text-emerald-700'
                      : detailTone === 'supplier'
                        ? 'text-sky-700'
                        : 'text-amber-700',
                  )}
                >
                  {pageEyebrow}
                </p>
                <div>
                  <h1 className="text-2xl font-semibold text-foreground">{detail.name}</h1>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                    <HeroMetaItem icon={<PhoneIcon />}>
                      {detail.phone || t('fields.not_set')}
                    </HeroMetaItem>
                    <HeroMetaItem icon={<LocationIcon />}>
                      {detail.address || t('fields.not_set')}
                    </HeroMetaItem>
                    <HeroMetaItem icon={<CalendarIcon />}>
                      {t('hero.contact_since', { date: formatDateLabel(detail.createdAt, localeTag) })}
                    </HeroMetaItem>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <ContactBadge type={detail.type} t={t} />
                {detail.type === ContactType.BOTH ? (
                  <>
                    <RoleBadge tone="customer">{t('hero.buys_from_you')}</RoleBadge>
                    <RoleBadge tone="supplier">{t('hero.sells_to_you')}</RoleBadge>
                  </>
                ) : null}
                <RoleBadge tone="neutral">{t('hero.active')}</RoleBadge>
              </div>

              {detail.type === ContactType.BOTH ? (
                <div className="rounded-2xl border border-border bg-muted/30 p-4">
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-medium text-muted-foreground">{t('hero.net_position')}</span>
                    <span className="font-mono font-semibold text-emerald-700">
                      {t('hero.they_owe_you_value', {
                        amount: formatCurrency(detail.totalReceivable, localeTag, businessCurrency),
                      })}
                    </span>
                    <span className="text-muted-foreground">{t('hero.separator')}</span>
                    <span className="font-mono font-semibold text-danger-400">
                      {t('hero.you_owe_them_value', {
                        amount: formatCurrency(detail.totalPayable, localeTag, businessCurrency),
                      })}
                    </span>
                    <span className="text-muted-foreground">{t('hero.separator')}</span>
                    <span
                      className={cn(
                        'font-semibold',
                        detail.netBalance > 0
                          ? 'text-emerald-700'
                          : detail.netBalance < 0
                            ? 'text-danger-400'
                            : 'text-foreground',
                      )}
                    >
                      {getNetPositionLabel(detail.netBalance, localeTag, businessCurrency, t)}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {detail.type !== ContactType.BOTH ? (
            <div className="rounded-2xl border border-border bg-muted/20 px-5 py-4 text-right xl:min-w-[220px]">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {currentBalanceLabel}
              </p>
              <p
                className={cn(
                  'mt-2 text-3xl font-semibold',
                  detail.type === ContactType.SUPPLIER ? 'text-danger-400' : 'text-danger-400',
                )}
              >
                {formatCurrency(currentBalanceAmount, localeTag, businessCurrency)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {detail.type === ContactType.SUPPLIER
                  ? t('hero.payable_outstanding')
                  : t('hero.receivable_outstanding')}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                {detail.lastTransactionDate
                  ? t('hero.last_activity', {
                      date: formatDateLabel(detail.lastTransactionDate, localeTag),
                    })
                  : t('hero.no_recent_activity')}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {detail.type === ContactType.BOTH ? (
        <div className="grid gap-4 md:grid-cols-2">
          <DirectionSummaryPanel
            title={t('panels.receivable_title')}
            badge={t('panels.receivable_badge')}
            summary={detail.receivableSummary}
            tone="customer"
            localeTag={localeTag}
            currency={businessCurrency}
            t={t}
          />
          <DirectionSummaryPanel
            title={t('panels.payable_title')}
            badge={t('panels.payable_badge')}
            summary={detail.payableSummary}
            tone="supplier"
            localeTag={localeTag}
            currency={businessCurrency}
            t={t}
          />
        </div>
      ) : detail.type === ContactType.CUSTOMER ? (
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard
            label={t('metrics.total_credit_given')}
            value={formatCurrency(detail.receivableSummary.totalOriginalAmount, localeTag, businessCurrency)}
            hint={t('metrics.total_credit_given_hint', {
              count: detail.receivableSummary.totalDebtCount,
            })}
          />
          <MetricCard
            label={t('metrics.total_collected')}
            value={formatCurrency(detail.receivableSummary.totalPaidAmount, localeTag, businessCurrency)}
            hint={t('metrics.total_collected_hint', {
              value: detail.receivableSummary.settlementRate,
            })}
            tone="accent"
          />
          <MetricCard
            label={t('metrics.outstanding')}
            value={formatCurrency(detail.receivableSummary.outstandingAmount, localeTag, businessCurrency)}
            hint={t('metrics.outstanding_hint', {
              count: detail.receivableSummary.openDebtCount,
            })}
            tone={detail.receivableSummary.outstandingAmount > 0 ? 'danger' : 'default'}
          />
          <MetricCard
            label={t('metrics.last_payment')}
            value={formatLastPaymentValue(detail.receivableSummary, localeTag, t)}
            hint={formatLastPaymentHint(detail.receivableSummary, localeTag, businessCurrency, t)}
            tone="warning"
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard
            label={t('metrics.total_restocked')}
            value={formatCurrency(detail.payableSummary.totalOriginalAmount, localeTag, businessCurrency)}
            hint={t('metrics.total_restocked_hint', {
              count: detail.payableSummary.totalDebtCount,
            })}
          />
          <MetricCard
            label={t('metrics.total_paid')}
            value={formatCurrency(detail.payableSummary.totalPaidAmount, localeTag, businessCurrency)}
            hint={t('metrics.total_paid_hint', {
              value: detail.payableSummary.settlementRate,
            })}
            tone="accent"
          />
          <MetricCard
            label={t('metrics.outstanding')}
            value={formatCurrency(detail.payableSummary.outstandingAmount, localeTag, businessCurrency)}
            hint={t('metrics.outstanding_hint', {
              count: detail.payableSummary.openDebtCount,
            })}
            tone={detail.payableSummary.outstandingAmount > 0 ? 'danger' : 'default'}
          />
          <MetricCard
            label={t('metrics.last_payment')}
            value={formatLastPaymentValue(detail.payableSummary, localeTag, t)}
            hint={formatLastPaymentHint(detail.payableSummary, localeTag, businessCurrency, t)}
            tone="warning"
          />
        </div>
      )}

      <p className="text-sm text-muted-foreground">{t('messages.local_derived_note')}</p>

      <div
        className={cn(
          'grid gap-4',
          detail.type === ContactType.BOTH ? 'md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]' : 'md:grid-cols-2',
        )}
      >
        <SurfaceCard
          title={getInfoTitle(detail.type, t)}
          description={t('info.description')}
        >
          <div className="space-y-3">
            <InfoField label={t('fields.name')} value={detail.name} />
            <InfoField label={t('fields.primary_phone')} value={detail.phone || t('fields.not_set')} />
            <InfoField
              label={t('fields.alternate_phone')}
              value={detail.phoneAlt || t('fields.not_set')}
            />
            <InfoField label={t('fields.address')} value={detail.address || t('fields.not_set')} />
            <InfoField label={t('fields.type')} value={getContactTypeLabel(detail.type, t)} />
            <InfoField
              label={t('fields.notes')}
              value={detail.notes || t('fields.no_notes')}
              multiline
            />
          </div>
        </SurfaceCard>

        <PaymentCaptureCard
          title={paymentTitle}
          description={paymentDescription}
          buttonLabel={paymentButtonLabel}
          openDebts={paymentOpenDebts}
          draft={paymentDraft}
          setDraft={setPaymentDraft}
          onSubmit={() => void handleRecordPayment()}
          onWriteOff={() => void handleWriteOff()}
          recordingPayment={isRecordingPayment}
          writingOff={isWritingOff}
          localeTag={localeTag}
          tone={paymentTone}
          paymentType={detail.type === ContactType.BOTH ? paymentTone : undefined}
          onPaymentTypeChange={detail.type === ContactType.BOTH ? setBothPaymentTone : undefined}
          currency={businessCurrency}
          t={t}
        />
      </div>

      <OpeningBalanceSection
        detail={detail}
        canManage={canManageOpeningBalances}
        obDraft={obDraft}
        obSubmitting={obSubmitting}
        obDeleting={obDeleting}
        onStartEdit={(direction, existing) =>
          setObDraft({
            direction,
            amount: existing?.openingBalance ? String(existing.openingBalance) : '',
            asOfDate: getTodayDate(),
            notes: '',
          })
        }
        onCancel={() => setObDraft(null)}
        onSave={() => void handleSaveOpeningBalance()}
        onDelete={(direction) => void handleDeleteOpeningBalance(direction)}
        onDraftChange={setObDraft}
        localeTag={localeTag}
        locale={locale}
        planGateT={planGateT}
        currency={businessCurrency}
        t={t}
      />

      {!canViewStatementReports || !canExportStatementCsv || !canExportStatementPdf ? (
        <p className="text-sm text-muted-foreground">
          {planGateT.rich('upgrade_hint', {
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

      {canViewStatementReports ? (
        <>
          {detail.type !== ContactType.SUPPLIER ? (
            <StatementCard
              title={getStatementTitle(detail.type, 'customer', t)}
              description={getStatementCardDescription('customer', t)}
              balanceLabel={getStatementBalanceLabel('customer', t)}
              summary={detail.receivableSummary}
              entries={detail.receivableStatement}
              tone="customer"
              localeTag={localeTag}
              exportingCsv={exportingCsvTone === 'customer'}
              exportingPdf={exportingPdfTone === 'customer'}
              onExportCsv={() => void handleExportStatementCsv('customer')}
              onExportPdf={() => void handleExportStatementPdf('customer')}
              csvLocked={!canExportStatementCsv}
              pdfLocked={!canExportStatementPdf}
              upgradeLabel={planGateT('upgrade_action')}
              currency={businessCurrency}
              t={t}
            />
          ) : null}

          {detail.type !== ContactType.CUSTOMER ? (
            <StatementCard
              title={getStatementTitle(detail.type, 'supplier', t)}
              description={getStatementCardDescription('supplier', t)}
              balanceLabel={getStatementBalanceLabel('supplier', t)}
              summary={detail.payableSummary}
              entries={detail.payableStatement}
              tone="supplier"
              localeTag={localeTag}
              exportingCsv={exportingCsvTone === 'supplier'}
              exportingPdf={exportingPdfTone === 'supplier'}
              onExportCsv={() => void handleExportStatementCsv('supplier')}
              onExportPdf={() => void handleExportStatementPdf('supplier')}
              csvLocked={!canExportStatementCsv}
              pdfLocked={!canExportStatementPdf}
              upgradeLabel={planGateT('upgrade_action')}
              currency={businessCurrency}
              t={t}
            />
          ) : null}
        </>
      ) : null}
      </div>

      <ContactCreateDialog
        businessId={businessId}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSaved={() => setReloadKey((current) => current + 1)}
        contact={detail}
      />
    </>
  )
}

function DirectionSummaryPanel({
  title,
  badge,
  summary,
  tone,
  localeTag,
  currency,
  t,
}: {
  title: string
  badge: string
  summary: LocalContactDirectionSummary
  tone: DirectionTone
  localeTag: string
  currency: string
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>
}) {
  const businessCurrency = currency;

  const panelClassName =
    tone === 'customer'
      ? 'border-emerald-200/70 bg-card dark:border-emerald-900/60'
      : 'border-sky-200/70 bg-card dark:border-sky-900/60'
  const headerClassName =
    tone === 'customer'
      ? 'bg-emerald-50/80 dark:bg-emerald-950/25'
      : 'bg-sky-50/80 dark:bg-sky-950/25'
  const badgeClassName =
    tone === 'customer'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-200'
      : 'bg-sky-100 text-sky-700 dark:bg-sky-950/45 dark:text-sky-200'

  return (
    <section className={cn('overflow-hidden rounded-2xl border shadow-sm', panelClassName)}>
      <div className={cn('flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4', headerClassName)}>
        <div>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{badge}</p>
        </div>
        <span className={cn('rounded-full px-3 py-1 text-xs font-medium', badgeClassName)}>
          {formatCurrency(summary.outstandingAmount, localeTag, businessCurrency)}
        </span>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <MiniMetric
          label={t('metrics.total_amount')}
          value={formatCurrency(summary.totalOriginalAmount, localeTag, businessCurrency)}
          hint={t('metrics.records_count', { count: summary.totalDebtCount })}
        />
        <MiniMetric
          label={tone === 'customer' ? t('metrics.collected') : t('metrics.paid')}
          value={formatCurrency(summary.totalPaidAmount, localeTag, businessCurrency)}
          hint={t('metrics.rate_hint', { value: summary.settlementRate })}
        />
        <MiniMetric
          label={t('metrics.outstanding')}
          value={formatCurrency(summary.outstandingAmount, localeTag, businessCurrency)}
          hint={t('metrics.outstanding_hint', { count: summary.openDebtCount })}
        />
        <MiniMetric
          label={t('metrics.last_payment')}
          value={formatLastPaymentValue(summary, localeTag, t)}
          hint={formatLastPaymentHint(summary, localeTag, businessCurrency, t)}
        />
      </div>
    </section>
  )
}

function MiniMetric({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/80 px-4 py-3 dark:bg-background/60">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
    </div>
  )
}

type ObDraft = { direction: DebtDirection; amount: string; asOfDate: string; notes: string }

function OpeningBalanceSection({
  detail,
  canManage,
  obDraft,
  obSubmitting,
  obDeleting,
  onStartEdit,
  onCancel,
  onSave,
  onDelete,
  onDraftChange,
  localeTag,
  locale,
  planGateT,
  currency,
  t,
}: {
  detail: LocalContactDetailRecord
  canManage: boolean
  obDraft: ObDraft | null
  obSubmitting: boolean
  obDeleting: DebtDirection | null
  onStartEdit: (direction: DebtDirection, existing: LocalContactDirectionSummary) => void
  onCancel: () => void
  onSave: () => void
  onDelete: (direction: DebtDirection) => void
  onDraftChange: (draft: ObDraft | null) => void
  localeTag: string
  locale: string
  currency: string
  planGateT: ReturnType<typeof useTranslations<'app.plan_gate'>>
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>
}) {
  const businessCurrency = currency;

  const directions: { direction: DebtDirection; summary: LocalContactDirectionSummary; show: boolean }[] = [
    {
      direction: DebtDirection.RECEIVABLE,
      summary: detail.receivableSummary,
      show: detail.type !== ContactType.SUPPLIER,
    },
    {
      direction: DebtDirection.PAYABLE,
      summary: detail.payableSummary,
      show: detail.type !== ContactType.CUSTOMER,
    },
  ].filter((d) => d.show)

  return (
    <SurfaceCard
      title={t('opening_balance.title')}
      description={t('opening_balance.description')}
    >
      {!canManage ? (
        <p className="text-sm text-muted-foreground">
          {planGateT.rich('upgrade_hint', {
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
      ) : (
        <div className="space-y-4">
          {directions.map(({ direction, summary }) => {
            const isEditingThis = obDraft?.direction === direction
            const hasOb = summary.openingBalance > 0
            const directionLabel =
              direction === DebtDirection.RECEIVABLE
                ? t('opening_balance.receivable_label')
                : t('opening_balance.payable_label')

            return (
              <div
                key={direction}
                className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{directionLabel}</p>
                    {hasOb ? (
                      <p className="text-base font-semibold text-foreground mt-1">
                        {formatCurrency(summary.openingBalance, localeTag, businessCurrency)}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">
                        {t('opening_balance.not_set')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!isEditingThis ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onStartEdit(direction, summary)}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                        >
                          {hasOb ? t('opening_balance.edit') : t('opening_balance.set')}
                        </button>
                        {hasOb ? (
                          <button
                            type="button"
                            onClick={() => onDelete(direction)}
                            disabled={obDeleting === direction}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-danger-500 transition-colors hover:bg-danger-50 disabled:opacity-50"
                          >
                            {obDeleting === direction
                              ? t('opening_balance.deleting')
                              : t('opening_balance.delete')}
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
                      >
                        {t('opening_balance.cancel')}
                      </button>
                    )}
                  </div>
                </div>

                {isEditingThis && obDraft ? (
                  <div className="space-y-3 pt-1">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t('opening_balance.amount_label')}
                        </span>
                        <NumberInput
                          value={obDraft.amount}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            onDraftChange({ ...obDraft, amount: e.target.value })
                          }
                          placeholder="0"
                          min="0.01"
                          step="1"
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t('opening_balance.date_label')}
                        </span>
                        <Input
                          type="date"
                          value={obDraft.asOfDate}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            onDraftChange({ ...obDraft, asOfDate: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t('opening_balance.notes_label')}
                      </span>
                      <Input
                        value={obDraft.notes}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          onDraftChange({ ...obDraft, notes: e.target.value })
                        }
                        placeholder={t('opening_balance.notes_placeholder')}
                      />
                    </label>
                    <Button
                      onClick={onSave}
                      disabled={obSubmitting}
                      className="w-full sm:w-auto"
                    >
                      {obSubmitting
                        ? t('opening_balance.saving')
                        : t('opening_balance.save')}
                    </Button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </SurfaceCard>
  )
}

function PaymentCaptureCard({
  title,
  description,
  buttonLabel,
  openDebts,
  draft,
  setDraft,
  onSubmit,
  onWriteOff,
  recordingPayment,
  writingOff,
  localeTag,
  tone,
  paymentType,
  onPaymentTypeChange,
  currency,
  t,
}: {
  title: string
  description: string
  buttonLabel: string
  currency: string
  openDebts: LocalContactDebtRecord[]
  draft: PaymentDraftState
  setDraft: Dispatch<SetStateAction<PaymentDraftState>>
  onSubmit: () => void | Promise<void>
  onWriteOff: () => void | Promise<void>
  recordingPayment: boolean
  writingOff: boolean
  localeTag: string
  tone: DirectionTone
  paymentType?: DirectionTone
  onPaymentTypeChange?: (value: DirectionTone) => void
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>
}) {
  const businessCurrency = currency;

  const selectedDebt = openDebts.find((debt) => debt.id === draft.selectedDebtId) ?? openDebts[0] ?? null
  const buttonClassName =
    tone === 'customer'
      ? 'bg-emerald-600 hover:bg-emerald-700'
      : 'bg-sky-600 hover:bg-sky-700'

  return (
    <SurfaceCard title={title} description={description}>
      <div className="space-y-4">
        {paymentType && onPaymentTypeChange ? (
          <FieldLabel label={t('forms.payment_type')}>
            <Select
              value={paymentType}
              onValueChange={(value) => onPaymentTypeChange(value as DirectionTone)}
            >
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">{t('forms.payment_type_customer')}</SelectItem>
                <SelectItem value="supplier">{t('forms.payment_type_supplier')}</SelectItem>
              </SelectContent>
            </Select>
          </FieldLabel>
        ) : null}

        {openDebts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-sm text-muted-foreground">
            {t('forms.no_open_debts')}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {t('forms.select_debt')}
              </label>
              <Select
                value={selectedDebt?.id ?? ''}
                onValueChange={(value) => setDraft((current) => ({ ...current, selectedDebtId: value }))}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {openDebts.map((debt) => (
                    <SelectItem key={debt.id} value={debt.id}>
                      {`${debt.reference} - ${formatCurrency(debt.outstandingAmount, localeTag, businessCurrency)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDebt ? (
                <p className="text-xs text-muted-foreground">
                  {t('forms.debt_context', {
                    date: formatDateLabel(selectedDebt.createdAt, localeTag),
                    status: getDebtStatusLabel(selectedDebt.status, t),
                  })}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FieldLabel label={t('forms.amount')}>
                <NumberInput
                  value={draft.amount}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setDraft((current) => ({ ...current, amount: event.target.value }))
                  }
                  min="0"
                  step="0.01"
                  placeholder="0"
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/40"
                />
              </FieldLabel>
              <FieldLabel label={t('forms.date')}>
                <input
                  type="date"
                  value={draft.date}
                  onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/40"
                />
              </FieldLabel>
            </div>

            <FieldLabel label={t('forms.method')}>
              <Select
                value={draft.method}
                onValueChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    method: value as PaymentMethod,
                    momoReference:
                      value === PaymentMethod.MTN_MOMO || value === PaymentMethod.ORANGE_MONEY
                        ? current.momoReference
                        : '',
                  }))
                }
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PaymentMethod.CASH}>{t('methods.cash')}</SelectItem>
                  <SelectItem value={PaymentMethod.MTN_MOMO}>{t('methods.mtn_momo')}</SelectItem>
                  <SelectItem value={PaymentMethod.ORANGE_MONEY}>{t('methods.orange_money')}</SelectItem>
                  <SelectItem value={PaymentMethod.CARD}>{t('methods.card')}</SelectItem>
                </SelectContent>
              </Select>
            </FieldLabel>

            {(draft.method === PaymentMethod.MTN_MOMO || draft.method === PaymentMethod.ORANGE_MONEY) ? (
              <FieldLabel label={t('forms.momo_reference')}>
                <Input
                  value={draft.momoReference}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setDraft((current) => ({ ...current, momoReference: event.target.value }))
                  }
                  placeholder={t('forms.momo_reference_placeholder')}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/40"
                />
              </FieldLabel>
            ) : null}

            <FieldLabel label={t('forms.notes')}>
              <Input
                value={draft.notes}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setDraft((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder={t('forms.notes_placeholder')}
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/40"
              />
            </FieldLabel>

            <button
              type="button"
              disabled={recordingPayment || writingOff}
              onClick={() => void onSubmit()}
              className={cn(
                'inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                buttonClassName,
              )}
            >
              {recordingPayment ? t('forms.payment_submitting') : buttonLabel}
            </button>

            {selectedDebt ? (
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t('forms.write_off_title')}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t('forms.write_off_description', {
                        amount: formatCurrency(selectedDebt.outstandingAmount, localeTag, businessCurrency),
                      })}
                    </p>
                  </div>
                </div>
                <FieldLabel label={t('forms.write_off_reason')}>
                  <Input
                    value={draft.writeOffReason}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setDraft((current) => ({ ...current, writeOffReason: event.target.value }))
                    }
                    placeholder={t('forms.write_off_reason_placeholder')}
                    maxLength={1000}
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/40"
                  />
                </FieldLabel>
                <button
                  type="button"
                  disabled={recordingPayment || writingOff}
                  onClick={() => void onWriteOff()}
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {writingOff ? t('forms.write_off_submitting') : t('forms.write_off_submit')}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </SurfaceCard>
  )
}

function StatementCard({
  title,
  description,
  balanceLabel,
  summary,
  entries,
  tone,
  localeTag,
  exportingCsv,
  exportingPdf,
  onExportCsv,
  onExportPdf,
  csvLocked,
  pdfLocked,
  upgradeLabel,
  currency,
  t,
}: {
  title: string
  description: string
  balanceLabel: string
  summary: LocalContactDirectionSummary
  entries: LocalContactStatementRecord[]
  tone: DirectionTone
  localeTag: string
  exportingCsv: boolean
  exportingPdf: boolean
  onExportCsv: () => void
  onExportPdf: () => void
  csvLocked: boolean
  pdfLocked: boolean
  upgradeLabel: string
  currency: string
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>
}) {
  const businessCurrency = currency;

  const panelClassName =
    tone === 'customer'
      ? 'border-emerald-200/70 bg-card dark:border-emerald-900/60'
      : 'border-sky-200/70 bg-card dark:border-sky-900/60'
  const headerClassName =
    tone === 'customer'
      ? 'bg-emerald-50/80 dark:bg-emerald-950/25'
      : 'bg-sky-50/80 dark:bg-sky-950/25'
  const balanceClassName =
    tone === 'customer'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-200'
      : 'bg-sky-100 text-sky-700 dark:bg-sky-950/45 dark:text-sky-200'
  const actionClassName =
    tone === 'customer'
      ? 'text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200'
      : 'text-sky-700 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200'

  return (
    <section className={cn('overflow-hidden rounded-2xl border shadow-sm', panelClassName)}>
      <div
        className={cn(
          'flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-5 py-4',
          headerClassName,
        )}
      >
        <div>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <span className={cn('rounded-xl px-3 py-1 text-sm font-semibold', balanceClassName)}>
          {`${balanceLabel} ${formatCurrency(summary.outstandingAmount, localeTag, businessCurrency)}`}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] table-fixed text-sm">
          <colgroup>
            <col className="w-[14%]" />
            <col className="w-[18%]" />
            <col className="w-[14%]" />
            <col className="w-[22%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="bg-muted/50">
            <tr>
              {[
                t('statement.table.date'),
                t('statement.table.reference'),
                t('statement.table.type'),
                t('statement.table.description'),
                tone === 'customer' ? t('statement.table.debit') : t('statement.table.payable'),
                tone === 'customer' ? t('statement.table.credit') : t('statement.table.paid'),
                t('statement.table.balance'),
              ].map((label, index) => (
                <th
                  key={label}
                  className={cn(
                    'px-4 py-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground',
                    index >= 4 ? 'text-right' : 'text-left',
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-sm text-muted-foreground">
                  {t('statement.empty')}
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="border-t border-border/70 first:border-t-0 hover:bg-muted/20">
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDateLabel(entry.date, localeTag)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {entry.reference}
                  </td>
                  <td className="px-4 py-3">
                    <StatementTypeBadge type={entry.type} t={t} />
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {getStatementDescription(entry, t)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-danger-400">
                    {entry.debit > 0 ? formatCurrency(entry.debit, localeTag, businessCurrency) : t('statement.amount_dash')}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-emerald-700">
                    {entry.credit > 0 ? formatCurrency(entry.credit, localeTag, businessCurrency) : t('statement.amount_dash')}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">
                    {formatCurrency(entry.balance, localeTag, businessCurrency)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-border px-5 py-4 text-sm text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <span className="block">{t('statement.footer', { count: entries.length })}</span>
          <span className="block font-medium text-foreground">
            {`${t('statement.closing_balance')} ${formatCurrency(summary.outstandingAmount, localeTag, businessCurrency)}`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onExportCsv}
            disabled={exportingCsv || exportingPdf}
            className={cn(
              'inline-flex items-center gap-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
              csvLocked ? 'text-amber-700 hover:text-amber-800' : actionClassName,
            )}
          >
            <DownloadIcon />
            <span>
              {csvLocked
                ? upgradeLabel
                : exportingCsv
                  ? t('statement.export.exporting_csv')
                  : t('statement.export.download_csv')}
            </span>
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            disabled={exportingCsv || exportingPdf}
            className={cn(
              'inline-flex items-center gap-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
              pdfLocked ? 'text-amber-700 hover:text-amber-800' : actionClassName,
            )}
          >
            <DocumentIcon />
            <span>
              {pdfLocked
                ? upgradeLabel
                : exportingPdf
                  ? t('statement.export.exporting_pdf')
                  : t('statement.export.download_pdf')}
            </span>
          </button>
        </div>
      </div>
    </section>
  )
}

function GhostActionButton({
  children,
  onClick,
}: {
  children: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-accent"
    >
      {children}
    </button>
  )
}

function HeroMetaItem({
  icon,
  children,
}: {
  icon: ReactNode
  children: string
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span>{children}</span>
    </span>
  )
}

function ContactBadge({
  type,
  t,
}: {
  type: ContactType
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>
}) {
  const className =
    type === ContactType.CUSTOMER
      ? 'bg-emerald-100 text-emerald-700'
      : type === ContactType.SUPPLIER
        ? 'bg-sky-100 text-sky-700'
        : 'bg-amber-100 text-amber-800'

  return (
    <span className={cn('rounded-full px-3 py-1 text-xs font-medium', className)}>
      {getContactTypeLabel(type, t)}
    </span>
  )
}

function RoleBadge({
  children,
  tone,
}: {
  children: string
  tone: 'customer' | 'supplier' | 'neutral'
}) {
  const className =
    tone === 'customer'
      ? 'bg-emerald-50 text-emerald-700'
      : tone === 'supplier'
        ? 'bg-sky-50 text-sky-700'
        : 'bg-muted text-muted-foreground'

  return <span className={cn('rounded-full px-3 py-1 text-xs font-medium', className)}>{children}</span>
}

function InfoField({
  label,
  value,
  multiline = false,
}: {
  label: string
  value: string
  multiline?: boolean
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className={cn('mt-1 text-sm font-medium text-foreground', multiline && 'whitespace-pre-wrap')}>
        {value}
      </p>
    </div>
  )
}

function FieldLabel({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  )
}

function StatementTypeBadge({
  type,
  t,
}: {
  type: ContactStatementEntryType
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>
}) {
  const className =
    type === ContactStatementEntryType.DEBT_CREATED
      ? 'bg-amber-100 text-amber-800'
      : type === ContactStatementEntryType.PAYMENT
        ? 'bg-emerald-100 text-emerald-700'
        : type === ContactStatementEntryType.OPENING_BALANCE
          ? 'bg-violet-100 text-violet-700'
          : 'bg-slate-100 text-slate-700'

  return (
    <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium', className)}>
      {getStatementTypeLabel(type, t)}
    </span>
  )
}

function ContactDetailPageFallback() {
  const t = useTranslations('app.contactDetail')

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground shadow-sm">
        <Spinner size="lg" />
        {t('loading')}
      </div>
    </div>
  )
}

function getContactTone(type: ContactType): DirectionTone | 'both' {
  if (type === ContactType.CUSTOMER) {
    return 'customer'
  }

  if (type === ContactType.SUPPLIER) {
    return 'supplier'
  }

  return 'both'
}

function getContactEyebrow(
  type: ContactType,
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>,
) {
  if (type === ContactType.CUSTOMER) {
    return t('hero.customer_path')
  }

  if (type === ContactType.SUPPLIER) {
    return t('hero.supplier_path')
  }

  return t('hero.both_path')
}

function getContactTypeLabel(
  type: ContactType,
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>,
) {
  if (type === ContactType.SUPPLIER) {
    return t('types.supplier')
  }

  if (type === ContactType.BOTH) {
    return t('types.both')
  }

  return t('types.customer')
}

function getInfoTitle(
  type: ContactType,
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>,
) {
  if (type === ContactType.SUPPLIER) {
    return t('info.supplier_title')
  }

  if (type === ContactType.BOTH) {
    return t('info.both_title')
  }

  return t('info.customer_title')
}

function getStatementTitle(
  type: ContactType,
  tone: DirectionTone,
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>,
) {
  if (type === ContactType.BOTH) {
    return tone === 'customer' ? t('statement.receivable_title') : t('statement.payable_title')
  }

  return t('statement.account_title')
}

function getStatementCardDescription(
  tone: DirectionTone,
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>,
) {
  return tone === 'customer' ? t('statement.receivable_description') : t('statement.payable_description')
}

function getStatementBalanceLabel(
  tone: DirectionTone,
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>,
) {
  return tone === 'customer' ? t('statement.they_owe') : t('statement.you_owe')
}

function getStatementDebitLabel(
  tone: DirectionTone,
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>,
) {
  return tone === 'customer' ? t('statement.table.debit') : t('statement.table.payable')
}

function getStatementCreditLabel(
  tone: DirectionTone,
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>,
) {
  return tone === 'customer' ? t('statement.table.credit') : t('statement.table.paid')
}

function getStatementDescription(
  entry: LocalContactStatementRecord,
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>,
) {
  if (entry.type === ContactStatementEntryType.OPENING_BALANCE) {
    return t('statement.descriptions.opening_balance')
  }

  if (entry.type === ContactStatementEntryType.DEBT_CREATED) {
    return entry.direction === DebtDirection.RECEIVABLE
      ? t('statement.descriptions.sale_credit')
      : t('statement.descriptions.restock_credit')
  }

  if (entry.type === ContactStatementEntryType.PAYMENT) {
    if (entry.method) {
      return entry.direction === DebtDirection.RECEIVABLE
        ? t('statement.descriptions.payment_received_method', {
            method: getPaymentMethodLabel(entry.method, t),
          })
        : t('statement.descriptions.payment_made_method', {
            method: getPaymentMethodLabel(entry.method, t),
          })
    }

    return entry.direction === DebtDirection.RECEIVABLE
      ? t('statement.descriptions.payment_received')
      : t('statement.descriptions.payment_made')
  }

  return t('statement.descriptions.write_off')
}

function getStatementTypeLabel(
  type: ContactStatementEntryType,
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>,
) {
  if (type === ContactStatementEntryType.OPENING_BALANCE) {
    return t('statement.types.opening_balance')
  }

  if (type === ContactStatementEntryType.DEBT_CREATED) {
    return t('statement.types.debt')
  }

  if (type === ContactStatementEntryType.PAYMENT) {
    return t('statement.types.payment')
  }

  return t('statement.types.write_off')
}

function getPaymentMethodLabel(
  method: PaymentMethod,
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>,
) {
  if (method === PaymentMethod.MTN_MOMO) {
    return t('methods.mtn_momo')
  }

  if (method === PaymentMethod.ORANGE_MONEY) {
    return t('methods.orange_money')
  }

  if (method === PaymentMethod.CARD) {
    return t('methods.card')
  }

  return t('methods.cash')
}

function getDebtStatusLabel(
  status: LocalContactDebtRecord['status'],
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>,
) {
  if (status === 'PARTIALLY_PAID') {
    return t('statuses.partially_paid')
  }

  if (status === 'SETTLED') {
    return t('statuses.settled')
  }

  if (status === DebtStatus.WRITTEN_OFF) {
    return t('statuses.written_off')
  }

  return t('statuses.outstanding')
}

function getNetPositionLabel(
  netBalance: number,
  localeTag: string,
  currency: string,
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>,
) {
  if (netBalance > 0) {
    return t('hero.net_they_owe_you', {
      amount: formatCurrency(netBalance, localeTag, currency),
    })
  }

  if (netBalance < 0) {
    return t('hero.net_you_owe_them', {
      amount: formatCurrency(Math.abs(netBalance), localeTag, currency),
    })
  }

  return t('hero.net_balanced')
}

function resolveSelectedDebtId(currentId: string, debts: LocalContactDebtRecord[]) {
  if (debts.some((debt) => debt.id === currentId)) {
    return currentId
  }

  return debts[0]?.id ?? ''
}

function getDefaultPaymentTone(
  receivableDebts: LocalContactDebtRecord[],
  payableDebts: LocalContactDebtRecord[],
): DirectionTone {
  if (receivableDebts.length > 0 || payableDebts.length === 0) {
    return 'customer'
  }

  return 'supplier'
}

function formatLastPaymentValue(
  summary: LocalContactDirectionSummary,
  localeTag: string,
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>,
) {
  return summary.lastPaymentDate
    ? formatDateLabel(summary.lastPaymentDate, localeTag)
    : t('metrics.no_payment')
}

function formatLastPaymentHint(
  summary: LocalContactDirectionSummary,
  localeTag: string,
  currency: string,
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>,
) {
  return summary.lastPaymentAmount && summary.lastPaymentAmount > 0
    ? formatCurrency(summary.lastPaymentAmount, localeTag, currency)
    : t('metrics.no_payment_hint')
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

function formatDateTimeLabel(value: Date, localeTag: string) {
  return new Intl.DateTimeFormat(localeTag, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10)
}

function buildStatementFilenameBase(contactName: string, tone: DirectionTone) {
  return `${sanitizeDownloadName(contactName)}-${tone === 'customer' ? 'receivable' : 'payable'}-statement`
}

function sanitizeDownloadName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'contact'
  )
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function buildStatementExportRows(
  entries: LocalContactStatementRecord[],
  localeTag: string,
  currency: string,
  t: ReturnType<typeof useTranslations<'app.contactDetail'>>,
) {
  const businessCurrency = currency;

  return entries.map((entry) => ({
    id: entry.id,
    type: entry.type,
    date: entry.date,
    dateLabel: formatDateLabel(entry.date, localeTag),
    reference: entry.reference,
    typeLabel: getStatementTypeLabel(entry.type, t),
    description: getStatementDescription(entry, t),
    debit: entry.debit,
    credit: entry.credit,
    balance: entry.balance,
    debitLabel: entry.debit > 0 ? formatCurrency(entry.debit, localeTag, businessCurrency) : t('statement.amount_dash'),
    creditLabel: entry.credit > 0 ? formatCurrency(entry.credit, localeTag, businessCurrency) : t('statement.amount_dash'),
    balanceLabel: formatCurrency(entry.balance, localeTag, businessCurrency),
  }))
}

function buildContactStatementCsv(input: {
  title: string
  description: string
  contactName: string
  contactPhone: string | null
  contactTypeLabel: string
  directionLabel: string
  generatedOn: string
  summary: LocalContactDirectionSummary
  rows: Array<{
    date: string
    reference: string
    typeLabel: string
    description: string
    debit: number
    credit: number
    balance: number
  }>
  labels: {
    contact: string
    phone: string
    type: string
    direction: string
    generatedOn: string
    totalAmount: string
    totalPaid: string
    outstanding: string
    lastPayment: string
    noPayment: string
    noPhone: string
    closingBalance: string
    table: {
      date: string
      reference: string
      type: string
      description: string
      debit: string
      credit: string
      balance: string
    }
  }
}) {
  const lastPaymentValue =
    input.summary.lastPaymentDate && input.summary.lastPaymentAmount !== null
      ? `${input.summary.lastPaymentDate} - ${formatCsvAmount(input.summary.lastPaymentAmount)}`
      : input.labels.noPayment

  const csvRows: string[][] = [
    [input.title],
    [input.description],
    [input.labels.contact, input.contactName],
    [input.labels.phone, input.contactPhone || input.labels.noPhone],
    [input.labels.type, input.contactTypeLabel],
    [input.labels.direction, input.directionLabel],
    [input.labels.generatedOn, input.generatedOn],
    [input.labels.totalAmount, formatCsvAmount(input.summary.totalOriginalAmount)],
    [input.labels.totalPaid, formatCsvAmount(input.summary.totalPaidAmount)],
    [input.labels.outstanding, formatCsvAmount(input.summary.outstandingAmount)],
    [input.labels.lastPayment, lastPaymentValue],
    [input.labels.closingBalance, formatCsvAmount(input.summary.outstandingAmount)],
    [],
    [
      input.labels.table.date,
      input.labels.table.reference,
      input.labels.table.type,
      input.labels.table.description,
      input.labels.table.debit,
      input.labels.table.credit,
      input.labels.table.balance,
    ],
    ...input.rows.map((row) => [
      row.date,
      row.reference,
      row.typeLabel,
      row.description,
      formatCsvAmount(row.debit),
      formatCsvAmount(row.credit),
      formatCsvAmount(row.balance),
    ]),
  ]

  return csvRows.map((row) => row.map((value) => escapeCsvCell(value ?? '')).join(',')).join('\r\n')
}

function buildContactStatementPdfHtml(input: {
  title: string
  description: string
  contactName: string
  contactPhone: string | null
  contactTypeLabel: string
  directionLabel: string
  generatedOn: string
  tone: DirectionTone
  balanceLabel: string
  summary: LocalContactDirectionSummary
  rows: Array<{
    type: ContactStatementEntryType
    dateLabel: string
    reference: string
    typeLabel: string
    description: string
    debitLabel: string
    creditLabel: string
    balanceLabel: string
  }>
  localeTag: string
  currency: string
  labels: {
    contact: string
    phone: string
    type: string
    direction: string
    generatedOn: string
    totalAmount: string
    totalPaid: string
    outstanding: string
    lastPayment: string
    noPayment: string
    noPhone: string
    empty: string
    footer: string
    closingBalance: string
    table: {
      date: string
      reference: string
      type: string
      description: string
      debit: string
      credit: string
      balance: string
    }
  }
}) {
  const accent =
    input.tone === 'customer'
      ? {
          strong: '#059669',
          soft: '#ecfdf5',
          softBorder: '#a7f3d0',
          text: '#065f46',
        }
      : {
          strong: '#0284c7',
          soft: '#f0f9ff',
          softBorder: '#bae6fd',
          text: '#0c4a6e',
        }

  const lastPaymentValue =
    input.summary.lastPaymentDate && input.summary.lastPaymentAmount !== null
      ? `${formatDateLabel(input.summary.lastPaymentDate, input.localeTag)} - ${formatCurrency(input.summary.lastPaymentAmount, input.localeTag, input.currency)}`
      : input.labels.noPayment

  const rowsHtml = input.rows
    .map((row) => {
      const badgeClass =
        row.type === ContactStatementEntryType.DEBT_CREATED
          ? 'badge-debt'
          : row.type === ContactStatementEntryType.PAYMENT
            ? 'badge-payment'
            : 'badge-writeoff'

      return `
        <tr>
          <td class="mono muted">${escapeHtml(row.dateLabel)}</td>
          <td class="mono">${escapeHtml(row.reference)}</td>
          <td><span class="badge ${badgeClass}">${escapeHtml(row.typeLabel)}</span></td>
          <td class="muted">${escapeHtml(row.description)}</td>
          <td class="mono right debit">${escapeHtml(row.debitLabel)}</td>
          <td class="mono right credit">${escapeHtml(row.creditLabel)}</td>
          <td class="mono right strong">${escapeHtml(row.balanceLabel)}</td>
        </tr>
      `
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(input.contactName)} - ${escapeHtml(input.title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Arial, sans-serif;
    color: #171717;
    background: #ffffff;
  }
  .sheet { width: 100%; }
  .hero {
    border: 1px solid ${accent.softBorder};
    border-radius: 24px;
    overflow: hidden;
    margin-bottom: 14px;
  }
  .hero-bar {
    height: 6px;
    background: ${accent.strong};
  }
  .hero-body {
    padding: 18px 20px 16px;
    background: linear-gradient(180deg, ${accent.soft} 0%, #ffffff 100%);
  }
  .hero-top {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
  }
  .title {
    font-size: 24px;
    line-height: 1.15;
    font-weight: 700;
    margin: 0;
  }
  .subtitle {
    margin: 6px 0 0;
    color: #525252;
    font-size: 13px;
  }
  .balance-pill {
    border-radius: 999px;
    padding: 10px 14px;
    background: #ffffff;
    border: 1px solid ${accent.softBorder};
    color: ${accent.text};
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
  }
  .meta {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
    margin-top: 16px;
  }
  .meta-card, .summary-card {
    border: 1px solid #e5e5e5;
    border-radius: 16px;
    padding: 12px 14px;
    background: #ffffff;
  }
  .meta-label, .summary-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #737373;
    margin: 0 0 6px;
  }
  .meta-value {
    font-size: 13px;
    font-weight: 600;
    margin: 0;
    word-break: break-word;
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin: 14px 0 16px;
  }
  .summary-value {
    font-size: 17px;
    font-weight: 700;
    margin: 0;
  }
  .summary-hint {
    font-size: 12px;
    color: #525252;
    margin: 6px 0 0;
  }
  .table-shell {
    border: 1px solid #e5e5e5;
    border-radius: 20px;
    overflow: hidden;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 12px;
  }
  thead {
    background: #f5f5f5;
  }
  th, td {
    padding: 12px 14px;
    border-bottom: 1px solid #ebebeb;
    vertical-align: top;
  }
  th {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #737373;
    text-align: left;
  }
  th.right, td.right { text-align: right; }
  tbody tr:last-child td { border-bottom: none; }
  .mono { font-family: "Courier New", monospace; }
  .muted { color: #525252; }
  .strong { color: #171717; font-weight: 700; }
  .debit { color: #b91c1c; }
  .credit { color: #047857; }
  .badge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 5px 9px;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
  }
  .badge-debt {
    background: #fef3c7;
    color: #92400e;
  }
  .badge-payment {
    background: #dcfce7;
    color: #166534;
  }
  .badge-writeoff {
    background: #e2e8f0;
    color: #334155;
  }
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
    color: #525252;
    font-size: 12px;
  }
  .footer strong {
    color: #171717;
  }
</style>
</head>
<body>
  <div class="sheet">
    <section class="hero">
      <div class="hero-bar"></div>
      <div class="hero-body">
        <div class="hero-top">
          <div>
            <h1 class="title">${escapeHtml(input.title)}</h1>
            <p class="subtitle">${escapeHtml(input.description)}</p>
          </div>
          <div class="balance-pill">${escapeHtml(`${input.balanceLabel} ${formatCurrency(input.summary.outstandingAmount, input.localeTag, input.currency)}`)}</div>
        </div>
        <div class="meta">
          <div class="meta-card">
            <p class="meta-label">${escapeHtml(input.labels.contact)}</p>
            <p class="meta-value">${escapeHtml(input.contactName)}</p>
          </div>
          <div class="meta-card">
            <p class="meta-label">${escapeHtml(input.labels.phone)}</p>
            <p class="meta-value">${escapeHtml(input.contactPhone || input.labels.noPhone)}</p>
          </div>
          <div class="meta-card">
            <p class="meta-label">${escapeHtml(input.labels.type)}</p>
            <p class="meta-value">${escapeHtml(input.contactTypeLabel)}</p>
          </div>
          <div class="meta-card">
            <p class="meta-label">${escapeHtml(input.labels.direction)}</p>
            <p class="meta-value">${escapeHtml(input.directionLabel)}</p>
          </div>
          <div class="meta-card">
            <p class="meta-label">${escapeHtml(input.labels.generatedOn)}</p>
            <p class="meta-value">${escapeHtml(input.generatedOn)}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="summary">
      <div class="summary-card">
        <p class="summary-label">${escapeHtml(input.labels.totalAmount)}</p>
        <p class="summary-value">${escapeHtml(formatCurrency(input.summary.totalOriginalAmount, input.localeTag, input.currency))}</p>
      </div>
      <div class="summary-card">
        <p class="summary-label">${escapeHtml(input.labels.totalPaid)}</p>
        <p class="summary-value">${escapeHtml(formatCurrency(input.summary.totalPaidAmount, input.localeTag, input.currency))}</p>
      </div>
      <div class="summary-card">
        <p class="summary-label">${escapeHtml(input.labels.outstanding)}</p>
        <p class="summary-value">${escapeHtml(formatCurrency(input.summary.outstandingAmount, input.localeTag, input.currency))}</p>
      </div>
      <div class="summary-card">
        <p class="summary-label">${escapeHtml(input.labels.lastPayment)}</p>
        <p class="summary-value">${escapeHtml(lastPaymentValue)}</p>
      </div>
    </section>

    <section class="table-shell">
      <table>
        <colgroup>
          <col style="width: 14%" />
          <col style="width: 18%" />
          <col style="width: 14%" />
          <col style="width: 22%" />
          <col style="width: 10%" />
          <col style="width: 10%" />
          <col style="width: 12%" />
        </colgroup>
        <thead>
          <tr>
            <th>${escapeHtml(input.labels.table.date)}</th>
            <th>${escapeHtml(input.labels.table.reference)}</th>
            <th>${escapeHtml(input.labels.table.type)}</th>
            <th>${escapeHtml(input.labels.table.description)}</th>
            <th class="right">${escapeHtml(input.labels.table.debit)}</th>
            <th class="right">${escapeHtml(input.labels.table.credit)}</th>
            <th class="right">${escapeHtml(input.labels.table.balance)}</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="7" class="muted">${escapeHtml(input.labels.empty)}</td></tr>`}
        </tbody>
      </table>
    </section>

    <div class="footer">
      <span>${escapeHtml(input.labels.footer)}</span>
      <strong>${escapeHtml(`${input.labels.closingBalance} ${formatCurrency(input.summary.outstandingAmount, input.localeTag, input.currency)}`)}</strong>
    </div>
  </div>
</body>
</html>`
}

function formatCsvAmount(value: number) {
  if (!Number.isFinite(value)) {
    return ''
  }

  const rounded = Math.round((value + Number.EPSILON) * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}

function escapeCsvCell(value: string) {
  const normalized = String(value)
  if (/[",\r\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`
  }

  return normalized
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function BackIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-left-icon lucide-chevron-left"><path d="m15 18-6-6 6-6"/></svg>
  )
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M8 2.5v7" />
      <path d="m5.5 7.5 2.5 2.5 2.5-2.5" />
      <path d="M3 12.5h10" />
    </svg>
  )
}

function DocumentIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M5 2.5h4l2.5 2.5v7A1.5 1.5 0 0 1 10 13.5H5A1.5 1.5 0 0 1 3.5 12V4A1.5 1.5 0 0 1 5 2.5z" />
      <path d="M9 2.5V5h2.5" />
      <path d="M5.5 8h4.5" />
      <path d="M5.5 10.5h4.5" />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M2 3a1 1 0 0 1 1-1h1.5l1 2.5-1.5 1a6 6 0 0 0 2.5 2.5l1-1.5L9 7.5V9a1 1 0 0 1-1 1A7 7 0 0 1 2 3z" />
    </svg>
  )
}

function LocationIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M6 10s3-2.7 3-5.1A3 3 0 1 0 3 4.9C3 7.3 6 10 6 10z" />
      <circle cx="6" cy="4.5" r="1.1" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="1.5" y="2.5" width="9" height="8" rx="1.2" />
      <path d="M1.5 4.5h9" />
      <path d="M4 1.5v2" />
      <path d="M8 1.5v2" />
    </svg>
  )
}
