'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Badge, Button, Input, NumberInput, Spinner } from '@biztrack/ui'
import {
  InventoryMovementType,
  StockAdjustmentType,
  type InventoryAlert,
  type InventoryDetail,
  type InventoryListItem,
  type PaginatedResult,
  type ProductCategory,
} from '@biztrack/types'
import { MetricCard } from '@/components/catalog/MetricCard'
import { PaginationControls } from '@/components/catalog/PaginationControls'
import { SurfaceCard } from '@/components/catalog/SurfaceCard'
import { cn } from '@/lib/utils'
import { getApiErrorMessage } from '@/services/api-response'
import {
  InventoryLocalError,
  adjustInventoryLocal,
  getInventoryDetailLocal,
  listInventoryAlertsLocal,
  listInventoryLocal,
  restockInventoryLocal,
  setInventoryThresholdLocal,
} from '@/services/inventory.local'
import { listCategoriesLocal } from '@/services/products.local'
import { useAuthStore } from '@/stores/auth.store'

type AdjustFormState = {
  type: StockAdjustmentType
  quantity: string
  notes: string
}

type RestockFormState = {
  quantity: string
  unitCost: string
  supplierName: string
  referenceNumber: string
  notes: string
}

type ThresholdFormState = {
  lowStockThreshold: string
  reorderPoint: string
}

const selectClassName =
  'block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring'
const textareaClassName =
  'block min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring'

function parseOptionalNumberInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return { kind: 'empty' as const }
  }

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) {
    return { kind: 'invalid' as const }
  }

  return { kind: 'value' as const, value: parsed }
}

function parseRequiredNumberInput(value: string) {
  const parsed = parseOptionalNumberInput(value)
  if (parsed.kind === 'empty') {
    return { kind: 'missing' as const }
  }

  return parsed
}

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatQuantity(value?: number | null) {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 3,
  }).format(value)
}

function movementBadgeVariant(type: InventoryMovementType) {
  if (type === InventoryMovementType.RESTOCK_IN || type === InventoryMovementType.OPENING_STOCK) {
    return 'success'
  }
  if (type === InventoryMovementType.SALE || type === InventoryMovementType.TRANSFER_OUT) {
    return 'danger'
  }
  return 'info'
}

