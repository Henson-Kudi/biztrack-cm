'use client'

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Spinner } from '@biztrack/ui'
import { useTranslations } from 'next-intl'
import { ContactPickerDialog } from '@/components/contacts/ContactPickerDialog'
import {
  createSupplierContactLocal,
  listSupplierContactsLocal,
  type LocalContactRecord,
} from '@/services/contacts.local'
import { cn } from '@/lib/utils'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

type SupplierContactSelectProps = {
  businessId: string | null | undefined
  supplier: LocalContactRecord | null
  onSelect: (supplier: LocalContactRecord | null) => void
}

function getSupplierCreatePrefill(search: string) {
  const trimmed = search.trim()
  if (!trimmed) {
    return {}
  }

  const compact = trimmed.replace(/[\s()+-]/g, '')
  if (/^\+?[\d\s()-]{5,}$/.test(trimmed) && compact.replace(/\D/g, '').length >= 5) {
    return { phone: trimmed }
  }

  return { name: trimmed }
}

export function SupplierContactSelect({
  businessId,
  supplier,
  onSelect,
}: SupplierContactSelectProps) {
  const t = useTranslations('app.inventory')
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [suppliers, setSuppliers] = useState<LocalContactRecord[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !businessId) {
      return
    }

    const currentBusinessId = businessId
    let active = true

    async function loadSuppliers() {
      setLoading(true)
      try {
        const result = await listSupplierContactsLocal(currentBusinessId, {
          page: 1,
          limit: 25,
          search: deferredSearch.trim() || undefined,
          sortBy: 'updatedAt',
          sortOrder: 'DESC',
          isActive: true,
        })

        if (!active) {
          return
        }

        setSuppliers(result.data)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadSuppliers()

    return () => {
      active = false
    }
  }, [businessId, deferredSearch, open])

  useEffect(() => {
    if (!open) {
      setSearch('')
      setSuppliers([])
      setLoading(false)
    }
  }, [open])

  const createPrefill = useMemo(() => getSupplierCreatePrefill(search), [search])

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{t('restock.supplier_contact')}</p>
          {supplier ? (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              {t('restock.clear_supplier')}
            </button>
          ) : null}
        </div>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-input bg-background px-3 py-2 text-left text-sm text-foreground shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring',
                !supplier && 'text-muted-foreground',
              )}
            >
              <span className="min-w-0 truncate">
                {supplier
                  ? supplier.phone
                    ? `${supplier.name} - ${supplier.phone}`
                    : supplier.name
                  : t('restock.search_supplier')}
              </span>
              <svg
                viewBox="0 0 20 20"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0 text-muted-foreground"
              >
                <path d="m5 7 5 6 5-6" />
              </svg>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                value={search}
                onValueChange={setSearch}
                placeholder={t('restock.search_supplier')}
              />
              <CommandList>
                {loading && suppliers.length === 0 ? (
                  <div className="flex items-center justify-center py-6">
                    <Spinner size="sm" />
                  </div>
                ) : null}

                {!loading && suppliers.length === 0 ? (
                  <CommandEmpty>{t('restock.no_suppliers_found')}</CommandEmpty>
                ) : null}

                <CommandGroup>
                  <CommandItem
                    value={`add ${search}`}
                    onSelect={() => {
                      setOpen(false)
                      setCreateOpen(true)
                    }}
                  >
                    <PlusIcon />
                    <span className="truncate">
                      {search.trim()
                        ? `${t('restock.add_new')} "${search.trim()}"`
                        : t('restock.add_new')}
                    </span>
                  </CommandItem>

                  {suppliers.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`${item.name} ${item.phone ?? ''}`}
                      onSelect={() => {
                        onSelect(item)
                        setOpen(false)
                      }}
                    >
                      <span className="truncate">{item.name}</span>
                      <span className="ml-auto truncate text-xs text-muted-foreground">
                        {item.phone || t('restock.no_supplier_phone')}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <p className="text-xs text-muted-foreground">{t('restock.supplier_contact_hint')}</p>
      </div>

      <ContactPickerDialog
        businessId={businessId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSelect={(contact) => {
          onSelect(contact)
          setCreateOpen(false)
        }}
        listContacts={listSupplierContactsLocal}
        createContact={createSupplierContactLocal}
        initialView="create"
        allowSelectView={false}
        initialFormState={createPrefill}
        copy={{
          title: t('restock.add_new'),
          description: t('restock.supplier_dialog_description'),
          searchPlaceholder: t('restock.search_supplier'),
          noResults: t('restock.no_suppliers_found'),
          noPhone: t('restock.no_supplier_phone'),
          addNew: t('restock.add_new'),
          backToList: t('restock.back_to_list'),
          fullName: t('restock.supplier_full_name'),
          phone: t('restock.supplier_phone'),
          alternatePhone: t('restock.alternate_phone'),
          address: t('restock.address'),
          notes: t('restock.notes'),
          notesPlaceholder: t('restock.notes_placeholder'),
          save: t('restock.save_supplier'),
          saving: t('restock.submitting'),
          cancel: t('dialog.close_action'),
          saved: t('restock.supplier_saved'),
          loadError: t('restock.supplier_load_error'),
          phoneRequired: t('restock.phone_required'),
          phoneInvalid: t('restock.phone_invalid'),
          nameRequired: t('restock.name_required'),
          contactExists: t('restock.contact_exists'),
        }}
      />
    </>
  )
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M10 4v12" />
      <path d="M4 10h12" />
    </svg>
  )
}
