'use client'

import { useEffect, useMemo, useRef, useState, type WheelEvent } from 'react'
import type { PaginatedResult } from '@biztrack/types'
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

export type CommandSelectOption = {
  value: string
  label: string
  imageUrl?: string | null
  keywords?: string[]
}

const EMPTY_OPTIONS: CommandSelectOption[] = []

type LoadOptionsParams = {
  search: string
  page: number
}

type CommandSelectProps = {
  value: string
  options?: CommandSelectOption[]
  staticOptions?: CommandSelectOption[]
  selectedOption?: CommandSelectOption | null
  placeholder: string
  searchPlaceholder: string
  emptyMessage: string
  loadingMessage?: string
  loadMoreLabel?: string
  disabled?: boolean
  invalid?: boolean
  required?: boolean
  showAvatar?: boolean
  debounceMs?: number
  loadOptions?: (params: LoadOptionsParams) => Promise<PaginatedResult<CommandSelectOption>>
  onChange: (value: string, option?: CommandSelectOption | null) => void
  onBlur?: () => void
}

function OptionAvatar({ option }: { option: CommandSelectOption }) {
  if (option.imageUrl) {
    return (
      <img
        src={option.imageUrl}
        alt={option.label}
        className="h-8 w-8 shrink-0 rounded-xl object-cover"
      />
    )
  }

  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
      {option.label
        .replace(/[^a-zA-Z]+/g, '') // replace special characters and numbers with empty string
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')}
    </span>
  )
}

function dedupeOptions(options: CommandSelectOption[]) {
  const seen = new Set<string>()

  return options.filter((option) => {
    if (seen.has(option.value)) {
      return false
    }

    seen.add(option.value)
    return true
  })
}

function getOptionSearchValue(option: CommandSelectOption) {
  return [option.label, option.value, ...(option.keywords ?? [])].join(' ')
}

function useDebouncedValue(value: string, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value)
    }, delayMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [delayMs, value])

  return debouncedValue
}

export function CommandSelect({
  value,
  options = EMPTY_OPTIONS,
  staticOptions = EMPTY_OPTIONS,
  selectedOption,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  loadingMessage = 'Loading...',
  loadMoreLabel = 'Load more',
  disabled = false,
  invalid = false,
  required = false,
  showAvatar = true,
  debounceMs = 250,
  loadOptions,
  onChange,
  onBlur,
}: CommandSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [asyncOptions, setAsyncOptions] = useState<CommandSelectOption[]>(options)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const debouncedSearch = useDebouncedValue(search, debounceMs)

  useEffect(() => {
    if (!loadOptions) {
      setAsyncOptions(options)
    }
  }, [loadOptions, options])

  useEffect(() => {
    if (!open || !loadOptions) {
      return
    }

    const loadOptionsFn = loadOptions
    let active = true

    async function fetchOptions() {
      setLoading(true)

      try {
        const result = await loadOptionsFn({
          search: debouncedSearch.trim(),
          page,
        })

        if (!active) {
          return
        }

        setAsyncOptions((current) =>
          page === 1 ? result.data : dedupeOptions([...current, ...result.data]),
        )
        setTotalPages(result.totalPages)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void fetchOptions()

    return () => {
      active = false
    }
  }, [debouncedSearch, loadOptions, open, page])

  useEffect(() => {
    if (!open) {
      setSearch('')
      setPage(1)

      if (loadOptions) {
        setAsyncOptions(EMPTY_OPTIONS)
        setTotalPages(1)
      }
    }
  }, [loadOptions, open])

  useEffect(() => {
    if (!open || !loadOptions) {
      return
    }

    setPage(1)
  }, [debouncedSearch, loadOptions, open])

  const resolvedOptions = useMemo(
    () =>
      dedupeOptions(
        loadOptions ? [...staticOptions, ...asyncOptions] : [...staticOptions, ...options],
      ),
    [asyncOptions, loadOptions, options, staticOptions],
  )
  const resolvedSelectedOption = useMemo(
    () =>
      selectedOption ??
      resolvedOptions.find((option) => option.value === value) ??
      staticOptions.find((option) => option.value === value) ??
      options.find((option) => option.value === value) ??
      null,
    [options, resolvedOptions, selectedOption, staticOptions, value],
  )
  const hasMore = loadOptions ? page < totalPages : false

  const handleWheelCapture = (event: WheelEvent<HTMLDivElement>) => {
    const list = listRef.current
    if (!list || list.scrollHeight <= list.clientHeight || event.deltaY === 0) {
      return
    }

    const maxScrollTop = list.scrollHeight - list.clientHeight
    const nextScrollTop = Math.max(0, Math.min(list.scrollTop + event.deltaY, maxScrollTop))

    if (nextScrollTop === list.scrollTop) {
      return
    }

    event.preventDefault()
    list.scrollTop = nextScrollTop
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)

        if (!nextOpen) {
          onBlur?.()
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-required={required}
          disabled={disabled}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2 text-left text-sm text-foreground shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
            invalid ? 'border-destructive text-destructive' : 'border-input',
          )}
        >
          <span className="flex min-w-0 items-center gap-3">
            {showAvatar && resolvedSelectedOption ? (
              <OptionAvatar option={resolvedSelectedOption} />
            ) : null}
            <span className={cn('truncate', !resolvedSelectedOption && 'text-muted-foreground')}>
              {resolvedSelectedOption?.label ?? placeholder}
            </span>
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
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        onWheelCapture={handleWheelCapture}
      >
        <Command shouldFilter>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={searchPlaceholder}
          />
          <CommandList ref={listRef}>
            {loading && resolvedOptions.length === 0 ? <CommandEmpty>{loadingMessage}</CommandEmpty> : null}
            {!loading ? <CommandEmpty>{emptyMessage}</CommandEmpty> : null}

            <CommandGroup>
              {resolvedOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={getOptionSearchValue(option)}
                  onSelect={() => {
                    onChange(option.value, option)
                    setOpen(false)
                  }}
                >
                  {showAvatar ? <OptionAvatar option={option} /> : null}
                  <span className="truncate">{option.label}</span>
                  <svg
                    viewBox="0 0 20 20"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className={cn(
                      'ml-auto shrink-0',
                      option.value === value ? 'opacity-100' : 'opacity-0',
                    )}
                  >
                    <path d="m4 10 4 4 8-8" />
                  </svg>
                </CommandItem>
              ))}
            </CommandGroup>

            {hasMore ? (
              <div className="border-t border-border p-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={loading}
                  className="flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? loadingMessage : loadMoreLabel}
                </button>
              </div>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
