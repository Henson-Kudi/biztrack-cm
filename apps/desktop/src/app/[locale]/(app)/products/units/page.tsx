'use client'

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Badge, Button, Spinner } from '@biztrack/ui'
import { toast } from 'sonner'
import type { PaginatedResult, UnitOfMeasure } from '@biztrack/types'
import { PaginationControls } from '@/components/catalog/PaginationControls'
import { SurfaceCard } from '@/components/catalog/SurfaceCard'
import { ResourceActionMenu } from '@/components/products/ResourceActionMenu'
import { UnitOfMeasureDialog } from '@/components/products/UnitOfMeasureDialog'
import { ViewModeToggle } from '@/components/products/ViewModeToggle'
import { getUnitErrorMessage } from '@/components/products/resource-error-messages'
import { formatDateLabel } from '@/components/products/product-utils'
import {
  countProductsByUnitLocal,
  deleteUnitOfMeasureLocal,
  listUnitOfMeasuresLocal,
  restoreUnitOfMeasureLocal,
  setUnitOfMeasureActiveStateLocal,
} from '@/services/products.local'
import { useAuthStore } from '@/stores/auth.store'

type ViewMode = 'list' | 'grid'

type UnitSummary = {
  unit: UnitOfMeasure
  productCount: number
}

const PAGE_SIZE = 12

