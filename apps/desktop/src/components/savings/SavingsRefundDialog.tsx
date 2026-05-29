'use client'

import { useState, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Button, NumberInput } from '@biztrack/ui'
import { PaymentMethod } from '@biztrack/types'
import { toast } from 'sonner'
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
import {
  recordSavingsRefundLocal,
  SavingsLocalError,
  type LocalSavingsAccount,
  type SavingsErrorCode,
} from '@/services/savings.local'
import { requestBackgroundSync } from '@/services/sync.local'

const MOMO_METHODS = new Set<PaymentMethod>([PaymentMethod.MTN_MOMO, PaymentMethod.ORANGE_MONEY])

const inputClassName =
  'block h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring'
const textareaClassName =
  'block min-h-20 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring'

type Props = {
  businessId: string
  userId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  account: LocalSavingsAccount
}

export function SavingsRefundDialog({
  businessId,
  userId,
  open,
  onOpenChange,
  onSuccess,
  account,
}: Props) {
  const t = useTranslations('app.savings')

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.CASH)
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setAmount('')
    setMethod(PaymentMethod.CASH)
    setReference('')
    setNotes('')
    setSubmitting(false)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  function resolveErrorMessage(err: unknown): string {
    if (err instanceof SavingsLocalError) {
      try {
        return t(`errors.${err.code as SavingsErrorCode}` as Parameters<typeof t>[0])
      } catch {
        return err.message
      }
    }
    return err instanceof Error ? err.message : t('load_error')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    const parsedAmount = parseFloat(amount)
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error(t('errors.SAVINGS_AMOUNT_INVALID'))
      return
    }
    if (parsedAmount > account.balance) {
      toast.error(t('errors.SAVINGS_INSUFFICIENT_BALANCE'))
      return
    }

    setSubmitting(true)

    try {
      await recordSavingsRefundLocal(businessId, account.id, {
        amount: parsedAmount,
        method,
        mobileMoneyReference: reference || null,
        notes: notes || null,
        recordedById: userId,
        actorId: userId,
      })

      toast.success(t('refund.success'))
      handleOpenChange(false)
      requestBackgroundSync()
      onSuccess()
    } catch (err) {
      toast.error(resolveErrorMessage(err))
      setSubmitting(false)
    }
  }

  const showMomoRef = MOMO_METHODS.has(method)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('refund.title')}</DialogTitle>
          <DialogDescription>
            {t('refund.available_balance', {
              balance: new Intl.NumberFormat('fr-CM', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              }).format(account.balance),
            })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              {t('refund.amount')}
            </label>
            <NumberInput
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="1"
              step="1"
              max={account.balance}
              className="h-10 w-full rounded-xl px-3 text-sm"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              {t('refund.method')}
            </label>
            <Select value={method} onValueChange={(val) => setMethod(val as PaymentMethod)}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PaymentMethod.CASH}>Cash</SelectItem>
                <SelectItem value={PaymentMethod.MTN_MOMO}>MTN MoMo</SelectItem>
                <SelectItem value={PaymentMethod.ORANGE_MONEY}>Orange Money</SelectItem>
                <SelectItem value={PaymentMethod.CARD}>Card</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showMomoRef ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                {t('refund.reference')}
              </label>
              <input
                type="text"
                className={inputClassName}
                placeholder={t('refund.reference_placeholder')}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          ) : null}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              {t('refund.notes')}
            </label>
            <textarea
              className={textareaClassName}
              placeholder={t('refund.notes_placeholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              {t('refund.cancel')}
            </Button>
            <Button type="submit" variant="danger" disabled={submitting}>
              {submitting ? t('refund.submitting') : t('refund.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
