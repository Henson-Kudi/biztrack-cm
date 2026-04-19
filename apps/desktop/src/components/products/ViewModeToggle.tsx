'use client'

import { Button } from '@biztrack/ui'
import { cn } from '@/lib/utils'

type ViewMode = 'list' | 'grid'

type ViewModeToggleProps = {
  value: ViewMode
  onChange: (value: ViewMode) => void
  listLabel: string
  gridLabel: string
}

export function ViewModeToggle({
  value,
  onChange,
  listLabel,
  gridLabel,
}: ViewModeToggleProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background p-1">
      <Button
        type="button"
        variant={value === 'list' ? 'secondary' : 'ghost'}
        size="sm"
        onClick={() => onChange('list')}
        className={cn(
          'rounded-full px-3',
          value === 'list' ? 'shadow-sm' : 'text-muted-foreground',
        )}
      >
        <ListIcon />
        <span>{listLabel}</span>
      </Button>
      <Button
        type="button"
        variant={value === 'grid' ? 'secondary' : 'ghost'}
        size="sm"
        onClick={() => onChange('grid')}
        className={cn(
          'rounded-full px-3',
          value === 'grid' ? 'shadow-sm' : 'text-muted-foreground',
        )}
      >
        <GridIcon />
        <span>{gridLabel}</span>
      </Button>
    </div>
  )
}

function ListIcon() {
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
      <path d="M6 5h10" />
      <path d="M6 10h10" />
      <path d="M6 15h10" />
      <circle cx="3" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="15" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function GridIcon() {
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
      <rect x="3" y="3" width="5" height="5" rx="1" />
      <rect x="12" y="3" width="5" height="5" rx="1" />
      <rect x="3" y="12" width="5" height="5" rx="1" />
      <rect x="12" y="12" width="5" height="5" rx="1" />
    </svg>
  )
}
