'use client'

import { useDeferredValue, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Button, Input, NumberInput, PhoneInput, Spinner } from '@biztrack/ui'
import { DebtDirection, Resource, type ContactListResult, type ContactsQuery } from '@biztrack/types'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/services/api-response'
import { getPermissionAccessFromState } from '@/lib/plan-access'
import {
  ContactLocalError,
  upsertOpeningBalanceLocal,
  type LocalContactCreateInput,
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

type ContactPickerDialogCopy = {
  title: string
  description: string
  searchPlaceholder: string
  noResults: string
  noPhone: string
  addNew: string
  backToList: string
  fullName: string
  phone: string
  alternatePhone: string
  address: string
  notes: string
  notesPlaceholder?: string
  save: string
  saving: string
  cancel: string
  saved: string
  loadError: string
  phoneRequired: string
  phoneInvalid: string
  nameRequired: string
  contactExists: string
  obTitle?: string
  obHint?: string
  obAmountLabel?: string
  obAmountPlaceholder?: string
  obDateLabel?: string
  obSaveError?: string
}

type ContactPickerDialogProps = {
  businessId: string | null | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedContactId?: string | null
  createdById?: string | null
  onSelect: (contact: LocalContactRecord) => void
  listContacts: (
    businessId: string,
    query: Omit<ContactsQuery, 'type'>,
  ) => Promise<ContactListResult>
  createContact: (
    businessId: string,
    input: LocalContactCreateInput,
  ) => Promise<LocalContactRecord>
  initialView?: ContactDialogView
  allowSelectView?: boolean
  initialFormState?: Partial<ContactFormState>
  openingBalanceDirection?: DebtDirection | null
  copy: ContactPickerDialogCopy
}

type ContactDialogView = 'select' | 'create'

type ContactFormState = {
  name: string
  phone: string
  phoneAlt: string
  address: string
  notes: string
}

const textareaClassName =
  'block min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/20'

function getTodayIso() {
  return new Date().toISOString().slice(0, 10)
}

function createDefaultFormState(initial?: Partial<ContactFormState>): ContactFormState {
  return {
    name: initial?.name ?? '',
    phone: initial?.phone ?? '',
    phoneAlt: initial?.phoneAlt ?? '',
    address: initial?.address ?? '',
    notes: initial?.notes ?? '',
  }
}

export function ContactPickerDialog({
  businessId,
  open,
  onOpenChange,
  selectedContactId,
  createdById,
  onSelect,
  listContacts,
  createContact,
  initialView = 'select',
  allowSelectView = true,
  initialFormState,
  openingBalanceDirection,
  copy,
}: ContactPickerDialogProps) {
  const resolvedInitialView: ContactDialogView = allowSelectView ? initialView : 'create'
  const [view, setView] = useState<ContactDialogView>(resolvedInitialView)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [contacts, setContacts] = useState<LocalContactRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ContactFormState>(createDefaultFormState(initialFormState))
  const [obAmount, setObAmount] = useState('')
  const [obDate, setObDate] = useState(getTodayIso())

  const planState = usePlanStore((state) => state.current)
  const canManageOb = planState
    ? (getPermissionAccessFromState(planState, Resource.OPENING_BALANCES).allowed ?? false)
    : false
  const showObSection = Boolean(openingBalanceDirection) && canManageOb

  useEffect(() => {
    if (!open) {
      setView(resolvedInitialView)
      setSearch('')
      setContacts([])
      setLoading(false)
      setSaving(false)
      setForm(createDefaultFormState(initialFormState))
      setObAmount('')
      setObDate(getTodayIso())
      return
    }

    setView(resolvedInitialView)
    setForm(createDefaultFormState(initialFormState))

    if (!businessId || resolvedInitialView !== 'select') {
      return
    }

    const currentBusinessId = businessId
    let active = true

    async function loadContacts() {
      setLoading(true)
      try {
        const result = await listContacts(currentBusinessId, {
          page: 1,
          limit: 50,
          search: deferredSearch.trim() || undefined,
          sortBy: 'updatedAt',
          sortOrder: 'DESC',
          isActive: true,
        })

        if (!active) {
          return
        }

        setContacts(result.data)
      } catch (error) {
        if (!active) {
          return
        }

        toast.error(getApiErrorMessage(error, copy.loadError))
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
  }, [
    allowSelectView,
    businessId,
    copy.loadError,
    deferredSearch,
    initialFormState,
    initialView,
    listContacts,
    open,
    resolvedInitialView,
  ])

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!businessId || saving) {
      return
    }

    setSaving(true)

    try {
      const contact = await createContact(businessId, {
        name: form.name,
        phone: form.phone,
        phoneAlt: form.phoneAlt,
        address: form.address,
        notes: form.notes,
        createdById,
      })

      if (showObSection && openingBalanceDirection && Number(obAmount) > 0 && obDate) {
        try {
          await upsertOpeningBalanceLocal(businessId, contact.id, createdById ?? '', {
            direction: openingBalanceDirection,
            amount: Number(obAmount),
            asOfDate: obDate,
          })
        } catch {
          if (copy.obSaveError) {
            toast.warning(copy.obSaveError)
          }
        }
      }

      toast.success(copy.saved)
      onSelect(contact)
      onOpenChange(false)
    } catch (error) {
      toast.error(getContactDialogErrorMessage(error, copy))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[calc(100vh-4rem)] max-w-2xl flex-col"
        closeLabel={copy.cancel}
      >
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {view === 'select' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex-1">
                  <input
                    autoFocus
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="block h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/20"
                    placeholder={copy.searchPlaceholder}
                  />
                </div>
                {allowSelectView ? (
                  <Button type="button" variant="primary" onClick={() => setView('create')}>
                    <PlusIcon />
                    <span>{copy.addNew}</span>
                  </Button>
                ) : null}
              </div>

              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Spinner size="sm" />
                  </div>
                ) : contacts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-background px-4 py-6 text-center text-sm text-muted-foreground">
                    {copy.noResults}
                  </div>
                ) : (
                  contacts.map((contact) => (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => {
                        onSelect(contact)
                        onOpenChange(false)
                      }}
                      className={[
                        'flex w-full items-center justify-between rounded-2xl border bg-card px-4 py-3 text-left transition hover:border-ring hover:bg-accent',
                        selectedContactId === contact.id
                          ? 'border-ring bg-accent'
                          : 'border-border',
                      ].join(' ')}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {contact.name}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {contact.phone || copy.noPhone}
                        </div>
                      </div>
                      <CheckIcon active={selectedContactId === contact.id} />
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              {allowSelectView ? (
                <div className="flex justify-end">
                  <Button type="button" variant="secondary" onClick={() => setView('select')}>
                    {copy.backToList}
                  </Button>
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">

                <Input
                  autoFocus
                  label={copy.fullName}
                  value={form.name}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
                <label className="space-y-1">
                  <span className="text-sm font-medium text-foreground">{copy.phone}</span>
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
                  <span className="text-sm font-medium text-foreground">{copy.alternatePhone}</span>
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
                  label={copy.address}
                  value={form.address}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setForm((current) => ({ ...current, address: event.target.value }))
                  }
                />
              </div>

              <label className="block space-y-1">
                <span className="text-sm font-medium text-foreground">{copy.notes}</span>
                <textarea
                  className={textareaClassName}
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, notes: event.target.value }))
                  }
                  placeholder={copy.notesPlaceholder}
                />
              </label>

              {showObSection ? (
                <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{copy.obTitle}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{copy.obHint}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        {copy.obAmountLabel}
                      </span>
                      <NumberInput
                        value={obAmount}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setObAmount(e.target.value)}
                        placeholder={copy.obAmountPlaceholder}
                        min="0"
                        step="1"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        {copy.obDateLabel}
                      </span>
                      <Input
                        type="date"
                        value={obDate}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setObDate(e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              ) : null}

              <DialogFooter className="px-0 pb-0">
                <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                  {copy.cancel}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={saving || form.name.trim().length === 0 || form.phone.trim().length === 0}
                >
                  {saving ? copy.saving : copy.save}
                </Button>
              </DialogFooter>
            </form>
          )}
        </div>

        {view === 'select' ? (
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              {copy.cancel}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function getContactDialogErrorMessage(error: unknown, copy: ContactPickerDialogCopy) {
  if (error instanceof ContactLocalError) {
    switch (error.code) {
      case 'CONTACT_NAME_REQUIRED':
        return copy.nameRequired
      case 'CONTACT_PHONE_REQUIRED':
        return copy.phoneRequired
      case 'CONTACT_PHONE_INVALID':
        return copy.phoneInvalid
      case 'CONTACT_ALREADY_EXISTS':
        return copy.contactExists
      default:
        break
    }
  }

  return getApiErrorMessage(error, copy.loadError)
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

function CheckIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={active ? 'shrink-0 text-[#042C53]' : 'shrink-0 text-muted-foreground'}
    >
      <path d="m4 10 4 4 8-8" />
    </svg>
  )
}
