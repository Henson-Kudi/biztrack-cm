'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import type { JwtPayload, RoleItem } from '@biztrack/types'
import { Button, Input } from '@biztrack/ui'
import { Plus, Search, Shield, ShieldCheck, Trash2, WifiOff, X } from 'lucide-react'
import { createRole, deleteRole, getRole, listRoles } from '@/services/auth.api'
import { getApiErrorMessage } from '@/services/api-response'
import { decodeJwtPayload } from '@/lib/jwt'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { ipc } from '@/services/ipc.bridge'

const LIMIT = 10

const ROLE_COLOURS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#64748b',
]

function ColourSwatch({
  colour,
  size = 'md',
}: {
  colour: string | null
  size?: 'sm' | 'md'
}) {
  const dim = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'
  return (
    <span
      className={cn('shrink-0 rounded-full', dim)}
      style={{ backgroundColor: colour ?? '#94a3b8' }}
    />
  )
}

type DeleteConfirmState = { roleId: string; name: string } | null

type CreateForm = {
  name: string
  description: string
  colour: string | null
}

export default function RolesPage() {
  const t = useTranslations('app.roles')
  const locale = useLocale()
  const router = useRouter()
  const accessToken = useAuthStore((s) => s.accessToken)
  const payload = accessToken ? decodeJwtPayload<JwtPayload>(accessToken) : null
  const isOwner = payload?.isOwner === true

  const [isOnline, setIsOnline] = useState(true)
  useEffect(() => {
    ipc.network.isOnline().then(setIsOnline)
    ipc.network.onStatusChange(setIsOnline)
  }, [])

  // Invalidate router cache on every mount so returning from the detail page
  // always shows up-to-date member counts (Next.js would otherwise serve
  // a cached route segment with stale userCount values).
  useEffect(() => {
    router.refresh()
  }, [])

  // ── Permission gate: requires roles:manage or owner ───────────
  const [canAccess, setCanAccess] = useState<boolean | null>(isOwner ? true : null)

  useEffect(() => {
    if (isOwner) {
      setCanAccess(true)
      return
    }
    if (!isOnline || !payload?.roleId) {
      setCanAccess(false)
      return
    }
    setCanAccess(null)
    getRole(payload.roleId)
      .then((r) => setCanAccess(r.permissions.includes('roles:manage')))
      .catch(() => setCanAccess(false))
  }, [isOwner, isOnline, payload?.roleId])

  // ── List state ────────────────────────────────────────────────
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [pendingSearch, setPendingSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const totalPages = Math.ceil(total / LIMIT)

  const fetchRoles = useCallback(
    async (p: number, q: string) => {
      setLoading(true)
      setLoadError(null)
      try {
        const res = await listRoles({ page: p, limit: LIMIT, search: q || undefined })
        setRoles(res.roles)
        setTotal(res.total)
      } catch (err) {
        setLoadError(getApiErrorMessage(err, t('load_error')))
      } finally {
        setLoading(false)
      }
    },
    [t],
  )

  useEffect(() => {
    if (!isOnline || canAccess !== true) return
    void fetchRoles(page, search)
  }, [isOnline, canAccess, page, search, fetchRoles])

  const handleSearch = () => {
    setPage(1)
    setSearch(pendingSearch)
  }

  // ── Delete ────────────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteRole(deleteConfirm.roleId)
      setDeleteConfirm(null)
      void fetchRoles(page, search)
    } catch (err) {
      setDeleteError(getApiErrorMessage(err, t('delete_error')))
    } finally {
      setDeleting(false)
    }
  }

  // ── Create ────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>({ name: '', description: '', colour: null })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!createForm.name.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      const role = await createRole({
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        colour: createForm.colour ?? undefined,
        permissions: [],
      })
      setShowCreate(false)
      setCreateForm({ name: '', description: '', colour: null })
      // Navigate to detail to assign permissions right away
      router.push(`/${locale}/settings/roles/detail?id=${role.id}`)
    } catch (err) {
      setCreateError(getApiErrorMessage(err, t('create_error')))
    } finally {
      setCreating(false)
    }
  }

  // ── Access gate ───────────────────────────────────────────────
  if (isOnline && canAccess === null) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <p className="text-sm text-muted-foreground">{t('checking_access')}</p>
      </div>
    )
  }

  if (isOnline && canAccess === false) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
          <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        </div>
        <div className="rounded-xl border border-border bg-card px-5 py-8 text-center">
          <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm font-medium text-foreground">{t('no_permission')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('no_permission_hint')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
            <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {isOwner && isOnline ? (
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            {t('new_role')}
          </Button>
        ) : null}
      </div>

      {/* Offline banner */}
      {!isOnline ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-900/20">
          <WifiOff className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={2} />
          <p className="text-sm text-amber-700 dark:text-amber-400">{t('offline_warning')}</p>
        </div>
      ) : null}

      {/* Non-owner hint */}
      {!isOwner && isOnline ? (
        <p className="text-sm text-muted-foreground">{t('owner_only_hint')}</p>
      ) : null}

      {/* Create dialog */}
      {showCreate ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">{t('create_title')}</h2>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false)
                setCreateError(null)
                setCreateForm({ name: '', description: '', colour: null })
              }}
              className="rounded p-1 hover:bg-secondary"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('create_name_label')} <span className="text-destructive">*</span>
              </label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('create_name_placeholder')}
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('create_description_label')}
              </label>
              <Input
                value={createForm.description}
                onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t('create_description_placeholder')}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {t('create_colour_label')}
              </label>
              <div className="flex items-center gap-2">
                {/* No colour option */}
                <button
                  type="button"
                  onClick={() => setCreateForm((f) => ({ ...f, colour: null }))}
                  className={cn(
                    'h-6 w-6 rounded-full border-2 bg-muted transition-all',
                    createForm.colour === null
                      ? 'border-foreground scale-110'
                      : 'border-transparent hover:border-muted-foreground',
                  )}
                  title="No colour"
                />
                {ROLE_COLOURS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCreateForm((f) => ({ ...f, colour: c }))}
                    className={cn(
                      'h-6 w-6 rounded-full border-2 transition-all',
                      createForm.colour === c
                        ? 'border-foreground scale-110'
                        : 'border-transparent hover:scale-105',
                    )}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>
          </div>

          {createError ? (
            <p className="mt-3 text-sm text-destructive">{createError}</p>
          ) : null}

          <div className="mt-4 flex gap-2">
            <Button
              variant="primary"
              onClick={() => void handleCreate()}
              disabled={creating || !createForm.name.trim()}
            >
              {creating ? t('creating') : t('create_action')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreate(false)
                setCreateError(null)
                setCreateForm({ name: '', description: '', colour: null })
              }}
              disabled={creating}
            >
              {t('delete_cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Search bar */}
      {isOnline ? (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={pendingSearch}
              onChange={(e) => setPendingSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch()
              }}
              placeholder={t('search_placeholder')}
              className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>
          {pendingSearch !== search ? (
            <Button variant="secondary" onClick={handleSearch}>
              {t('retry')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Roles list */}
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      ) : loadError ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-destructive">{loadError}</p>
          <button
            type="button"
            onClick={() => void fetchRoles(page, search)}
            className="text-sm font-medium text-primary underline underline-offset-2"
          >
            {t('retry')}
          </button>
        </div>
      ) : roles.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {roles.map((role) => {
            const isDeleteOpen = deleteConfirm?.roleId === role.id
            return (
              <div key={role.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {/* Colour swatch */}
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: role.colour ? `${role.colour}22` : undefined }}
                    >
                      {role.colour ? (
                        <ColourSwatch colour={role.colour} />
                      ) : (
                        <Shield className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{role.name}</span>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                            role.isSystem
                              ? 'bg-secondary text-muted-foreground'
                              : 'bg-primary/10 text-primary',
                          )}
                        >
                          {role.isSystem ? t('system_badge') : t('custom_badge')}
                        </span>
                      </div>
                      {role.description ? (
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                          {role.description}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t('member_count', { count: role.userCount })}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/${locale}/settings/roles/detail?id=${role.id}`)
                      }
                      className="text-xs font-medium text-primary underline underline-offset-2 hover:opacity-80"
                    >
                      {role.isSystem || !isOwner ? t('view_permissions') : t('edit_role')}
                    </button>
                    {isOwner && !role.isSystem ? (
                      <button
                        type="button"
                        onClick={() =>
                          setDeleteConfirm(
                            isDeleteOpen ? null : { roleId: role.id, name: role.name },
                          )
                        }
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        title={t('delete_role')}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Inline delete confirm */}
                {isDeleteOpen && deleteConfirm ? (
                  <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
                    <p className="text-sm font-medium text-foreground">
                      {t('delete_confirm_title', { name: deleteConfirm.name })}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t('delete_confirm_body')}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setDeleteConfirm(null)
                          setDeleteError(null)
                        }}
                        disabled={deleting}
                      >
                        {t('delete_cancel')}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => void handleDelete()}
                        disabled={deleting}
                      >
                        {deleting ? t('deleting') : t('delete_confirm_action')}
                      </Button>
                    </div>
                    {deleteError ? (
                      <p className="mt-2 text-xs text-destructive">{deleteError}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