export default function InventoryPage() {
  const t = useTranslations('app.inventory')
  const locale = useLocale()
  const businessId = useAuthStore((state) => state.businessId)
  const [inventory, setInventory] = useState<PaginatedResult<InventoryListItem> | null>(null)
  const [alerts, setAlerts] = useState<PaginatedResult<InventoryAlert> | null>(null)
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [detail, setDetail] = useState<InventoryDetail | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [savingThresholds, setSavingThresholds] = useState(false)
  const [savingAdjustment, setSavingAdjustment] = useState(false)
  const [savingRestock, setSavingRestock] = useState(false)
  const [thresholdForm, setThresholdForm] = useState<ThresholdFormState>({
    lowStockThreshold: '',
    reorderPoint: '',
  })
  const [adjustForm, setAdjustForm] = useState<AdjustFormState>({
    type: StockAdjustmentType.ADD,
    quantity: '',
    notes: '',
  })
  const [restockForm, setRestockForm] = useState<RestockFormState>({
    quantity: '',
    unitCost: '',
    supplierName: '',
    referenceNumber: '',
    notes: '',
  })

  const getInventoryErrorMessage = (inventoryError: unknown, fallback: string) => {
    if (inventoryError instanceof InventoryLocalError) {
      switch (inventoryError.code) {
        case 'INVENTORY_NOT_FOUND':
          return t('errors.inventory_not_found')
        case 'INVENTORY_LOW_STOCK_THRESHOLD_INVALID':
          return t('errors.low_stock_threshold_invalid')
        case 'INVENTORY_REORDER_POINT_INVALID':
          return t('errors.reorder_point_invalid')
        case 'INVENTORY_ADJUSTMENT_QUANTITY_INVALID':
          return t('errors.adjustment_quantity_invalid')
        case 'INVENTORY_ADJUSTMENT_NOTES_REQUIRED':
          return t('errors.adjustment_notes_required')
        case 'INVENTORY_INSUFFICIENT_STOCK':
          return t('errors.insufficient_stock')
        case 'INVENTORY_RESTOCK_ITEMS_REQUIRED':
          return t('errors.restock_items_required')
        case 'INVENTORY_RESTOCK_PRODUCT_INVALID':
          return t('errors.restock_product_invalid')
        case 'INVENTORY_RESTOCK_QUANTITY_INVALID':
          return t('errors.restock_quantity_invalid')
        case 'INVENTORY_RESTOCK_UNIT_COST_INVALID':
          return t('errors.restock_unit_cost_invalid')
        case 'INVENTORY_RESTOCK_TOTAL_COST_INVALID':
          return t('errors.restock_total_cost_invalid')
        default:
          break
      }
    }

    return getApiErrorMessage(inventoryError, fallback)
  }

  useEffect(() => {
    if (!businessId) {
      setCategories([])
      return
    }

    const currentBusinessId = businessId
    let active = true

    async function loadCategories() {
      try {
        const result = await listCategoriesLocal(currentBusinessId)
        if (!active) return
        setCategories(result.data)
      } catch {
        // Inventory stays usable without category filter options.
      }
    }

    loadCategories()

    return () => {
      active = false
    }
  }, [businessId])

  useEffect(() => {
    if (!businessId) {
      setInventory(null)
      setAlerts(null)
      setLoading(false)
      return
    }

    const currentBusinessId = businessId
    let active = true

    async function loadInventoryWorkspace() {
      setLoading(true)
      setError(null)
      try {
        const [inventoryResult, alertsResult] = await Promise.all([
          listInventoryLocal(currentBusinessId, {
            page,
            limit: 10,
            sortBy: 'lastRestockAt',
            sortOrder: 'DESC',
            categoryId: categoryId || undefined,
            lowStockOnly: lowStockOnly || undefined,
          }),
          listInventoryAlertsLocal(currentBusinessId, {
            page: 1,
            limit: 6,
            sortBy: 'shortfall',
            sortOrder: 'DESC',
          }),
        ])

        if (!active) return

        setInventory(inventoryResult)
        setAlerts(alertsResult)
      } catch (loadError) {
        if (!active) return
        setError(getApiErrorMessage(loadError, t('errors.load')))
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadInventoryWorkspace()

    return () => {
      active = false
    }
  }, [businessId, categoryId, lowStockOnly, page, refreshKey, t])

  useEffect(() => {
    if (!inventory?.data.length) {
      setSelectedProductId(null)
      return
    }

    const selectionStillVisible = inventory.data.some(
      (item) => item.productId === selectedProductId,
    )

    if (!selectionStillVisible) {
      setSelectedProductId(inventory.data[0]?.productId ?? null)
    }
  }, [inventory, selectedProductId])

  useEffect(() => {
    const productId = selectedProductId
    if (!businessId || !productId) {
      setDetail(null)
      return
    }

    const currentBusinessId = businessId
    let active = true

    async function loadDetail(targetProductId: string) {
      setDetailLoading(true)
      setDetailError(null)
      try {
        const result = await getInventoryDetailLocal(currentBusinessId, targetProductId)
        if (!active) return
        setDetail(result)
      } catch (loadError) {
        if (!active) return
        setDetailError(getInventoryErrorMessage(loadError, t('errors.detail')))
      } finally {
        if (active) {
          setDetailLoading(false)
        }
      }
    }

    loadDetail(productId)

    return () => {
      active = false
    }
  }, [businessId, refreshKey, selectedProductId, t])

  useEffect(() => {
    setThresholdForm({
      lowStockThreshold: detail?.lowStockThreshold?.toString() ?? '',
      reorderPoint: detail?.reorderPoint?.toString() ?? '',
    })
  }, [detail?.lowStockThreshold, detail?.reorderPoint])

  useEffect(() => {
    setThresholdForm({
      lowStockThreshold: detail?.lowStockThreshold?.toString() ?? '',
      reorderPoint: detail?.reorderPoint?.toString() ?? '',
    })
    setAdjustForm({
      type: StockAdjustmentType.ADD,
      quantity: '',
      notes: '',
    })
    setRestockForm({
      quantity: '',
      unitCost: '',
      supplierName: '',
      referenceNumber: '',
      notes: '',
    })
    setActionError(null)
    setActionMessage(null)
  }, [detail?.productId])

  const inventoryItems = useMemo(() => inventory?.data ?? [], [inventory])
  const selectedItem = useMemo(
    () => inventoryItems.find((item) => item.productId === selectedProductId) ?? null,
    [inventoryItems, selectedProductId],
  )

  const handleThresholdSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!businessId || !selectedProductId) return

    const lowStockThresholdInput = parseOptionalNumberInput(thresholdForm.lowStockThreshold)
    if (lowStockThresholdInput.kind === 'invalid') {
      setActionError(t('errors.low_stock_threshold_invalid'))
      setActionMessage(null)
      return
    }

    const reorderPointInput = parseOptionalNumberInput(thresholdForm.reorderPoint)
    if (reorderPointInput.kind === 'invalid') {
      setActionError(t('errors.reorder_point_invalid'))
      setActionMessage(null)
      return
    }

    const currentBusinessId = businessId
    setSavingThresholds(true)
    setActionError(null)
    setActionMessage(null)
    try {
      const result = await setInventoryThresholdLocal(currentBusinessId, selectedProductId, {
        lowStockThreshold:
          lowStockThresholdInput.kind === 'value' ? lowStockThresholdInput.value : null,
        reorderPoint: reorderPointInput.kind === 'value' ? reorderPointInput.value : null,
      })
      setDetail(result)
      setActionMessage(t('thresholds.success'))
      setRefreshKey((current) => current + 1)
    } catch (submitError) {
      setActionError(getInventoryErrorMessage(submitError, t('errors.thresholds')))
    } finally {
      setSavingThresholds(false)
    }
  }

  const handleAdjustmentSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!businessId || !selectedProductId) return

    const quantityInput = parseRequiredNumberInput(adjustForm.quantity)
    if (quantityInput.kind !== 'value') {
      setActionError(t('errors.adjustment_quantity_invalid'))
      setActionMessage(null)
      return
    }

    const notes = adjustForm.notes.trim()
    if (notes.length < 3) {
      setActionError(t('errors.adjustment_notes_required'))
      setActionMessage(null)
      return
    }

    const currentBusinessId = businessId
    setSavingAdjustment(true)
    setActionError(null)
    setActionMessage(null)
    try {
      const result = await adjustInventoryLocal(currentBusinessId, selectedProductId, {
        type: adjustForm.type,
        quantity: quantityInput.value,
        notes,
      })
      setDetail(result)
      setActionMessage(t('adjustment.success'))
      setRefreshKey((current) => current + 1)
    } catch (submitError) {
      setActionError(getInventoryErrorMessage(submitError, t('errors.adjust')))
    } finally {
      setSavingAdjustment(false)
    }
  }

  const handleRestockSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!businessId || !selectedProductId) return

    const quantityInput = parseRequiredNumberInput(restockForm.quantity)
    if (quantityInput.kind !== 'value' || quantityInput.value < 0.001) {
      setActionError(t('errors.restock_quantity_invalid'))
      setActionMessage(null)
      return
    }

    const unitCostInput = parseOptionalNumberInput(restockForm.unitCost)
    if (
      unitCostInput.kind === 'invalid' ||
      (unitCostInput.kind === 'value' && unitCostInput.value < 0)
    ) {
      setActionError(t('errors.restock_unit_cost_invalid'))
      setActionMessage(null)
      return
    }

    const currentBusinessId = businessId
    const quantity = quantityInput.value
    const unitCost = unitCostInput.kind === 'value' ? unitCostInput.value : undefined

    setSavingRestock(true)
    setActionError(null)
    setActionMessage(null)
    try {
      await restockInventoryLocal(currentBusinessId, {
        referenceNumber: restockForm.referenceNumber.trim() || undefined,
        supplierName: restockForm.supplierName.trim() || undefined,
        notes: restockForm.notes.trim() || undefined,
        totalCost: unitCost !== undefined ? Number((unitCost * quantity).toFixed(2)) : undefined,
        items: [
          {
            productId: selectedProductId,
            quantity,
            unitCost,
          },
        ],
      })
      setActionMessage(t('restock.success'))
      setRefreshKey((current) => current + 1)
    } catch (submitError) {
      setActionError(getInventoryErrorMessage(submitError, t('errors.restock')))
    } finally {
      setSavingRestock(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
            {t('eyebrow')}
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">
            {t('title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button variant="secondary" onClick={() => setRefreshKey((current) => current + 1)}>
          {t('actions.refresh')}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t('metrics.tracked_products')}
          value={String(inventory?.total ?? 0)}
          hint={t('metrics.tracked_products_hint')}
        />
        <MetricCard
          label={t('metrics.alerts')}
          value={String(alerts?.total ?? 0)}
          hint={t('metrics.alerts_hint')}
          tone={(alerts?.total ?? 0) > 0 ? 'warning' : 'default'}
        />
        <MetricCard
          label={t('metrics.page_low_stock')}
          value={String(inventoryItems.filter((item) => item.isLowStock).length)}
          hint={t('metrics.page_low_stock_hint')}
          tone="accent"
        />
        <MetricCard
          label={t('metrics.selected_quantity')}
          value={formatQuantity(detail?.quantity)}
          hint={selectedItem?.productName || t('detail.empty_title')}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,1fr)]">
        <div className="space-y-6">
          <SurfaceCard title={t('alerts.title')} description={t('alerts.description')}>
            {alerts?.data?.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {alerts.data.map((alert) => (
                  <button
                    key={alert.productId}
                    type="button"
                    onClick={() => setSelectedProductId(alert.productId)}
                    className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left transition-colors hover:border-amber-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{alert.productName || '—'}</p>
                        <p className="text-sm text-muted-foreground">
                          {alert.categoryName || t('stock.uncategorized')}
                        </p>
                      </div>
                      <Badge variant="warning">-{formatQuantity(alert.shortfall)}</Badge>
                    </div>
                    <p className="mt-3 text-sm text-amber-700">
                      {t('alerts.summary', {currentQuantity: formatQuantity(alert.currentQuantity), threshold: formatQuantity(alert.lowStockThreshold)})
                        .replace('{currentQuantity}', formatQuantity(alert.currentQuantity))
                        .replace('{threshold}', formatQuantity(alert.lowStockThreshold))}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('alerts.empty')}</p>
            )}
          </SurfaceCard>

          <SurfaceCard title={t('stock.title')} description={t('stock.description')}>
            <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <label className="space-y-1">
                <span className="text-sm font-medium text-foreground">{t('filters.category')}</span>
                <select
                  className={selectClassName}
                  value={categoryId}
                  onChange={(event) => {
                    setCategoryId(event.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">{t('filters.all_categories')}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-end gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={lowStockOnly}
                  onChange={(event) => {
                    setLowStockOnly(event.target.checked)
                    setPage(1)
                  }}
                />
                {t('filters.low_stock_only')}
              </label>
            </div>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="flex min-h-[320px] items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : inventoryItems.length === 0 ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background px-6 text-center">
                <h4 className="text-lg font-semibold text-foreground">{t('stock.empty_title')}</h4>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  {t('stock.empty_description')}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {inventoryItems.map((item) => (
                  <button
                    key={item.productId}
                    type="button"
                    onClick={() => setSelectedProductId(item.productId)}
                    className={cn(
                      'w-full rounded-2xl border px-4 py-4 text-left transition-colors',
                      item.productId === selectedProductId
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-background hover:border-primary/30',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="truncate text-base font-semibold text-foreground">
                            {item.productName || '—'}
                          </h4>
                          {item.isLowStock ? (
                            <Badge variant="warning">{t('stock.low_stock_badge')}</Badge>
                          ) : (
                            <Badge variant="success">{t('stock.healthy_badge')}</Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.categoryName || t('stock.uncategorized')}
                          {' · '}
                          {item.unitAbbreviation || t('stock.no_unit')}
                        </p>
                      </div>

                      <div className="grid gap-2 text-right sm:grid-cols-3 sm:text-left lg:text-right">
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                            {t('stock.quantity')}
                          </p>
                          <p className="text-base font-semibold text-foreground">
                            {formatQuantity(item.quantity)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                            {t('stock.threshold')}
                          </p>
                          <p className="text-base font-semibold text-foreground">
                            {formatQuantity(item.lowStockThreshold)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                            {t('stock.last_restock')}
                          </p>
                          <p className="text-base font-semibold text-foreground">
                            {item.lastRestockAt
                              ? new Intl.DateTimeFormat(locale, {
                                  dateStyle: 'medium',
                                }).format(new Date(item.lastRestockAt))
                              : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4">
              <PaginationControls
                page={inventory?.page ?? 1}
                totalPages={inventory?.totalPages ?? 1}
                pageLabel={t('pagination.page_label', { page: inventory?.page ?? 1, totalPages: inventory?.totalPages ?? 1 })}
                previousLabel={t('pagination.previous')}
                nextLabel={t('pagination.next')}
                onPrevious={() => setPage((current) => Math.max(current - 1, 1))}
                onNext={() =>
                  setPage((current) =>
                    Math.min(current + 1, inventory?.totalPages ?? current + 1),
                  )
                }
              />
            </div>
          </SurfaceCard>
        </div>

        <div className="space-y-6">
          <SurfaceCard
            title={detail?.product.name || t('detail.empty_title')}
            description={detail?.product.sku || t('detail.empty_description')}
          >
            {detailError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {detailError}
              </div>
            ) : null}

            {!selectedProductId ? (
              <div className="rounded-2xl border border-dashed border-border bg-background px-5 py-10 text-center">
                <h4 className="text-lg font-semibold text-foreground">{t('detail.empty_title')}</h4>
                <p className="mt-2 text-sm text-muted-foreground">{t('detail.empty_description')}</p>
              </div>
            ) : detailLoading || !detail ? (
              <div className="flex min-h-[220px] items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-background px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {t('detail.current_quantity')}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">
                      {formatQuantity(detail.quantity)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {t('detail.last_restock')}
                    </p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {detail.lastRestockAt
                        ? new Intl.DateTimeFormat(locale, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(detail.lastRestockAt))
                        : '—'}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-background px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {t('detail.threshold')}
                    </p>
                    <p className="mt-2 text-base font-semibold text-foreground">
                      {formatQuantity(detail.lowStockThreshold)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {t('detail.reorder_point')}
                    </p>
                    <p className="mt-2 text-base font-semibold text-foreground">
                      {formatQuantity(detail.reorderPoint)}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {t('detail.movements')}
                    </h4>
                  </div>
                  {detail.movements.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('detail.no_movements')}</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.movements.map((movement) => (
                        <div
                          key={movement.id}
                          className="rounded-2xl border border-border bg-background px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={movementBadgeVariant(movement.type)}>
                                {formatEnumLabel(movement.type)}
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                {movement.performedBy?.name || t('detail.system')}
                              </span>
                            </div>
                            <div
                              className={cn(
                                'text-sm font-semibold',
                                movement.quantityChange >= 0
                                  ? 'text-emerald-600'
                                  : 'text-red-600',
                              )}
                            >
                              {movement.quantityChange >= 0 ? '+' : ''}
                              {formatQuantity(movement.quantityChange)}
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                            <span>
                              {t('detail.movement_summary', { before: formatQuantity(movement.quantityBefore), after: formatQuantity(movement.quantityAfter) })}
                            </span>
                            <span>
                              {new Intl.DateTimeFormat(locale, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              }).format(new Date(movement.createdAt))}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </SurfaceCard>

          {actionError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {actionError}
            </div>
          ) : null}

          {actionMessage ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {actionMessage}
            </div>
          ) : null}

          <SurfaceCard title={t('thresholds.title')} description={t('thresholds.description')}>
            <form className="space-y-4" onSubmit={handleThresholdSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberInput
                  label={t('thresholds.low_stock_threshold')}
                  min="0"
                  step="0.001"
                  value={thresholdForm.lowStockThreshold}
                  onChange={(event) =>
                    setThresholdForm((current) => ({
                      ...current,
                      lowStockThreshold: event.target.value,
                    }))
                  }
                  disabled={!detail}
                />
                <NumberInput
                  label={t('thresholds.reorder_point')}
                  min="0"
                  step="0.001"
                  value={thresholdForm.reorderPoint}
                  onChange={(event) =>
                    setThresholdForm((current) => ({
                      ...current,
                      reorderPoint: event.target.value,
                    }))
                  }
                  disabled={!detail}
                />
              </div>

              <Button type="submit" variant="secondary" className="w-full" disabled={!detail || savingThresholds}>
                {savingThresholds ? t('thresholds.submitting') : t('thresholds.submit')}
              </Button>
            </form>
          </SurfaceCard>

          <SurfaceCard title={t('adjustment.title')} description={t('adjustment.description')}>
            <form className="space-y-4" onSubmit={handleAdjustmentSubmit}>
              <label className="space-y-1">
                <span className="text-sm font-medium text-foreground">{t('adjustment.type')}</span>
                <select
                  className={selectClassName}
                  value={adjustForm.type}
                  onChange={(event) =>
                    setAdjustForm((current) => ({
                      ...current,
                      type: event.target.value as StockAdjustmentType,
                    }))
                  }
                  disabled={!detail}
                >
                  {Object.values(StockAdjustmentType).map((type) => (
                    <option key={type} value={type}>
                      {formatEnumLabel(type)}
                    </option>
                  ))}
                </select>
              </label>

              <NumberInput
                label={t('adjustment.quantity')}
                step="0.001"
                value={adjustForm.quantity}
                onChange={(event) =>
                  setAdjustForm((current) => ({ ...current, quantity: event.target.value }))
                }
                disabled={!detail}
              />

              <label className="block space-y-1">
                <span className="text-sm font-medium text-foreground">{t('adjustment.notes')}</span>
                <textarea
                  className={textareaClassName}
                  value={adjustForm.notes}
                  onChange={(event) =>
                    setAdjustForm((current) => ({ ...current, notes: event.target.value }))
                  }
                  disabled={!detail}
                />
              </label>

              <Button type="submit" variant="secondary" className="w-full" disabled={!detail || savingAdjustment}>
                {savingAdjustment ? t('adjustment.submitting') : t('adjustment.submit')}
              </Button>
            </form>
          </SurfaceCard>

          <SurfaceCard title={t('restock.title')} description={t('restock.description')}>
            <form className="space-y-4" onSubmit={handleRestockSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberInput
                  label={t('restock.quantity')}
                  min="0"
                  step="0.001"
                  value={restockForm.quantity}
                  onChange={(event) =>
                    setRestockForm((current) => ({ ...current, quantity: event.target.value }))
                  }
                  disabled={!detail}
                />
                <NumberInput
                  label={t('restock.unit_cost')}
                  min="0"
                  step="0.01"
                  value={restockForm.unitCost}
                  onChange={(event) =>
                    setRestockForm((current) => ({ ...current, unitCost: event.target.value }))
                  }
                  disabled={!detail}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label={t('restock.supplier')}
                  value={restockForm.supplierName}
                  onChange={(event) =>
                    setRestockForm((current) => ({
                      ...current,
                      supplierName: event.target.value,
                    }))
                  }
                  disabled={!detail}
                />
                <Input
                  label={t('restock.reference')}
                  value={restockForm.referenceNumber}
                  onChange={(event) =>
                    setRestockForm((current) => ({
                      ...current,
                      referenceNumber: event.target.value,
                    }))
                  }
                  disabled={!detail}
                />
              </div>

              <label className="block space-y-1">
                <span className="text-sm font-medium text-foreground">{t('restock.notes')}</span>
                <textarea
                  className={textareaClassName}
                  value={restockForm.notes}
                  onChange={(event) =>
                    setRestockForm((current) => ({ ...current, notes: event.target.value }))
                  }
                  disabled={!detail}
                />
              </label>

              <Button type="submit" variant="primary" className="w-full" disabled={!detail || savingRestock}>
                {savingRestock ? t('restock.submitting') : t('restock.submit')}
              </Button>
            </form>
          </SurfaceCard>
        </div>
      </div>
    </div>
  )
}
