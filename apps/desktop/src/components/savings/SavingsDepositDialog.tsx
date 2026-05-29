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
import { CustomerContactDialog } from '@/components/contacts/CustomerContactDialog'
import { CustomerSelect, type CustomerOption } from '@/components/contacts/CustomerSelect'
import {
  createOrDepositSavingsLocal,
  recordSavingsDepositLocal,
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
  account?: LocalSavingsAccount | null
}

export function SavingsDepositDialog({
  businessId,
  userId,
  open,
  onOpenChange,
  onSuccess,
  account,
}: Props) {
  const t = useTranslations('app.savings')
  const tSell = useTranslations('app.sell')

  const [addNewOpen, setAddNewOpen] = useState(false)
  const [selectedContact, setSelectedContact] = useState<CustomerOption | null>(
    account
      ? { id: account.customerId, name: account.customerName ?? '', phone: account.customerPhone ?? null }
      : null,
  )
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.CASH)
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    if (!account) setSelectedContact(null)
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
    if (!account && !selectedContact) {
      toast.error(t('errors.SAVINGS_CUSTOMER_REQUIRED'))
      return
    }
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error(t('errors.SAVINGS_AMOUNT_INVALID'))
      return
    }

    setSubmitting(true)

    try {
      if (account) {
        await recordSavingsDepositLocal(businessId, account.id, {
          amount: parsedAmount,
          method,
          mobileMoneyReference: reference || null,
          notes: notes || null,
          recordedById: userId,
          actorId: userId,
        })
      } else {
        await createOrDepositSavingsLocal(businessId, {
          customerId: selectedContact!.id,
          customerName: selectedContact!.name || null,
          customerPhone: selectedContact!.phone ?? null,
          initialDeposit: {
            type: 'deposit',
            direction: 'inbound',
            amount: parsedAmount,
            method,
            mobileMoneyReference: reference || null,
            notes: notes || null,
            recordedById: userId,
          },
          actorId: userId,
        })
      }

      toast.success(t('deposit.success'))
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
    <>
      <CustomerContactDialog
        businessId={businessId}
        open={addNewOpen}
        onOpenChange={setAddNewOpen}
        onSelect={(contact) => {
          setSelectedContact({ id: contact.id, name: contact.name ?? '', phone: contact.phone ?? null })
          setAddNewOpen(false)
        }}
      />

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('deposit.title')}</DialogTitle>
            <DialogDescription>
              {account
                ? t('deposit.existing_balance', {
                    balance: new Intl.NumberFormat('fr-CM', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    }).format(account.balance),
                  })
                : t('deposit.description')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 p-4">
            {!account ? (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  {t('deposit.customer_label')}
                </label>
                <CustomerSelect
                  businessId={businessId}
                  value={selectedContact}
                  onChange={setSelectedContact}
                  onAddNew={() => setAddNewOpen(true)}
                  required
                  copy={{
                    placeholder: t('deposit.pick_customer'),
                    searchPlaceholder: tSell('search_customer'),
                    noResults: tSell('no_customers_found'),
                    noPhone: tSell('no_phone_number'),
                    addNew: tSell('add_new'),
                  }}
                />
              </div>
            ) : null}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                {t('deposit.amount')}
              </label>
              <NumberInput
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                step="1"
                className="h-10 w-full rounded-xl px-3 text-sm"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                {t('deposit.method')}
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
                  {t('deposit.reference')}
                </label>
                <input
                  type="text"
                  className={inputClassName}
                  placeholder={t('deposit.reference_placeholder')}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
            ) : null}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                {t('deposit.notes')}
              </label>
              <textarea
                className={textareaClassName}
                placeholder={t('deposit.notes_placeholder')}
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
                {t('deposit.cancel')}
              </Button>
              <Button variant="primary" type="submit" disabled={submitting}>
                {submitting ? t('deposit.submitting') : t('deposit.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
