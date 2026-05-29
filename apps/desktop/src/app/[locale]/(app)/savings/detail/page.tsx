'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button, Spinner } from '@biztrack/ui'
import { Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { SavingsDepositDialog } from '@/components/savings/SavingsDepositDialog'
import { SavingsRefundDialog } from '@/components/savings/SavingsRefundDialog'
import { cn } from '@/lib/utils'
import { hasDesktopIpc, ipc } from '@/services/ipc.bridge'
import {
  getSavingsStatementLocal,
  type LocalSavingsStatement,
} from '@/services/savings.local'
import { useAuthStore } from '@/stores/auth.store'

function formatCurrency(amount: number, currency = 'XAF') {
  return `${currency} ${new Intl.NumberFormat('fr-CM', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)}`
}

function formatDateTime(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('fr-CM', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

export default function SavingsDetailPage() {
  const t = useTranslations('app.savings')
  const locale = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const savingsId = searchParams.get('savingsId')
  const businessId = useAuthStore((state) => state.businessId)
  const businessName = useAuthStore((state) => state.businessName)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const businessCurrency = useAuthStore((state) => state.businessCurrency)

  const [statement, setStatement] = useState<LocalSavingsStatement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [depositOpen, setDepositOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    if (!businessId || !savingsId) {
      setLoading(false)
      setError(t('errors.SAVINGS_NOT_FOUND'))
      return
    }

    setLoading(true)
    setError(null)

    getSavingsStatementLocal(businessId, savingsId)
      .then((result) => setStatement(result))
      .catch((err) => setError(err instanceof Error ? err.message : t('load_error')))
      .finally(() => setLoading(false))
  }, [businessId, savingsId, refreshKey, t])

  async function handleShare() {
    if (!statement) return
    if (!hasDesktopIpc()) {
      toast.error(t('detail.share_error'))
      return
    }
    setSharing(true)
    try {
      const { account: acc, entries } = statement
      const generatedAt = new Date().toLocaleDateString('fr-CM', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
      const fmt = (n: number) =>
        `${businessCurrency} ${new Intl.NumberFormat('fr-CM', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)}`
      const fmtDate = (d: string) => {
        try {
          return new Date(d).toLocaleDateString('fr-CM', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        } catch {
          return d
        }
      }
      const rows = entries
        .map(
          (e) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;">${fmtDate(e.occurredAt)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
            <span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:${e.direction === 'inbound' ? '#d1fae5' : '#fee2e2'};color:${e.direction === 'inbound' ? '#065f46' : '#991b1b'};">
              ${e.type === 'deposit' ? t('detail.transaction_type_deposit') : e.type === 'refund' ? t('detail.transaction_type_refund') : e.type === 'sale' ? t('detail.transaction_type_sale') : t('detail.transaction_type_voided_sale')}
            </span>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;">${e.method ?? '—'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;max-width:160px;">${e.notes ?? '—'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;text-align:right;color:${e.direction === 'inbound' ? '#065f46' : '#991b1b'};">
            ${e.direction === 'inbound' ? '+' : '−'}${fmt(e.amount)}
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;font-family:monospace;">${fmt(e.runningBalance)}</td>
        </tr>`,
        )
        .join('')

      const companyName = businessName?.trim() || 'BizTrack Business'

      const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Savings Statement – ${acc.accountNumber}</title></head>
<body style="margin:0;padding:32px;font-family:Arial,sans-serif;color:#111827;background:#fff;">
  <div style="margin-bottom:24px;padding-bottom:20px;border-bottom:2px solid #e5e7eb;">
    <div style="font-size:22px;font-weight:700;color:#111827;">${companyName}</div>
    <div style="font-size:13px;color:#6b7280;margin-top:4px;">Savings Account Statement</div>
  </div>
  <p style="font-size:12px;color:#9ca3af;margin:0 0 24px;">Generated ${generatedAt}</p>

  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <tr>
      <td style="padding:12px 16px;background:#f9fafb;border-radius:8px 0 0 8px;border:1px solid #e5e7eb;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:4px;">${t('detail.account_number')}</div>
        <div style="font-size:16px;font-weight:700;font-family:monospace;">${acc.accountNumber}</div>
      </td>
      <td style="padding:12px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-left:none;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:4px;">${t('detail.customer')}</div>
        <div style="font-size:14px;font-weight:600;">${acc.customerName ?? '—'}</div>
        ${acc.customerPhone ? `<div style="font-size:12px;color:#6b7280;">${acc.customerPhone}</div>` : ''}
      </td>
      <td style="padding:12px 16px;background:#f9fafb;border-radius:0 8px 8px 0;border:1px solid #e5e7eb;border-left:none;text-align:right;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:4px;">${t('detail.balance')}</div>
        <div style="font-size:20px;font-weight:700;">${fmt(acc.balance)}</div>
      </td>
    </tr>
  </table>

  <div style="display:flex;gap:16px;margin-bottom:28px;">
    <div style="flex:1;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:4px;">${t('detail.total_deposited')}</div>
      <div style="font-size:15px;font-weight:600;color:#065f46;">${fmt(acc.totalDeposited)}</div>
    </div>
    <div style="flex:1;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:4px;">${t('detail.total_refunded')}</div>
      <div style="font-size:15px;font-weight:600;color:#991b1b;">${fmt(acc.totalRefunded)}</div>
    </div>
  </div>

  ${
    entries.length === 0
      ? `<p style="text-align:center;color:#9ca3af;padding:32px 0;">${t('detail.no_transactions')}</p>`
      : `<table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr style="border-bottom:2px solid #e5e7eb;">
        <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">${t('detail.date')}</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Type</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">${t('detail.method')}</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">${t('detail.notes')}</th>
        <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">${t('detail.amount')}</th>
        <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">${t('detail.running_balance')}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`
  }
</body>
</html>`

      const renderResult = await ipc.documents.renderPdf({ html })
      if (!renderResult.success || !renderResult.buffer) {
        toast.error(t('detail.share_error'))
        return
      }
      await ipc.share.file({
        buffer: renderResult.buffer,
        filename: `savings-statement-${acc.accountNumber}.pdf`,
        mimeType: 'application/pdf',
      })
    } catch {
      toast.error(t('detail.share_error'))
    } finally {
      setSharing(false)
    }
  }

  const currentBalance = statement?.account.balance ?? 0

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (error || !statement) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-destructive">{error ?? t('errors.SAVINGS_NOT_FOUND')}</p>
        <Button variant="outline" size="sm" onClick={() => router.push(`/${locale}/savings`)}>
          {t('detail.back')}
        </Button>
      </div>
    )
  }

  const { account, entries } = statement

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-6">
      {/* Back + actions */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => router.push(`/${locale}/savings`)}
        >
          ← {t('detail.back')}
        </button>
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={() => setDepositOpen(true)}>
            {t('detail.add_deposit')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={currentBalance <= 0}
            onClick={() => setRefundOpen(true)}
          >
            {t('detail.refund_balance')}
          </Button>
          <button
            type="button"
            title={t('detail.share_statement')}
            disabled={sharing}
            onClick={() => void handleShare()}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            {sharing ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Share2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Account header */}
      <div className="rounded-xl border border-border/60 bg-card p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t('detail.account_number')}
            </p>
            <p className="mt-1 font-mono text-lg font-semibold text-foreground">
              {account.accountNumber}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t('detail.balance')}
            </p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {formatCurrency(account.balance, businessCurrency)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-border/40 pt-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">{t('detail.customer')}</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {account.customerName ?? '—'}
            </p>
            {account.customerPhone ? (
              <p className="text-xs text-muted-foreground">{account.customerPhone}</p>
            ) : null}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('detail.total_deposited')}</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {formatCurrency(account.totalDeposited, businessCurrency)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('detail.total_refunded')}</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {formatCurrency(account.totalRefunded, businessCurrency)}
            </p>
          </div>
          {account.taggedProducts && account.taggedProducts.length > 0 ? (
            <div>
              <p className="text-xs text-muted-foreground">{t('detail.tagged_products')}</p>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {account.taggedProducts.map((tp) => (
                  <span
                    key={tp.productId}
                    className="rounded bg-secondary px-1.5 py-0.5 text-xs text-foreground"
                  >
                    {tp.productName}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Statement table */}
      <div className="flex-1 overflow-auto">
        {entries.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            {t('detail.no_transactions')}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 pr-4">{t('detail.date')}</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">{t('detail.method')}</th>
                <th className="pb-2 pr-4">{t('detail.notes')}</th>
                <th className="pb-2 pr-4 text-right">{t('detail.amount')}</th>
                <th className="pb-2 text-right">{t('detail.running_balance')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-border/30 transition-colors hover:bg-secondary/20"
                >
                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                    {formatDateTime(entry.occurredAt)}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                        entry.direction === 'inbound'
                          ? 'bg-[rgb(var(--chart-2))]/15 text-[rgb(var(--chart-2))]'
                          : 'bg-destructive/15 text-destructive',
                      )}
                    >
                      {entry.type === 'deposit'
                        ? t('detail.transaction_type_deposit')
                        : entry.type === 'refund'
                          ? t('detail.transaction_type_refund')
                          : entry.type === 'sale'
                            ? t('detail.transaction_type_sale')
                            : t('detail.transaction_type_voided_sale')}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-xs text-muted-foreground">{entry.method ?? '—'}</td>
                  <td className="max-w-[180px] truncate py-3 pr-4 text-xs text-muted-foreground">
                    {entry.notes || '—'}
                  </td>
                  <td
                    className={cn(
                      'py-3 pr-4 text-right font-medium',
                      entry.direction === 'inbound'
                        ? 'text-[rgb(var(--chart-2))]'
                        : 'text-destructive',
                    )}
                  >
                    {entry.direction === 'inbound' ? '+' : '-'}
                    {formatCurrency(entry.amount, businessCurrency)}
                  </td>
                  <td className="py-3 text-right font-mono text-sm text-foreground">
                    {formatCurrency(entry.runningBalance, businessCurrency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <SavingsDepositDialog
        businessId={businessId ?? ''}
        userId={userId ?? null}
        open={depositOpen}
        onOpenChange={setDepositOpen}
        account={account}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />

      <SavingsRefundDialog
        businessId={businessId ?? ''}
        userId={userId ?? null}
        open={refundOpen}
        onOpenChange={setRefundOpen}
        account={account}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  )
}
