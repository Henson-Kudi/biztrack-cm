'use client'

import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Badge, Button, Input, NumberInput, Spinner } from '@biztrack/ui'
import {
  InventoryMovementType,
  StockAdjustmentType,
  type InventoryDetail,
  type InventoryMovement,
  type PaginatedResult,
  type Product,
  type ProductCategory,
  type UnitOfMeasure,
} from '@biztrack/types'
import { MetricCard } from '@/components/catalog/MetricCard'
import { PaginationControls } from '@/components/catalog/PaginationControls'
import { SurfaceCard } from '@/components/catalog/SurfaceCard'
import { ProductUpdateDialog } from '@/components/products/ProductUpdateDialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  formatDateLabel,
  formatProductPrice,
  formatQuantity,
  isLowStockProduct,
} from '@/components/products/product-utils'
import { cn } from '@/lib/utils'
import { getApiErrorMessage } from '@/services/api-response'
import {
  InventoryLocalError,
  adjustInventoryLocal,
  getInventoryDetailLocal,
  listInventoryMovementsLocal,
  restockInventoryLocal,
  setInventoryThresholdLocal,
} from '@/services/inventory.local'
import {
  deleteProductLocal,
  getProductByIdLocal,
  listCategoriesLocal,
  listUnitOfMeasuresLocal,
  setProductActiveStateLocal,
} from '@/services/products.local'
import { useAuthStore } from '@/stores/auth.store'

type ThresholdFormState = {
  lowStockThreshold: string
  reorderPoint: string
}

