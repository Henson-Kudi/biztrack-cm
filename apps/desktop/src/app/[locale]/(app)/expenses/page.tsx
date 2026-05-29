'use client'

import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Button, Spinner } from '@biztrack/ui'
import { PaymentMethod, Resource, type Expense, type ExpenseCategory } from '@biztrack/types'
import { toast } from 'sonner'
import { MetricCard } from '@/components/catalog/MetricCard'
import { SurfaceCard } from '@/components/catalog/SurfaceCard'
import { ResourceActionMenu } from '@/components/products/ResourceActionMenu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { getPermissionAccessFromState } from '@/lib/plan-access'
import { cn } from '@/lib/utils'
import {
  createExpenseLocal,
  deleteExpenseLocal,
  ExpenseLocalError,
  getExpenseLocal,
  listExpenseCategoriesLocal,
  listExpensesLocal,
  updateExpenseLocal,
} from '@/services/expenses.local'
import { useAuthStore } from '@/stores/auth.store'
import { usePlanStore } from '@/stores/plan.store'

type PeriodKey = 'month' | 'quarter' | 'year'
type RecurringFilterValue = '' | 'true' | 'false'
type DialogMode = 'add' | 'edit' | 'view' | 'delete' | null

type ExpenseFormState = {
  description: string
  amount: string
  expenseDate: string
  categoryId: string
  vendor: string
  notes: string
  isRecurring: boolean
  paymentMethod: PaymentMethod
}

type MetricTrend = {
  value: string
  tone: 'danger' | 'success' | 'neutral'
}

type CategoryTotal = {
  categoryId: string
  name: string
  color: string
  amount: number
  count: number
}

const MAX_EXPENSES_LIMIT = 1000
const PAGE_SIZE = 8
const inputClassName =
  'block h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring'
const textareaClassName =
  'block min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring'

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getPeriodRange(period: PeriodKey) {
  const today = startOfLocalDay(new Date())

  if (period === 'year') {
    return {
      start: new Date(today.getFullYear(), 0, 1),
      end: today,
    }
  }

  if (period === 'quarter') {
    const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3
    return {
      start: new Date(today.getFullYear(), quarterStartMonth, 1),
      end: today,
    }
  }

  return {
    start: new Date(today.getFullYear(), today.getMonth(), 1),
    end: today,
  }
}

function getPreviousPeriodRange(period: PeriodKey) {
  const current = getPeriodRange(period)
  const dayCount =
    Math.floor((current.end.getTime() - current.start.getTime()) / (24 * 60 * 60 * 1000)) + 1
  const end = addDays(current.start, -1)
  const start = addDays(end, -(dayCount - 1))

  return { start, end }
}

function formatCurrency(value: number, localeTag: string, currency = 'XAF') {
  return `${currency} ${Math.round(value).toLocaleString(localeTag)}`
}

function formatDateLabel(value: string, localeTag: string) {
  return new Intl.DateTimeFormat(localeTag, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

function formatMonthSubtitle(period: PeriodKey, localeTag: string, businessLabel: string) {
  const now = new Date()

  if (period === 'year') {
    return `${now.getFullYear()} - ${businessLabel}`
  }

  if (period === 'quarter') {
    const quarter = Math.floor(now.getMonth() / 3) + 1
    return `Q${quarter} ${now.getFullYear()} - ${businessLabel}`
  }

  const label = new Intl.DateTimeFormat(localeTag, {
    month: 'long',
    year: 'numeric',
  }).format(now)

  return `${label} - ${businessLabel}`
}

function createDefaultExpenseForm(categoryId = ''): ExpenseFormState {
  return {
    description: '',
    amount: '',
    expenseDate: formatDateKey(new Date()),
    categoryId,
    vendor: '',
    notes: '',
    isRecurring: false,
    paymentMethod: PaymentMethod.CASH,
  }
}

function buildExpenseFormFromExpense(expense: Expense): ExpenseFormState {
  return {
    description: expense.description,
    amount: String(expense.amount),
    expenseDate: expense.expenseDate,
    categoryId: expense.categoryId,
    vendor: expense.vendor ?? '',
    notes: expense.notes ?? '',
    isRecurring: expense.isRecurring,
    paymentMethod: (expense.paymentMethod as PaymentMethod | null) ?? PaymentMethod.CASH,
  }
}

function getExpenseCategoryName(expense: Expense, fallback: string) {
  return expense.category?.name ?? fallback
}

function getExpenseCategoryColor(expense: Expense) {
  return expense.category?.color ?? '#888780'
}

function withAlpha(color: string, alpha: string) {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return `${color}${alpha}`
  }

  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [r, g, b] = color.slice(1).split('')
    return `#${r}${r}${g}${g}${b}${b}${alpha}`
  }

  return color
}

