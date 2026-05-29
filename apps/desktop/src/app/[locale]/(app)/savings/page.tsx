'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Button, Spinner } from '@biztrack/ui'
import { type PaginatedResult } from '@biztrack/types'
import { ResourceActionMenu } from '@/components/products/ResourceActionMenu'
import { SavingsDepositDialog } from '@/components/savings/SavingsDepositDialog'
import { SavingsRefundDialog } from '@/components/savings/SavingsRefundDialog'
import {
  listSavingsAccountsLocal,
  type LocalSavingsAccount,
} from '@/services/savings.local'
import { useAuthStore } from '@/stores/auth.store'
import { Link } from '@/i18n/navigation'

function formatCurrency(amount: number, currency = 'XAF') {
  return `${currency} ${new Intl.NumberFormat('fr-CM', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)}`
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('fr-CM', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

const PAGE_SIZE = 15

export default function SavingsPage() {
  const t = useTranslations('app.savings')
  const locale = useLocale()
  const router = useRouter()
  const businessId = useAuthStore((state) => state.businessId)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const businessCurrency = useAuthStore((state) => state.businessCurrency)

  const [accounts, setAccounts] = useState<PaginatedResult<LocalSavingsAccount> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)

  const [depositOpen, setDepositOpen] = useState(false)
  const [depositAccount, setDepositAccount] = useState<LocalSavingsAccount | null>(null)

  const [refundOpen, setRefundOpen] = useState(false)
  const [refundAccount, setRefundAccount] = useState<LocalSavingsAccount | null>(null)

  useEffect(() => {
    if (!businessId) {
      setLoading(false)
      setError(t('business_required'))
      return
    }

    setLoading(true)
    setError(null)

    listSavingsAccountsLocal(businessId, { page, limit: PAGE_SIZE, search })
      .then((result) => setAccounts(result))
      .catch((err) => setError(err instanceof Error ? err.message : t('load_error')))
      .finally(() => setLoading(false))
  }, [businessId, page, search, refreshKey, t])

  function openDeposit(account?: LocalSavingsAccount) {
    setDepositAccount(account ?? null)
    setDepositOpen(true)
  }

  function openRefund(account: LocalSavingsAccount) {
    setRefundAccount(account)
    setRefundOpen(true)
  }

  const inputClassName =
    'block h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => openDeposit()} className="shrink-0">
          {t('new_deposit')}
        </Button>
      </div>

      {/* Search */}
      <div>
        <input
          type="text"
          className={inputClassName}
          placeholder={`${t('table.customer')} / ${t('table.number')}...`}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner className="h-6 w-6" />
            <span className="ml-2 text-sm text-muted-foreground">{t('loading')}</span>
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : !accounts || accounts.data.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2">
            <p className="text-sm font-medium text-foreground">{t('empty.title')}</p>
            <p className="text-sm text-muted-foreground">{t('empty.subtitle')}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 pr-4">{t('table.number')}</th>
                <th className="pb-2 pr-4">{t('table.customer')}</th>
                <th className="pb-2 pr-4 text-right">{t('table.balance')}</th>
                <th className="pb-2 pr-4 text-right">{t('table.total_deposited')}</th>
                <th className="pb-2 pr-4">{t('table.last_activity')}</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.data.map((account) => (
                <tr
                  key={account.id}
                  className="border-b border-border/30 transition-colors hover:bg-secondary/30"
                >
                  <td className="py-3 pr-4 font-mono text-xs text-foreground">
                    <Link
                      href={`/savings/detail?savingsId=${account.id}`}
                      className="text-primary hover:underline"
                    >
                      {account.accountNumber}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="font-medium text-foreground">
                      {account.customerName || t('table.no_customer')}
                    </div>
                    {account.customerPhone ? (
                      <div className="text-xs text-muted-foreground">{account.customerPhone}</div>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 text-right font-medium text-foreground">
                    {formatCurrency(account.balance, businessCurrency)}
                  </td>
                  <td className="py-3 pr-4 text-right text-muted-foreground">
                    {formatCurrency(account.totalDeposited, businessCurrency)}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {formatDate(account.lastTransactionAt)}
                  </td>
                  <td className="py-3 text-right">
                    <ResourceActionMenu
                      label={t('actions.more')}
                      items={[
                        {
                          label: t('actions.view_statement'),
                          onSelect: () =>
                            router.push(`/${locale}/savings/detail?savingsId=${account.id}`),
                        },
                        {
                          label: t('actions.add_deposit'),
                          onSelect: () => openDeposit(account),
                        },
                        {
                          label: t('actions.refund'),
                          onSelect: () => openRefund(account),
                          disabled: account.balance <= 0,
                          tone: 'danger',
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {accounts && accounts.totalPages > 1 ? (
        <div className="flex items-center justify-between border-t border-border/60 pt-4">
          <span className="text-sm text-muted-foreground">
            {t('pagination.showing', {
              from: (page - 1) * PAGE_SIZE + 1,
              to: Math.min(page * PAGE_SIZE, accounts.total),
              total: accounts.total,
            })}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= accounts.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <SavingsDepositDialog
        businessId={businessId ?? ''}
        userId={userId ?? null}
        open={depositOpen}
        onOpenChange={setDepositOpen}
        account={depositAccount}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />

      {refundAccount ? (
        <SavingsRefundDialog
          businessId={businessId ?? ''}
          userId={userId ?? null}
          open={refundOpen}
          onOpenChange={(open) => {
            setRefundOpen(open)
            if (!open) setRefundAccount(null)
          }}
          account={refundAccount}
          onSuccess={() => setRefreshKey((k) => k + 1)}
        />
      ) : null}
    </div>
  )
}
