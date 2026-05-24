'use client'

import { useDeferredValue, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button, Input, Spinner } from '@biztrack/ui'
import { ContactType, type ContactListItem, type JwtPayload } from '@biztrack/types'
import { toast } from 'sonner'
import { MetricCard } from '@/components/catalog/MetricCard'
import { SurfaceCard } from '@/components/catalog/SurfaceCard'
import { ContactCreateDialog } from '@/components/contacts/ContactCreateDialog'
import { ResourceActionMenu } from '@/components/products/ResourceActionMenu'
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
import { listContactsLocal } from '@/services/contacts.local'
import { useAuthStore } from '@/stores/auth.store'
import { usePlanStore } from '@/stores/plan.store'

type ContactTypeFilterValue = 'ALL' | ContactType
type BalanceFilterValue = 'ALL' | 'RECEIVABLE' | 'PAYABLE' | 'CLEAR'

const PAGE_SIZE = 8
const MAX_CONTACTS_LIMIT = 1000

export default function ContactsPage() {
  const t = useTranslations('app.contacts')
  const planGateT = useTranslations('app.plan_gate')
  const locale = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const businessId = useAuthStore((state) => state.businessId)
  const accessToken = useAuthStore((state) => state.accessToken)
  const planState = usePlanStore((state) => state.current)
  const [contacts, setContacts] = useState<ContactListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ContactTypeFilterValue>('ALL')
  const contactsView = searchParams.get('view')
  const balanceFilterFromView = useMemo(
    () => resolveBalanceFilterFromView(contactsView),
    [contactsView],
  )
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilterValue>(balanceFilterFromView)
  const [currentPage, setCurrentPage] = useState(1)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const deferredSearch = useDeferredValue(search)

  const createdById = useMemo(
    () => (accessToken ? decodeJwtPayload<JwtPayload>(accessToken)?.sub ?? null : null),
    [accessToken],
  )

  useEffect(() => {
    if (!businessId) {
      setContacts([])
      setLoading(false)
      setError(t('business_required'))
      return
    }

    const currentBusinessId = businessId
    let active = true

    async function loadContacts() {
      setLoading(true)
      setError(null)

      try {
        const result = await listContactsLocal(currentBusinessId, {
          page: 1,
          limit: MAX_CONTACTS_LIMIT,
          isActive: true,
          sortBy: 'updatedAt',
          sortOrder: 'DESC',
        })

        if (!active) {
          return
        }

        setContacts(result.data)
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

    void loadContacts()

    return () => {
      active = false
    }
  }, [businessId, reloadKey, t])

  useEffect(() => {
    setBalanceFilter(balanceFilterFromView)
  }, [balanceFilterFromView])

  useEffect(() => {
    setCurrentPage(1)
  }, [balanceFilter, deferredSearch, typeFilter])

  const pageTitle =
    contactsView === 'debtors'
      ? t('views.debtors_title')
      : contactsView === 'creditors'
        ? t('views.creditors_title')
        : t('title')

  const pageSubtitle =
    contactsView === 'debtors'
      ? t('views.debtors_subtitle')
      : contactsView === 'creditors'
        ? t('views.creditors_subtitle')
        : t('subtitle')

  const filteredContacts = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase()

    return contacts.filter((contact) => {
      if (typeFilter !== 'ALL' && contact.type !== typeFilter) {
        return false
      }

      if (balanceFilter === 'RECEIVABLE' && contact.totalReceivable <= 0) {
        return false
      }

      if (balanceFilter === 'PAYABLE' && contact.totalPayable <= 0) {
        return false
      }

      if (
        balanceFilter === 'CLEAR' &&
        (contact.totalReceivable > 0 || contact.totalPayable > 0)
      ) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const haystack = [contact.name, contact.phone, contact.phoneAlt]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedSearch)
    })
  }, [balanceFilter, contacts, deferredSearch, typeFilter])

  const totalPages = Math.max(1, Math.ceil(filteredContacts.length / PAGE_SIZE))

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages))
  }, [totalPages])

  const pageStart = filteredContacts.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE
  const paginatedContacts = filteredContacts.slice(pageStart, pageStart + PAGE_SIZE)
  const showingStart = filteredContacts.length === 0 ? 0 : pageStart + 1
  const showingEnd = filteredContacts.length === 0 ? 0 : pageStart + paginatedContacts.length

  const exactCustomers = contacts.filter((contact) => contact.type === ContactType.CUSTOMER).length
  const exactSuppliers = contacts.filter((contact) => contact.type === ContactType.SUPPLIER).length
  const exactBoth = contacts.filter((contact) => contact.type === ContactType.BOTH).length
  const activeDebtors = contacts.filter((contact) => contact.totalReceivable > 0)
  const activeCreditors = contacts.filter((contact) => contact.totalPayable > 0)
  const totalReceivable = activeDebtors.reduce((sum, contact) => sum + contact.totalReceivable, 0)
  const totalPayable = activeCreditors.reduce((sum, contact) => sum + contact.totalPayable, 0)
  const settledThisMonthCount = contacts.filter(
    (contact) =>
      contact.totalReceivable <= 0 &&
      contact.totalPayable <= 0 &&
      isDateInCurrentMonth(getLastActivityDate(contact)),
  ).length

  const pageNumbers = useMemo(() => buildPageNumbers(currentPage, totalPages), [currentPage, totalPages])
  const contactsQuotaUsage =
    planState?.quotaUsage.find((entry) => entry.resource === 'contacts' && !entry.unlimited) ?? null
  const contactsQuotaReached = Boolean(
    contactsQuotaUsage && contactsQuotaUsage.used >= (contactsQuotaUsage.limit ?? 0),
  )
  const buildContactHref = (contactId: string) =>
    `/${locale}/contacts/detail?contactId=${encodeURIComponent(contactId)}`

  const handleCopyValue = async (value: string | null | undefined, label: string) => {
    if (!value) {
      return
    }

    try {
      await copyTextToClipboard(value)
      toast.success(t('toast.copied', { label }))
    } catch {
      toast.error(t('toast.copy_failed'))
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground">{pageTitle}</h2>
            <p className="text-sm text-muted-foreground">{pageSubtitle}</p>
          </div>

          <Button
            type="button"
            variant="primary"
            onClick={() => setIsCreateOpen(true)}
            disabled={!businessId || contactsQuotaReached}
          >
            <PlusIcon />
            <span>{t('actions.add')}</span>
          </Button>
        </div>

        {contactsQuotaReached ? (
          <p className="text-sm text-muted-foreground">
            {planGateT.rich('quota_hint', {
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

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label={t('metrics.total_contacts')}
            value={String(contacts.length)}
            hint={t('metrics.total_contacts_hint', {
              customers: exactCustomers,
              suppliers: exactSuppliers,
              both: exactBoth,
            })}
          />
          <MetricCard
            label={t('metrics.active_debtors')}
            value={String(activeDebtors.length)}
            hint={
              activeDebtors.length > 0
                ? t('metrics.active_debtors_hint', {
                    amount: formatCurrency(totalReceivable, locale),
                  })
                : t('metrics.no_receivables')
            }
            tone={activeDebtors.length > 0 ? 'warning' : 'default'}
          />
          <MetricCard
            label={t('metrics.active_creditors')}
            value={String(activeCreditors.length)}
            hint={
              activeCreditors.length > 0
                ? t('metrics.active_creditors_hint', {
                    amount: formatCurrency(totalPayable, locale),
                  })
                : t('metrics.no_payables')
            }
            tone={activeCreditors.length > 0 ? 'danger' : 'default'}
          />
          <MetricCard
            label={t('metrics.settled_this_month')}
            value={String(settledThisMonthCount)}
            hint={
              settledThisMonthCount > 0
                ? t('metrics.settled_this_month_hint', { count: settledThisMonthCount })
                : t('metrics.nothing_settled')
            }
            tone="accent"
          />
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

              <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]">
                <Select
                  value={typeFilter}
                  onValueChange={(value) => setTypeFilter(value as ContactTypeFilterValue)}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t('filters.all_types')}</SelectItem>
                    <SelectItem value={ContactType.CUSTOMER}>{t('filters.customers')}</SelectItem>
                    <SelectItem value={ContactType.SUPPLIER}>{t('filters.suppliers')}</SelectItem>
                    <SelectItem value={ContactType.BOTH}>{t('filters.both')}</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={balanceFilter}
                  onValueChange={(value) => setBalanceFilter(value as BalanceFilterValue)}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t('filters.all_statuses')}</SelectItem>
                    <SelectItem value="RECEIVABLE">{t('filters.has_receivable')}</SelectItem>
                    <SelectItem value="PAYABLE">{t('filters.has_payable')}</SelectItem>
                    <SelectItem value="CLEAR">{t('filters.clear')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] table-fixed text-sm">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[14%]" />
                <col className="w-[18%]" />
                <col className="w-[18%]" />
                <col className="w-[14%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead className="bg-muted/50">
                <tr>
                  {[
                    t('table.contact'),
                    t('table.type'),
                    t('table.receivable'),
                    t('table.payable'),
                    t('table.last_activity'),
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
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16">
                      <div className="flex items-center justify-center">
                        <Spinner size="lg" />
                      </div>
                    </td>
                  </tr>
                ) : paginatedContacts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center text-sm text-muted-foreground">
                      {t('table.empty')}
                    </td>
                  </tr>
                ) : (
                  paginatedContacts.map((contact) => {
                    const lastActivity = getLastActivityDate(contact)

                    return (
                      <tr key={contact.id} className="border-t border-border/80 first:border-t-0 hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <Link href={buildContactHref(contact.id)} className="flex items-center gap-3">
                            <div
                              className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                                getAvatarClassName(contact.type),
                              )}
                            >
                              {getInitials(contact.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-medium text-foreground transition-colors hover:text-primary">
                                {contact.name}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {contact.phone || t('table.no_phone')}
                              </div>
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                              getTypeBadgeClassName(contact.type),
                            )}
                          >
                            {getTypeLabel(contact.type, t)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <DebtChip
                            tone="receivable"
                            value={contact.totalReceivable}
                            settledLabel={t('table.settled')}
                            locale={locale}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <DebtChip
                            tone="payable"
                            value={contact.totalPayable}
                            settledLabel={t('table.settled')}
                            locale={locale}
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {lastActivity ? formatDateLabel(lastActivity, locale) : t('table.no_activity')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            <ResourceActionMenu
                              label={t('actions.more')}
                              orientation="vertical"
                              items={[
                                {
                                  label: t('actions.view_details'),
                                  onSelect: () => router.push(buildContactHref(contact.id)),
                                },
                                {
                                  label: t('actions.copy_phone'),
                                  disabled: !contact.phone,
                                  onSelect: () => void handleCopyValue(contact.phone, t('table.contact')),
                                },
                                {
                                  label: t('actions.copy_alt_phone'),
                                  disabled: !contact.phoneAlt,
                                  onSelect: () =>
                                    void handleCopyValue(contact.phoneAlt, t('dialog.alternate_phone')),
                                },
                                {
                                  label: t('actions.copy_address'),
                                  disabled: !contact.address,
                                  onSelect: () => void handleCopyValue(contact.address, t('dialog.address')),
                                },
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

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
            <span>{t('table.showing', { start: showingStart, end: showingEnd, total: filteredContacts.length })}</span>

            <div className="flex items-center gap-2">
              {pageNumbers.map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  disabled={page === currentPage}
                  className={cn(
                    'inline-flex min-w-9 items-center justify-center rounded-lg border px-3 py-1.5 text-sm transition-colors',
                    page === currentPage
                      ? 'border-primary/20 bg-primary/10 font-medium text-foreground'
                      : 'border-border bg-background hover:border-primary/30 hover:text-foreground',
                  )}
                >
                  {page}
                </button>
              ))}
            </div>
          </div>
        </SurfaceCard>
      </div>

      <ContactCreateDialog
        businessId={businessId}
        createdById={createdById}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSaved={() => setReloadKey((current) => current + 1)}
        quotaReached={contactsQuotaReached}
      />
    </>
  )
}

function formatCurrency(value: number, localeTag: string) {
  return `XAF ${Math.round(value).toLocaleString(localeTag)}`
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

function getLastActivityDate(contact: ContactListItem) {
  return contact.lastTransactionDate || contact.updatedAt || contact.createdAt || null
}

function isDateInCurrentMonth(value: string | null) {
  if (!value) {
    return false
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return false
  }

  const now = new Date()

  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
}

function getAvatarClassName(type: ContactType) {
  if (type === ContactType.SUPPLIER) {
    return 'bg-sky-100 text-sky-700'
  }

  if (type === ContactType.BOTH) {
    return 'bg-amber-100 text-amber-800'
  }

  return 'bg-emerald-100 text-emerald-700'
}

function getTypeBadgeClassName(type: ContactType) {
  if (type === ContactType.SUPPLIER) {
    return 'bg-sky-100 text-sky-700'
  }

  if (type === ContactType.BOTH) {
    return 'bg-amber-100 text-amber-800'
  }

  return 'bg-emerald-100 text-emerald-700'
}

function getTypeLabel(
  type: ContactType,
  t: ReturnType<typeof useTranslations<'app.contacts'>>,
) {
  if (type === ContactType.SUPPLIER) {
    return t('types.supplier')
  }

  if (type === ContactType.BOTH) {
    return t('types.both')
  }

  return t('types.customer')
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

function resolveBalanceFilterFromView(view: string | null): BalanceFilterValue {
  if (view === 'debtors') {
    return 'RECEIVABLE'
  }

  if (view === 'creditors') {
    return 'PAYABLE'
  }

  return 'ALL'
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'absolute'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

function DebtChip({
  tone,
  value,
  settledLabel,
  locale,
}: {
  tone: 'receivable' | 'payable'
  value: number
  settledLabel: string
  locale: string
}) {
  if (value <= 0) {
    return (
      <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
        {settledLabel}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
        tone === 'receivable' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700',
      )}
    >
      {formatCurrency(value, locale)}
    </span>
  )
}

function PlusIcon() {
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
      <path d="M10 4v12" />
      <path d="M4 10h12" />
    </svg>
  )
}
