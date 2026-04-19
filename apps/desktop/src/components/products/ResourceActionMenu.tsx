'use client'

import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type ResourceActionItem = {
  label: string
  onSelect: () => void | Promise<void>
  disabled?: boolean
  tone?: 'default' | 'danger'
}

type ResourceActionMenuProps = {
  label: string
  items: ResourceActionItem[]
  orientation?: 'horizontal' | 'vertical'
}

export function ResourceActionMenu({
  label,
  items,
  orientation = 'horizontal',
}: ResourceActionMenuProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
        >
          {orientation === 'vertical' ? <MoreVerticalIcon /> : <MoreHorizontalIcon />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <div className="space-y-1">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) {
                  return
                }

                item.onSelect()
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors',
                item.disabled
                  ? 'cursor-not-allowed text-muted-foreground/50'
                  : 'text-foreground hover:bg-accent hover:text-accent-foreground',
                item.tone === 'danger' && !item.disabled && 'text-red-600 hover:bg-red-50 hover:text-red-700',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function MoreHorizontalIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="4" cy="10" r="1.6" />
      <circle cx="10" cy="10" r="1.6" />
      <circle cx="16" cy="10" r="1.6" />
    </svg>
  )
}

function MoreVerticalIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="10" cy="4" r="1.6" />
      <circle cx="10" cy="10" r="1.6" />
      <circle cx="10" cy="16" r="1.6" />
    </svg>
  )
}