export default function ProductUnitsPage() {
  const t = useTranslations('app.products')
  const locale = useLocale()
  const businessId = useAuthStore((state) => state.businessId)
  const role = useAuthStore((state) => state.role)
  const [units, setUnits] = useState<PaginatedResult<UnitOfMeasure> | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [page, setPage] = useState(1)
  const [productCounts, setProductCounts] = useState<Record<string, number>>({})
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingUnit, setEditingUnit] = useState<UnitOfMeasure | null>(null)
  const [busyUnitId, setBusyUnitId] = useState<string | null>(null)

  const translateKey = useCallback((key: string) => t(key as never), [t])
  const canUndoDelete = String(role ?? '') === 'SUPER_ADMIN'

  useEffect(() => {
    if (!businessId) {
      setUnits(null)
      setLoading(false)
      return
    }

    const currentBusinessId = businessId
    let active = true

    async function loadUnits() {
      setLoading(true)
      setError(null)

      try {
        const [unitsResult, countByUnit] = await Promise.all([
          listUnitOfMeasuresLocal(currentBusinessId, {
            page,
            limit: PAGE_SIZE,
            sortBy: 'name',
            sortOrder: 'ASC',
            search: deferredSearch.trim() || undefined,
            includeInactive: true,
          }),
          countProductsByUnitLocal(currentBusinessId),
        ])

        if (!active) {
          return
        }

        setUnits(unitsResult)
        setProductCounts(Object.fromEntries(countByUnit.entries()))
      } catch (loadError) {
        if (!active) {
          return
        }

        setError(getUnitErrorMessage(loadError, translateKey, t('errors.unit_load')))
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadUnits()

    return () => {
      active = false
    }
  }, [businessId, deferredSearch, page, reloadKey, t, translateKey])

  useEffect(() => {
    if (!units || units.totalPages === 0 || page <= units.totalPages) {
      return
    }

    setPage(units.totalPages)
  }, [page, units])

  const items = useMemo<UnitSummary[]>(
    () =>
      (units?.data ?? []).map((unit) => ({
        unit,
        productCount: productCounts[unit.id] ?? 0,
      })),
    [productCounts, units],
  )

  const defaultUnitCount = items.filter((item) => item.unit.isDefault).length
  const inUseCount = items.filter((item) => item.productCount > 0).length

  const handleToggleActive = async (unit: UnitOfMeasure) => {
    if (!businessId) {
      toast.error(t('errors.business_required'))
      return
    }

    setBusyUnitId(unit.id)

    try {
      const isActive = unit.isActive !== false
      await setUnitOfMeasureActiveStateLocal(businessId, unit.id, !isActive)
      toast.success(
        isActive ? t('units_page.inactive_success') : t('units_page.active_success'),
      )
      setReloadKey((current) => current + 1)
    } catch (actionError) {
      toast.error(getUnitErrorMessage(actionError, translateKey, t('errors.unit_toggle')))
    } finally {
      setBusyUnitId(null)
    }
  }

  const handleDelete = async (unit: UnitOfMeasure) => {
    if (!businessId) {
      toast.error(t('errors.business_required'))
      return
    }

    if (
      !window.confirm(
        canUndoDelete ? t('units_page.delete_confirm_super_admin') : t('units_page.delete_confirm'),
      )
    ) {
      return
    }

    setBusyUnitId(unit.id)

    try {
      await deleteUnitOfMeasureLocal(businessId, unit.id)

      if (canUndoDelete) {
        toast.success(t('units_page.delete_success'), {
          action: {
            label: t('actions.undo_delete'),
            onClick: () => {
              void handleUndoDelete(unit.id)
            },
          },
        })
      } else {
        toast.success(t('units_page.delete_success'))
      }

      setReloadKey((current) => current + 1)
    } catch (actionError) {
      toast.error(getUnitErrorMessage(actionError, translateKey, t('errors.unit_delete')))
    } finally {
      setBusyUnitId(null)
    }
  }

  const handleUndoDelete = async (unitId: string) => {
    if (!businessId) {
      toast.error(t('errors.business_required'))
      return
    }

    setBusyUnitId(unitId)

    try {
      await restoreUnitOfMeasureLocal(businessId, unitId)
      toast.success(t('units_page.undo_delete_success'))
      setReloadKey((current) => current + 1)
    } catch (actionError) {
      toast.error(getUnitErrorMessage(actionError, translateKey, t('errors.unit_restore')))
    } finally {
      setBusyUnitId(null)
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
            {t('eyebrow')}
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">
            {t('units_page.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('units_page.description')}</p>
        </div>

        <SurfaceCard
          action={
            <div className="flex flex-wrap items-center gap-2">
              <ViewModeToggle
                value={viewMode}
                onChange={setViewMode}
                listLabel={t('units_page.views.list')}
                gridLabel={t('units_page.views.grid')}
              />
              <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
                {t('actions.add_unit')}
              </Button>
              <Button variant="secondary" onClick={() => setReloadKey((current) => current + 1)}>
                {t('actions.refresh')}
              </Button>
            </div>
          }
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="w-full max-w-md">
              <SearchInput
                value={search}
                onChange={setSearch}
                label={t('filters.search')}
                placeholder={t('units_page.search_placeholder')}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {t('units_page.summary', {
                total: units?.total ?? 0,
                defaults: defaultUnitCount,
                inUse: inUseCount,
              })}
            </p>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background px-6 text-center">
              <h4 className="text-lg font-semibold text-foreground">
                {t('units_page.empty_title')}
              </h4>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                {t('units_page.empty_description')}
              </p>
            </div>
          ) : viewMode === 'list' ? (
            <div className="overflow-hidden rounded-2xl border border-border">
              <div className="divide-y divide-border bg-card">
                {items.map(({ unit, productCount }) => {
                  const isActive = unit.isActive !== false
                  const isImmutable = !unit.businessId || unit.isDefault

                  return (
                    <div
                      key={unit.id}
                      className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-semibold text-foreground">
                            {unit.name}
                          </h3>
                          {unit.isDefault ? (
                            <Badge variant="success">{t('units_page.badges.default')}</Badge>
                          ) : null}
                          <Badge variant={isActive ? 'success' : 'neutral'}>
                            {isActive
                              ? t('units_page.badges.active')
                              : t('units_page.badges.inactive')}
                          </Badge>
                          <Badge variant="info">
                            {unit.businessId
                              ? t('units_page.badges.business')
                              : t('units_page.badges.system')}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {unit.abbreviation || t('units_page.no_abbreviation')}
                        </p>
                      </div>

                      <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-4 lg:min-w-[520px] lg:grid-cols-4">
                        <DetailMeta
                          label={t('units_page.fields.type')}
                          value={
                            unit.type
                              ? t(`form.unit_types.${unit.type.toLowerCase()}`)
                              : t('form.unit_types.generic')
                          }
                        />
                        <DetailMeta
                          label={t('units_page.fields.scope')}
                          value={
                            unit.businessId
                              ? t('units_page.badges.business')
                              : t('units_page.badges.system')
                          }
                        />
                        <DetailMeta
                          label={t('units_page.fields.products')}
                          value={t('units_page.product_count', { count: productCount })}
                        />
                        <DetailMeta
                          label={t('units_page.fields.updated_at')}
                          value={formatDateLabel(unit.updatedAt, locale)}
                        />
                      </div>

                      <div className="self-start lg:self-center">
                        <ResourceActionMenu
                          label={t('actions.more_actions')}
                          orientation="horizontal"
                          items={[
                            {
                              label: t('actions.update_unit'),
                              onSelect: () => setEditingUnit(unit),
                              disabled: isImmutable || busyUnitId === unit.id,
                            },
                            {
                              label: isActive ? t('actions.deactivate') : t('actions.activate'),
                              onSelect: () => void handleToggleActive(unit),
                              disabled: isImmutable || busyUnitId === unit.id,
                            },
                            {
                              label: t('actions.delete'),
                              onSelect: () => void handleDelete(unit),
                              disabled: isImmutable || busyUnitId === unit.id,
                              tone: 'danger',
                            },
                          ]}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map(({ unit, productCount }) => {
                const isActive = unit.isActive !== false
                const isImmutable = !unit.businessId || unit.isDefault

                return (
                  <div
                    key={unit.id}
                    className="rounded-2xl border border-border bg-background/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-foreground">
                          {unit.name}
                        </h3>
                        <p className="truncate text-sm text-muted-foreground">
                          {unit.abbreviation || t('units_page.no_abbreviation')}
                        </p>
                      </div>
                      <ResourceActionMenu
                        label={t('actions.more_actions')}
                        orientation="vertical"
                        items={[
                          {
                            label: t('actions.update_unit'),
                            onSelect: () => setEditingUnit(unit),
                            disabled: isImmutable || busyUnitId === unit.id,
                          },
                          {
                            label: isActive ? t('actions.deactivate') : t('actions.activate'),
                            onSelect: () => void handleToggleActive(unit),
                            disabled: isImmutable || busyUnitId === unit.id,
                          },
                          {
                            label: t('actions.delete'),
                            onSelect: () => void handleDelete(unit),
                            disabled: isImmutable || busyUnitId === unit.id,
                            tone: 'danger',
                          },
                        ]}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {unit.isDefault ? (
                        <Badge variant="success">{t('units_page.badges.default')}</Badge>
                      ) : null}
                      <Badge variant={isActive ? 'success' : 'neutral'}>
                        {isActive
                          ? t('units_page.badges.active')
                          : t('units_page.badges.inactive')}
                      </Badge>
                      <Badge variant="info">
                        {unit.businessId
                          ? t('units_page.badges.business')
                          : t('units_page.badges.system')}
                      </Badge>
                    </div>

                    <div className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                      <DetailMeta
                        label={t('units_page.fields.type')}
                        value={
                          unit.type
                            ? t(`form.unit_types.${unit.type.toLowerCase()}`)
                            : t('form.unit_types.generic')
                        }
                      />
                      <DetailMeta
                        label={t('units_page.fields.products')}
                        value={t('units_page.product_count', { count: productCount })}
                      />
                      <DetailMeta
                        label={t('units_page.fields.scope')}
                        value={
                          unit.businessId
                            ? t('units_page.badges.business')
                            : t('units_page.badges.system')
                        }
                      />
                      <DetailMeta
                        label={t('units_page.fields.updated_at')}
                        value={formatDateLabel(unit.updatedAt, locale)}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-4">
            <PaginationControls
              page={units?.page ?? 1}
              totalPages={units?.totalPages ?? 1}
              pageLabel={t('pagination.page_label', {
                page: units?.page ?? 1,
                totalPages: units?.totalPages ?? 1,
              })}
              previousLabel={t('pagination.previous')}
              nextLabel={t('pagination.next')}
              onPrevious={() => setPage((current) => Math.max(current - 1, 1))}
              onNext={() =>
                setPage((current) =>
                  Math.min(current + 1, units?.totalPages ?? current + 1),
                )
              }
            />
          </div>
        </SurfaceCard>
      </div>

      <UnitOfMeasureDialog
        businessId={businessId}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSaved={() => {
          setPage(1)
          setReloadKey((current) => current + 1)
        }}
      />

      <UnitOfMeasureDialog
        businessId={businessId}
        unit={editingUnit}
        open={Boolean(editingUnit)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingUnit(null)
          }
        }}
        onSaved={() => {
          setReloadKey((current) => current + 1)
          setEditingUnit(null)
        }}
      />
    </>
  )
}

function SearchInput({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder: string
}) {
  return (
    <div className="w-full">
      <label className="mb-1 block text-sm font-medium text-foreground">{label}</label>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="block h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  )
}

function DetailMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  )
}
