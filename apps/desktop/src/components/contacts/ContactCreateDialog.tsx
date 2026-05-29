'use client'

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Button, Input, NumberInput, PhoneInput } from '@biztrack/ui'
import { ContactType, DebtDirection, Resource } from '@biztrack/types'
import { toast } from 'sonner'
import { getPermissionAccessFromState } from '@/lib/plan-access'
import { getApiErrorMessage } from '@/services/api-response'
import {
  ContactLocalError,
  createContactByTypeLocal,
  updateContactLocal,
  upsertOpeningBalanceLocal,
  type LocalContactRecord,
} from '@/services/contacts.local'
import { usePlanStore } from '@/stores/plan.store'
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

type ContactCreateDialogProps = {
  businessId: string | null | undefined
  createdById?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (contact: LocalContactRecord) => void
  contact?: LocalContactRecord | null
  quotaReached?: boolean
}

type ContactCreateFormState = {
  type: ContactType
  name: string
  phone: string
  phoneAlt: string
  address: string
  notes: string
}

type ObState = {
  receivableAmount: string
  receivableDate: string
  payableAmount: string
  payableDate: string
}

const textareaClassName =
  'block min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/20'

function getTodayIso() {
  return new Date().toISOString().slice(0, 10)
}

function createDefaultFormState(): ContactCreateFormState {
  return {
    type: ContactType.CUSTOMER,
    name: '',
    phone: '',
    phoneAlt: '',
    address: '',
    notes: '',
  }
}

function createDefaultObState(): ObState {
  const today = getTodayIso()
  return { receivableAmount: '', receivableDate: today, payableAmount: '', payableDate: today }
}

function createFormStateFromContact(contact?: LocalContactRecord | null): ContactCreateFormState {
  if (!contact) {
    return createDefaultFormState()
  }

  return {
    type: contact.type,
    name: contact.name,
    phone: contact.phone ?? '',
    phoneAlt: contact.phoneAlt ?? '',
    address: contact.address ?? '',
    notes: contact.notes ?? '',
  }
}

