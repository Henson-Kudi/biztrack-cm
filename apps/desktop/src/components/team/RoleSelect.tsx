'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RoleItem } from '@biztrack/types'
import { ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { listRoles } from '@/services/auth.api'
import { cn } from '@/lib/utils'

const LIMIT = 5

type Props = {
  value: string
  onChange: (roleId: string) => void
  disabled?: boolean
  className?: string
  placeholder?: string
}

export function RoleSelect({ value, onChange, disabled, className, placeholder = 'Select role' }: Props) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [pendingSearch, setPendingSearch] = useState('')
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState<string>('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const totalPages = Math.ceil(total / LIMIT)
  const showSearch = total > LIMIT

  const fetchPage = useCallback(
    async (p: number, q: string) => {
      setLoading(true)
      try {
        const res = await listRoles({ page: p, limit: LIMIT, search: q || undefined })
        setRoles(res.roles)
        setTotal(res.total)
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  // Fetch when dropdown opens or page/search changes
  useEffect(() => {
    if (!open) return
    void fetchPage(page, search)
  }, [open, page, search, fetchPage])

  // Sync label when value or roles change
  useEffect(() => {
    const found = roles.find((r) => r.id === value)
    if (found) setSelectedLabel(found.name)
  }, [roles, value])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleOpen = () => {
    if (disabled) return
    setPage(1)
    setSearch('')
    setPendingSearch('')
    setOpen((o) => !o)
  }

  const handleSelect = (role: RoleItem) => {
    onChange(role.id)
    setSelectedLabel(role.name)
    setOpen(false)
  }

  const handleSearchSubmit = () => {
    setPage(1)
    setSearch(pendingSearch)
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition',
          'focus:border-ring focus:ring-2 focus:ring-ring/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
          open && 'border-ring ring-2 ring-ring/20',
        )}
      >
        <span className={cn(!selectedLabel && 'text-muted-foreground')}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-border bg-popover shadow-lg">
          {/* Search */}
          {showSearch ? (
            <div className="flex items-center gap-1.5 border-b border-border p-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                type="text"
                value={pendingSearch}
                onChange={(e) => setPendingSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearchSubmit()
                  if (e.key === 'Escape') setOpen(false)
                }}
                placeholder="Search roles…"
                className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                autoFocus
              />
              {pendingSearch !== search ? (
                <button
                  type="button"
                  onClick={handleSearchSubmit}
                  className="shrink-0 text-[10px] font-medium text-primary"
                >
                  Go
                </button>
              ) : null}
            </div>
          ) : null}

          {/* Role list */}
          <div className="py-1">
            {loading ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
            ) : roles.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No roles found</p>
            ) : (
              roles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => handleSelect(role)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                    role.id === value && 'bg-accent font-medium text-foreground',
                  )}
                >
                  {role.colour ? (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: role.colour }}
                    />
                  ) : null}
                  <span className="flex-1 truncate">{role.name}</span>
                  {role.isSystem ? (
                    <span className="text-[10px] text-muted-foreground">system</span>
                  ) : null}
                </button>
              ))
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-border px-3 py-2">
              <span className="text-[10px] text-muted-foreground">
                {page} / {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded p-0.5 hover:bg-accent disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded p-0.5 hover:bg-accent disabled:opacity-40"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