type AdjustmentFormState = {
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

const textareaClassName =
  'block min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring'
const menuItemClassName =
  'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50'
const iconButtonClassName =
  'inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground'

function createDefaultAdjustmentForm(): AdjustmentFormState {
  return {
    type: StockAdjustmentType.ADD,
    quantity: '',
    notes: '',
  }
}

function createDefaultRestockForm(): RestockFormState {
  return {
    quantity: '',
    unitCost: '',
    supplierName: '',
    referenceNumber: '',
    notes: '',
  }
}

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

function movementBadgeVariant(type: InventoryMovementType) {
  if (type === InventoryMovementType.RESTOCK_IN || type === InventoryMovementType.OPENING_STOCK) {
    return 'success'
  }

  if (type === InventoryMovementType.SALE || type === InventoryMovementType.TRANSFER_OUT) {
    return 'danger'
  }

  return 'info'
}

function isValidAdjustmentQuantity(type: StockAdjustmentType, quantity: number) {
  if (type === StockAdjustmentType.SET) {
    return quantity >= 0
  }

  return quantity > 0
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'absolute'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

export default function ProductDetailPage() {
  const t = useTranslations('app.products')
  const inventoryT = useTranslations('app.inventory')
  const locale = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const productId = searchParams.get('productId') ?? ''
  const businessId = useAuthStore((state) => state.businessId)
  const [product, setProduct] = useState<Product | null>(null)
  const [inventoryDetail, setInventoryDetail] = useState<InventoryDetail | null>(null)
  const [recentMovements, setRecentMovements] = useState<PaginatedResult<InventoryMovement> | null>(
    null,
  )
  const [allMovements, setAllMovements] = useState<PaginatedResult<InventoryMovement> | null>(null)
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [units, setUnits] = useState<UnitOfMeasure[]>([])
  const [loading, setLoading] = useState(true)
  const [metadataLoading, setMetadataLoading] = useState(true)
  const [movementsLoading, setMovementsLoading] = useState(false)
  const [allMovementsLoading, setAllMovementsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inventoryError, setInventoryError] = useState<string | null>(null)
  const [allMovementsError, setAllMovementsError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [movementsPage, setMovementsPage] = useState(1)
  const [isUpdateOpen, setIsUpdateOpen] = useState(false)
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false)
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false)
  const [isRestockOpen, setIsRestockOpen] = useState(false)
  const [isMovementsOpen, setIsMovementsOpen] = useState(false)
  const [markingInactive, setMarkingInactive] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [savingThresholds, setSavingThresholds] = useState(false)
  const [savingAdjustment, setSavingAdjustment] = useState(false)
  const [savingRestock, setSavingRestock] = useState(false)
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null)
  const [restockError, setRestockError] = useState<string | null>(null)
  const [thresholdForm, setThresholdForm] = useState<ThresholdFormState>({
    lowStockThreshold: '',
    reorderPoint: '',
  })
  const [adjustmentForm, setAdjustmentForm] = useState<AdjustmentFormState>(
    createDefaultAdjustmentForm(),
  )
  const [restockForm, setRestockForm] = useState<RestockFormState>(createDefaultRestockForm())

  const getInventoryErrorMessage = (inventoryErrorValue: unknown, fallback: string) => {
    if (inventoryErrorValue instanceof InventoryLocalError) {
      switch (inventoryErrorValue.code) {
        case 'INVENTORY_NOT_FOUND':
          return inventoryT('errors.inventory_not_found')
        case 'INVENTORY_LOW_STOCK_THRESHOLD_INVALID':
          return inventoryT('errors.low_stock_threshold_invalid')
        case 'INVENTORY_REORDER_POINT_INVALID':
          return inventoryT('errors.reorder_point_invalid')
        case 'INVENTORY_ADJUSTMENT_QUANTITY_INVALID':
          return inventoryT('errors.adjustment_quantity_invalid')
        case 'INVENTORY_ADJUSTMENT_NOTES_REQUIRED':
          return inventoryT('errors.adjustment_notes_required')
        case 'INVENTORY_INSUFFICIENT_STOCK':
          return inventoryT('errors.insufficient_stock')
        case 'INVENTORY_RESTOCK_ITEMS_REQUIRED':
          return inventoryT('errors.restock_items_required')
        case 'INVENTORY_RESTOCK_PRODUCT_INVALID':
          return inventoryT('errors.restock_product_invalid')
        case 'INVENTORY_RESTOCK_QUANTITY_INVALID':
          return inventoryT('errors.restock_quantity_invalid')
        case 'INVENTORY_RESTOCK_UNIT_COST_INVALID':
          return inventoryT('errors.restock_unit_cost_invalid')
        case 'INVENTORY_RESTOCK_TOTAL_COST_INVALID':
          return inventoryT('errors.restock_total_cost_invalid')
        default:
          break
      }
    }

    return getApiErrorMessage(inventoryErrorValue, fallback)
  }

  useEffect(() => {
    if (!businessId) {
      setCategories([])
      setUnits([])
      setMetadataLoading(false)
      return
    }

    const currentBusinessId = businessId
    let active = true

    async function loadMetadata() {
      setMetadataLoading(true)

      try {
        const [categoriesResult, unitsResult] = await Promise.all([
          listCategoriesLocal(currentBusinessId, {
            page: 1,
            limit: 20,
            sortBy: 'name',
            sortOrder: 'ASC',
          }),
          listUnitOfMeasuresLocal(currentBusinessId, {
            page: 1,
            limit: 50,
            sortBy: 'name',
            sortOrder: 'ASC',
          }),
        ])

        if (!active) {
          return
        }

        setCategories(categoriesResult.data)
        setUnits(unitsResult.data)
      } catch (loadError) {
        if (!active) {
          return
        }

        toast.error(getApiErrorMessage(loadError, t('errors.metadata')))
      } finally {
        if (active) {
          setMetadataLoading(false)
        }
      }
    }

    void loadMetadata()

    return () => {
      active = false
    }
  }, [businessId, t])

  useEffect(() => {
    if (!businessId || !productId) {
      setProduct(null)
      setInventoryDetail(null)
      setLoading(false)
      return
    }

    const currentBusinessId = businessId
    let active = true

    async function loadProductWorkspace() {
      setLoading(true)
      setError(null)
      setInventoryError(null)

      try {
        const nextProduct = await getProductByIdLocal(currentBusinessId, productId)

        if (!active) {
          return
        }

        if (!nextProduct) {
          setProduct(null)
          setInventoryDetail(null)
          return
        }

        setProduct(nextProduct)

        if (!nextProduct.trackInventory) {
          setInventoryDetail(null)
          return
        }

        try {
          const nextInventoryDetail = await getInventoryDetailLocal(currentBusinessId, productId)

          if (!active) {
            return
          }

          setInventoryDetail(nextInventoryDetail)
        } catch (inventoryLoadError) {
          if (!active) {
            return
          }

          setInventoryDetail(null)
          setInventoryError(getInventoryErrorMessage(inventoryLoadError, inventoryT('errors.detail')))
        }
      } catch (loadError) {
        if (!active) {
          return
        }

        setError(getApiErrorMessage(loadError, t('errors.load')))
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadProductWorkspace()

    return () => {
      active = false
    }
  }, [businessId, inventoryT, productId, reloadKey, t])

  useEffect(() => {
    if (!businessId || !product?.id || !product.trackInventory) {
      setRecentMovements(null)
      setMovementsLoading(false)
      return
    }

    const currentBusinessId = businessId
    const currentProductId = product.id
    let active = true

    async function loadRecentMovements() {
      setMovementsLoading(true)

      try {
        const result = await listInventoryMovementsLocal(currentBusinessId, {
          productId: currentProductId,
          page: 1,
          limit: 5,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
        })

        if (!active) {
          return
        }

        setRecentMovements(result)
      } catch (loadError) {
        if (!active) {
          return
        }

        toast.error(getInventoryErrorMessage(loadError, inventoryT('errors.detail')))
      } finally {
        if (active) {
          setMovementsLoading(false)
        }
      }
    }

    void loadRecentMovements()

    return () => {
      active = false
    }
  }, [businessId, inventoryT, product?.id, product?.trackInventory, reloadKey])

  useEffect(() => {
    if (!isMovementsOpen) {
      setAllMovements(null)
      setAllMovementsError(null)
      setMovementsPage(1)
      return
    }

    if (!businessId || !product?.id || !product.trackInventory) {
      setAllMovements(null)
      setAllMovementsLoading(false)
      return
    }

    const currentBusinessId = businessId
    const currentProductId = product.id
    let active = true

    async function loadAllMovements() {
      setAllMovementsLoading(true)
      setAllMovementsError(null)

      try {
        const result = await listInventoryMovementsLocal(currentBusinessId, {
          productId: currentProductId,
          page: movementsPage,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
        })

        if (!active) {
          return
        }

        setAllMovements(result)
      } catch (loadError) {
        if (!active) {
          return
        }

        setAllMovementsError(getInventoryErrorMessage(loadError, inventoryT('errors.detail')))
      } finally {
        if (active) {
          setAllMovementsLoading(false)
        }
      }
    }

    void loadAllMovements()

    return () => {
      active = false
    }
  }, [businessId, inventoryT, isMovementsOpen, movementsPage, product?.id, product?.trackInventory, reloadKey])

  useEffect(() => {
    setThresholdForm({
      lowStockThreshold: inventoryDetail?.lowStockThreshold?.toString() ?? '',
      reorderPoint: inventoryDetail?.reorderPoint?.toString() ?? '',
    })
  }, [inventoryDetail?.lowStockThreshold, inventoryDetail?.reorderPoint])

  useEffect(() => {
    setAdjustmentForm(createDefaultAdjustmentForm())
    setRestockForm(createDefaultRestockForm())
    setAdjustmentError(null)
    setRestockError(null)
    setIsAdjustmentOpen(false)
    setIsRestockOpen(false)
    setIsMovementsOpen(false)
    setIsActionMenuOpen(false)
  }, [product?.id])

  const lowStock = useMemo(() => (product ? isLowStockProduct(product) : false), [product])
  const recentMovementItems = useMemo(() => recentMovements?.data ?? [], [recentMovements])
  const allMovementItems = useMemo(() => allMovements?.data ?? [], [allMovements])

  const handleCopyValue = async (value: string | null | undefined, label: string) => {
    if (!value) {
      return
    }

    try {
      await copyTextToClipboard(value)
      toast.success(t('detail.copy_success', { label }))
    } catch {
      toast.error(t('detail.copy_failed'))
    }
  }

  const handleMarkInactive = async () => {
    if (!businessId || !product || !product.isActive) {
      return
    }

    setMarkingInactive(true)

    try {
      const updatedProduct = await setProductActiveStateLocal(businessId, product.id, false)
      setProduct(updatedProduct)
      toast.success(t('detail.inactive_success'))
    } catch (submitError) {
      toast.error(getApiErrorMessage(submitError, t('errors.deactivate')))
    } finally {
      setMarkingInactive(false)
    }
  }

  const handleDelete = async () => {
    if (!businessId || !product) {
      return
    }

    if (!window.confirm(t('detail.delete_confirm'))) {
      return
    }

    setDeleting(true)

    try {
      await deleteProductLocal(businessId, product.id)
      toast.success(t('detail.delete_success'))
      router.back()
    } catch (submitError) {
      toast.error(getApiErrorMessage(submitError, t('errors.delete')))
    } finally {
      setDeleting(false)
    }
  }

  const handleThresholdSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!businessId || !product || !product.trackInventory) {
      return
    }

    const lowStockThresholdInput = parseOptionalNumberInput(thresholdForm.lowStockThreshold)
    if (lowStockThresholdInput.kind === 'invalid') {
      toast.error(inventoryT('errors.low_stock_threshold_invalid'))
      return
    }

    const reorderPointInput = parseOptionalNumberInput(thresholdForm.reorderPoint)
    if (reorderPointInput.kind === 'invalid') {
      toast.error(inventoryT('errors.reorder_point_invalid'))
      return
    }

    setSavingThresholds(true)

    try {
      const updatedInventoryDetail = await setInventoryThresholdLocal(businessId, product.id, {
        lowStockThreshold:
          lowStockThresholdInput.kind === 'value' ? lowStockThresholdInput.value : null,
        reorderPoint: reorderPointInput.kind === 'value' ? reorderPointInput.value : null,
      })

      setInventoryDetail(updatedInventoryDetail)
      setReloadKey((current) => current + 1)
      toast.success(inventoryT('thresholds.success'))
    } catch (submitError) {
      toast.error(getInventoryErrorMessage(submitError, inventoryT('errors.thresholds')))
    } finally {
      setSavingThresholds(false)
    }
  }

  const handleAdjustmentSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!businessId || !product || !product.trackInventory) {
      return
    }

    const quantityInput = parseRequiredNumberInput(adjustmentForm.quantity)
    if (
      quantityInput.kind !== 'value' ||
      !isValidAdjustmentQuantity(adjustmentForm.type, quantityInput.value)
    ) {
      setAdjustmentError(inventoryT('errors.adjustment_quantity_invalid'))
      return
    }

    const notes = adjustmentForm.notes.trim()
    if (notes.length < 3) {
      setAdjustmentError(inventoryT('errors.adjustment_notes_required'))
      return
    }

    setSavingAdjustment(true)
    setAdjustmentError(null)

    try {
      const updatedInventoryDetail = await adjustInventoryLocal(businessId, product.id, {
        type: adjustmentForm.type,
        quantity: quantityInput.value,
        notes,
      })

      setInventoryDetail(updatedInventoryDetail)
      setReloadKey((current) => current + 1)
      setAdjustmentForm(createDefaultAdjustmentForm())
      setIsAdjustmentOpen(false)
      toast.success(inventoryT('adjustment.success'))
    } catch (submitError) {
      setAdjustmentError(getInventoryErrorMessage(submitError, inventoryT('errors.adjust')))
    } finally {
      setSavingAdjustment(false)
    }
  }

  const handleRestockSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!businessId || !product || !product.trackInventory) {
      return
    }

    const quantityInput = parseRequiredNumberInput(restockForm.quantity)
    if (quantityInput.kind !== 'value' || quantityInput.value < 0.001) {
      setRestockError(inventoryT('errors.restock_quantity_invalid'))
      return
    }

    const unitCostInput = parseOptionalNumberInput(restockForm.unitCost)
    if (
      unitCostInput.kind === 'invalid' ||
      (unitCostInput.kind === 'value' && unitCostInput.value < 0)
    ) {
      setRestockError(inventoryT('errors.restock_unit_cost_invalid'))
      return
    }

    setSavingRestock(true)
    setRestockError(null)

    try {
      const unitCost = unitCostInput.kind === 'value' ? unitCostInput.value : undefined

      await restockInventoryLocal(businessId, {
        referenceNumber: restockForm.referenceNumber.trim() || undefined,
        supplierName: restockForm.supplierName.trim() || undefined,
        notes: restockForm.notes.trim() || undefined,
        totalCost:
          unitCost !== undefined
            ? Number((unitCost * quantityInput.value).toFixed(2))
            : undefined,
        items: [
          {
            productId: product.id,
            quantity: quantityInput.value,
            unitCost,
          },
        ],
      })

      setReloadKey((current) => current + 1)
      setRestockForm(createDefaultRestockForm())
      setIsRestockOpen(false)
      toast.success(inventoryT('restock.success'))
    } catch (submitError) {
      setRestockError(getInventoryErrorMessage(submitError, inventoryT('errors.restock')))
    } finally {
      setSavingRestock(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (!product) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 text-center">
        <h2 className="text-2xl font-semibold text-foreground">{t('detail.not_found_title')}</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {t('detail.not_found_description')}
        </p>
        <Button variant="secondary" onClick={() => router.back()} className="mt-5">
          <BackIcon />
          <span>{t('actions.back')}</span>
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Button variant="ghost" onClick={() => router.back()} className="px-0">
            <BackIcon />
            <span>{t('actions.back')}</span>
          </Button>

          <Popover open={isActionMenuOpen} onOpenChange={setIsActionMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                className="h-10 w-10 rounded-full px-0"
                aria-label={t('actions.more_actions')}
              >
                <MoreHorizontalIcon />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-1">
              <MenuActionButton
                onClick={() => {
                  setIsActionMenuOpen(false)
                  setIsUpdateOpen(true)
                }}
                disabled={metadataLoading}
              >
                {t('actions.update_product')}
              </MenuActionButton>
              <MenuActionButton
                onClick={() => {
                  setIsActionMenuOpen(false)
                  setRestockForm(createDefaultRestockForm())
                  setRestockError(null)
                  setIsRestockOpen(true)
                }}
                disabled={!product.trackInventory}
              >
                {t('actions.restock')}
              </MenuActionButton>
              <MenuActionButton
                onClick={() => {
                  setIsActionMenuOpen(false)
                  void handleMarkInactive()
                }}
                disabled={markingInactive || deleting || !product.isActive}
              >
                {product.isActive ? t('actions.mark_inactive') : t('detail.inactive_state')}
              </MenuActionButton>
              <MenuActionButton
                onClick={() => {
                  setIsActionMenuOpen(false)
                  void handleDelete()
                }}
                disabled={deleting}
                destructive
              >
                {deleting ? t('actions.deleting') : t('actions.delete')}
              </MenuActionButton>
            </PopoverContent>
          </Popover>
        </div>

        <SurfaceCard>
          <div className="flex flex-wrap items-start gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[28px] bg-primary/10 text-xl font-semibold text-primary">
              {product.primaryImageUrl ? (
                <img
                  src={product.primaryImageUrl}
                  alt={product.name}
                  className="h-full w-full rounded-[28px] object-cover"
                />
              ) : (
                product.name.slice(0, 2).toUpperCase()
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3 text-xs font-medium uppercase tracking-[0.18em] text-primary">
                  <span>{t('eyebrow')}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-muted-foreground">{t('detail.title')}</span>
                </div>
                <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                  {product.name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {product.description?.trim() || t('detail.no_description')}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant={product.isActive ? 'success' : 'neutral'}>
                  {product.isActive ? t('badges.active') : t('badges.inactive')}
                </Badge>
                <Badge variant={product.isService ? 'info' : 'neutral'}>
                  {product.isService ? t('badges.service') : t('badges.product')}
                </Badge>
                <Badge variant={product.trackInventory ? 'info' : 'neutral'}>
                  {product.trackInventory ? t('badges.tracked') : t('badges.untracked')}
                </Badge>
                {lowStock ? <Badge variant="warning">{t('badges.low_stock')}</Badge> : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label={t('detail.metrics.price')}
                  value={formatProductPrice(product, locale)}
                />
                <MetricCard
                  label={t('detail.metrics.stock')}
                  value={
                    product.trackInventory
                      ? formatQuantity(inventoryDetail?.quantity ?? product.currentStock)
                      : t('list.not_tracked')
                  }
                  tone={lowStock ? 'warning' : 'default'}
                />
                <MetricCard
                  label={t('detail.metrics.threshold')}
                  value={
                    product.trackInventory
                      ? formatQuantity(
                          inventoryDetail?.lowStockThreshold ?? product.lowStockThreshold,
                        )
                      : t('list.not_tracked')
                  }
                />
                <MetricCard
                  label={t('detail.metrics.updated')}
                  value={formatDateLabel(product.updatedAt, locale)}
                />
              </div>
            </div>
          </div>
        </SurfaceCard>

        {inventoryError ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {inventoryError}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
          <SurfaceCard
            title={t('detail.overview_title')}
            description={t('detail.overview_description')}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <DetailItem label={t('detail.fields.category')}>
                {product.category?.name || t('list.uncategorized')}
              </DetailItem>
              <DetailItem label={t('detail.fields.unit')}>
                {product.unitOfMeasure?.abbreviation || t('list.no_unit')}
              </DetailItem>
              <DetailItem
                label={t('detail.fields.sku')}
                action={
                  product.sku ? (
                    <CopyValueButton
                      label={t('detail.copy_value')}
                      onClick={() => void handleCopyValue(product.sku, t('detail.fields.sku'))}
                    />
                  ) : null
                }
              >
                {product.sku || '-'}
              </DetailItem>
              <DetailItem
                label={t('detail.fields.barcode')}
                action={
                  product.barcode ? (
                    <CopyValueButton
                      label={t('detail.copy_value')}
                      onClick={() =>
                        void handleCopyValue(product.barcode, t('detail.fields.barcode'))
                      }
                    />
                  ) : null
                }
              >
                {product.barcode || '-'}
              </DetailItem>
              <DetailItem label={t('detail.fields.cost_price')}>
                {product.costPrice !== null && product.costPrice !== undefined
                  ? new Intl.NumberFormat(locale, {
                      style: 'currency',
                      currency: product.currency || 'XAF',
                      maximumFractionDigits: 0,
                    }).format(product.costPrice)
                  : '-'}
              </DetailItem>
              <DetailItem label={t('detail.fields.tax_rate')}>{product.taxRate}%</DetailItem>
              <DetailItem label={t('detail.fields.created_at')}>
                {formatDateLabel(product.createdAt, locale)}
              </DetailItem>
              <DetailItem label={t('detail.fields.updated_at')}>
                {formatDateLabel(product.updatedAt, locale)}
              </DetailItem>
            </div>
          </SurfaceCard>

          <SurfaceCard
            title={t('detail.inventory_title')}
            description={t('detail.inventory_description')}
          >
            <div className="grid gap-4">
              <DetailItem label={t('detail.fields.current_stock')}>
                {product.trackInventory
                  ? formatQuantity(inventoryDetail?.quantity ?? product.currentStock)
                  : t('list.not_tracked')}
              </DetailItem>
              <DetailItem label={t('detail.fields.low_stock_threshold')}>
                {product.trackInventory
                  ? formatQuantity(
                      inventoryDetail?.lowStockThreshold ?? product.lowStockThreshold,
                    )
                  : t('list.not_tracked')}
              </DetailItem>
              <DetailItem label={t('detail.fields.reorder_point')}>
                {product.trackInventory
                  ? formatQuantity(inventoryDetail?.reorderPoint ?? product.reorderPoint)
                  : t('list.not_tracked')}
              </DetailItem>
              <DetailItem label={inventoryT('detail.last_restock')}>
                {product.trackInventory
                  ? formatDateLabel(inventoryDetail?.lastRestockAt, locale)
                  : t('list.not_tracked')}
              </DetailItem>
              <DetailItem label={t('detail.fields.barcode_type')}>
                {product.barcodeType || '-'}
              </DetailItem>
              <DetailItem label={t('detail.fields.slug')}>{product.slug}</DetailItem>
            </div>
          </SurfaceCard>
        </div>

        {product.trackInventory ? (
          <>
            <SurfaceCard
              title={inventoryT('detail.movement_logs')}
              description={t('detail.movements_description')}
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setAdjustmentForm(createDefaultAdjustmentForm())
                    setAdjustmentError(null)
                    setIsAdjustmentOpen(true)
                  }}
                >
                  {inventoryT('adjustment.open')}
                </Button>
              }
            >
              {movementsLoading ? (
                <div className="flex min-h-[180px] items-center justify-center">
                  <Spinner size="lg" />
                </div>
              ) : recentMovementItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">{inventoryT('detail.no_movements')}</p>
              ) : (
                <div className="space-y-2">
                  {recentMovementItems.map((movement) => (
                    <MovementCard
                      key={movement.id}
                      movement={movement}
                      locale={locale}
                      summaryLabel={inventoryT('detail.movement_summary', {
                        before: formatQuantity(movement.quantityBefore),
                        after: formatQuantity(movement.quantityAfter),
                      })}
                      systemLabel={inventoryT('detail.system')}
                    />
                  ))}
                </div>
              )}

              {(recentMovements?.total ?? 0) > 5 ? (
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setMovementsPage(1)
                      setIsMovementsOpen(true)
                    }}
                    className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
                  >
                    {inventoryT('detail.view_all')}
                  </button>
                </div>
              ) : null}
            </SurfaceCard>

            <SurfaceCard
              title={inventoryT('thresholds.title')}
              description={inventoryT('thresholds.description')}
              className="max-w-3xl"
            >
              <form className="space-y-4" onSubmit={handleThresholdSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberInput
                    label={inventoryT('thresholds.low_stock_threshold')}
                    min="0"
                    step="0.001"
                    value={thresholdForm.lowStockThreshold}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setThresholdForm((current) => ({
                        ...current,
                        lowStockThreshold: event.target.value,
                      }))
                    }
                  />
                  <NumberInput
                    label={inventoryT('thresholds.reorder_point')}
                    min="0"
                    step="0.001"
                    value={thresholdForm.reorderPoint}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setThresholdForm((current) => ({
                        ...current,
                        reorderPoint: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="flex justify-end">
                  <Button type="submit" variant="primary" disabled={savingThresholds}>
                    {savingThresholds
                      ? inventoryT('thresholds.submitting')
                      : inventoryT('thresholds.submit')}
                  </Button>
                </div>
              </form>
            </SurfaceCard>
          </>
        ) : (
          <SurfaceCard
            title={t('detail.inventory_disabled_title')}
            description={t('detail.inventory_disabled_description')}
          >
            <Button
              variant="secondary"
              onClick={() => setIsUpdateOpen(true)}
              disabled={metadataLoading}
            >
              {t('detail.enable_tracking')}
            </Button>
          </SurfaceCard>
        )}
      </div>

      <Dialog open={isAdjustmentOpen} onOpenChange={setIsAdjustmentOpen}>
        <DialogContent
          className="max-h-[calc(100vh-4rem)] max-w-xl"
          closeLabel={inventoryT('dialog.close')}
        >
          <DialogHeader>
            <DialogTitle>{inventoryT('adjustment.title')}</DialogTitle>
            <DialogDescription>{inventoryT('adjustment.description')}</DialogDescription>
          </DialogHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleAdjustmentSubmit}>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {adjustmentError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {adjustmentError}
                </div>
              ) : null}

              <div className="space-y-1">
                <span className="text-sm font-medium text-foreground">
                  {inventoryT('adjustment.type')}
                </span>
                <Select
                  value={adjustmentForm.type}
                  onValueChange={(value) =>
                    setAdjustmentForm((current) => ({
                      ...current,
                      type: value as StockAdjustmentType,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={inventoryT('adjustment.type')} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(StockAdjustmentType).map((type) => (
                      <SelectItem key={type} value={type}>
                        {formatEnumLabel(type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <NumberInput
                label={inventoryT('adjustment.quantity')}
                min="0"
                step="0.001"
                value={adjustmentForm.quantity}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setAdjustmentForm((current) => ({
                    ...current,
                    quantity: event.target.value,
                  }))
                }
              />

              <label className="space-y-1">
                <span className="text-sm font-medium text-foreground">
                  {inventoryT('adjustment.notes')}
                </span>
                <textarea
                  className={textareaClassName}
                  value={adjustmentForm.notes}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                    setAdjustmentForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsAdjustmentOpen(false)}
              >
                {t('form.cancel')}
              </Button>
              <Button type="submit" variant="primary" disabled={savingAdjustment}>
                {savingAdjustment
                  ? inventoryT('adjustment.submitting')
                  : inventoryT('adjustment.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isRestockOpen} onOpenChange={setIsRestockOpen}>
        <DialogContent
          className="max-h-[calc(100vh-4rem)] max-w-2xl"
          closeLabel={inventoryT('dialog.close')}
        >
          <DialogHeader>
            <DialogTitle>{inventoryT('restock.title')}</DialogTitle>
            <DialogDescription>{inventoryT('restock.description')}</DialogDescription>
          </DialogHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleRestockSubmit}>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {restockError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {restockError}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <NumberInput
                  label={inventoryT('restock.quantity')}
                  min="0"
                  step="0.001"
                  value={restockForm.quantity}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setRestockForm((current) => ({
                      ...current,
                      quantity: event.target.value,
                    }))
                  }
                />
                <NumberInput
                  label={inventoryT('restock.unit_cost')}
                  min="0"
                  step="0.01"
                  value={restockForm.unitCost}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setRestockForm((current) => ({
                      ...current,
                      unitCost: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label={inventoryT('restock.supplier')}
                  value={restockForm.supplierName}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setRestockForm((current) => ({
                      ...current,
                      supplierName: event.target.value,
                    }))
                  }
                />
                <Input
                  label={inventoryT('restock.reference')}
                  value={restockForm.referenceNumber}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setRestockForm((current) => ({
                      ...current,
                      referenceNumber: event.target.value,
                    }))
                  }
                />
              </div>

              <label className="space-y-1">
                <span className="text-sm font-medium text-foreground">
                  {inventoryT('restock.notes')}
                </span>
                <textarea
                  className={textareaClassName}
                  value={restockForm.notes}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                    setRestockForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsRestockOpen(false)}
              >
                {t('form.cancel')}
              </Button>
              <Button type="submit" variant="primary" disabled={savingRestock}>
                {savingRestock ? inventoryT('restock.submitting') : inventoryT('restock.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isMovementsOpen} onOpenChange={setIsMovementsOpen}>
        <DialogContent
          className="max-h-[calc(100vh-4rem)] max-w-3xl"
          closeLabel={inventoryT('dialog.close')}
        >
          <DialogHeader>
            <DialogTitle>{inventoryT('detail.all_movements_title')}</DialogTitle>
            <DialogDescription>{inventoryT('detail.all_movements_description')}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {allMovementsError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {allMovementsError}
              </div>
            ) : null}

            {allMovementsLoading ? (
              <div className="flex min-h-[280px] items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : allMovementItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">{inventoryT('detail.no_movements')}</p>
            ) : (
              <div className="space-y-2">
                {allMovementItems.map((movement) => (
                  <MovementCard
                    key={movement.id}
                    movement={movement}
                    locale={locale}
                    summaryLabel={inventoryT('detail.movement_summary', {
                      before: formatQuantity(movement.quantityBefore),
                      after: formatQuantity(movement.quantityAfter),
                    })}
                    systemLabel={inventoryT('detail.system')}
                  />
                ))}
              </div>
            )}

            <PaginationControls
              page={allMovements?.page ?? 1}
              totalPages={allMovements?.totalPages ?? 1}
              pageLabel={inventoryT('pagination.page_label', {
                page: allMovements?.page ?? 1,
                totalPages: allMovements?.totalPages ?? 1,
              })}
              previousLabel={inventoryT('pagination.previous')}
              nextLabel={inventoryT('pagination.next')}
              onPrevious={() => setMovementsPage((current) => Math.max(current - 1, 1))}
              onNext={() =>
                setMovementsPage((current) =>
                  Math.min(current + 1, allMovements?.totalPages ?? current + 1),
                )
              }
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setIsMovementsOpen(false)}>
              {inventoryT('dialog.close_action')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductUpdateDialog
        businessId={businessId}
        product={product}
        categories={categories}
        units={units}
        open={isUpdateOpen}
        onOpenChange={setIsUpdateOpen}
        onUpdated={(updatedProduct) => {
          setProduct(updatedProduct)
          setReloadKey((current) => current + 1)
        }}
      />
    </>
  )
}

function DetailItem({
  label,
  action,
  children,
}: {
  label: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/60 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-2 text-sm font-medium text-foreground">{children}</div>
    </div>
  )
}

function CopyValueButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className={iconButtonClassName} aria-label={label}>
      <CopyIcon />
    </button>
  )
}

function MenuActionButton({
  children,
  destructive = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      className={cn(
        menuItemClassName,
        destructive && 'text-destructive hover:bg-destructive/10 hover:text-destructive',
      )}
      {...props}
    >
      <span>{children}</span>
    </button>
  )
}

function MovementCard({
  movement,
  locale,
  summaryLabel,
  systemLabel,
}: {
  movement: InventoryMovement
  locale: string
  summaryLabel: string
  systemLabel: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-background px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={movementBadgeVariant(movement.type)}>
            {formatEnumLabel(movement.type)}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {movement.performedBy?.name || systemLabel}
          </span>
        </div>
        <div
          className={cn(
            'text-sm font-semibold',
            movement.quantityChange >= 0 ? 'text-emerald-600' : 'text-red-600',
          )}
        >
          {movement.quantityChange >= 0 ? '+' : ''}
          {formatQuantity(movement.quantityChange)}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{summaryLabel}</span>
        <span>{formatDateLabel(movement.createdAt, locale)}</span>
      </div>
      {movement.notes ? <p className="mt-2 text-sm text-foreground">{movement.notes}</p> : null}
    </div>
  )
}

function BackIcon() {
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
      <path d="m8 4-6 6 6 6" />
      <path d="M3 10h15" />
    </svg>
  )
}

function MoreHorizontalIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="4" cy="10" r="1.6" />
      <circle cx="10" cy="10" r="1.6" />
      <circle cx="16" cy="10" r="1.6" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="7" y="7" width="9" height="9" rx="2" />
      <path d="M4 13.5V6a2 2 0 0 1 2-2h7.5" />
    </svg>
  )
}