export function ContactCreateDialog({
  businessId,
  createdById,
  open,
  onOpenChange,
  onSaved,
  contact = null,
  quotaReached = false,
}: ContactCreateDialogProps) {
  const t = useTranslations('app.contacts')
  const planState = usePlanStore((state) => state.current)
  const isEditMode = Boolean(contact)
  const [form, setForm] = useState<ContactCreateFormState>(createDefaultFormState())
  const [ob, setOb] = useState<ObState>(createDefaultObState())
  const [saving, setSaving] = useState(false)

  const canManageOb = planState
    ? (getPermissionAccessFromState(planState, Resource.OPENING_BALANCES).allowed ?? false)
    : false
  const showReceivable = form.type !== ContactType.SUPPLIER
  const showPayable = form.type !== ContactType.CUSTOMER

  useEffect(() => {
    setForm(open ? createFormStateFromContact(contact) : createDefaultFormState())
    setOb(createDefaultObState())
    setSaving(false)
  }, [contact, open])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!businessId || saving) {
      return
    }

    setSaving(true)

    try {
      const savedContact = isEditMode && contact
        ? await updateContactLocal(businessId, contact.id, {
            type: form.type,
            name: form.name,
            phone: form.phone,
            phoneAlt: form.phoneAlt,
            address: form.address,
            notes: form.notes,
          })
        : await createContactByTypeLocal(businessId, form.type, {
            name: form.name,
            phone: form.phone,
            phoneAlt: form.phoneAlt,
            address: form.address,
            notes: form.notes,
            createdById,
          })

      if (!isEditMode && canManageOb) {
        const userId = createdById ?? ''
        const obSaveErrors: Array<() => Promise<void>> = []

        if (showReceivable) {
          const amount = Number(ob.receivableAmount)
          if (amount > 0 && ob.receivableDate) {
            obSaveErrors.push(() =>
              upsertOpeningBalanceLocal(businessId, savedContact.id, userId, {
                direction: DebtDirection.RECEIVABLE,
                amount,
                asOfDate: ob.receivableDate,
              }).then(() => undefined),
            )
          }
        }

        if (showPayable) {
          const amount = Number(ob.payableAmount)
          if (amount > 0 && ob.payableDate) {
            obSaveErrors.push(() =>
              upsertOpeningBalanceLocal(businessId, savedContact.id, userId, {
                direction: DebtDirection.PAYABLE,
                amount,
                asOfDate: ob.payableDate,
              }).then(() => undefined),
            )
          }
        }

        if (obSaveErrors.length > 0) {
          try {
            await Promise.all(obSaveErrors.map((fn) => fn()))
          } catch {
            toast.warning(t('dialog.ob_save_error'))
          }
        }
      }

      toast.success(isEditMode ? t('dialog.updated') : t('dialog.saved'))
      onSaved(savedContact)
      onOpenChange(false)
    } catch (error) {
      toast.error(getContactCreateErrorMessage(error, t))
    } finally {
      setSaving(false)
    }
  }

  const showObSection = !isEditMode && canManageOb

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-4rem)] max-w-2xl" closeLabel={t('dialog.cancel')}>
        <DialogHeader>
          <DialogTitle>{isEditMode ? t('dialog.edit_title') : t('dialog.title')}</DialogTitle>
          <DialogDescription>
            {isEditMode ? t('dialog.edit_description') : t('dialog.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto space-y-5 px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 sm:col-span-2">
              <span className="text-sm font-medium text-foreground">{t('dialog.type')}</span>
              <Select
                value={form.type}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, type: value as ContactType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ContactType.CUSTOMER}>{t('dialog.customer')}</SelectItem>
                  <SelectItem value={ContactType.SUPPLIER}>{t('dialog.supplier')}</SelectItem>
                  <SelectItem value={ContactType.BOTH}>{t('dialog.both')}</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <Input
              autoFocus
              label={t('dialog.full_name')}
              value={form.name}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
            />

            <label className="space-y-1">
              <span className="text-sm font-medium text-foreground">{t('dialog.phone')}</span>
              <PhoneInput
                value={form.phone}
                onChange={(value?: string) =>
                  setForm((current) => ({ ...current, phone: value ?? '' }))
                }
                className="rounded-xl"
                placeholder="+237 6XX XXX XXX"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium text-foreground">
                {t('dialog.alternate_phone')}
              </span>
              <PhoneInput
                value={form.phoneAlt}
                onChange={(value?: string) =>
                  setForm((current) => ({ ...current, phoneAlt: value ?? '' }))
                }
                className="rounded-xl"
                placeholder="+237 6XX XXX XXX"
              />
            </label>

            <Input
              label={t('dialog.address')}
              value={form.address}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setForm((current) => ({ ...current, address: event.target.value }))
              }
            />
          </div>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-foreground">{t('dialog.notes')}</span>
            <textarea
              className={textareaClassName}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder={t('dialog.notes_placeholder')}
            />
          </label>

          {showObSection ? (
            <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
              <div>
                <p className="text-sm font-medium text-foreground">{t('dialog.ob_title')}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('dialog.ob_hint')}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {showReceivable ? (
                  <>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t('dialog.ob_receivable_label')}
                      </span>
                      <NumberInput
                        value={ob.receivableAmount}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setOb((current) => ({ ...current, receivableAmount: e.target.value }))
                        }
                        placeholder={t('dialog.ob_amount_placeholder')}
                        min="0"
                        step="1"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t('dialog.ob_date_label')}
                      </span>
                      <Input
                        type="date"
                        value={ob.receivableDate}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setOb((current) => ({ ...current, receivableDate: e.target.value }))
                        }
                      />
                    </label>
                  </>
                ) : null}

                {showPayable ? (
                  <>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t('dialog.ob_payable_label')}
                      </span>
                      <NumberInput
                        value={ob.payableAmount}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setOb((current) => ({ ...current, payableAmount: e.target.value }))
                        }
                        placeholder={t('dialog.ob_amount_placeholder')}
                        min="0"
                        step="1"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t('dialog.ob_date_label')}
                      </span>
                      <Input
                        type="date"
                        value={ob.payableDate}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setOb((current) => ({ ...current, payableDate: e.target.value }))
                        }
                      />
                    </label>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              {t('dialog.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={saving || form.name.trim().length === 0 || form.phone.trim().length === 0 || (quotaReached && !isEditMode)}
            >
              {saving
                ? isEditMode
                  ? t('dialog.updating')
                  : t('dialog.saving')
                : isEditMode
                  ? t('dialog.update')
                  : t('dialog.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function getContactCreateErrorMessage(
  error: unknown,
  t: ReturnType<typeof useTranslations<'app.contacts'>>,
) {
  if (error instanceof ContactLocalError) {
    switch (error.code) {
      case 'CONTACT_NAME_REQUIRED':
        return t('dialog.name_required')
      case 'CONTACT_PHONE_REQUIRED':
        return t('dialog.phone_required')
      case 'CONTACT_PHONE_INVALID':
        return t('dialog.phone_invalid')
      case 'CONTACT_ALREADY_EXISTS':
        return t('dialog.contact_exists')
      case 'CONTACT_TYPE_CONFLICT':
        return t('dialog.type_conflict')
      case 'CONTACTS_QUOTA_REACHED':
        return t('dialog.contacts_quota_reached')
      default:
        break
    }
  }

  return getApiErrorMessage(error, t('dialog.load_error'))
}