function calculateTrend(currentTotal: number, previousTotal: number): MetricTrend | null {
  if (previousTotal <= 0) {
    return null
  }

  const delta = ((currentTotal - previousTotal) / previousTotal) * 100
  const rounded = Math.round(Math.abs(delta))

  if (rounded === 0) {
    return { value: '0%', tone: 'neutral' }
  }

  return {
    value: `${delta > 0 ? '+' : '-'}${rounded}%`,
    tone: delta > 0 ? 'danger' : 'success',
  }
}

function getExpenseErrorMessage(error: unknown, t: ReturnType<typeof useTranslations<'app.expenses'>>) {
  if (error instanceof ExpenseLocalError) {
    switch (error.code) {
      case 'BUSINESS_REQUIRED':
        return t('business_required')
      case 'EXPENSE_CATEGORY_NOT_FOUND':
        return t('messages.category_missing')
      case 'EXPENSE_DESCRIPTION_INVALID':
        return t('messages.description_invalid')
      case 'EXPENSE_AMOUNT_INVALID':
        return t('messages.amount_invalid')
      case 'EXPENSE_DATE_INVALID':
        return t('messages.date_invalid')
      case 'EXPENSE_DATE_FUTURE':
        return t('messages.date_future')
      case 'EXPENSE_VENDOR_TOO_LONG':
        return t('messages.vendor_too_long')
      case 'EXPENSE_NOTES_TOO_LONG':
        return t('messages.notes_too_long')
      case 'EXPENSE_NOT_FOUND':
        return t('messages.expense_missing')
      default:
        return t('messages.action_failed')
    }
  }

  return error instanceof Error ? error.message : t('messages.action_failed')
}

function isExpenseWithinRange(expense: Expense, startKey: string, endKey: string) {
  return expense.expenseDate >= startKey && expense.expenseDate <= endKey
}

function buildCategoryTotals(
  expenses: Expense[],
  categories: ExpenseCategory[],
  uncategorizedLabel: string,
) {
  const totals = new Map<string, CategoryTotal>()

  for (const category of categories) {
    totals.set(category.id, {
      categoryId: category.id,
      name: category.name,
      color: category.color,
      amount: 0,
      count: 0,
    })
  }

  for (const expense of expenses) {
    const categoryId = expense.categoryId || 'uncategorized'
    const existing =
      totals.get(categoryId) ??
      {
        categoryId,
        name: expense.category?.name ?? uncategorizedLabel,
        color: expense.category?.color ?? '#888780',
        amount: 0,
        count: 0,
      }

    existing.amount += expense.amount
    existing.count += 1
    totals.set(categoryId, existing)
  }

  return Array.from(totals.values())
    .filter((item) => item.amount > 0)
    .sort((left, right) => right.amount - left.amount)
}

function ExpenseTypeBadge({
  recurring,
  recurringLabel,
  oneOffLabel,
}: {
  recurring: boolean
  recurringLabel: string
  oneOffLabel: string
}) {
  if (recurring) {
    return (
      <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
        {recurringLabel}
      </span>
    )
  }

  return <span className="text-xs text-muted-foreground">{oneOffLabel}</span>
}

