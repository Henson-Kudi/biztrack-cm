'use client'

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Button, Input, PhoneInput } from '@biztrack/ui'
import { ContactType } from '@biztrack/types'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/services/api-response'
import {
  ContactLocalError,
  createContactByTypeLocal,
  updateContactLocal,
  type LocalContactRecord,
} from '@/services/contacts.local'
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

const textareaClassName =
  'block min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/20'

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
  const isEditMode = Boolean(contact)
  const [form, setForm] = useState<ContactCreateFormState>(createDefaultFormState())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(open ? createFormStateFromContact(contact) : createDefaultFormState())
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

      toast.success(isEditMode ? t('dialog.updated') : t('dialog.saved'))
      onSaved(savedContact)
      onOpenChange(false)
    } catch (error) {
      toast.error(getContactCreateErrorMessage(error, t))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" closeLabel={t('dialog.cancel')}>
        <DialogHeader>
          <DialogTitle>{isEditMode ? t('dialog.edit_title') : t('dialog.title')}</DialogTitle>
          <DialogDescription>
            {isEditMode ? t('dialog.edit_description') : t('dialog.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
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

          <DialogFooter className="px-0 pb-0">
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
