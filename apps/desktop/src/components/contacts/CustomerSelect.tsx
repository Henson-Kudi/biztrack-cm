'use client'

import { useDeferredValue, useEffect, useState } from 'react'
import { Spinner } from '@biztrack/ui'
import { listCustomerContactsLocal } from '@/services/contacts.local'
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

export type CustomerOption = {
  id: string
  name: string
  phone?: string | null
}

export type CustomerSelectCopy = {
  placeholder: string
  searchPlaceholder: string
  noResults: string
  noPhone: string
  addNew?: string
}

type Props = {
  businessId: string
  value: CustomerOption | null
  onChange: (contact: CustomerOption | null) => void
  copy: CustomerSelectCopy
  required?: boolean
  error?: string
  disabled?: boolean
  onAddNew?: () => void
}

const AVATAR_PALETTE = [
  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
]

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0]![0]! + parts[1]![0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

function getAvatarColor(name: string): string {
  return AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length]!
}

export function CustomerSelect({
  businessId,
  value,
  onChange,
  copy,
  required,
  error,
  disabled,
  onAddNew,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [results, setResults] = useState<CustomerOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      setSearch('')
      setResults([])
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)

    listCustomerContactsLocal(businessId, {
      page: 1,
      limit: 25,
      search: deferredSearch.trim() || undefined,
      sortBy: 'updatedAt',
      sortOrder: 'DESC',
      isActive: true,
    })
      .then((result) => {
        if (active) {
          setResults(result.data)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [businessId, deferredSearch, open])

  const initials = value ? getInitials(value.name) : ''
  const avatarColor = value ? getAvatarColor(value.name) : ''

  return (
    <div className="w-full">
      <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'flex min-h-[2.75rem] w-full items-center gap-3 rounded-xl border bg-background px-3 py-2 text-left text-sm shadow-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:cursor-not-allowed disabled:opacity-50',
              error
                ? 'border-destructive focus-visible:ring-destructive/30'
                : open
                  ? 'border-ring ring-2 ring-ring/20'
                  : 'border-input hover:border-ring/50',
            )}
          >
            {value ? (
              <>
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    avatarColor,
                  )}
                >
                  {initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-foreground">{value.name}</span>
                  {value.phone && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {value.phone}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation()
                    onChange(null)
                  }}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Clear selection"
                >
                  <XIcon />
                </button>
              </>
            ) : (
              <>
                <PersonIcon className="shrink-0 text-muted-foreground" />
                <span className="flex-1 text-muted-foreground">
                  {copy.placeholder}
                  {required && (
                    <span className="ml-0.5 text-destructive" aria-hidden="true">
                      *
                    </span>
                  )}
                </span>
                <ChevronDownIcon className="shrink-0 text-muted-foreground" />
              </>
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder={copy.searchPlaceholder}
            />
            <CommandList>
              {loading && results.length === 0 ? (
                <div className="flex items-center justify-center py-6">
                  <Spinner size="sm" />
                </div>
              ) : null}

              {!loading && results.length === 0 && !onAddNew ? (
                <CommandEmpty>{copy.noResults}</CommandEmpty>
              ) : null}

              <CommandGroup>
                {onAddNew && copy.addNew ? (
                  <CommandItem
                    value={`__add__ ${search}`}
                    onSelect={() => {
                      setOpen(false)
                      onAddNew()
                    }}
                    className="gap-2.5"
                  >
                    <PlusCircleIcon className="shrink-0 text-primary" />
                    <span className="truncate font-medium text-primary">
                      {search.trim() ? `${copy.addNew} "${search.trim()}"` : copy.addNew}
                    </span>
                  </CommandItem>
                ) : null}

                {!loading && results.length === 0 && onAddNew ? (
                  <p className="px-2 py-2 text-xs text-muted-foreground">{copy.noResults}</p>
                ) : null}

                {results.map((contact) => {
                  const ci = getInitials(contact.name)
                  const cc = getAvatarColor(contact.name)
                  const isSelected = value?.id === contact.id
                  return (
                    <CommandItem
                      key={contact.id}
                      value={`${contact.name} ${contact.phone ?? ''}`}
                      onSelect={() => {
                        onChange(contact)
                        setOpen(false)
                      }}
                      className="gap-3 py-2"
                    >
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                          cc,
                        )}
                      >
                        {ci}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{contact.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {contact.phone || copy.noPhone}
                        </span>
                      </span>
                      {isSelected ? <CheckIcon className="shrink-0 text-primary" /> : null}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {error ? <p className="mt-1.5 text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

function PersonIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="10" cy="7" r="3.5" />
      <path d="M3 17c0-3.314 3.134-6 7-6s7 2.686 7 6" />
    </svg>
  )
}

function ChevronDownIcon({ className }: { className?: string }) {
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
      className={className}
    >
      <path d="m5 7 5 6 5-6" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

function PlusCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 7v6M7 10h6" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="m4 10 4 4 8-8" />
    </svg>
  )
}
