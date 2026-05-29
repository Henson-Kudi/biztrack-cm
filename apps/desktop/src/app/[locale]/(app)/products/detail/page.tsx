'use client'

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Badge, Button, Input, NumberInput, Spinner } from '@biztrack/ui'
import {
  InventoryMovementType,
  type InventoryMovementTrendPoint,
  StockAdjustmentType,
  type InventoryDetail,
  type InventoryMovement,
  type PaginatedResult,
  type Product,
  type ProductCategory,
  type UnitOfMeasure,
} from '@biztrack/types'
import { RestockPaymentEditor } from '@/components/inventory/RestockPaymentEditor'
import { SupplierContactSelect } from '@/components/inventory/SupplierContactSelect'
import {
  mapRestockPaymentDrafts,
  sumRestockPaymentDrafts,
  type RestockPaymentDraft,
} from '@/components/inventory/restock-shared'
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
  formatQuantity,
  isLowStockProduct,
} from '@/components/products/product-utils'
import { cn } from '@/lib/utils'
import { hasDesktopIpc, ipc } from '@/services/ipc.bridge'
import { getApiErrorMessage } from '@/services/api-response'
import {
  InventoryLocalError,
  adjustInventoryLocal,
  getInventoryDetailLocal,
  listInventoryMovementsLocal,
  restockInventoryLocal,
  setInventoryThresholdLocal,
} from '@/services/inventory.local'
import { type LocalContactRecord } from '@/services/contacts.local'
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

type RestockCostMode = 'unit' | 'total'

type RestockFormState = {
  quantity: string
  unitCost: string
  supplierId: string
  referenceNumber: string
  totalAmount: string
  notes: string
  payments: RestockPaymentDraft[]
  costMode: RestockCostMode
}

const textareaClassName =
  'block min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring'
const menuItemClassName =
  'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50'
const iconButtonClassName =
  'inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground'
const STOCK_BIN_REFERENCE_MAX_LENGTH = 17
const STOCK_BIN_MOVEMENT_TYPE_MAX_LENGTH = 18

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
    supplierId: '',
    referenceNumber: '',
    totalAmount: '',
    notes: '',
    payments: [],
    costMode: 'unit',
  }
}

