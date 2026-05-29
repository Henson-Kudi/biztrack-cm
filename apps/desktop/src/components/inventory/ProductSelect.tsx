'use client'

import { useDeferredValue, useEffect, useState } from 'react'
import { Spinner } from '@biztrack/ui'
import { listProductsLocal } from '@/services/products.local'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export type ProductOption = {
  id: string
  name: string
  sellingPrice: number
  sku?: string | null
  category?: { name: string } | null
  currentStock?: number | null
  trackInventory?: boolean
}

export type ProductSelectCopy = {
  placeholder: string
  searchPlaceholder: string
  noResults: string
  inStock: string
  outOfStock: string
}

type Props = {
  businessId: string
  value: ProductOption | null
  onChange: (product: ProductOption | null) => void
  copy: ProductSelectCopy
  disabled?: boolean
  error?: string
  required?: boolean
}

function formatPrice(price: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat().format(Math.round(price))}`
}

export function ProductSelect({ businessId, value, onChange, copy, disabled, error, required }: Props) {
  const businessCurrency = useAuthStore((s) => s.businessCurrency)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [results, setResults] = useState<ProductOption[]>([])
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

    listProductsLocal(businessId, {
      page: 1,
      limit: 50,
      search: deferredSearch.trim() || undefined,
      sortBy: 'name',
      sortOrder: 'ASC',
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

  return (
    <div className="w-full">
      <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'flex min-h-[2.5rem] w-full items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-left text-sm shadow-sm transition-colors',
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
                <PackageIcon className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{value.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatPrice(value.sellingPrice, businessCurrency)}
                  </span>
                </span>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation()
                    onChange(null)
                  }}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Clear product"
                >
                  <XIcon />
                </button>
              </>
            ) : (
              <>
                <PackageIcon className="shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-muted-foreground">
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

              {!loading && results.length === 0 ? (
                <CommandEmpty>{copy.noResults}</CommandEmpty>
              ) : null}

              <CommandGroup>
                {results.map((product) => {
                  const isSelected = value?.id === product.id
                  const stockLabel =
                    product.trackInventory && product.currentStock != null
                      ? product.currentStock > 0
                        ? `${product.currentStock} ${copy.inStock}`
                        : copy.outOfStock
                      : null
                  const isOutOfStock = product.trackInventory && (product.currentStock ?? 1) <= 0

                  return (
                    <CommandItem
                      key={product.id}
                      value={`${product.name} ${product.sku ?? ''}`}
                      onSelect={() => {
                        onChange(product)
                        setOpen(false)
                      }}
                      className="gap-3 py-2.5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium">{product.name}</span>
                          <span className="shrink-0 text-xs font-semibold text-foreground">
                            {formatPrice(product.sellingPrice, businessCurrency)}
                          </span>
                        </span>
                        {(product.category?.name || stockLabel) && (
                          <span className="mt-0.5 flex items-center gap-2">
                            {product.category?.name && (
                              <span className="truncate text-xs text-muted-foreground">
                                {product.category.name}
                              </span>
                            )}
                            {stockLabel && (
                              <span
                                className={cn(
                                  'ml-auto shrink-0 text-xs font-medium',
                                  isOutOfStock
                                    ? 'text-destructive'
                                    : 'text-emerald-600 dark:text-emerald-400',
                                )}
                              >
                                {stockLabel}
                              </span>
                            )}
                          </span>
                        )}
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

function PackageIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M2.5 5.5 10 2l7.5 3.5v9L10 18 2.5 14.5v-9Z" />
      <path d="M10 2v16M2.5 5.5l7.5 4 7.5-4" />
      <path d="M6.25 3.75 13.75 7.5" />
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
      width="10"
      height="10"
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
