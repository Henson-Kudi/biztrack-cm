'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type {
  BusinessMemberRole,
  JwtPayload,
  PermissionCatalogItem,
  RoleWithPermissions,
  TeamMember,
} from '@biztrack/types'
import { Button, Input, Switch } from '@biztrack/ui'
import {
  ArrowLeft,
  CheckSquare,
  Lock,
  Pencil,
  ShieldCheck,
  Square,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import {
  bulkUpdateMemberRole,
  getRole,
  listPermissions,
  listTeamMembers,
  setRolePermissions,
  updateRole,
} from '@/services/auth.api'
import { getApiErrorMessage } from '@/services/api-response'
import { decodeJwtPayload } from '@/lib/jwt'
import { cn } from '@/lib/utils'
import { ipc } from '@/services/ipc.bridge'
import { useAuthStore } from '@/stores/auth.store'

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

// ── Permission group row ──────────────────────────────────────────────────────

function PermissionRow({
  perm,
  checked,
  onToggle,
  disabled,
}: {
  perm: PermissionCatalogItem
  checked: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 rounded-lg px-4 py-3 transition-colors',
        !disabled && 'hover:bg-secondary/40',
        checked && !disabled && 'bg-primary/5',
      )}
    >
      <div className="flex min-w-0 flex-col">
        <span
          className={cn(
            'text-sm font-medium leading-snug',
            checked ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {perm.label}
        </span>
        <span className="mt-0.5 text-xs text-muted-foreground/80">{perm.description}</span>
      </div>
      <div className="shrink-0 pt-0.5">
        <Switch checked={checked} onCheckedChange={onToggle} disabled={disabled} />
      </div>
    </div>
  )
}

// ── Permission group section ──────────────────────────────────────────────────

function PermissionGroup({
  groupKey,
  label,
  perms,
  enabled,
  onToggle,
  onSelectAll,
  onClearAll,
  disabled,
  t,
}: {
  groupKey: string
  label: string
  perms: PermissionCatalogItem[]
  enabled: Set<string>
  onToggle: (key: string) => void
  onSelectAll: () => void
  onClearAll: () => void
  disabled?: boolean
  t: ReturnType<typeof useTranslations<'app.roles'>>
}) {
  const grantedCount = perms.filter((p) => enabled.has(p.key)).length

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Group header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold uppercase tracking-wide text-foreground">
            {label}
          </span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {grantedCount} / {perms.length}
          </span>
        </div>
        {!disabled ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onSelectAll}
              disabled={grantedCount === perms.length}
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <CheckSquare className="h-3 w-3" strokeWidth={2} />
              {t('perm_group_all')}
            </button>
            <button
              type="button"
              onClick={onClearAll}
              disabled={grantedCount === 0}
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <Square className="h-3 w-3" strokeWidth={2} />
              {t('perm_group_none')}
            </button>
          </div>
        ) : null}
      </div>

      {/* Permission rows */}
      <div className="divide-y divide-border/50 px-1 py-1">
        {perms.map((perm) => (
          <PermissionRow
            key={perm.key}
            perm={perm}
            checked={enabled.has(perm.key)}
            onToggle={() => onToggle(perm.key)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function RoleDetailContent() {
  const t = useTranslations('app.roles')
  const locale = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const roleId = searchParams.get('id')

  const accessToken = useAuthStore((s) => s.accessToken)
  const payload = accessToken ? decodeJwtPayload<JwtPayload>(accessToken) : null
  const isOwner = payload?.isOwner === true

  // ── Permission gate: requires roles:manage or owner ───────────
  const [canAccess, setCanAccess] = useState<boolean | null>(isOwner ? true : null)
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    ipc.network.isOnline().then(setIsOnline)
    ipc.network.onStatusChange(setIsOnline)
  }, [])

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

  // ── Load role + catalogue ─────────────────────────────────────
  const [role, setRole] = useState<RoleWithPermissions | null>(null)
  const [catalogue, setCatalogue] = useState<PermissionCatalogItem[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingRole, setLoadingRole] = useState(true)

  const loadData = useCallback(async () => {
    if (!roleId) return
    setLoadingRole(true)
    setLoadError(null)
    try {
      const [roleData, permsData] = await Promise.all([
        getRole(roleId),
        listPermissions(),
      ])
      setRole(roleData)
      setCatalogue(permsData.permissions)
      setEnabled(new Set(roleData.permissions))
      setOriginalEnabled(new Set(roleData.permissions))
    } catch (err) {
      setLoadError(getApiErrorMessage(err, t('detail_load_error')))
    } finally {
      setLoadingRole(false)
    }
  }, [roleId, t])

  useEffect(() => {
    if (canAccess === true) void loadData()
  }, [canAccess, loadData])

  // ── Permission state ──────────────────────────────────────────
  const [enabled, setEnabled] = useState<Set<string>>(new Set())
  const [originalEnabled, setOriginalEnabled] = useState<Set<string>>(new Set())

  const isDirty = useMemo(() => {
    if (enabled.size !== originalEnabled.size) return true
    for (const key of enabled) {
      if (!originalEnabled.has(key)) return true
    }
    return false
  }, [enabled, originalEnabled])

  const grantedCount = enabled.size
  const totalCount = catalogue.length

  const handleToggle = (key: string) => {
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleGroupSelectAll = (keys: string[]) => {
    setEnabled((prev) => {
      const next = new Set(prev)
      keys.forEach((k) => next.add(k))
      return next
    })
  }

  const handleGroupClearAll = (keys: string[]) => {
    setEnabled((prev) => {
      const next = new Set(prev)
      keys.forEach((k) => next.delete(k))
      return next
    })
  }

  const handleSelectAll = () => {
    setEnabled(new Set(catalogue.map((p) => p.key)))
  }

  const handleClearAll = () => {
    setEnabled(new Set())
  }

  const handleRevert = () => {
    setEnabled(new Set(originalEnabled))
  }

  // ── Save permissions ──────────────────────────────────────────
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleSavePermissions = async () => {
    if (!roleId) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await setRolePermissions(roleId, {
        permissions: Array.from(enabled),
      })
      setRole(updated)
      setOriginalEnabled(new Set(updated.permissions))
      setEnabled(new Set(updated.permissions))
    } catch (err) {
      setSaveError(getApiErrorMessage(err, t('perm_save_error')))
    } finally {
      setSaving(false)
    }
  }

  // ── Edit role details ─────────────────────────────────────────
  const [editingDetails, setEditingDetails] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', description: '', colour: null as string | null })
  const [detailSaving, setDetailSaving] = useState(false)
  const [detailSaveError, setDetailSaveError] = useState<string | null>(null)

  const startEditing = () => {
    if (!role) return
    setEditForm({
      name: role.name,
      description: role.description ?? '',
      colour: role.colour,
    })
    setEditingDetails(true)
  }

  const handleSaveDetails = async () => {
    if (!roleId || !editForm.name.trim()) return
    setDetailSaving(true)
    setDetailSaveError(null)
    try {
      const updated = await updateRole(roleId, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        colour: editForm.colour ?? undefined,
      })
      setRole({ ...updated, permissions: role?.permissions ?? [] })
      setEditingDetails(false)
    } catch (err) {
      setDetailSaveError(getApiErrorMessage(err, t('detail_save_error')))
    } finally {
      setDetailSaving(false)
    }
  }

  // ── Members state ─────────────────────────────────────────────
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [showAddMembers, setShowAddMembers] = useState(false)
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [addingMembers, setAddingMembers] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true)
    try {
      const res = await listTeamMembers()
      setMembers(res.members)
    } catch {
      // non-critical — silently fail, members section stays empty
    } finally {
      setLoadingMembers(false)
    }
  }, [])

  useEffect(() => {
    if (role && canAccess === true && isOnline) {
      void loadMembers()
    }
  }, [role, canAccess, isOnline, loadMembers])

  const currentRoleMembers = useMemo(
    () => members.filter((m) => m.roleId === role?.id),
    [members, role],
  )

  const eligibleMembers = useMemo(
    () =>
      members.filter(
        (m) => m.roleId !== role?.id && m.role !== ('OWNER' as BusinessMemberRole),
      ),
    [members, role],
  )

  const selectedMembers = useMemo(
    () => eligibleMembers.filter((m) => selectedUserIds.includes(m.userId)),
    [eligibleMembers, selectedUserIds],
  )

  const toggleSelectMember = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    )
  }

  const handleAddMembers = async () => {
    if (!role || selectedUserIds.length === 0) return
    setAddingMembers(true)
    setAddError(null)
    try {
      await bulkUpdateMemberRole({ userIds: selectedUserIds, roleId: role.id })
      setShowAddMembers(false)
      setSelectedUserIds([])
      // Refresh router cache so the roles list shows updated member counts on back-navigation
      router.refresh()
      await loadMembers()
    } catch (err) {
      setAddError(getApiErrorMessage(err, t('add_members_error')))
    } finally {
      setAddingMembers(false)
    }
  }

  // ── Group catalogue by group key ──────────────────────────────
  const groupLabels: Record<string, string> = {
    sales: t('groups.sales'),
    expenses: t('groups.expenses'),
    contacts: t('groups.contacts'),
    inventory: t('groups.inventory'),
    debts: t('groups.debts'),
    reports: t('groups.reports'),
    admin: t('groups.admin'),
  }

  const groups = useMemo(() => {
    const map = new Map<string, PermissionCatalogItem[]>()
    for (const perm of catalogue) {
      const existing = map.get(perm.group)
      if (existing) existing.push(perm)
      else map.set(perm.group, [perm])
    }
    return Array.from(map.entries())
  }, [catalogue])

  const canEditPermissions = isOwner && role && !role.isSystem
  const canManageMembers = canAccess === true && isOnline

  // ── Render ────────────────────────────────────────────────────
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
        <button
          type="button"
          onClick={() => router.push(`/${locale}/settings/roles`)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('detail_back')}
        </button>
        <div className="rounded-xl border border-border bg-card px-5 py-8 text-center">
          <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm font-medium text-foreground">{t('no_permission')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('no_permission_hint')}</p>
        </div>
      </div>
    )
  }

  if (loadingRole) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      </div>
    )
  }

  if (loadError || !role) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <button
          type="button"
          onClick={() => router.push(`/${locale}/settings/roles`)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('detail_back')}
        </button>
        <p className="text-sm text-destructive">{loadError ?? t('detail_not_found')}</p>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col gap-6 p-6 pb-24">
      {/* Back nav */}
      <button
        type="button"
        onClick={() => router.push(`/${locale}/settings/roles`)}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        {t('detail_back')}
      </button>

      {/* Role header */}
      <div className="rounded-xl border border-border bg-card p-5">
        {editingDetails ? (
          /* ── Edit details form ── */
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">{t('detail_edit_title')}</h2>
              <button
                type="button"
                onClick={() => {
                  setEditingDetails(false)
                  setDetailSaveError(null)
                }}
                className="rounded p-1 hover:bg-secondary"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('detail_name_label')} <span className="text-destructive">*</span>
              </label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('detail_description_label')}
              </label>
              <Input
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {t('detail_colour_label')}
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditForm((f) => ({ ...f, colour: null }))}
                  className={cn(
                    'h-6 w-6 rounded-full border-2 bg-muted transition-all',
                    editForm.colour === null
                      ? 'scale-110 border-foreground'
                      : 'border-transparent hover:border-muted-foreground',
                  )}
                  title="No colour"
                />
                {ROLE_COLOURS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEditForm((f) => ({ ...f, colour: c }))}
                    className={cn(
                      'h-6 w-6 rounded-full border-2 transition-all',
                      editForm.colour === c
                        ? 'scale-110 border-foreground'
                        : 'border-transparent hover:scale-105',
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {detailSaveError ? (
              <p className="text-sm text-destructive">{detailSaveError}</p>
            ) : null}

            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={() => void handleSaveDetails()}
                disabled={detailSaving || !editForm.name.trim()}
              >
                {detailSaving ? t('detail_saving') : t('detail_save')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setEditingDetails(false)
                  setDetailSaveError(null)
                }}
                disabled={detailSaving}
              >
                {t('detail_cancel')}
              </Button>
            </div>
          </div>
        ) : (
          /* ── Role info display ── */
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: role.colour ? `${role.colour}22` : undefined }}
              >
                {role.colour ? (
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: role.colour }}
                  />
                ) : (
                  <ShieldCheck className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold text-foreground">{role.name}</h1>
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
                  <p className="mt-0.5 text-sm text-muted-foreground">{role.description}</p>
                ) : null}
              </div>
            </div>

            {isOwner && !role.isSystem ? (
              <button
                type="button"
                onClick={startEditing}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                {t('detail_edit_title')}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* System role notice */}
      {role.isSystem ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-900/20">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={2} />
          <p className="text-sm text-amber-700 dark:text-amber-400">{t('detail_system_notice')}</p>
        </div>
      ) : null}

      {/* Permissions section */}
      <div>
        {/* Section header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground">{t('permissions_title')}</h2>
            <span className="text-sm text-muted-foreground">
              {t('permissions_count', { granted: grantedCount, total: totalCount })}
            </span>
          </div>
          {canEditPermissions ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleSelectAll}
                disabled={grantedCount === totalCount}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <CheckSquare className="h-3.5 w-3.5" strokeWidth={2} />
                {t('perm_select_all')}
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                disabled={grantedCount === 0}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <Square className="h-3.5 w-3.5" strokeWidth={2} />
                {t('perm_clear_all')}
              </button>
            </div>
          ) : null}
        </div>

        {/* Permission groups */}
        <div className="flex flex-col gap-4">
          {groups.map(([groupKey, perms]) => (
              <PermissionGroup
                key={groupKey}
                groupKey={groupKey}
                label={groupLabels[groupKey] ?? groupKey}
                perms={perms}
                enabled={enabled}
                onToggle={handleToggle}
                onSelectAll={() => handleGroupSelectAll(perms.map((p) => p.key))}
                onClearAll={() => handleGroupClearAll(perms.map((p) => p.key))}
                disabled={!canEditPermissions}
                t={t}
              />
            ))}
        </div>
      </div>

      {/* Members section */}
      {canManageMembers && role ? (
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Users className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
              <h2 className="text-sm font-semibold text-foreground">{t('members_title')}</h2>
            </div>
            {!showAddMembers ? (
              <button
                type="button"
                onClick={() => setShowAddMembers(true)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
                {t('add_members')}
              </button>
            ) : null}
          </div>

          {/* Current members in this role */}
          <div className="rounded-xl border border-border bg-card">
            {loadingMembers ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">{t('members_loading')}</p>
            ) : currentRoleMembers.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">{t('members_empty')}</p>
            ) : (
              <div className="divide-y divide-border/60">
                {currentRoleMembers.map((m) => (
                  <div key={m.userId} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold uppercase text-muted-foreground">
                      {(m.name ?? m.email ?? '?').charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {m.name ?? m.email ?? m.phone ?? '—'}
                      </p>
                      {m.email ? (
                        <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add members panel */}
          {showAddMembers ? (
            <div className="mt-4 rounded-xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">{t('add_members_title')}</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMembers(false)
                    setSelectedUserIds([])
                    setAddError(null)
                  }}
                  className="rounded p-1 hover:bg-secondary"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {eligibleMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('add_members_empty')}</p>
              ) : (
                <div className="divide-y divide-border/60 rounded-lg border border-border">
                  {eligibleMembers.map((m) => {
                    const selected = selectedUserIds.includes(m.userId)
                    return (
                      <label
                        key={m.userId}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors',
                          selected ? 'bg-primary/5' : 'hover:bg-secondary/40',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelectMember(m.userId)}
                          className="h-4 w-4 rounded border-input accent-primary"
                        />
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold uppercase text-muted-foreground">
                          {(m.name ?? m.email ?? '?').charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {m.name ?? m.email ?? m.phone ?? '—'}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {t('member_current_role', { role: m.roleName })}
                          </p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}

              {/* Warning banner when members are selected */}
              {selectedMembers.length > 0 ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-900/20">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    {t('add_members_warning')}
                  </p>
                  <ul className="mt-1.5 space-y-0.5">
                    {selectedMembers.map((m) => (
                      <li key={m.userId} className="text-xs text-amber-600 dark:text-amber-400">
                        {m.name ?? m.email ?? m.phone} &rarr;{' '}
                        <span className="font-medium">{role.name}</span>{' '}
                        <span className="opacity-70">
                          ({t('member_current_role', { role: m.roleName })})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {addError ? (
                <p className="mt-3 text-sm text-destructive">{addError}</p>
              ) : null}

              <div className="mt-4 flex gap-2">
                <Button
                  variant="primary"
                  onClick={() => void handleAddMembers()}
                  disabled={addingMembers || selectedUserIds.length === 0}
                >
                  {addingMembers
                    ? t('add_members_saving')
                    : selectedUserIds.length === 1
                      ? t('add_members_confirm', { count: 1 })
                      : t('add_members_confirm_plural', { count: selectedUserIds.length })}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowAddMembers(false)
                    setSelectedUserIds([])
                    setAddError(null)
                  }}
                  disabled={addingMembers}
                >
                  {t('add_members_cancel')}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Sticky unsaved changes bar */}
      {canEditPermissions && isDirty ? (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-4 border-t border-border bg-background/95 px-6 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-sm font-medium text-foreground">{t('perm_unsaved')}</span>
          </div>
          <div className="flex items-center gap-2">
            {saveError ? (
              <span className="text-xs text-destructive">{saveError}</span>
            ) : null}
            <button
              type="button"
              onClick={handleRevert}
              disabled={saving}
              className="text-sm font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
            >
              {t('perm_revert')}
            </button>
            <Button
              variant="primary"
              onClick={() => void handleSavePermissions()}
              disabled={saving}
            >
              {saving ? t('perm_saving') : t('perm_save')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function RoleDetailPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading...</div>}>
      <RoleDetailContent />
    </Suspense>
  )
}
