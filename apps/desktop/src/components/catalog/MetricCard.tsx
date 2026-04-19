import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type MetricTone = 'default' | 'accent' | 'warning' | 'danger'

type MetricCardProps = {
  label: string
  value: string
  hint?: string
  icon?: ReactNode
  tone?: MetricTone
}

const toneStyles: Record<MetricTone, string> = {
  default: 'border-border bg-card',
  accent: 'border-primary/20 bg-primary/5',
  warning: 'border-warning-200 bg-amber-50',
  danger: 'border-red-200 bg-red-50',
}

export function MetricCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: MetricCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4 shadow-sm transition-colors',
        toneStyles[tone],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </p>
          <p className={cn('text-2xl font-semibold text-foreground', tone === 'danger' && 'text-danger-400', tone === 'warning' && 'text-warning-400')}>{value}</p>
        </div>
        {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      </div>
      {hint ? <p className="mt-3 text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
