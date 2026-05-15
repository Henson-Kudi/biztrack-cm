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
        <div className="mb-4">
          <div className="space-y-1 flex flex-wrap items-center justify-between gap-3">
            {title ? <h3 className="text-base font-semibold text-card-foreground">{title}</h3> : null}
            {action ? <div>{action}</div> : null}
          </div>
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
        </div>
      )}
      {children}
    </section>
  )
}
