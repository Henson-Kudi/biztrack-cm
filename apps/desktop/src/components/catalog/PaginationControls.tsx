import { Button } from '@biztrack/ui'

type PaginationControlsProps = {
  page: number
  totalPages: number
  pageLabel: string
  previousLabel: string
  nextLabel: string
  onPrevious: () => void
  onNext: () => void
}

export function PaginationControls({
  page,
  totalPages,
  pageLabel,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
}: PaginationControlsProps) {
  if (totalPages <= 1) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <p className="text-sm text-muted-foreground">
        {pageLabel.replace('{page}', String(page)).replace('{totalPages}', String(totalPages))}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={onPrevious} disabled={page <= 1}>
          {previousLabel}
        </Button>
        <Button variant="secondary" onClick={onNext} disabled={page >= totalPages}>
          {nextLabel}
        </Button>
      </div>
    </div>
  )
}
