import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type SurfaceCardProps = {
  title?: string
  description?: string
  action?: ReactNode
  className?: string
  children: ReactNode
}

export function SurfaceCard({
  title,
  description,
  action,
  className,
  children,
}: SurfaceCardProps) {
  return (
    <section className={cn('rounded-2xl border border-border bg-card p-5 shadow-sm', className)}>
      {(title || description || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            {title ? <h3 className="text-base font-semibold text-card-foreground">{title}</h3> : null}
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action ? <div>{action}</div> : null}
        </div>
      )}
      {children}
    </section>
  )
}