function formatMoneyInput(value: number) {
  const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function syncRestockCostFields(input: {
  quantity: string
  unitCost: string
  totalAmount: string
  costMode: RestockCostMode
}) {
  const quantityInput = parseRequiredNumberInput(input.quantity)
  if (quantityInput.kind !== 'value' || quantityInput.value < 0.001) {
    return {
      unitCost: input.unitCost,
      totalAmount: input.totalAmount,
    }
  }

  if (input.costMode === 'total') {
    const totalInput = parseOptionalNumberInput(input.totalAmount)
    if (totalInput.kind === 'value' && totalInput.value >= 0) {
      return {
        unitCost: formatMoneyInput(totalInput.value / quantityInput.value),
        totalAmount: input.totalAmount,
      }
    }
  }

  const unitCostInput = parseOptionalNumberInput(input.unitCost)
  if (unitCostInput.kind === 'value' && unitCostInput.value >= 0) {
    return {
      unitCost: input.unitCost,
      totalAmount: formatMoneyInput(quantityInput.value * unitCostInput.value),
    }
  }

  const totalInput = parseOptionalNumberInput(input.totalAmount)
  if (totalInput.kind === 'value' && totalInput.value >= 0) {
    return {
      unitCost: formatMoneyInput(totalInput.value / quantityInput.value),
      totalAmount: input.totalAmount,
    }
  }

  return {
    unitCost: input.unitCost,
    totalAmount: input.totalAmount,
  }
}

function resolveRestockUnitCostValue(quantity: string, unitCost: string, totalAmount: string) {
  const quantityInput = parseRequiredNumberInput(quantity)
  if (quantityInput.kind !== 'value' || quantityInput.value < 0.001) {
    return null
  }

  const unitCostInput = parseOptionalNumberInput(unitCost)
  if (unitCostInput.kind === 'value' && unitCostInput.value >= 0) {
    return unitCostInput.value
  }

  const totalAmountInput = parseOptionalNumberInput(totalAmount)
  if (totalAmountInput.kind === 'value' && totalAmountInput.value >= 0) {
    return Math.round(((totalAmountInput.value / quantityInput.value) + Number.EPSILON) * 100) / 100
  }

  return null
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
  const businessCurrency = useAuthStore((state) => state.businessCurrency)
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
  const [exportingStockBinPdf, setExportingStockBinPdf] = useState(false)
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null)
  const [restockError, setRestockError] = useState<string | null>(null)
  const [restockSupplier, setRestockSupplier] = useState<LocalContactRecord | null>(null)
  const [thresholdForm, setThresholdForm] = useState<ThresholdFormState>({
    lowStockThreshold: '',
    reorderPoint: '',
  })
  const [adjustmentForm, setAdjustmentForm] = useState<AdjustmentFormState>(
    createDefaultAdjustmentForm(),
  )
  const [restockForm, setRestockForm] = useState<RestockFormState>(createDefaultRestockForm())

  const getInventoryErrorMessage = useCallback((inventoryErrorValue: unknown, fallback: string) => {
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
        case 'INVENTORY_RESTOCK_TOTAL_AMOUNT_INVALID':
          return inventoryT('errors.restock_total_amount_invalid')
        case 'INVENTORY_RESTOCK_TOTAL_AMOUNT_REQUIRED':
          return inventoryT('errors.restock_total_amount_required')
        case 'INVENTORY_RESTOCK_TOTAL_AMOUNT_MISMATCH':
          return inventoryT('errors.restock_total_amount_mismatch')
        case 'INVENTORY_RESTOCK_PAYMENT_AMOUNT_INVALID':
          return inventoryT('errors.restock_payment_amount_invalid')
        case 'INVENTORY_RESTOCK_PAYMENT_EXCEEDS_TOTAL':
          return inventoryT('errors.restock_payment_exceeds_total')
        case 'INVENTORY_RESTOCK_SUPPLIER_REQUIRED_FOR_CREDIT':
          return inventoryT('errors.restock_supplier_required_for_credit')
        case 'INVENTORY_RESTOCK_SUPPLIER_NOT_FOUND':
          return inventoryT('errors.restock_supplier_not_found')
        case 'INVENTORY_RESTOCK_SUPPLIER_INACTIVE':
          return inventoryT('errors.restock_supplier_inactive')
        case 'INVENTORY_RESTOCK_SUPPLIER_TYPE_INVALID':
          return inventoryT('errors.restock_supplier_type_invalid')
        default:
          break
      }
    }

    return getApiErrorMessage(inventoryErrorValue, fallback)
  }, [inventoryT])

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
  }, [businessId, getInventoryErrorMessage, inventoryT, productId, reloadKey, t])

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
  }, [businessId, getInventoryErrorMessage, inventoryT, product?.id, product?.trackInventory, reloadKey])

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
  }, [businessId, getInventoryErrorMessage, inventoryT, isMovementsOpen, movementsPage, product?.id, product?.trackInventory, reloadKey])

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
    setRestockSupplier(null)
    setIsActionMenuOpen(false)
  }, [product?.id])

  const lowStock = useMemo(() => (product ? isLowStockProduct(product) : false), [product])
  const recentMovementItems = useMemo(() => recentMovements?.data ?? [], [recentMovements])
  const allMovementItems = useMemo(() => allMovements?.data ?? [], [allMovements])
  const allMovementsCurrentPage = allMovements?.page ?? movementsPage
  const allMovementsTotalPages = Math.max(allMovements?.totalPages ?? 1, 1)
  const restockComputedTotal = useMemo(() => {
    const quantityInput = parseRequiredNumberInput(restockForm.quantity)
    const unitCostInput = parseOptionalNumberInput(restockForm.unitCost)

    if (
      quantityInput.kind !== 'value' ||
      quantityInput.value < 0.001 ||
      unitCostInput.kind !== 'value' ||
      unitCostInput.value < 0
    ) {
      return null
    }

    return quantityInput.value * unitCostInput.value
  }, [restockForm.quantity, restockForm.unitCost])
  const restockExplicitTotal = useMemo(() => {
    const parsed = parseOptionalNumberInput(restockForm.totalAmount)
    if (parsed.kind !== 'value' || parsed.value < 0) {
      return null
    }

    return parsed.value
  }, [restockForm.totalAmount])
  const restockEffectiveTotal = restockExplicitTotal ?? restockComputedTotal
  const restockAmountPaid = useMemo(
    () => sumRestockPaymentDrafts(restockForm.payments),
    [restockForm.payments],
  )
  const restockCreditAmount = useMemo(() => {
    if (restockEffectiveTotal === null) {
      return null
    }

    return Math.max(0, restockEffectiveTotal - restockAmountPaid)
  }, [restockAmountPaid, restockEffectiveTotal])
  const currencyCode = product?.currency || businessCurrency
  const inventorySummary = inventoryDetail?.binSummary ?? null
  const displayMovements = inventoryDetail?.movements ?? recentMovementItems
  const stockQuantity = product?.trackInventory
    ? inventoryDetail?.quantity ?? product.currentStock
    : product?.currentStock
  const thresholdQuantity = inventoryDetail?.lowStockThreshold ?? product?.lowStockThreshold ?? null
  const reorderPointQuantity = inventoryDetail?.reorderPoint ?? product?.reorderPoint ?? null
  const unitDisplay =
    product?.unitOfMeasure?.abbreviation && product?.unitOfMeasure?.name
      ? `${product.unitOfMeasure.abbreviation} (${product.unitOfMeasure.name})`
      : product?.unitOfMeasure?.abbreviation ||
        product?.unitOfMeasure?.name ||
        t('list.no_unit')
  const stockUnitDisplay =
    product?.unitOfMeasure?.abbreviation || product?.unitOfMeasure?.name || t('list.no_unit')
  const grossMarginPercent = useMemo(() => {
    if (!product) {
      return null
    }

    if (
      product.costPrice === null ||
      product.costPrice === undefined ||
      !Number.isFinite(product.costPrice) ||
      product.sellingPrice <= 0
    ) {
      return null
    }

    const percentage = ((product.sellingPrice - product.costPrice) / product.sellingPrice) * 100
    return Math.max(0, Math.round(percentage))
  }, [product])
  const movementTypeLabels = useMemo(
    () => ({
      [InventoryMovementType.SALE]: inventoryT('movement_types.sale'),
      [InventoryMovementType.RESTOCK_IN]: inventoryT('movement_types.restock_in'),
      [InventoryMovementType.MANUAL_ADJUSTMENT]: inventoryT('movement_types.manual_adjustment'),
      [InventoryMovementType.VOID_REVERSAL]: inventoryT('movement_types.void_reversal'),
      [InventoryMovementType.OPENING_STOCK]: inventoryT('movement_types.opening_stock'),
      [InventoryMovementType.TRANSFER_IN]: inventoryT('movement_types.transfer_in'),
      [InventoryMovementType.TRANSFER_OUT]: inventoryT('movement_types.transfer_out'),
    }),
    [inventoryT],
  )
  const timezoneLabel = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const movementHistoryTotal = recentMovements?.total ?? displayMovements.length
  const movementChartLegend = useMemo(
    () => ({
      stockIn: t('detail.trend.stock_in'),
      stockOut: t('detail.trend.stock_out'),
    }),
    [t],
  )
  const lowStockHint = product?.trackInventory
    ? lowStock && thresholdQuantity !== null
      ? t('detail.low_stock_status', {
          threshold: `${formatQuantity(thresholdQuantity)} ${stockUnitDisplay}`,
        })
      : t('detail.stock_healthy')
    : t('list.not_tracked')
  const thresholdHint =
    reorderPointQuantity !== null
      ? t('detail.reorder_point_hint', {
          value: `${formatQuantity(reorderPointQuantity)} ${stockUnitDisplay}`,
        })
      : t('detail.reorder_point_missing')
  const marginHint =
    grossMarginPercent !== null && product
      ? t('detail.margin_hint', {
          cost: formatCurrencyValue(product.costPrice ?? 0, currencyCode, locale),
          price: formatCurrencyValue(product.sellingPrice, currencyCode, locale),
        })
      : t('detail.margin_unavailable')
  const lastRestockHint = inventorySummary?.lastRestockQuantity
    ? t('detail.last_restock_hint', {
        quantity: formatQuantity(inventorySummary.lastRestockQuantity),
        source: inventorySummary.lastRestockSourceName || inventorySummary.lastRestockReferenceLabel || t('detail.reference_missing'),
      })
    : t('detail.last_restock_empty')
  const stockBinSubtitle = [
    product?.sku || product?.barcode || product?.slug,
    product?.category?.name || t('list.uncategorized'),
  ]
    .filter(Boolean)
    .join(' · ')

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

  const handleDownloadStockBinCsv = () => {
    if (!product) {
      return
    }

    const csv = buildStockBinCsv({
      productName: product.name,
      stockUnitDisplay,
      summary: inventorySummary,
      movements: displayMovements,
      locale,
      timezoneLabel,
      movementTypeLabels,
      labels: {
        product: t('detail.title'),
        sku: t('detail.fields.sku'),
        category: t('detail.fields.category'),
        currentStock: t('detail.fields.current_stock'),
        openingStock: t('detail.stock_bin.opening_stock'),
        totalRestocked: t('detail.stock_bin.total_restocked'),
        totalSold: t('detail.stock_bin.total_sold'),
        adjustments: t('detail.stock_bin.adjustments'),
        date: t('detail.stock_bin.table.date'),
        reference: t('detail.stock_bin.table.reference'),
        movementType: t('detail.stock_bin.table.type'),
        performedBy: t('detail.stock_bin.table.performed_by'),
        notes: t('detail.stock_bin.table.notes'),
        stockIn: t('detail.stock_bin.table.stock_in'),
        stockOut: t('detail.stock_bin.table.stock_out'),
        balance: t('detail.stock_bin.table.balance'),
      },
    })

    downloadTextFile(
      `${sanitizeDownloadName(product.name)}-stock-bin-card.csv`,
      csv,
      'text/csv;charset=utf-8',
    )
    toast.success(t('detail.stock_bin.csv_ready'))
  }

  const handleDownloadStockBinPdf = async () => {
    if (!product) {
      return
    }

    if (!hasDesktopIpc()) {
      toast.error(t('detail.stock_bin.pdf_desktop_only'))
      return
    }

    setExportingStockBinPdf(true)

    try {
      const html = buildStockBinPdfHtml({
        locale,
        productName: product.name,
        productDescription: product.description?.trim() || t('detail.no_description'),
        productCode: stockBinSubtitle,
        imageUrl: product.primaryImageUrl || null,
        stockUnitDisplay,
        summary: inventorySummary,
        movements: displayMovements,
        timezoneLabel,
        movementTypeLabels,
        labels: {
          title: t('detail.stock_bin.title'),
          balance: t('detail.stock_bin.balance'),
          asOfToday: t('detail.stock_bin.as_of_today'),
          openingStock: t('detail.stock_bin.opening_stock'),
          totalRestocked: t('detail.stock_bin.total_restocked'),
          totalSold: t('detail.stock_bin.total_sold'),
          adjustments: t('detail.stock_bin.adjustments'),
          noNotes: t('detail.stock_bin.no_notes'),
          footer: t('detail.stock_bin.footer', {
            count: displayMovements.length,
            timezone: timezoneLabel,
          }),
          table: {
            date: t('detail.stock_bin.table.date'),
            reference: t('detail.stock_bin.table.reference'),
            type: t('detail.stock_bin.table.type'),
            performedBy: t('detail.stock_bin.table.performed_by'),
            notes: t('detail.stock_bin.table.notes'),
            stockIn: t('detail.stock_bin.table.stock_in'),
            stockOut: t('detail.stock_bin.table.stock_out'),
            balance: t('detail.stock_bin.table.balance'),
          },
        },
      })

      const result = await ipc.documents.exportPdf({
        html,
        filename: `${sanitizeDownloadName(product.name)}-stock-bin-card.pdf`,
      })

      if (result.success) {
        toast.success(t('detail.stock_bin.pdf_ready'))
        return
      }

      if (!result.canceled) {
        toast.error(result.error || t('detail.stock_bin.export_failed'))
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('detail.stock_bin.export_failed')))
    } finally {
      setExportingStockBinPdf(false)
    }
  }

  const handleSelectRestockSupplier = (supplier: LocalContactRecord) => {
    setRestockSupplier(supplier)
    setRestockForm((current) => ({
      ...current,
      supplierId: supplier.id,
    }))
  }

  const clearRestockSupplier = () => {
    setRestockSupplier(null)
    setRestockForm((current) => ({
      ...current,
      supplierId: '',
    }))
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

    const totalAmountInput = parseOptionalNumberInput(restockForm.totalAmount)
    if (
      totalAmountInput.kind === 'invalid' ||
      (totalAmountInput.kind === 'value' && totalAmountInput.value < 0)
    ) {
      setRestockError(inventoryT('errors.restock_total_amount_invalid'))
      return
    }

    setSavingRestock(true)
    setRestockError(null)

    try {
      const resolvedUnitCost = resolveRestockUnitCostValue(
        restockForm.quantity,
        restockForm.unitCost,
        restockForm.totalAmount,
      )
      if (resolvedUnitCost === null) {
        setRestockError(inventoryT('errors.restock_line_cost_required'))
        setSavingRestock(false)
        return
      }

      const payments = mapRestockPaymentDrafts(restockForm.payments)
      if (payments.some((payment) => !Number.isFinite(payment.amount) || payment.amount <= 0)) {
        throw new InventoryLocalError('INVENTORY_RESTOCK_PAYMENT_AMOUNT_INVALID')
      }

      await restockInventoryLocal(businessId, {
        referenceNumber: restockForm.referenceNumber.trim() || undefined,
        supplierId: restockSupplier?.id || restockForm.supplierId || undefined,
        supplierName: restockSupplier?.name || undefined,
        notes: restockForm.notes.trim() || undefined,
        totalAmount:
          totalAmountInput.kind === 'value' ? totalAmountInput.value : undefined,
        totalCost:
          totalAmountInput.kind === 'value' ? totalAmountInput.value : undefined,
        payments,
        items: [
          {
            productId: product.id,
            quantity: quantityInput.value,
            unitCost: resolvedUnitCost,
          },
        ],
      })

      setReloadKey((current) => current + 1)
      setRestockForm(createDefaultRestockForm())
      setRestockSupplier(null)
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
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <Button variant="ghost" onClick={() => router.back()} className="w-fit px-0">
            <BackIcon />
            <span>{t('actions.back')}</span>
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            {product.trackInventory ? (
              <ActionPill
                onClick={() => {
                  setRestockForm(createDefaultRestockForm())
                  setRestockError(null)
                  setRestockSupplier(null)
                  setIsRestockOpen(true)
                }}
              >
                <RestockIcon />
                <span>{t('actions.restock')}</span>
              </ActionPill>
            ) : null}
            {product.trackInventory ? (
              <ActionPill
                onClick={() => {
                  setAdjustmentForm(createDefaultAdjustmentForm())
                  setAdjustmentError(null)
                  setIsAdjustmentOpen(true)
                }}
              >
                <AdjustStockIcon />
                <span>{inventoryT('adjustment.open')}</span>
              </ActionPill>
            ) : null}
            <ActionPill
              onClick={() => setIsUpdateOpen(true)}
              disabled={metadataLoading}
            >
              <EditIcon />
              <span>{t('actions.update_product')}</span>
            </ActionPill>

            <Popover open={isActionMenuOpen} onOpenChange={setIsActionMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                  aria-label={t('actions.more_actions')}
                >
                  <MoreHorizontalIcon />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-1">
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
        </div>

        <section className="relative overflow-hidden rounded-[28px] border border-border/80 bg-card p-6 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-1 bg-primary" />
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px] border border-primary/15 bg-primary/10 text-xl font-semibold text-primary">
              {product.primaryImageUrl ? (
                <img
                  src={product.primaryImageUrl}
                  alt={product.name}
                  className="h-full w-full rounded-[18px] object-cover"
                />
              ) : (
                product.name.slice(0, 2).toUpperCase()
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary">
                {t('eyebrow')} / {t('detail.title')}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                {product.name}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {product.description?.trim() || t('detail.no_description')}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
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
            </div>

            <div className="min-w-[220px] rounded-2xl border border-border bg-background/60 px-5 py-4 lg:text-right">
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {t('detail.metrics.price')}
              </p>
              <p className="mt-1 font-mono text-3xl font-semibold text-foreground">
                {formatCurrencyValue(product.sellingPrice, currencyCode, locale)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{stockUnitDisplay}</p>
              <p className="mt-4 text-xs text-muted-foreground">
                {t('detail.fields.cost_price')}{' '}
                <span className="font-mono font-semibold text-foreground">
                  {product.costPrice !== null && product.costPrice !== undefined
                    ? formatCurrencyValue(product.costPrice, currencyCode, locale)
                    : '-'}
                </span>
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-4">
          <MetricSurface
            label={t('detail.metrics.stock')}
            value={
              product.trackInventory
                ? `${formatQuantity(stockQuantity)}`
                : t('list.not_tracked')
            }
            hint={lowStockHint}
            tone={lowStock ? 'warning' : 'default'}
          />
          <MetricSurface
            label={t('detail.metrics.threshold')}
            value={
              thresholdQuantity !== null
                ? `${formatQuantity(thresholdQuantity)} ${stockUnitDisplay}`
                : t('detail.threshold_not_set')
            }
            hint={thresholdHint}
          />
          <MetricSurface
            label={t('detail.metrics.margin')}
            value={grossMarginPercent === null ? '-' : `${grossMarginPercent}%`}
            hint={marginHint}
            tone={grossMarginPercent !== null && grossMarginPercent >= 30 ? 'success' : 'default'}
          />
          <MetricSurface
            label={t('detail.metrics.last_restock')}
            value={
              inventorySummary?.lastRestockAt
                ? formatDateLabel(inventorySummary.lastRestockAt, locale)
                : '-'
            }
            hint={lastRestockHint}
          />
        </div>

        {inventoryError ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {inventoryError}
          </div>
        ) : null}

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.96fr)]">
          <section className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
            <p className="text-sm font-semibold text-foreground">{t('detail.overview_title')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('detail.overview_description')}</p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <DetailItem label={t('detail.fields.category')}>
                {product.category?.name || t('list.uncategorized')}
              </DetailItem>
              <DetailItem label={t('detail.fields.unit')}>{unitDisplay}</DetailItem>
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
              <DetailItem label={t('detail.fields.barcode_type')}>
                {product.barcodeType || '-'}
              </DetailItem>
              <DetailItem label={t('detail.fields.tax_rate')}>{product.taxRate}%</DetailItem>
              <DetailItem label={t('detail.fields.created_at')}>
                {formatDateLabel(product.createdAt, locale)}
              </DetailItem>
              <DetailItem label={t('detail.fields.updated_at')}>
                {formatDateLabel(product.updatedAt, locale)}
              </DetailItem>
            </div>

            <div className="mt-5 border-t border-border pt-4">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>{t('detail.margin_health')}</span>
                <span className="font-semibold text-primary">
                  {grossMarginPercent === null ? '-' : `${grossMarginPercent}%`}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted/70">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${Math.max(0, Math.min(grossMarginPercent ?? 0, 100))}%` }}
                />
              </div>
            </div>
          </section>

          {product.trackInventory ? (
            <section className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
              <p className="text-sm font-semibold text-foreground">
                {t('detail.inventory_thresholds_title')}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('detail.inventory_thresholds_description')}
              </p>

              <form className="mt-4 space-y-4" onSubmit={handleThresholdSubmit}>
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

              <div className="mt-5 border-t border-border pt-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">
                    {t('detail.trend.title')}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {t('detail.trend.window', {
                      days: inventorySummary?.movementWindowDays ?? 30,
                    })}
                  </span>
                </div>
                <MovementTrendChart
                  points={inventorySummary?.trend ?? []}
                  locale={locale}
                  emptyLabel={t('detail.trend.empty')}
                  legend={movementChartLegend}
                />
              </div>
            </section>
          ) : (
            <section className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
              <p className="text-sm font-semibold text-foreground">
                {t('detail.inventory_disabled_title')}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('detail.inventory_disabled_description')}
              </p>
              <Button
                variant="secondary"
                onClick={() => setIsUpdateOpen(true)}
                disabled={metadataLoading}
                className="mt-4"
              >
                {t('detail.enable_tracking')}
              </Button>
            </section>
          )}
        </div>

        {product.trackInventory ? (
          <section className="overflow-hidden rounded-[28px] border border-border bg-card shadow-sm">
            <div className="flex flex-col gap-4 bg-primary px-5 py-4 text-primary-foreground lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold">{t('detail.stock_bin.title')}</p>
                <p className="mt-1 text-xs text-primary-foreground/80">
                  {product.name}
                  {stockBinSubtitle ? ` · ${stockBinSubtitle}` : ''}
                </p>
              </div>
              <div className="text-left lg:text-right">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-primary-foreground/70">
                  {t('detail.stock_bin.balance')}
                </p>
                <p className="font-mono text-3xl font-semibold">
                  {formatQuantity(inventorySummary?.currentBalance ?? stockQuantity)}
                </p>
                <p className="mt-1 text-xs text-primary-foreground/80">
                  {stockUnitDisplay} · {t('detail.stock_bin.as_of_today')}
                </p>
              </div>
            </div>

            <div className="grid border-b border-border md:grid-cols-4">
              <BinMetaCell
                label={t('detail.stock_bin.opening_stock')}
                value={`${formatQuantity(inventorySummary?.openingStock ?? 0)} ${stockUnitDisplay}`}
              />
              <BinMetaCell
                label={t('detail.stock_bin.total_restocked')}
                value={`${formatQuantity(inventorySummary?.totalRestocked ?? 0)} ${stockUnitDisplay}`}
              />
              <BinMetaCell
                label={t('detail.stock_bin.total_sold')}
                value={`${formatQuantity(inventorySummary?.totalSold ?? 0)} ${stockUnitDisplay}`}
              />
              <BinMetaCell
                label={t('detail.stock_bin.adjustments')}
                value={`${formatQuantity(inventorySummary?.totalAdjusted ?? 0)} ${stockUnitDisplay}`}
                isLast
              />
            </div>

            <div className="overflow-x-auto">
              {movementsLoading ? (
                <div className="flex min-h-[220px] items-center justify-center px-5 py-8">
                  <Spinner size="lg" />
                </div>
              ) : displayMovements.length === 0 ? (
                <div className="px-5 py-10 text-sm text-muted-foreground">
                  {t('detail.stock_bin.empty')}
                </div>
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">{t('detail.stock_bin.table.date')}</th>
                      <th className="px-4 py-3 font-medium">{t('detail.stock_bin.table.reference')}</th>
                      <th className="px-4 py-3 font-medium">{t('detail.stock_bin.table.type')}</th>
                      <th className="px-4 py-3 font-medium">{t('detail.stock_bin.table.performed_by')}</th>
                      <th className="px-4 py-3 font-medium">{t('detail.stock_bin.table.notes')}</th>
                      <th className="px-4 py-3 font-medium text-right">{t('detail.stock_bin.table.stock_in')}</th>
                      <th className="px-4 py-3 font-medium text-right">{t('detail.stock_bin.table.stock_out')}</th>
                      <th className="px-4 py-3 font-medium text-right">{t('detail.stock_bin.table.balance')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayMovements.map((movement) => (
                      <tr key={movement.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                          {formatDateLabel(movement.createdAt, locale)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                          <span title={movement.referenceLabel || movement.referenceId || t('detail.reference_missing')}>
                            {truncateText(
                              movement.referenceLabel ||
                                movement.referenceId ||
                                t('detail.reference_missing'),
                              STOCK_BIN_REFERENCE_MAX_LENGTH,
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            title={movementTypeLabels[movement.type] ?? formatEnumLabel(movement.type)}
                            className={cn(
                              'inline-flex max-w-[132px] rounded-full px-2.5 py-1 text-[11px] font-medium',
                              movementBadgeTone(movement.type),
                            )}
                          >
                            <span className="truncate whitespace-nowrap">
                              {truncateText(
                                movementTypeLabels[movement.type] ?? formatEnumLabel(movement.type),
                                STOCK_BIN_MOVEMENT_TYPE_MAX_LENGTH,
                              )}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {movement.performedBy?.name || inventoryT('detail.system')}
                        </td>
                        <td className="max-w-[220px] px-4 py-3 text-muted-foreground">
                          <span className="line-clamp-1">
                            {movement.notes?.trim() || t('detail.stock_bin.no_notes')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-600">
                          {movement.quantityChange > 0 ? `+${formatQuantity(movement.quantityChange)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-rose-600">
                          {movement.quantityChange < 0 ? `-${formatQuantity(Math.abs(movement.quantityChange))}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                          {formatQuantity(movement.quantityAfter)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-border bg-muted/30 px-5 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p>
                {t('detail.stock_bin.footer', {
                  count: displayMovements.length,
                  timezone: timezoneLabel,
                })}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleDownloadStockBinCsv}
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                >
                  <DownloadIcon />
                  <span>{t('detail.stock_bin.download_csv')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownloadStockBinPdf()}
                  disabled={exportingStockBinPdf}
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <DocumentIcon />
                  <span>
                    {exportingStockBinPdf
                      ? t('detail.stock_bin.exporting_pdf')
                      : t('detail.stock_bin.download_pdf')}
                  </span>
                </button>
                {movementHistoryTotal > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMovementsPage(1)
                      setIsMovementsOpen(true)
                    }}
                    className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
                  >
                    {t('detail.stock_bin.view_all')}
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}
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

              <section className="space-y-4 rounded-2xl border border-border bg-background/60 p-4">
                <Input
                  label={t('form.product')}
                  value={product.name}
                  readOnly
                  disabled
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberInput
                    label={inventoryT('restock.quantity')}
                    min="0"
                    step="0.001"
                    value={restockForm.quantity}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setRestockForm((current) => {
                        const nextState = {
                          ...current,
                          quantity: event.target.value,
                        }
                        const synced = syncRestockCostFields(nextState)
                        return {
                          ...nextState,
                          unitCost: synced.unitCost,
                          totalAmount: synced.totalAmount,
                        }
                      })
                    }
                  />
                  <NumberInput
                    label={inventoryT('restock.unit_cost')}
                    min="0"
                    step="0.01"
                    value={restockForm.unitCost}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setRestockForm((current) => {
                        const nextState = {
                          ...current,
                          unitCost: event.target.value,
                          costMode: 'unit' as const,
                        }
                        const synced = syncRestockCostFields(nextState)
                        return {
                          ...nextState,
                          totalAmount: synced.totalAmount,
                        }
                      })
                    }
                    placeholder={inventoryT('restock.unit_cost_optional')}
                  />
                  <NumberInput
                    label={inventoryT('restock.total_amount')}
                    min="0"
                    step="0.01"
                    value={restockForm.totalAmount}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setRestockForm((current) => {
                        const nextState = {
                          ...current,
                          totalAmount: event.target.value,
                          costMode: 'total' as const,
                        }
                        const synced = syncRestockCostFields(nextState)
                        return {
                          ...nextState,
                          unitCost: synced.unitCost,
                        }
                      })
                    }
                    placeholder={inventoryT('restock.total_amount_optional')}
                  />
                  <Input
                    label={inventoryT('restock.computed_total')}
                    value={
                      restockComputedTotal === null
                        ? '-'
                        : new Intl.NumberFormat(locale, {
                            style: 'currency',
                            currency: currencyCode,
                            maximumFractionDigits: 0,
                          }).format(restockComputedTotal)
                    }
                    readOnly
                    disabled
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  {inventoryT('restock.total_amount_hint')}
                </p>
              </section>

              <section className="space-y-4 rounded-2xl border border-border bg-background/60 p-4">
                <SupplierContactSelect
                  businessId={businessId}
                  supplier={restockSupplier}
                  onSelect={(supplier) => {
                    if (supplier) {
                      handleSelectRestockSupplier(supplier)
                      return
                    }

                    clearRestockSupplier()
                  }}
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
              </section>

              <RestockPaymentEditor
                payments={restockForm.payments}
                onChange={(payments) =>
                  setRestockForm((current) => ({
                    ...current,
                    payments,
                  }))
                }
              />

              <div className="grid gap-4 sm:grid-cols-3">
                <Input
                  label={inventoryT('restock.total_amount')}
                  value={
                    restockEffectiveTotal === null
                      ? '-'
                      : new Intl.NumberFormat(locale, {
                          style: 'currency',
                          currency: currencyCode,
                          maximumFractionDigits: 0,
                        }).format(restockEffectiveTotal)
                  }
                  readOnly
                  disabled
                />
                <Input
                  label={inventoryT('restock.amount_paid')}
                  value={new Intl.NumberFormat(locale, {
                    style: 'currency',
                    currency: currencyCode,
                    maximumFractionDigits: 0,
                  }).format(restockAmountPaid)}
                  readOnly
                  disabled
                />
                <Input
                  label={inventoryT('restock.balance_on_credit')}
                  value={
                    restockCreditAmount === null
                      ? '-'
                      : new Intl.NumberFormat(locale, {
                          style: 'currency',
                          currency: currencyCode,
                          maximumFractionDigits: 0,
                        }).format(restockCreditAmount)
                  }
                  readOnly
                  disabled
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
          </div>

          <DialogFooter className="gap-3 justify-between">
            <div className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={inventoryT('pagination.previous')}
                disabled={allMovementsCurrentPage <= 1}
                onClick={() => setMovementsPage((current) => Math.max(current - 1, 1))}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-left-icon lucide-chevron-left"><path d="m15 18-6-6 6-6"/></svg>
              </Button>
              <span className="min-w-[3.75rem] text-center font-medium text-foreground">
                {allMovementsCurrentPage}/{allMovementsTotalPages}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={inventoryT('pagination.next')}
                disabled={allMovementsCurrentPage >= allMovementsTotalPages}
                onClick={() =>
                  setMovementsPage((current) =>
                    Math.min(current + 1, allMovementsTotalPages),
                  )
                }
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-right-icon lucide-chevron-right"><path d="m9 18 6-6-6-6"/></svg>
              </Button>
            </div>
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

function ActionPill({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

function MetricSurface({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  hint: string
  tone?: 'default' | 'warning' | 'success'
}) {
  return (
    <div className="rounded-2xl bg-card px-5 py-4 shadow-sm ring-1 ring-border">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-2 font-mono text-2xl font-semibold text-foreground',
          tone === 'warning' && 'text-amber-600',
          tone === 'success' && 'text-emerald-600',
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

function BinMetaCell({
  label,
  value,
  isLast = false,
}: {
  label: string
  value: string
  isLast?: boolean
}) {
  return (
    <div className={cn('px-5 py-4', !isLast && 'border-b border-border md:border-b-0 md:border-r')}>
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}

function MovementTrendChart({
  points,
  locale,
  emptyLabel,
  legend,
}: {
  points: InventoryMovementTrendPoint[]
  locale: string
  emptyLabel: string
  legend: { stockIn: string; stockOut: string }
}) {
  const hasActivity = points.some((point) => point.stockIn > 0 || point.stockOut > 0)
  if (points.length === 0 || !hasActivity) {
    return <p className="py-10 text-sm text-muted-foreground">{emptyLabel}</p>
  }

  const width = 640
  const height = 170
  const baseline = 84
  const topPadding = 16
  const bottomPadding = 28
  const sidePadding = 12
  const usableWidth = width - sidePadding * 2
  const slotWidth = usableWidth / points.length
  const barWidth = Math.max(4, slotWidth * 0.56)
  const maxValue = Math.max(
    1,
    ...points.flatMap((point) => [point.stockIn, point.stockOut]),
  )
  const visibleLabelStep = Math.max(1, Math.ceil(points.length / 6))

  return (
    <div>
      <div className="h-40 w-full">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible">
          <line
            x1={sidePadding}
            y1={baseline}
            x2={width - sidePadding}
            y2={baseline}
            stroke="currentColor"
            strokeOpacity="0.16"
          />
          {points.map((point, index) => {
            const x = sidePadding + slotWidth * index + (slotWidth - barWidth) / 2
            const inHeight =
              point.stockIn > 0
                ? ((baseline - topPadding) * point.stockIn) / maxValue
                : 0
            const outHeight =
              point.stockOut > 0
                ? ((height - bottomPadding - baseline) * point.stockOut) / maxValue
                : 0
            const labelDate = new Intl.DateTimeFormat(locale, {
              month: 'short',
              day: 'numeric',
            }).format(new Date(point.date))

            return (
              <g key={point.date}>
                {point.stockIn > 0 ? (
                  <rect
                    x={x}
                    y={baseline - inHeight}
                    width={barWidth}
                    height={inHeight}
                    rx={2}
                    fill="#1D9E75"
                  >
                    <title>{`${labelDate}: ${legend.stockIn} ${formatQuantity(point.stockIn)}`}</title>
                  </rect>
                ) : null}
                {point.stockOut > 0 ? (
                  <rect
                    x={x}
                    y={baseline}
                    width={barWidth}
                    height={outHeight}
                    rx={2}
                    fill="#E24B4A"
                  >
                    <title>{`${labelDate}: ${legend.stockOut} ${formatQuantity(point.stockOut)}`}</title>
                  </rect>
                ) : null}
                {index % visibleLabelStep === 0 || index === points.length - 1 ? (
                  <text
                    x={x + barWidth / 2}
                    y={height - 8}
                    textAnchor="middle"
                    fontSize="10"
                    fill="currentColor"
                    fillOpacity="0.55"
                  >
                    {labelDate}
                  </text>
                ) : null}
              </g>
            )
          })}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#1D9E75]" />
          {legend.stockIn}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#E24B4A]" />
          {legend.stockOut}
        </span>
      </div>
    </div>
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
    <div className="rounded-2xl bg-muted/40 px-4 py-3">
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

function movementBadgeTone(type: InventoryMovementType) {
  if (type === InventoryMovementType.RESTOCK_IN || type === InventoryMovementType.OPENING_STOCK) {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (type === InventoryMovementType.SALE || type === InventoryMovementType.TRANSFER_OUT) {
    return 'bg-rose-100 text-rose-700'
  }

  return 'bg-sky-100 text-sky-700'
}

function formatCurrencyValue(value: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

function sanitizeDownloadName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'product'
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function buildStockBinCsv(input: {
  productName: string
  stockUnitDisplay: string
  summary: InventoryDetail['binSummary']
  movements: InventoryMovement[]
  locale: string
  timezoneLabel: string
  movementTypeLabels: Record<InventoryMovementType, string>
  labels: {
    product: string
    sku: string
    category: string
    currentStock: string
    openingStock: string
    totalRestocked: string
    totalSold: string
    adjustments: string
    date: string
    reference: string
    movementType: string
    performedBy: string
    notes: string
    stockIn: string
    stockOut: string
    balance: string
  }
}) {
  const rows: string[][] = [
    [input.labels.product, input.productName],
    [input.labels.currentStock, `${formatQuantity(input.summary?.currentBalance ?? 0)} ${input.stockUnitDisplay}`],
    [input.labels.openingStock, `${formatQuantity(input.summary?.openingStock ?? 0)} ${input.stockUnitDisplay}`],
    [input.labels.totalRestocked, `${formatQuantity(input.summary?.totalRestocked ?? 0)} ${input.stockUnitDisplay}`],
    [input.labels.totalSold, `${formatQuantity(input.summary?.totalSold ?? 0)} ${input.stockUnitDisplay}`],
    [input.labels.adjustments, `${formatQuantity(input.summary?.totalAdjusted ?? 0)} ${input.stockUnitDisplay}`],
    ['Timezone', input.timezoneLabel],
    [],
    [
      input.labels.date,
      input.labels.reference,
      input.labels.movementType,
      input.labels.performedBy,
      input.labels.notes,
      input.labels.stockIn,
      input.labels.stockOut,
      input.labels.balance,
    ],
    ...input.movements.map((movement) => [
      formatDateLabel(movement.createdAt, input.locale),
      movement.referenceLabel || movement.referenceId || '',
      input.movementTypeLabels[movement.type] ?? formatEnumLabel(movement.type),
      movement.performedBy?.name || '',
      movement.notes || '',
      movement.quantityChange > 0 ? formatQuantity(movement.quantityChange) : '',
      movement.quantityChange < 0 ? formatQuantity(Math.abs(movement.quantityChange)) : '',
      formatQuantity(movement.quantityAfter),
    ]),
  ]

  return rows
    .map((row) => row.map((value) => escapeCsvCell(value ?? '')).join(','))
    .join('\r\n')
}

function escapeCsvCell(value: string) {
  const normalized = String(value)
  if (/[",\r\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`
  }

  return normalized
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value
  }

  if (maxLength <= 3) {
    return value.slice(0, maxLength)
  }

  return `${value.slice(0, maxLength - 3)}...`
}

function buildStockBinPdfHtml(input: {
  locale: string
  productName: string
  productDescription: string
  productCode: string
  imageUrl: string | null
  stockUnitDisplay: string
  summary: InventoryDetail['binSummary']
  movements: InventoryMovement[]
  timezoneLabel: string
  movementTypeLabels: Record<InventoryMovementType, string>
  labels: {
    title: string
    balance: string
    asOfToday: string
    openingStock: string
    totalRestocked: string
    totalSold: string
    adjustments: string
    noNotes: string
    footer: string
    table: {
      date: string
      reference: string
      type: string
      performedBy: string
      notes: string
      stockIn: string
      stockOut: string
      balance: string
    }
  }
}) {
  const avatar = input.productName.slice(0, 2).toUpperCase()
  const rows = input.movements
    .map((movement) => {
      const typeLabel = input.movementTypeLabels[movement.type] ?? formatEnumLabel(movement.type)
      const badgeClass =
        movement.type === InventoryMovementType.RESTOCK_IN ||
        movement.type === InventoryMovementType.OPENING_STOCK
          ? 'badge-in'
          : movement.type === InventoryMovementType.SALE ||
              movement.type === InventoryMovementType.TRANSFER_OUT
            ? 'badge-out'
            : 'badge-adjust'

      return `
        <tr>
          <td class="mono muted">${escapeHtml(formatDateLabel(movement.createdAt, input.locale))}</td>
          <td class="mono">${escapeHtml(
            truncateText(
              movement.referenceLabel || movement.referenceId || '',
              STOCK_BIN_REFERENCE_MAX_LENGTH,
            ),
          )}</td>
          <td><span class="badge ${badgeClass}" title="${escapeAttribute(typeLabel)}">${escapeHtml(
            truncateText(typeLabel, STOCK_BIN_MOVEMENT_TYPE_MAX_LENGTH),
          )}</span></td>
          <td class="muted">${escapeHtml(movement.performedBy?.name || '')}</td>
          <td class="muted">${escapeHtml(movement.notes?.trim() || input.labels.noNotes)}</td>
          <td class="mono right in">${movement.quantityChange > 0 ? `+${escapeHtml(formatQuantity(movement.quantityChange))}` : '&mdash;'}</td>
          <td class="mono right out">${movement.quantityChange < 0 ? `-${escapeHtml(formatQuantity(Math.abs(movement.quantityChange)))}` : '&mdash;'}</td>
          <td class="mono right strong">${escapeHtml(formatQuantity(movement.quantityAfter))}</td>
        </tr>
      `
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(input.productName)} - Stock Bin Card</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Arial, sans-serif;
    color: #171717;
    background: #ffffff;
  }
  .sheet { width: 100%; }
  .hero {
    border: 1px solid #dcdcdc;
    border-radius: 22px;
    padding: 18px;
    margin-bottom: 14px;
    overflow: hidden;
    position: relative;
  }
  .hero::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    height: 4px;
    background: #1d9e75;
  }
  .hero-inner { display: flex; gap: 16px; align-items: flex-start; }
  .avatar, .avatar img {
    width: 56px;
    height: 56px;
    border-radius: 16px;
  }
  .avatar {
    background: #e1f5ee;
    color: #1d9e75;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .eyebrow {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .14em;
    color: #1d9e75;
    margin-bottom: 6px;
  }
  h1 {
    margin: 0;
    font-size: 24px;
    line-height: 1.2;
  }
  .desc {
    margin-top: 8px;
    color: #666;
    font-size: 13px;
    line-height: 1.5;
  }
  .meta {
    min-width: 220px;
    margin-left: auto;
    border: 1px solid #e7e7e7;
    border-radius: 18px;
    background: #fafafa;
    padding: 14px 16px;
    text-align: right;
  }
  .meta-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: #777;
  }
  .meta-value {
    font-size: 30px;
    font-family: "Courier New", monospace;
    font-weight: 700;
    margin-top: 4px;
  }
  .meta-hint {
    margin-top: 4px;
    font-size: 12px;
    color: #777;
  }
  .card {
    border: 1px solid #dcdcdc;
    border-radius: 22px;
    overflow: hidden;
  }
  .card-header {
    background: #1d9e75;
    color: #fff;
    padding: 16px 18px;
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
  }
  .card-title {
    font-size: 15px;
    font-weight: 700;
    margin: 0;
  }
  .card-subtitle {
    margin-top: 3px;
    font-size: 12px;
    color: rgba(255,255,255,.8);
  }
  .stock-balance-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: rgba(255,255,255,.72);
  }
  .stock-balance-value {
    font-size: 30px;
    font-family: "Courier New", monospace;
    font-weight: 700;
  }
  .stock-balance-unit {
    font-size: 12px;
    color: rgba(255,255,255,.8);
  }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border-bottom: 1px solid #e7e7e7;
  }
  .summary-cell {
    padding: 14px 16px;
    border-right: 1px solid #e7e7e7;
  }
  .summary-cell:last-child { border-right: 0; }
  .summary-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: #777;
  }
  .summary-value {
    margin-top: 4px;
    font-size: 14px;
    font-weight: 700;
    font-family: "Courier New", monospace;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  thead { background: #f5f5f5; }
  th, td {
    padding: 10px 12px;
    border-bottom: 1px solid #ececec;
    vertical-align: top;
    text-align: left;
  }
  th {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: #777;
  }
  .right { text-align: right; }
  .mono { font-family: "Courier New", monospace; }
  .muted { color: #666; }
  .strong { color: #171717; font-weight: 700; }
  .in { color: #1d9e75; }
  .out { color: #e24b4a; }
  .badge {
    display: inline-block;
    max-width: 132px;
    padding: 4px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: middle;
  }
  .badge-in { background: #e1f5ee; color: #085041; }
  .badge-out { background: #fcebeb; color: #791f1f; }
  .badge-adjust { background: #e6f1fb; color: #0c447c; }
  .footer {
    background: #f7f7f7;
    color: #666;
    font-size: 12px;
    padding: 12px 18px;
  }
</style>
</head>
<body>
  <div class="sheet">
    <section class="hero">
      <div class="hero-inner">
        <div class="avatar">
          ${
            input.imageUrl
              ? `<img src="${escapeAttribute(input.imageUrl)}" alt="${escapeAttribute(input.productName)}" />`
              : escapeHtml(avatar)
          }
        </div>
        <div>
          <div class="eyebrow">Products / Detail</div>
          <h1>${escapeHtml(input.productName)}</h1>
          <div class="desc">${escapeHtml(input.productDescription)}</div>
          <div class="desc">${escapeHtml(input.productCode)}</div>
        </div>
        <div class="meta">
          <div class="meta-label">${escapeHtml(input.labels.balance)}</div>
          <div class="meta-value">${escapeHtml(formatQuantity(input.summary?.currentBalance ?? 0))}</div>
          <div class="meta-hint">${escapeHtml(input.stockUnitDisplay)} · ${escapeHtml(input.labels.asOfToday)}</div>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-header">
        <div>
          <p class="card-title">${escapeHtml(input.labels.title)}</p>
          <p class="card-subtitle">${escapeHtml(input.productName)}${input.productCode ? ` · ${escapeHtml(input.productCode)}` : ''}</p>
        </div>
        <div style="text-align:right">
          <div class="stock-balance-label">${escapeHtml(input.labels.balance)}</div>
          <div class="stock-balance-value">${escapeHtml(formatQuantity(input.summary?.currentBalance ?? 0))}</div>
          <div class="stock-balance-unit">${escapeHtml(input.stockUnitDisplay)} · ${escapeHtml(input.labels.asOfToday)}</div>
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-cell">
          <div class="summary-label">${escapeHtml(input.labels.openingStock)}</div>
          <div class="summary-value">${escapeHtml(formatQuantity(input.summary?.openingStock ?? 0))} ${escapeHtml(input.stockUnitDisplay)}</div>
        </div>
        <div class="summary-cell">
          <div class="summary-label">${escapeHtml(input.labels.totalRestocked)}</div>
          <div class="summary-value">${escapeHtml(formatQuantity(input.summary?.totalRestocked ?? 0))} ${escapeHtml(input.stockUnitDisplay)}</div>
        </div>
        <div class="summary-cell">
          <div class="summary-label">${escapeHtml(input.labels.totalSold)}</div>
          <div class="summary-value">${escapeHtml(formatQuantity(input.summary?.totalSold ?? 0))} ${escapeHtml(input.stockUnitDisplay)}</div>
        </div>
        <div class="summary-cell">
          <div class="summary-label">${escapeHtml(input.labels.adjustments)}</div>
          <div class="summary-value">${escapeHtml(formatQuantity(input.summary?.totalAdjusted ?? 0))} ${escapeHtml(input.stockUnitDisplay)}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>${escapeHtml(input.labels.table.date)}</th>
            <th>${escapeHtml(input.labels.table.reference)}</th>
            <th>${escapeHtml(input.labels.table.type)}</th>
            <th>${escapeHtml(input.labels.table.performedBy)}</th>
            <th>${escapeHtml(input.labels.table.notes)}</th>
            <th class="right">${escapeHtml(input.labels.table.stockIn)}</th>
            <th class="right">${escapeHtml(input.labels.table.stockOut)}</th>
            <th class="right">${escapeHtml(input.labels.table.balance)}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="footer">${escapeHtml(input.labels.footer)}</div>
    </section>
  </div>
</body>
</html>`
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttribute(value: string) {
  return escapeHtml(value)
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

function RestockIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="4.5" width="13" height="11" rx="2" />
      <path d="M10 7v6M7 10h6" />
    </svg>
  )
}

function AdjustStockIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 6.5v7M6.5 10h7" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 14.5V16h1.5L14 7.5 12.5 6 4 14.5Z" />
      <path d="M11.5 7 13 5.5a1.4 1.4 0 0 1 2 2L13.5 9" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 3.5v8" />
      <path d="m6.5 8.5 3.5 3.5 3.5-3.5" />
      <path d="M4 15.5h12" />
    </svg>
  )
}

function DocumentIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 2.5h5l4 4v10a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 5 16.5V4A1.5 1.5 0 0 1 6.5 2.5Z" />
      <path d="M11 2.5V7h4.5" />
      <path d="M7.5 11h5" />
      <path d="M7.5 14h5" />
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