function CategoryPill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        backgroundColor: withAlpha(color, '1A'),
        color,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 2.5v11M2.5 8h11" strokeLinecap="round" />
    </svg>
  )
}

function ExpensesPageContent() {
  const t = useTranslations('app.expenses')
  const planGateT = useTranslations('app.plan_gate')
  const locale = useLocale()
  const localeTag = locale.startsWith('fr') ? 'fr-CM' : 'en-GB'
  const businessId = useAuthStore((state) => state.businessId)
  const businessName = useAuthStore((state) => state.businessName)
  const businessCurrency = useAuthStore((state) => state.businessCurrency)
  const planState = usePlanStore((state) => state.current)
  const canUseCategories = useMemo(
    () => (planState ? getPermissionAccessFromState(planState, Resource.EXPENSES_CATEGORIES).allowed : true),
    [planState],
  )
  const [period, setPeriod] = useState<PeriodKey>('month')
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [recurringFilter, setRecurringFilter] = useState<RecurringFilterValue>('')
  const [page, setPage] = useState(1)
  const [dialogMode, setDialogMode] = useState<DialogMode>(null)
  const [activeExpenseId, setActiveExpenseId] = useState<string | null>(null)
  const [formState, setFormState] = useState<ExpenseFormState>(createDefaultExpenseForm())
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const deferredSearch = useDeferredValue(search)

  const businessLabel = businessName?.trim() || t('business_fallback')

  useEffect(() => {
    setPage(1)
  }, [categoryFilter, deferredSearch, period, recurringFilter])

  useEffect(() => {
    if (!businessId) {
      setExpenses([])
      setCategories([])
      setLoading(false)
      setError(null)
      return
    }

    let active = true
    const currentBusinessId = businessId

    async function loadDashboard() {
      setLoading(true)
      setError(null)

      try {
        const [categoriesResult, expensesResult] = await Promise.all([
          listExpenseCategoriesLocal(currentBusinessId),
          listExpensesLocal(currentBusinessId, {
            page: 1,
            limit: MAX_EXPENSES_LIMIT,
            sortBy: 'expenseDate',
            sortOrder: 'DESC',
          }),
        ])

        if (!active) {
          return
        }

        setCategories(categoriesResult)
        setExpenses(expensesResult.data)
      } catch (loadError) {
        if (!active) {
          return
        }

        setError(getExpenseErrorMessage(loadError, t))
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
  }, [businessId, refreshKey, t])

  const activeExpense =
    activeExpenseId === null ? null : expenses.find((expense) => expense.id === activeExpenseId) ?? null
  const currentRange = getPeriodRange(period)
  const previousRange = getPreviousPeriodRange(period)
  const startKey = formatDateKey(currentRange.start)
  const endKey = formatDateKey(currentRange.end)
  const previousStartKey = formatDateKey(previousRange.start)
  const previousEndKey = formatDateKey(previousRange.end)
  const periodExpenses = expenses.filter((expense) => isExpenseWithinRange(expense, startKey, endKey))
  const previousPeriodExpenses = expenses.filter((expense) =>
    isExpenseWithinRange(expense, previousStartKey, previousEndKey),
  )
  const filteredExpenses = periodExpenses.filter((expense) => {
    if (categoryFilter && expense.categoryId !== categoryFilter) {
      return false
    }

    if (recurringFilter === 'true' && !expense.isRecurring) {
      return false
    }

    if (recurringFilter === 'false' && expense.isRecurring) {
      return false
    }

    if (!deferredSearch.trim()) {
      return true
    }

    const haystack = [
      expense.description,
      expense.vendor ?? '',
      expense.category?.name ?? '',
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(deferredSearch.trim().toLowerCase())
  })
  const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const visibleExpenses = filteredExpenses.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )
  const visiblePageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1)

  useEffect(() => {
    if (page !== currentPage) {
      setPage(currentPage)
    }
  }, [currentPage, page])

  useEffect(() => {
    if (dialogMode !== 'add' && dialogMode !== 'edit') {
      return
    }

    if (formState.categoryId || categories.length === 0) {
      return
    }

    const firstCategory = categories[0]
    if (!firstCategory) {
      return
    }

    setFormState((current) => ({
      ...current,
      categoryId: firstCategory.id,
    }))
  }, [categories, dialogMode, formState.categoryId])

  const totalAmount = periodExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  const recurringAmount = periodExpenses.reduce(
    (sum, expense) => sum + (expense.isRecurring ? expense.amount : 0),
    0,
  )
  const oneOffAmount = totalAmount - recurringAmount
  const currentCategoryTotals = buildCategoryTotals(
    periodExpenses,
    categories,
    t('uncategorized'),
  )
  const previousTotalAmount = previousPeriodExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  const trend = calculateTrend(totalAmount, previousTotalAmount)
  const chartCategories = currentCategoryTotals.slice(0, 6)
  const topCategoryAmount = chartCategories[0]?.amount ?? 0
  const recurringShare = totalAmount > 0 ? Math.round((recurringAmount / totalAmount) * 100) : 0
  const oneOffShare = totalAmount > 0 ? Math.round((oneOffAmount / totalAmount) * 100) : 0
  const periodSubtitle = formatMonthSubtitle(period, localeTag, businessLabel)
  const emptyTable = filteredExpenses.length === 0

  function openAddDialog() {
    setActiveExpenseId(null)
    setFormState(createDefaultExpenseForm(categories[0]?.id ?? ''))
    setDialogMode('add')
  }

  function openEditDialog(expense: Expense) {
    setActiveExpenseId(expense.id)
    setFormState(buildExpenseFormFromExpense(expense))
    setDialogMode('edit')
  }

  async function openViewDialog(expenseId: string) {
    if (!businessId) {
      return
    }

    try {
      const detail = await getExpenseLocal(businessId, expenseId)
      setActiveExpenseId(detail.id)
      setDialogMode('view')
    } catch (detailError) {
      toast.error(getExpenseErrorMessage(detailError, t))
    }
  }

  function openDeleteDialog(expense: Expense) {
    setActiveExpenseId(expense.id)
    setDialogMode('delete')
  }

  function closeDialog() {
    if (saving || deleting) {
      return
    }

    setDialogMode(null)
    setActiveExpenseId(null)
  }

  function resetDialogState() {
    setDialogMode(null)
    setActiveExpenseId(null)
  }

  async function handleSaveExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!businessId || saving) {
      return
    }

    setSaving(true)

    try {
      const payload = {
        categoryId: canUseCategories ? formState.categoryId : undefined,
        description: formState.description,
        amount: Number(formState.amount),
        expenseDate: formState.expenseDate,
        vendor: formState.vendor || undefined,
        notes: formState.notes || undefined,
        isRecurring: formState.isRecurring,
        paymentMethod: formState.paymentMethod,
      }

      if (dialogMode === 'edit' && activeExpenseId) {
        await updateExpenseLocal(businessId, activeExpenseId, payload)
        toast.success(t('messages.updated'))
      } else {
        await createExpenseLocal(businessId, 'local-user', {
          ...payload,
          categoryId: payload.categoryId!,
        })
        toast.success(t('messages.created'))
      }

      resetDialogState()
      setRefreshKey((value) => value + 1)
    } catch (saveError) {
      toast.error(getExpenseErrorMessage(saveError, t))
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteExpense() {
    if (!businessId || !activeExpenseId || deleting) {
      return
    }

    setDeleting(true)

    try {
      await deleteExpenseLocal(businessId, activeExpenseId)
      toast.success(t('messages.deleted'))
      resetDialogState()
      setRefreshKey((value) => value + 1)
    } catch (deleteError) {
      toast.error(getExpenseErrorMessage(deleteError, t))
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground shadow-sm">
          <Spinner size={'lg'} />
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
      <SurfaceCard title={t('title')} description={t('load_error')}>
        <div className="space-y-4">
          <p className="text-sm text-danger-400">{error}</p>
          <Button variant="secondary" onClick={() => setRefreshKey((value) => value + 1)}>
            {t('actions.retry')}
          </Button>
        </div>
      </SurfaceCard>
    )
  }

  return (
    <>
      {!canUseCategories ? (
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
      <div className="space-y-6">
        <div className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-foreground">{t('title')}</h2>
            <p className="text-sm text-muted-foreground">{periodSubtitle}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-2">
              {(['month', 'quarter', 'year'] as PeriodKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                    period === key
                      ? 'border-border bg-secondary text-foreground'
                      : 'border-border/80 bg-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground',
                  )}
                >
                  {t(`periods.${key}`)}
                </button>
              ))}
            </div>
            <Button
              variant="primary"
              onClick={openAddDialog}
              disabled={canUseCategories && categories.length === 0}
              className="gap-2"
            >
              <PlusIcon />
              {t('actions.add')}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label={t('metrics.total_expenses')}
            value={formatCurrency(totalAmount, localeTag, businessCurrency)}
            hint={
              trend
                ? t('metrics.compared_to_previous', { value: trend.value })
                : t('metrics.current_period')
            }
            tone={trend?.tone === 'danger' ? 'danger' : 'default'}
          />
          <MetricCard
            label={t('metrics.recurring')}
            value={formatCurrency(recurringAmount, localeTag, businessCurrency)}
            hint={t('metrics.share_of_total', { value: recurringShare })}
            tone="accent"
          />
          <MetricCard
            label={t('metrics.one_off')}
            value={formatCurrency(oneOffAmount, localeTag, businessCurrency)}
            hint={t('metrics.share_of_total', { value: oneOffShare })}
          />
          {canUseCategories ? (
            <MetricCard
              label={t('metrics.categories')}
              value={String(currentCategoryTotals.length)}
              hint={t('metrics.entries_count', { count: periodExpenses.length })}
            />
          ) : null}
        </div>

        {canUseCategories ? (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
          <SurfaceCard title={t('chart.title')}>
            {chartCategories.length === 0 ? (
              <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
                {t('chart.empty')}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {chartCategories.map((category) => (
                    <span key={category.categoryId} className="inline-flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: category.color }}
                        aria-hidden="true"
                      />
                      {category.name}
                    </span>
                  ))}
                </div>
                <div className="grid min-h-[220px] grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  {chartCategories.map((category) => {
                    const ratio = topCategoryAmount > 0 ? category.amount / topCategoryAmount : 0
                    const barHeight = Math.max(18, Math.round(ratio * 160))

                    return (
                      <div key={category.categoryId} className="flex flex-col justify-end gap-3">
                        <div className="flex flex-1 items-end justify-center">
                          <div className="group relative flex w-full max-w-[64px] justify-center">
                            <div className="absolute -top-11 hidden rounded-xl border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-xl group-hover:block">
                              {formatCurrency(category.amount, localeTag, businessCurrency)}
                            </div>
                            <div
                              className="w-full rounded-t-xl transition-opacity group-hover:opacity-90"
                              style={{
                                height: `${barHeight}px`,
                                backgroundColor: category.color,
                              }}
                              title={`${category.name}: ${formatCurrency(category.amount, localeTag, businessCurrency)}`}
                            />
                          </div>
                        </div>
                        <div className="space-y-1 text-center">
                          <p className="truncate text-xs font-medium text-foreground">{category.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatCurrency(category.amount, localeTag, businessCurrency)}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard title={t('top_categories.title')}>
            {currentCategoryTotals.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('top_categories.empty')}</p>
            ) : (
              <div className="space-y-3">
                {currentCategoryTotals.slice(0, 6).map((category) => {
                  const ratio = currentCategoryTotals[0]?.amount
                    ? category.amount / currentCategoryTotals[0].amount
                    : 0

                  return (
                    <div key={category.categoryId} className="flex items-center gap-3">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: category.color }}
                        aria-hidden="true"
                      />
                      <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                        {category.name}
                      </p>
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(8, Math.round(ratio * 100))}%`,
                            backgroundColor: category.color,
                          }}
                        />
                      </div>
                      <p className="w-24 text-right text-sm font-medium text-foreground">
                        {Math.round(category.amount).toLocaleString(localeTag)}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </SurfaceCard>
        </div>
        ) : null}

        <SurfaceCard>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('filters.search_placeholder')}
              className={cn(inputClassName, 'lg:flex-1')}
            />

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]">
              {canUseCategories ? (
                <Select value={categoryFilter || '__all__'} onValueChange={(value) => setCategoryFilter(value === '__all__' ? '' : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('filters.all_categories')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t('filters.all_categories')}</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              <Select value={recurringFilter || '__all__'} onValueChange={(value) => setRecurringFilter(value === '__all__' ? '' : (value as RecurringFilterValue))}>
                <SelectTrigger>
                  <SelectValue placeholder={t('filters.all_types')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t('filters.all_types')}</SelectItem>
                  <SelectItem value="true">{t('types.recurring')}</SelectItem>
                  <SelectItem value="false">{t('types.one_off')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-[24%] px-3 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {t('table.description')}
                  </th>
                  <th className="w-[14%] px-3 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {t('table.date')}
                  </th>
                  {canUseCategories ? (
                    <th className="w-[18%] px-3 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      {t('table.category')}
                    </th>
                  ) : null}
                  <th className="w-[16%] px-3 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {t('table.vendor')}
                  </th>
                  <th className="w-[12%] px-3 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {t('table.type')}
                  </th>
                  <th className="w-[12%] px-3 py-3 text-right text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {t('table.amount')}
                  </th>
                  <th className="w-[4%] px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {visibleExpenses.map((expense) => {
                  const categoryName = getExpenseCategoryName(expense, t('uncategorized'))
                  const categoryColor = getExpenseCategoryColor(expense)

                  return (
                    <tr key={expense.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                      <td className="px-3 py-3 text-foreground" title={expense.description}>
                        <div className="truncate font-medium">{expense.description}</div>
                      </td>
                      <td className="px-3 py-3 text-foreground">
                        {formatDateLabel(expense.expenseDate, localeTag)}
                      </td>
                      {canUseCategories ? (
                        <td className="px-3 py-3">
                          <CategoryPill label={categoryName} color={categoryColor} />
                        </td>
                      ) : null}
                      <td
                        className={cn(
                          'px-3 py-3',
                          expense.vendor ? 'text-foreground' : 'text-muted-foreground',
                        )}
                        title={expense.vendor ?? ''}
                      >
                        <div className="truncate">{expense.vendor || '—'}</div>
                      </td>
                      <td className="px-3 py-3">
                        <ExpenseTypeBadge
                          recurring={expense.isRecurring}
                          recurringLabel={t('types.recurring')}
                          oneOffLabel={t('types.one_off')}
                        />
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-foreground">
                        {Math.round(expense.amount).toLocaleString(localeTag)}
                      </td>
                      <td className="px-3 py-3">
                        <ResourceActionMenu
                          label={t('actions.more')}
                          orientation="vertical"
                          items={[
                            {
                              label: t('actions.view'),
                              onSelect: () => {
                                void openViewDialog(expense.id)
                              },
                            },
                            {
                              label: t('actions.edit'),
                              onSelect: () => openEditDialog(expense),
                            },
                            {
                              label: t('actions.delete'),
                              tone: 'danger',
                              onSelect: () => openDeleteDialog(expense),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {emptyTable ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              {t('table.empty')}
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {t('table.showing', {
                  start: (currentPage - 1) * PAGE_SIZE + 1,
                  end: Math.min(currentPage * PAGE_SIZE, filteredExpenses.length),
                  total: filteredExpenses.length,
                })}
              </p>
              <div className="flex flex-wrap gap-2">
                {visiblePageNumbers.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setPage(pageNumber)}
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
          )}
        </SurfaceCard>
      </div>

      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-h-[calc(100vh-1rem)] overflow-hidden p-0 sm:max-h-[calc(100vh-3rem)] sm:max-w-[560px]">
          {dialogMode === 'add' || dialogMode === 'edit' ? (
            <>
              <DialogHeader className="shrink-0 pr-16">
                <DialogTitle>
                  {dialogMode === 'edit' ? t('dialogs.edit_title') : t('dialogs.add_title')}
                </DialogTitle>
                <DialogDescription>{t('dialogs.form_subtitle')}</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSaveExpense} className="flex min-h-0 flex-1 flex-col">
                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground" htmlFor="expense-description">
                      {t('form.description')}
                    </label>
                    <input
                      id="expense-description"
                      value={formState.description}
                      onChange={(event) =>
                        setFormState((current) => ({ ...current, description: event.target.value }))
                      }
                      className={inputClassName}
                      placeholder={t('form.description_placeholder')}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground" htmlFor="expense-amount">
                        {t('form.amount')}
                      </label>
                      <input
                        id="expense-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formState.amount}
                        onChange={(event) =>
                          setFormState((current) => ({ ...current, amount: event.target.value }))
                        }
                        className={inputClassName}
                        placeholder="0"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground" htmlFor="expense-date">
                        {t('form.date')}
                      </label>
                      <input
                        id="expense-date"
                        type="date"
                        value={formState.expenseDate}
                        onChange={(event) =>
                          setFormState((current) => ({ ...current, expenseDate: event.target.value }))
                        }
                        className={inputClassName}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {canUseCategories ? (
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">{t('form.category')}</label>
                        <Select
                          value={formState.categoryId}
                          onValueChange={(value) =>
                            setFormState((current) => ({ ...current, categoryId: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t('form.category_placeholder')} />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((category) => (
                              <SelectItem key={category.id} value={category.id}>
                                {category.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground" htmlFor="expense-vendor">
                        {t('form.vendor')}
                      </label>
                      <input
                        id="expense-vendor"
                        value={formState.vendor}
                        onChange={(event) =>
                          setFormState((current) => ({ ...current, vendor: event.target.value }))
                        }
                        className={inputClassName}
                        placeholder={t('form.vendor_placeholder')}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">{t('form.payment_method')}</label>
                    <Select
                      value={formState.paymentMethod}
                      onValueChange={(value) =>
                        setFormState((current) => ({
                          ...current,
                          paymentMethod: value as PaymentMethod,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={PaymentMethod.CASH}>{t('payment.cash')}</SelectItem>
                        <SelectItem value={PaymentMethod.MTN_MOMO}>{t('payment.mtn_momo')}</SelectItem>
                        <SelectItem value={PaymentMethod.ORANGE_MONEY}>{t('payment.orange_money')}</SelectItem>
                        <SelectItem value={PaymentMethod.CARD}>{t('payment.card')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground" htmlFor="expense-notes">
                      {t('form.notes')}
                    </label>
                    <textarea
                      id="expense-notes"
                      value={formState.notes}
                      onChange={(event) =>
                        setFormState((current) => ({ ...current, notes: event.target.value }))
                      }
                      className={textareaClassName}
                      placeholder={t('form.notes_placeholder')}
                    />
                  </div>

                  <label className="flex items-center gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={formState.isRecurring}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          isRecurring: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                    />
                    <span>{t('form.recurring')}</span>
                  </label>
                </div>

                <DialogFooter className="shrink-0">
                  <Button variant="secondary" type="button" onClick={closeDialog} disabled={saving}>
                    {t('actions.cancel')}
                  </Button>
                  <Button variant={'primary'} type="submit" disabled={saving}>
                    {saving ? (
                      <>
                        <Spinner size={'md'} />
                        {dialogMode === 'edit' ? t('actions.saving') : t('actions.creating')}
                      </>
                    ) : dialogMode === 'edit' ? (
                      t('actions.save')
                    ) : (
                      t('actions.add')
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : dialogMode === 'view' && activeExpense ? (
            <>
              <DialogHeader className="shrink-0 pr-16">
                <DialogTitle>{activeExpense.description}</DialogTitle>
                <DialogDescription>{t('dialogs.view_subtitle')}</DialogDescription>
              </DialogHeader>
              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
                <div className="space-y-3 border-b border-border pb-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">{t('detail.amount')}</span>
                    <span className="text-2xl font-semibold text-foreground">
                      {formatCurrency(activeExpense.amount, localeTag, businessCurrency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">{t('detail.date')}</span>
                    <span className="text-sm font-medium text-foreground">
                      {formatDateLabel(activeExpense.expenseDate, localeTag)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">{t('detail.category')}</span>
                    <CategoryPill
                      label={getExpenseCategoryName(activeExpense, t('uncategorized'))}
                      color={getExpenseCategoryColor(activeExpense)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">{t('detail.vendor')}</span>
                    <span className="text-sm font-medium text-foreground">
                      {activeExpense.vendor || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">{t('detail.type')}</span>
                    <span className="text-sm font-medium text-foreground">
                      {activeExpense.isRecurring ? t('types.recurring_monthly') : t('types.one_off')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">{t('detail.payment_method')}</span>
                    <span className="text-sm font-medium text-foreground">
                      {activeExpense.paymentMethod === PaymentMethod.MTN_MOMO
                        ? t('payment.mtn_momo')
                        : activeExpense.paymentMethod === PaymentMethod.ORANGE_MONEY
                          ? t('payment.orange_money')
                          : activeExpense.paymentMethod === PaymentMethod.CARD
                            ? t('payment.card')
                            : t('payment.cash')}
                    </span>
                  </div>
                </div>

                {activeExpense.notes ? (
                  <div className="space-y-2 border-b border-border pb-4">
                    <p className="text-sm text-muted-foreground">{t('detail.notes')}</p>
                    <p className="text-sm leading-6 text-foreground">{activeExpense.notes}</p>
                  </div>
                ) : null}

                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => openEditDialog(activeExpense)}
                  >
                    {t('actions.edit')}
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1 border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                    onClick={() => openDeleteDialog(activeExpense)}
                  >
                    {t('actions.delete')}
                  </Button>
                </div>
              </div>
            </>
          ) : dialogMode === 'delete' && activeExpense ? (
            <>
              <DialogHeader className="shrink-0 pr-16">
                <DialogTitle>{t('dialogs.delete_title')}</DialogTitle>
                <DialogDescription>{t('dialogs.delete_subtitle')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-5 px-6 py-5">
                <p className="text-sm leading-6 text-muted-foreground">
                  {t('dialogs.delete_message', {
                    description: activeExpense.description,
                    amount: formatCurrency(activeExpense.amount, localeTag, businessCurrency),
                  })}
                </p>
              </div>
              <DialogFooter className="shrink-0">
                <Button variant="secondary" onClick={closeDialog} disabled={deleting}>
                  {t('actions.cancel')}
                </Button>
                <Button
                  onClick={() => void handleDeleteExpense()}
                  disabled={deleting}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  {deleting ? (
                    <>
                      <Spinner size={'md'} />
                      {t('actions.deleting')}
                    </>
                  ) : (
                    t('actions.confirm_delete')
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function ExpensesPage() {
  return <ExpensesPageContent />
}
