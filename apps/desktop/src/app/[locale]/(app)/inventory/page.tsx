'use client'

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Badge, Button, Input, NumberInput, Spinner } from '@biztrack/ui'
import { toast } from 'sonner'
import {
  InventoryMovementType,
  StockAdjustmentType,
  type InventoryListItem,
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
import { PaginationControls } from '@/components/catalog/PaginationControls'
import { ProductCreateDialog } from '@/components/products/ProductCreateDialog'
import { ResourceActionMenu } from '@/components/products/ResourceActionMenu'
import { formatDateLabel, formatQuantity } from '@/components/products/product-utils'
import { CommandSelect, type CommandSelectOption } from '@/components/ui/command-select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { getApiErrorMessage } from '@/services/api-response'
import {
  InventoryLocalError,
  adjustInventoryLocal,
  listInventoryLocal,
  listInventoryMovementsLocal,
  restockInventoryLocal,
  setInventoryThresholdLocal,
} from '@/services/inventory.local'
import { type LocalContactRecord } from '@/services/contacts.local'
import { listCategoriesLocal, listProductsLocal, listUnitOfMeasuresLocal } from '@/services/products.local'
import { useAuthStore } from '@/stores/auth.store'
import { usePlanStore } from '@/stores/plan.store'
import Link from 'next/link'

type InventoryStatus = 'healthy' | 'low' | 'out' | 'reorder'
type InventoryTab = 'all' | 'low' | 'out' | 'reorder'

type AdjustFormState = {
  productId: string
  type: StockAdjustmentType
  quantity: string
  notes: string
}

type RestockFormState = {
  supplierId: string
  referenceNumber: string
  totalAmount: string
  notes: string
  payments: RestockPaymentDraft[]
  items: RestockLineState[]
}

type RestockCostMode = 'unit' | 'total'

type RestockProductPickerState = {
  draftProductId: string
  draftQuantity: string
  draftUnitCost: string
  draftLineTotal: string
  draftCostMode: RestockCostMode
  items: RestockLineState[]
}

type ThresholdFormState = {
  productId: string
  lowStockThreshold: string
  reorderPoint: string
}

type RestockLineState = {
  id: string
  productId: string
  quantity: string
  unitCost: string
  lineTotal: string
  costMode: RestockCostMode
}

const PAGE_SIZE = 10
const INVENTORY_LIMIT = 1000
const MOVEMENT_LIMIT = 8
const PRODUCT_SELECT_LIMIT = 25
const FALLBACK_AVATAR_COLORS = ['#E6F1FB', '#EAF3DE', '#FAEEDA', '#FCEBEB', '#EEEDFE']
const ALL_CATEGORIES_VALUE = '__all_categories__'
const selectClassName =
  'block h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring'

function inventoryItemToOption(item: InventoryListItem): CommandSelectOption {
  const productName = item.productName || '-'

  return {
    value: item.productId,
    label: item.sku ? `${productName} (${item.sku})` : productName,
    imageUrl: item.primaryImageUrl ?? null,
    keywords: [productName, item.sku ?? '', item.barcode ?? '', item.categoryName ?? ''],
  }
}

function productToOption(product: Product): CommandSelectOption {
  return {
    value: product.id,
    label: product.sku ? `${product.name} (${product.sku})` : product.name,
    imageUrl: product.primaryImageUrl ?? product.imageUrl ?? null,
    keywords: [product.name, product.sku ?? '', product.barcode ?? '', product.category?.name ?? ''],
  }
}

function categoryToOption(category: ProductCategory): CommandSelectOption {
  return {
    value: category.id,
    label: category.name,
    keywords: [category.name, category.slug ?? ''],
  }
}

function mergeCommandOptions(options: CommandSelectOption[]) {
  const byValue = new Map<string, CommandSelectOption>()

  for (const option of options) {
    byValue.set(option.value, option)
  }

  return Array.from(byValue.values())
}

function cloneRestockItems(items: RestockLineState[]) {
  return items.map((item) => ({ ...item }))
}

function createEmptyRestockForm(): RestockFormState {
  return {
    supplierId: '',
    referenceNumber: '',
    totalAmount: '',
    notes: '',
    payments: [],
    items: [],
  }
}

function createEmptyRestockProductPicker(
  items: RestockLineState[] = [],
): RestockProductPickerState {
  return {
    draftProductId: '',
    draftQuantity: '',
    draftUnitCost: '',
    draftLineTotal: '',
    draftCostMode: 'unit',
    items: cloneRestockItems(items),
  }
}

function formatMoneyInput(value: number) {
  const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function computeRestockSubtotal(quantity: string, unitCost: string, lineTotal?: string) {
  const quantityInput = parseRequiredNumberInput(quantity)
  const lineTotalInput = parseOptionalNumberInput(lineTotal ?? '')
  const unitCostInput = parseOptionalNumberInput(unitCost)

  if (
    quantityInput.kind !== 'value' ||
    quantityInput.value < 0.001 ||
    (
      (lineTotalInput.kind !== 'value' || lineTotalInput.value < 0) &&
      (unitCostInput.kind !== 'value' || unitCostInput.value < 0)
    )
  ) {
    return null
  }

  if (lineTotalInput.kind === 'value' && lineTotalInput.value >= 0) {
    return lineTotalInput.value
  }

  return quantityInput.value * (unitCostInput.value || 0)
}

function syncRestockCostFields(input: {
  quantity: string
  unitCost: string
  lineTotal: string
  costMode: RestockCostMode
}) {
  const quantityInput = parseRequiredNumberInput(input.quantity)
  if (quantityInput.kind !== 'value' || quantityInput.value < 0.001) {
    return {
      unitCost: input.unitCost,
      lineTotal: input.lineTotal,
    }
  }

  if (input.costMode === 'total') {
    const totalInput = parseOptionalNumberInput(input.lineTotal)
    if (totalInput.kind === 'value' && totalInput.value >= 0) {
      return {
        unitCost: formatMoneyInput(totalInput.value / quantityInput.value),
        lineTotal: input.lineTotal,
      }
    }
  }

  const unitCostInput = parseOptionalNumberInput(input.unitCost)
  if (unitCostInput.kind === 'value' && unitCostInput.value >= 0) {
    return {
      unitCost: input.unitCost,
      lineTotal: formatMoneyInput(quantityInput.value * unitCostInput.value),
    }
  }

  const totalInput = parseOptionalNumberInput(input.lineTotal)
  if (totalInput.kind === 'value' && totalInput.value >= 0) {
    return {
      unitCost: formatMoneyInput(totalInput.value / quantityInput.value),
      lineTotal: input.lineTotal,
    }
  }

  return {
    unitCost: input.unitCost,
    lineTotal: input.lineTotal,
  }
}

function resolveRestockLineUnitCostValue(quantity: string, unitCost: string, lineTotal: string) {
  const quantityInput = parseRequiredNumberInput(quantity)
  if (quantityInput.kind !== 'value' || quantityInput.value < 0.001) {
    return null
  }

  const unitCostInput = parseOptionalNumberInput(unitCost)
  if (unitCostInput.kind === 'value' && unitCostInput.value >= 0) {
    return unitCostInput.value
  }

  const lineTotalInput = parseOptionalNumberInput(lineTotal)
  if (lineTotalInput.kind === 'value' && lineTotalInput.value >= 0) {
    return Math.round(((lineTotalInput.value / quantityInput.value) + Number.EPSILON) * 100) / 100
  }

  return null
}

function computeRestockTotalFromItems(items: RestockLineState[]) {
  let total = 0
  let hasAnySubtotal = false

  for (const item of items) {
    const subtotal = computeRestockSubtotal(item.quantity, item.unitCost, item.lineTotal)
    if (subtotal === null) {
      continue
    }

    total += subtotal
    hasAnySubtotal = true
  }

  return hasAnySubtotal ? total : null
}

function formatXafCurrency(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'XAF',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }

  return `${bytes} B`
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

function getInventoryStatus(item: InventoryListItem): InventoryStatus {
  if (item.quantity <= 0) {
    return 'out'
  }

  if (item.isLowStock) {
    return 'low'
  }

  if (item.reorderPoint !== null && item.reorderPoint !== undefined && item.quantity <= item.reorderPoint) {
    return 'reorder'
  }

  return 'healthy'
}

function getInventoryStatusBadgeVariant(
  status: InventoryStatus,
): 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'out':
      return 'danger'
    case 'low':
      return 'warning'
    case 'reorder':
      return 'info'
    case 'healthy':
    default:
      return 'success'
  }
}

function getInventoryStatusLabel(
  status: InventoryStatus,
  t: ReturnType<typeof useTranslations<'app.inventory'>>,
) {
  switch (status) {
    case 'out':
      return t('stock.badges.out_of_stock')
    case 'low':
      return t('stock.badges.low_stock')
    case 'reorder':
      return t('stock.badges.reorder')
    case 'healthy':
    default:
      return t('stock.badges.healthy')
  }
}

function getProgressPercent(item: InventoryListItem) {
  const target = Math.max(item.reorderPoint ?? item.lowStockThreshold ?? item.quantity, 1)
  return Math.min(100, Math.round((item.quantity / target) * 100))
}

function getProgressClassName(status: InventoryStatus) {
  switch (status) {
    case 'out':
      return 'bg-danger-400'
    case 'low':
      return 'bg-warning-400'
    case 'reorder':
      return 'bg-primary'
    case 'healthy':
    default:
      return 'bg-emerald-600'
  }
}

function movementTypeLabel(
  type: InventoryMovementType,
  t: ReturnType<typeof useTranslations<'app.inventory'>>,
) {
  switch (type) {
    case InventoryMovementType.SALE:
      return t('movement_types.sale')
    case InventoryMovementType.RESTOCK_IN:
      return t('movement_types.restock_in')
    case InventoryMovementType.MANUAL_ADJUSTMENT:
      return t('movement_types.manual_adjustment')
    case InventoryMovementType.VOID_REVERSAL:
      return t('movement_types.void_reversal')
    case InventoryMovementType.OPENING_STOCK:
      return t('movement_types.opening_stock')
    case InventoryMovementType.TRANSFER_IN:
      return t('movement_types.transfer_in')
    case InventoryMovementType.TRANSFER_OUT:
      return t('movement_types.transfer_out')
    default:
      return type
  }
}

function movementTone(
  movement: InventoryMovement,
): {
  badge: 'success' | 'warning' | 'danger' | 'info'
  iconClassName: string
  quantityClassName: string
  icon: string
} {
  if (
    movement.type === InventoryMovementType.RESTOCK_IN ||
    movement.type === InventoryMovementType.OPENING_STOCK ||
    movement.type === InventoryMovementType.TRANSFER_IN ||
    movement.quantityChange > 0
  ) {
    return {
      badge: 'success',
      iconClassName: 'bg-emerald-100 text-emerald-700',
      quantityClassName: 'text-emerald-700',
      icon: '+',
    }
  }

  if (
    movement.type === InventoryMovementType.SALE ||
    movement.type === InventoryMovementType.TRANSFER_OUT ||
    movement.quantityChange < 0
  ) {
    return {
      badge: 'danger',
      iconClassName: 'bg-red-100 text-red-700',
      quantityClassName: 'text-red-700',
      icon: '-',
    }
  }

  return {
    badge: 'warning',
    iconClassName: 'bg-amber-100 text-amber-700',
    quantityClassName: 'text-amber-700',
    icon: '~',
  }
}

function resolveFallbackAvatarColor(value?: string | null) {
  if (!value) {
    return FALLBACK_AVATAR_COLORS[0]
  }

  const hash = value.split('').reduce((total, char) => total + char.charCodeAt(0), 0)
  return FALLBACK_AVATAR_COLORS[hash % FALLBACK_AVATAR_COLORS.length]
}

function formatInventoryQuantity(item?: InventoryListItem | null) {
  if (!item) return '-'

  return `${formatQuantity(item.quantity)}${item.unitAbbreviation ? ` ${item.unitAbbreviation}` : ''}`
}

function MetricPanel({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  hint: string
  tone?: 'default' | 'healthy' | 'warning' | 'danger'
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-4 shadow-sm',
        tone === 'healthy' && 'border-emerald-200 bg-emerald-50',
        tone === 'warning' && 'border-amber-200 bg-amber-50',
        tone === 'danger' && 'border-red-200 bg-red-50',
        tone === 'default' && 'border-border bg-card',
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-2 text-3xl font-semibold tracking-tight text-foreground',
          tone === 'healthy' && 'text-emerald-700',
          tone === 'warning' && 'text-amber-700',
          tone === 'danger' && 'text-red-700',
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  )
}

function StatusTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
        active
          ? 'border border-border bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-secondary',
      )}
    >
      {label}
    </button>
  )
}

function SearchIcon() {
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
      <circle cx="9" cy="9" r="5.5" />
      <path d="m14 14 3 3" />
    </svg>
  )
}

function ProductAvatar({
  item,
  categoryColor,
}: {
  item: InventoryListItem
  categoryColor?: string | null
}) {
  const fallbackColor = categoryColor || resolveFallbackAvatarColor(item.categoryName || item.productName)

  if (item.primaryImageUrl) {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
        <img
          src={item.primaryImageUrl}
          alt={item.productName || 'Product image'}
          className="h-full w-full object-cover"
        />
      </div>
    )
  }

  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-sm font-semibold text-foreground"
      style={{ backgroundColor: fallbackColor }}
    >
      {(item.productName || '?').trim().charAt(0).toUpperCase()}
    </div>
  )
}

export default function InventoryPage() {
  const t = useTranslations('app.inventory')
  const locale = useLocale()
  const tProducts = useTranslations('app.products')
  const businessId = useAuthStore((state) => state.businessId)
  const planState = usePlanStore((state) => state.current)
  const productsQuotaUsage =
    planState?.quotaUsage.find((entry) => entry.resource === 'products' && !entry.unlimited) ?? null
  const productsQuotaReached = Boolean(
    productsQuotaUsage && productsQuotaUsage.used >= (productsQuotaUsage.limit ?? 0),
  )
  const invoiceInputRef = useRef<HTMLInputElement | null>(null)
  const [inventoryItems, setInventoryItems] = useState<InventoryListItem[]>([])
  const [movements, setMovements] = useState<InventoryMovement[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [units, setUnits] = useState<UnitOfMeasure[]>([])
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [statusTab, setStatusTab] = useState<InventoryTab>('all')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [categoryId, setCategoryId] = useState('')
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyProductId, setBusyProductId] = useState<string | null>(null)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [restockOpen, setRestockOpen] = useState(false)
  const [restockProductsOpen, setRestockProductsOpen] = useState(false)
  const [restockCreateProductOpen, setRestockCreateProductOpen] = useState(false)
  const [thresholdOpen, setThresholdOpen] = useState(false)
  const [savingAdjustment, setSavingAdjustment] = useState(false)
  const [savingRestock, setSavingRestock] = useState(false)
  const [savingThresholds, setSavingThresholds] = useState(false)
  const [restockInvoiceFile, setRestockInvoiceFile] = useState<File | null>(null)
  const [restockSupplier, setRestockSupplier] = useState<LocalContactRecord | null>(null)
  const [cachedProductOptions, setCachedProductOptions] = useState<CommandSelectOption[]>([])
  const [adjustForm, setAdjustForm] = useState<AdjustFormState>({
    productId: '',
    type: StockAdjustmentType.ADD,
    quantity: '1',
    notes: '',
  })
  const [restockForm, setRestockForm] = useState<RestockFormState>(createEmptyRestockForm())
  const [restockProductPicker, setRestockProductPicker] = useState<RestockProductPickerState>(
    createEmptyRestockProductPicker(),
  )
  const [thresholdForm, setThresholdForm] = useState<ThresholdFormState>({
    productId: '',
    lowStockThreshold: '',
    reorderPoint: '',
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
        case 'INVENTORY_RESTOCK_TOTAL_AMOUNT_INVALID':
          return t('errors.restock_total_amount_invalid')
        case 'INVENTORY_RESTOCK_TOTAL_AMOUNT_REQUIRED':
          return t('errors.restock_total_amount_required')
        case 'INVENTORY_RESTOCK_TOTAL_AMOUNT_MISMATCH':
          return t('errors.restock_total_amount_mismatch')
        case 'INVENTORY_RESTOCK_PAYMENT_AMOUNT_INVALID':
          return t('errors.restock_payment_amount_invalid')
        case 'INVENTORY_RESTOCK_PAYMENT_EXCEEDS_TOTAL':
          return t('errors.restock_payment_exceeds_total')
        case 'INVENTORY_RESTOCK_SUPPLIER_REQUIRED_FOR_CREDIT':
          return t('errors.restock_supplier_required_for_credit')
        case 'INVENTORY_RESTOCK_SUPPLIER_NOT_FOUND':
          return t('errors.restock_supplier_not_found')
        case 'INVENTORY_RESTOCK_SUPPLIER_INACTIVE':
          return t('errors.restock_supplier_inactive')
        case 'INVENTORY_RESTOCK_SUPPLIER_TYPE_INVALID':
          return t('errors.restock_supplier_type_invalid')
        default:
          break
      }
    }

    return getApiErrorMessage(inventoryError, fallback)
  }

  useEffect(() => {
    if (!businessId) {
      setCategories([])
      setUnits([])
      setCachedProductOptions([])
      return
    }

    const currentBusinessId = businessId
    let active = true

    async function loadMetadata() {
      try {
        const [categoriesResult, unitsResult] = await Promise.all([
          listCategoriesLocal(currentBusinessId, {
            page: 1,
            limit: 500,
            sortBy: 'sortOrder',
            sortOrder: 'ASC',
          }),
          listUnitOfMeasuresLocal(currentBusinessId, {
            page: 1,
            limit: 200,
            sortBy: 'name',
            sortOrder: 'ASC',
          }),
        ])
        if (!active) return

        setCategories(categoriesResult.data)
        setUnits(unitsResult.data)
      } catch {
        // Keep the page usable even when the category filter is unavailable.
      }
    }

    void loadMetadata()

    return () => {
      active = false
    }
  }, [businessId])

  useEffect(() => {
    if (!businessId) {
      setInventoryItems([])
      setMovements([])
      setLoading(false)
      return
    }

    const currentBusinessId = businessId
    let active = true

    async function loadWorkspace() {
      setLoading(true)
      setError(null)

      try {
        const [inventoryResult, movementsResult] = await Promise.all([
          listInventoryLocal(currentBusinessId, {
            page: 1,
            limit: INVENTORY_LIMIT,
            sortBy: 'productName',
            sortOrder: 'ASC',
          }),
          listInventoryMovementsLocal(currentBusinessId, {
            page: 1,
            limit: MOVEMENT_LIMIT,
            sortBy: 'createdAt',
            sortOrder: 'DESC',
          }),
        ])

        if (!active) return

        setInventoryItems(inventoryResult.data)
        setMovements(movementsResult.data)
      } catch (loadError) {
        if (!active) return
        setError(getApiErrorMessage(loadError, t('errors.load')))
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadWorkspace()

    return () => {
      active = false
    }
  }, [businessId, refreshKey, t])

  const categoryColorMap = useMemo(() => {
    return new Map(categories.map((category) => [category.name, category.color ?? null]))
  }, [categories])

  const inventoryMap = useMemo(() => {
    return new Map(inventoryItems.map((item) => [item.productId, item]))
  }, [inventoryItems])

  const inventoryProductOptions = useMemo(
    () => inventoryItems.map((item) => inventoryItemToOption(item)),
    [inventoryItems],
  )

  const productSelectOptions = useMemo(
    () => mergeCommandOptions([...inventoryProductOptions, ...cachedProductOptions]),
    [cachedProductOptions, inventoryProductOptions],
  )

  const productSelectOptionMap = useMemo(
    () => new Map(productSelectOptions.map((option) => [option.value, option])),
    [productSelectOptions],
  )

  const getSelectedInventoryStaticOptions = useCallback(
    (productId: string) => {
      if (!productId) {
        return [] as CommandSelectOption[]
      }

      const option = productSelectOptionMap.get(productId)
      return option ? [option] : []
    },
    [productSelectOptionMap],
  )

  const categoryOptions = useMemo<CommandSelectOption[]>(
    () => [
      {
        value: ALL_CATEGORIES_VALUE,
        label: t('filters.all_categories'),
        keywords: [t('filters.all_categories')],
      },
      ...categories.map((category) => categoryToOption(category)),
    ],
    [categories, t],
  )

  const loadTrackedProductOptions = useCallback(
    async ({
      search,
      page,
    }: {
      search: string
      page: number
    }): Promise<PaginatedResult<CommandSelectOption>> => {
      if (!businessId) {
        return {
          data: [],
          page,
          limit: PRODUCT_SELECT_LIMIT,
          total: 0,
          totalPages: 1,
        }
      }

      const result = await listProductsLocal(businessId, {
        page,
        limit: PRODUCT_SELECT_LIMIT,
        search,
        sortBy: 'name',
        sortOrder: 'ASC',
        trackInventory: true,
      })

      const mappedOptions = result.data.map((product) => productToOption(product))
      setCachedProductOptions((current) => mergeCommandOptions([...current, ...mappedOptions]))

      return {
        ...result,
        data: mappedOptions,
      }
    },
    [businessId],
  )

  const metrics = useMemo(() => {
    return inventoryItems.reduce(
      (summary, item) => {
        const status = getInventoryStatus(item)
        summary.total += 1

        if (status === 'out') {
          summary.out += 1
        } else if (status === 'low') {
          summary.low += 1
        } else {
          summary.inStock += 1
        }

        if (status === 'reorder') {
          summary.reorder += 1
        }

        return summary
      },
      { total: 0, inStock: 0, low: 0, out: 0, reorder: 0 },
    )
  }, [inventoryItems])

  const filteredItems = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()

    return inventoryItems.filter((item) => {
      if (categoryId && item.categoryName !== categories.find((category) => category.id === categoryId)?.name) {
        return false
      }

      const status = getInventoryStatus(item)
      if (statusTab === 'low' && status !== 'low') return false
      if (statusTab === 'out' && status !== 'out') return false
      if (statusTab === 'reorder' && status !== 'reorder') return false

      if (!query) return true

      const haystack = [item.productName, item.sku, item.barcode, item.categoryName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [categories, categoryId, deferredSearch, inventoryItems, statusTab])

  const totalPages = Math.max(Math.ceil(filteredItems.length / PAGE_SIZE), 1)

  const pagedItems = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE
    return filteredItems.slice(startIndex, startIndex + PAGE_SIZE)
  }, [filteredItems, page])

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  useEffect(() => {
    if (filteredItems.length === 0) {
      setSelectedProductId(null)
      return
    }

    if (!selectedProductId || !filteredItems.some((item) => item.productId === selectedProductId)) {
      setSelectedProductId(filteredItems[0]?.productId ?? null)
    }
  }, [filteredItems, selectedProductId])

  const openAdjustDialog = (preferredProductId?: string | null) => {
    const productId = preferredProductId ?? ''
    if (productId) {
      setSelectedProductId(productId)
    }
    setAdjustForm({
      productId,
      type: StockAdjustmentType.ADD,
      quantity: '1',
      notes: '',
    })
    setAdjustOpen(true)
  }

  const openRestockDialog = (preferredProductId?: string | null) => {
    if (preferredProductId) {
      setSelectedProductId(preferredProductId)
    }
    setRestockForm(createEmptyRestockForm())
    setRestockSupplier(null)
    setRestockProductPicker(createEmptyRestockProductPicker())
    if (preferredProductId) {
      setRestockProductPicker((current) => ({
        ...current,
        draftProductId: preferredProductId,
      }))
    }
    setRestockInvoiceFile(null)
    setRestockOpen(true)
  }

  const openThresholdDialog = (preferredProductId?: string | null) => {
    const productId = preferredProductId ?? ''
    const item = productId ? inventoryMap.get(productId) ?? null : null

    if (productId) {
      setSelectedProductId(productId)
    }
    setThresholdForm({
      productId,
      lowStockThreshold: item?.lowStockThreshold?.toString() ?? '',
      reorderPoint: item?.reorderPoint?.toString() ?? '',
    })
    setThresholdOpen(true)
  }

  const updateThresholdProduct = (productId: string) => {
    const item = inventoryMap.get(productId) ?? null
    setThresholdForm({
      productId,
      lowStockThreshold: item?.lowStockThreshold?.toString() ?? '',
      reorderPoint: item?.reorderPoint?.toString() ?? '',
    })
  }

  const categoryFilterValue = categoryId || ALL_CATEGORIES_VALUE

  const restockTotalCost = useMemo(
    () => computeRestockTotalFromItems(restockForm.items),
    [restockForm.items],
  )
  const restockExplicitTotal = useMemo(() => {
    const parsed = parseOptionalNumberInput(restockForm.totalAmount)
    if (parsed.kind !== 'value' || parsed.value < 0) {
      return null
    }

    return parsed.value
  }, [restockForm.totalAmount])
  const restockEffectiveTotal = restockExplicitTotal ?? restockTotalCost
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

  const restockPickerTotalCost = useMemo(
    () => computeRestockTotalFromItems(restockProductPicker.items),
    [restockProductPicker.items],
  )

  const restockProductsPreview = useMemo(() => {
    return restockForm.items.slice(0, 3).map((item) => {
      return productSelectOptionMap.get(item.productId)?.label ?? t('movement_log.unknown_product')
    })
  }, [productSelectOptionMap, restockForm.items, t])

  const restockPickerPreview = useMemo(() => {
    return restockProductPicker.items.slice(0, 3).map((item) => {
      return productSelectOptionMap.get(item.productId)?.label ?? t('movement_log.unknown_product')
    })
  }, [productSelectOptionMap, restockProductPicker.items, t])

  const openRestockProductsDialog = () => {
    setRestockProductPicker((current) => {
      const nextState = createEmptyRestockProductPicker(restockForm.items)

      if (restockForm.items.length === 0) {
        nextState.draftProductId = current.draftProductId
        nextState.draftQuantity = current.draftQuantity
        nextState.draftUnitCost = current.draftUnitCost
        nextState.draftLineTotal = current.draftLineTotal
        nextState.draftCostMode = current.draftCostMode
      }

      return nextState
    })
    setRestockProductsOpen(true)
  }

  const closeRestockProductsDialog = () => {
    setRestockProductsOpen(false)
    setRestockCreateProductOpen(false)
  }

  const confirmRestockProductsDialog = () => {
    setRestockForm((current) => ({
      ...current,
      items: cloneRestockItems(restockProductPicker.items),
    }))
    setRestockProductsOpen(false)
  }

  const handleRestockDraftProductChange = (productId: string) => {
    setRestockProductPicker((current) => ({
      ...current,
      draftProductId: productId,
    }))
  }

  const confirmReplaceRestockProduct = (productId: string) => {
    const productLabel = productSelectOptionMap.get(productId)?.label ?? t('form.product')
    return window.confirm(t('restock.replace_existing_confirm', { product: productLabel }))
  }

  const addRestockLine = () => {
    if (!restockProductPicker.draftProductId) {
      toast.error(t('errors.product_required'))
      return
    }

    const quantityInput = parseRequiredNumberInput(restockProductPicker.draftQuantity)
    if (quantityInput.kind !== 'value' || quantityInput.value < 0.001) {
      toast.error(t('errors.restock_quantity_invalid'))
      return
    }

    const unitCostInput = parseOptionalNumberInput(restockProductPicker.draftUnitCost)
    if (unitCostInput.kind === 'invalid' || (unitCostInput.kind === 'value' && unitCostInput.value < 0)) {
      toast.error(t('errors.restock_unit_cost_invalid'))
      return
    }

    const lineTotalInput = parseOptionalNumberInput(restockProductPicker.draftLineTotal)
    if (
      lineTotalInput.kind === 'invalid' ||
      (lineTotalInput.kind === 'value' && lineTotalInput.value < 0)
    ) {
      toast.error(t('errors.restock_total_amount_invalid'))
      return
    }

    const resolvedUnitCost = resolveRestockLineUnitCostValue(
      restockProductPicker.draftQuantity,
      restockProductPicker.draftUnitCost,
      restockProductPicker.draftLineTotal,
    )
    if (resolvedUnitCost === null) {
      toast.error(t('errors.restock_line_cost_required'))
      return
    }

    const syncedDraft = syncRestockCostFields({
      quantity: restockProductPicker.draftQuantity,
      unitCost: restockProductPicker.draftUnitCost,
      lineTotal: restockProductPicker.draftLineTotal,
      costMode: restockProductPicker.draftCostMode,
    })

    const existingLine = restockProductPicker.items.find(
      (item) => item.productId === restockProductPicker.draftProductId,
    )
    if (existingLine) {
      if (!confirmReplaceRestockProduct(restockProductPicker.draftProductId)) {
        return
      }

      setRestockProductPicker((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.id === existingLine.id
            ? {
                ...item,
                quantity: current.draftQuantity,
                unitCost: syncedDraft.unitCost || formatMoneyInput(resolvedUnitCost),
                lineTotal: syncedDraft.lineTotal,
                costMode: current.draftCostMode,
              }
            : item,
        ),
        draftProductId: '',
        draftQuantity: '',
        draftUnitCost: '',
        draftLineTotal: '',
        draftCostMode: 'unit',
      }))

      return
    }

    setRestockProductPicker((current) => ({
      ...current,
      items: [
        {
          id: crypto.randomUUID(),
          productId: current.draftProductId,
          quantity: current.draftQuantity,
          unitCost: syncedDraft.unitCost || formatMoneyInput(resolvedUnitCost),
          lineTotal: syncedDraft.lineTotal,
          costMode: current.draftCostMode,
        },
        ...current.items,
      ],
      draftProductId: '',
      draftQuantity: '',
      draftUnitCost: '',
      draftLineTotal: '',
      draftCostMode: 'unit',
    }))
  }

  const updateRestockLine = (
    lineId: string,
    field: 'quantity' | 'unitCost' | 'lineTotal',
    value: string,
  ) => {
    setRestockProductPicker((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === lineId
          ? (() => {
              const nextItem = {
                ...item,
                [field]: value,
                costMode: field === 'lineTotal' ? 'total' : field === 'unitCost' ? 'unit' : item.costMode,
              }
              const synced = syncRestockCostFields({
                quantity: nextItem.quantity,
                unitCost: nextItem.unitCost,
                lineTotal: nextItem.lineTotal,
                costMode: nextItem.costMode,
              })

              return {
                ...nextItem,
                unitCost: synced.unitCost,
                lineTotal: synced.lineTotal,
              }
            })()
          : item
      ),
    }))
  }

  const updateRestockLineProduct = (lineId: string, productId: string) => {
    const duplicateLine = restockProductPicker.items.find(
      (item) => item.id !== lineId && item.productId === productId,
    )

    if (productId && duplicateLine) {
      if (!confirmReplaceRestockProduct(productId)) {
        return
      }

      setRestockProductPicker((current) => ({
        ...current,
        items: current.items
          .filter((item) => item.id !== duplicateLine.id)
          .map((item) => (item.id === lineId ? { ...item, productId } : item)),
      }))

      return
    }

    setRestockProductPicker((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === lineId ? { ...item, productId } : item
      ),
    }))
  }

  const removeRestockLine = (lineId: string) => {
    setRestockProductPicker((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== lineId),
    }))
  }

  const handleRestockInvoiceChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setRestockInvoiceFile(file)
    event.target.value = ''
  }

  const openRestockInvoicePicker = () => {
    invoiceInputRef.current?.click()
  }

  const handleRestockProductCreated = (product: Product) => {
    const option = productToOption(product)
    setCachedProductOptions((current) => mergeCommandOptions([...current, option]))
    setRestockProductPicker((current) => ({
      ...current,
      draftProductId: product.id,
      draftQuantity: current.draftQuantity || '1',
      draftUnitCost:
        current.draftUnitCost || (product.costPrice !== null && product.costPrice !== undefined
          ? String(product.costPrice)
          : ''),
      draftLineTotal:
        current.draftLineTotal ||
        (current.draftQuantity &&
        product.costPrice !== null &&
        product.costPrice !== undefined &&
        Number(current.draftQuantity) > 0
          ? formatMoneyInput(Number(current.draftQuantity) * product.costPrice)
          : ''),
      draftCostMode: current.draftUnitCost ? current.draftCostMode : 'unit',
    }))
    setRefreshKey((current) => current + 1)
  }

  const closeRestockDialog = () => {
    setRestockOpen(false)
    setRestockProductsOpen(false)
    setRestockCreateProductOpen(false)
    setRestockSupplier(null)
    setRestockForm(createEmptyRestockForm())
    setRestockProductPicker(createEmptyRestockProductPicker())
    setRestockInvoiceFile(null)
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

  const handleQuickAdjust = async (productId: string, delta: 1 | -1) => {
    if (!businessId) return

    setSelectedProductId(productId)
    setBusyProductId(productId)

    try {
      await adjustInventoryLocal(businessId, productId, {
        type: delta > 0 ? StockAdjustmentType.ADD : StockAdjustmentType.REMOVE,
        quantity: 1,
        notes:
          delta > 0
            ? t('adjustment.quick_add_note')
            : t('adjustment.quick_remove_note'),
      })
      setRefreshKey((current) => current + 1)
    } catch (actionError) {
      toast.error(getInventoryErrorMessage(actionError, t('errors.adjust')))
    } finally {
      setBusyProductId(null)
    }
  }

  const handleAdjustmentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!businessId) return

    if (!adjustForm.productId) {
      toast.error(t('errors.product_required'))
      return
    }

    const quantityInput = parseRequiredNumberInput(adjustForm.quantity)
    if (quantityInput.kind !== 'value') {
      toast.error(t('errors.adjustment_quantity_invalid'))
      return
    }

    const notes = adjustForm.notes.trim()
    if (notes.length < 3) {
      toast.error(t('errors.adjustment_notes_required'))
      return
    }

    setSavingAdjustment(true)
    try {
      await adjustInventoryLocal(businessId, adjustForm.productId, {
        type: adjustForm.type,
        quantity: quantityInput.value,
        notes,
      })
      toast.success(t('adjustment.success'))
      setAdjustOpen(false)
      setSelectedProductId(adjustForm.productId)
      setRefreshKey((current) => current + 1)
    } catch (submitError) {
      toast.error(getInventoryErrorMessage(submitError, t('errors.adjust')))
    } finally {
      setSavingAdjustment(false)
    }
  }

  const handleRestockSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!businessId) return

    if (restockForm.items.length === 0) {
      toast.error(t('errors.restock_items_required'))
      return
    }

    setSavingRestock(true)
    try {
      const items = restockForm.items.map((item) => {
        if (!item.productId) {
          throw new InventoryLocalError('INVENTORY_RESTOCK_PRODUCT_INVALID')
        }

        const quantityInput = parseRequiredNumberInput(item.quantity)
        if (quantityInput.kind !== 'value' || quantityInput.value < 0.001) {
          throw new InventoryLocalError('INVENTORY_RESTOCK_QUANTITY_INVALID')
        }

        const unitCostInput = parseOptionalNumberInput(item.unitCost)
        if (
          unitCostInput.kind === 'invalid' ||
          (unitCostInput.kind === 'value' && unitCostInput.value < 0)
        ) {
          throw new InventoryLocalError('INVENTORY_RESTOCK_UNIT_COST_INVALID')
        }

        const lineTotalInput = parseOptionalNumberInput(item.lineTotal)
        if (
          lineTotalInput.kind === 'invalid' ||
          (lineTotalInput.kind === 'value' && lineTotalInput.value < 0)
        ) {
          throw new InventoryLocalError('INVENTORY_RESTOCK_TOTAL_AMOUNT_INVALID')
        }

        const resolvedUnitCost = resolveRestockLineUnitCostValue(
          item.quantity,
          item.unitCost,
          item.lineTotal,
        )
        if (resolvedUnitCost === null) {
          throw new InventoryLocalError('INVENTORY_RESTOCK_TOTAL_AMOUNT_REQUIRED')
        }

        return {
          productId: item.productId,
          quantity: quantityInput.value,
          unitCost: resolvedUnitCost,
        }
      })

      const totalAmountInput = parseOptionalNumberInput(restockForm.totalAmount)
      if (
        totalAmountInput.kind === 'invalid' ||
        (totalAmountInput.kind === 'value' && totalAmountInput.value < 0)
      ) {
        throw new InventoryLocalError('INVENTORY_RESTOCK_TOTAL_AMOUNT_INVALID')
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
        items,
      })

      toast.success(t('restock.success'))
      setSelectedProductId(restockForm.items[0]?.productId ?? null)
      closeRestockDialog()
      setRefreshKey((current) => current + 1)
    } catch (submitError) {
      toast.error(getInventoryErrorMessage(submitError, t('errors.restock')))
    } finally {
      setSavingRestock(false)
    }
  }

  const handleThresholdSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!businessId) return

    if (!thresholdForm.productId) {
      toast.error(t('errors.product_required'))
      return
    }

    const lowStockThresholdInput = parseOptionalNumberInput(thresholdForm.lowStockThreshold)
    if (lowStockThresholdInput.kind === 'invalid') {
      toast.error(t('errors.low_stock_threshold_invalid'))
      return
    }

    const reorderPointInput = parseOptionalNumberInput(thresholdForm.reorderPoint)
    if (reorderPointInput.kind === 'invalid') {
      toast.error(t('errors.reorder_point_invalid'))
      return
    }

    setSavingThresholds(true)
    try {
      await setInventoryThresholdLocal(businessId, thresholdForm.productId, {
        lowStockThreshold:
          lowStockThresholdInput.kind === 'value' ? lowStockThresholdInput.value : null,
        reorderPoint: reorderPointInput.kind === 'value' ? reorderPointInput.value : null,
      })

      toast.success(t('thresholds.success'))
      setThresholdOpen(false)
      setSelectedProductId(thresholdForm.productId)
      setRefreshKey((current) => current + 1)
    } catch (submitError) {
      toast.error(getInventoryErrorMessage(submitError, t('errors.thresholds')))
    } finally {
      setSavingThresholds(false)
    }
  }

  const tabOptions: Array<{ id: InventoryTab; label: string }> = [
    { id: 'all', label: t('tabs.all_products') },
    { id: 'low', label: t('tabs.low_stock') },
    { id: 'out', label: t('tabs.out_of_stock') },
    { id: 'reorder', label: t('tabs.reorder_soon') },
  ]

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
              {t('eyebrow')}
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-foreground">{t('title')}</h2>
            <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => openThresholdDialog()}>
              {t('thresholds.open')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => openAdjustDialog()}>
              {t('adjustment.open')}
            </Button>
            <Button variant="primary" size="sm" onClick={() => openRestockDialog()}>
              {t('restock.open')}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricPanel
            label={t('metrics.total_skus')}
            value={String(metrics.total)}
            hint={t('metrics.total_skus_hint')}
          />
          <MetricPanel
            label={t('metrics.in_stock')}
            value={String(metrics.inStock)}
            hint={t('metrics.in_stock_hint')}
            tone="healthy"
          />
          <MetricPanel
            label={t('metrics.low_stock')}
            value={String(metrics.low)}
            hint={t('metrics.low_stock_hint')}
            tone="warning"
          />
          <MetricPanel
            label={t('metrics.out_of_stock')}
            value={String(metrics.out)}
            hint={t('metrics.out_of_stock_hint')}
            tone="danger"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {tabOptions.map((option) => (
            <StatusTabButton
              key={option.id}
              active={statusTab === option.id}
              label={option.label}
              onClick={() => {
                setStatusTab(option.id)
                setPage(1)
              }}
            />
          ))}
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={search}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder={t('filters.search_placeholder')}
              className="block h-11 w-full rounded-2xl border border-input bg-background pl-10 pr-3 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="w-full lg:w-60">
            <CommandSelect
              value={categoryFilterValue}
              staticOptions={categoryOptions}
              selectedOption={
                categoryOptions.find((option) => option.value === categoryFilterValue) ?? null
              }
              placeholder={t('filters.all_categories')}
              searchPlaceholder={t('filters.search_categories')}
              emptyMessage={t('filters.no_categories_found')}
              showAvatar={false}
              onChange={(value) => {
                setCategoryId(value === ALL_CATEGORIES_VALUE ? '' : value)
                setPage(1)
              }}
            />
          </div>
        </div>

        <section className="overflow-hidden rounded-[1.5rem] border border-border bg-card shadow-sm">
          {error ? (
            <div className="border-b border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="flex min-h-[420px] items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
              <h3 className="text-lg font-semibold text-foreground">{t('stock.empty_title')}</h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                {inventoryItems.length === 0
                  ? t('stock.empty_description')
                  : t('stock.empty_filtered')}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-[980px] w-full border-collapse">
                  <thead className="bg-secondary/60">
                    <tr className="border-b border-border">
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {t('table.product')}
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {t('table.category')}
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {t('table.in_stock')}
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {t('table.threshold_reorder')}
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {t('table.stock_level')}
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {t('table.status')}
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {t('table.last_restock')}
                      </th>
                      <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {t('table.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedItems.map((item) => {
                      const status = getInventoryStatus(item)
                      const isSelected = item.productId === selectedProductId
                      const progressPercent = getProgressPercent(item)

                      return (
                        <tr
                          key={item.productId}
                          className={cn(
                            'cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-secondary/50',
                            isSelected && 'bg-primary/5',
                          )}
                          onClick={() => setSelectedProductId(item.productId)}
                        >
                          <td className="px-5 py-4">
                            <Link href={`/${locale}/products/detail?productId=${item.productId}`}>
                              <div className="flex items-center gap-3">
                                <ProductAvatar
                                  item={item}
                                  categoryColor={categoryColorMap.get(item.categoryName || '')}
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-foreground">
                                    {item.productName || '-'}
                                  </p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {item.sku || item.barcode || t('table.no_identifier')}
                                  </p>
                                </div>
                              </div>
                            </Link>
                          </td>
                          <td className="px-4 py-4 text-sm text-muted-foreground">
                            {item.categoryName || t('stock.uncategorized')}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                aria-label={t('actions.quick_remove')}
                                disabled={busyProductId === item.productId || item.quantity <= 0}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void handleQuickAdjust(item.productId, -1)
                                }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-secondary text-sm font-semibold text-foreground transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                -
                              </button>
                              <span className="min-w-[3rem] text-center text-sm font-semibold text-foreground">
                                {formatQuantity(item.quantity)}
                              </span>
                              <button
                                type="button"
                                aria-label={t('actions.quick_add')}
                                disabled={busyProductId === item.productId}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void handleQuickAdjust(item.productId, 1)
                                }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-secondary text-sm font-semibold text-foreground transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-muted-foreground">
                            {formatQuantity(item.lowStockThreshold)} / {formatQuantity(item.reorderPoint)}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-24 overflow-hidden rounded-full bg-secondary">
                                <div
                                  className={cn('h-full rounded-full', getProgressClassName(status))}
                                  style={{ width: `${progressPercent}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground">{progressPercent}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <Badge variant={getInventoryStatusBadgeVariant(status)}>
                              {getInventoryStatusLabel(status, t)}
                            </Badge>
                          </td>
                          <td className="px-4 py-4 text-sm text-muted-foreground">
                            {item.lastRestockAt ? formatDateLabel(item.lastRestockAt, locale) : '-'}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div
                              className="flex justify-end"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <ResourceActionMenu
                                label={t('table.actions')}
                                items={[
                                  {
                                    label: t('adjustment.open'),
                                    onSelect: () => openAdjustDialog(item.productId),
                                  },
                                  {
                                    label: t('thresholds.open'),
                                    onSelect: () => openThresholdDialog(item.productId),
                                  },
                                ]}
                              />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-border px-5 py-4">
                <PaginationControls
                  page={page}
                  totalPages={totalPages}
                  pageLabel={t('pagination.page_label', { page, totalPages })}
                  previousLabel={t('pagination.previous')}
                  nextLabel={t('pagination.next')}
                  onPrevious={() => setPage((current) => Math.max(current - 1, 1))}
                  onNext={() => setPage((current) => Math.min(current + 1, totalPages))}
                />
              </div>
            </>
          )}
        </section>

        <section className="overflow-hidden rounded-[1.5rem] border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">{t('movement_log.title')}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t('movement_log.description')}</p>
            </div>
          </div>

          {movements.length === 0 ? (
            <div className="px-5 py-8 text-sm text-muted-foreground">
              {t('movement_log.empty')}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {movements.map((movement) => {
                const tone = movementTone(movement)
                const item = inventoryMap.get(movement.productId) ?? null

                return (
                  <div
                    key={movement.id}
                    className="grid gap-3 px-5 py-4 md:grid-cols-[32px_minmax(0,1fr)_auto] md:items-center"
                  >
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold',
                        tone.iconClassName,
                      )}
                    >
                      {tone.icon}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {item?.productName || t('movement_log.unknown_product')}
                        </p>
                        <Badge variant={tone.badge}>
                          {movementTypeLabel(movement.type, t)}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {(movement.notes || t('movement_log.no_notes'))}
                        {' · '}
                        {formatDateLabel(movement.createdAt, locale)}
                      </p>
                    </div>

                    <div className={cn('text-sm font-semibold', tone.quantityClassName)}>
                      {movement.quantityChange > 0 ? '+' : ''}
                      {formatQuantity(movement.quantityChange)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <Dialog open={thresholdOpen} onOpenChange={setThresholdOpen}>
        <DialogContent className="max-w-xl" closeLabel={t('dialog.close')}>
          <DialogHeader>
            <DialogTitle>{t('thresholds.title')}</DialogTitle>
            <DialogDescription>{t('thresholds.description')}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleThresholdSubmit} className="flex min-h-0 flex-col">
            <div className="grid gap-4 overflow-y-auto px-6 py-5">
              <label className="space-y-1">
                <span className="text-sm font-medium text-foreground">{t('form.product')}</span>
                <CommandSelect
                  value={thresholdForm.productId}
                  staticOptions={getSelectedInventoryStaticOptions(thresholdForm.productId)}
                  selectedOption={productSelectOptionMap.get(thresholdForm.productId) ?? null}
                  placeholder={t('form.select_product')}
                  searchPlaceholder={t('form.search_product')}
                  emptyMessage={t('form.no_products_found')}
                  loadingMessage={t('form.loading_products')}
                  loadMoreLabel={t('form.load_more_products')}
                  showAvatar={false}
                  loadOptions={loadTrackedProductOptions}
                  onChange={(value) => updateThresholdProduct(value)}
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <NumberInput
                  label={t('thresholds.low_stock_threshold')}
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
                  label={t('thresholds.reorder_point')}
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
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setThresholdOpen(false)}>
                {t('dialog.close_action')}
              </Button>
              <Button type="submit" variant="primary" disabled={savingThresholds}>
                {savingThresholds ? t('thresholds.submitting') : t('thresholds.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={restockOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeRestockDialog()
            return
          }

          setRestockOpen(true)
        }}
      >
        <DialogContent
          className="max-h-[calc(100vh-1.5rem)] max-w-2xl overflow-hidden p-0"
          closeLabel={t('dialog.close')}
        >
          <DialogHeader>
            <DialogTitle>{t('restock.title')}</DialogTitle>
            <DialogDescription>{t('restock.description')}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRestockSubmit} className="grid min-h-0 flex-1 grid-rows-[1fr_auto] overflow-hidden">
            <input
              ref={invoiceInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
              onChange={handleRestockInvoiceChange}
            />

            <div className="min-h-0 space-y-5 overflow-y-auto px-6 py-5">
              <section className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t('restock.sections.purchase_details')}
                </p>

                <div className="space-y-4 rounded-2xl border border-border bg-background/60 p-4">
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
                </div>
              </section>

              <section className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t('restock.sections.products_received')}
                </p>

                <button
                  type="button"
                  onClick={openRestockProductsDialog}
                  className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border bg-background/60 px-4 py-4 text-left transition hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-base text-foreground">
                    +
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{t('restock.add_products')}</p>
                    <p className="text-xs text-muted-foreground">
                      {restockForm.items.length > 0
                        ? t('restock.products_added_count', { count: restockForm.items.length })
                        : t('restock.no_products_selected')}
                    </p>
                  </div>
                </button>

                {restockForm.items.length > 0 ? (
                  <div className="rounded-2xl border border-border bg-secondary/30 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">
                          {t('restock.products_added_count', { count: restockForm.items.length })}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {restockProductsPreview.join(', ')}
                          {restockForm.items.length > restockProductsPreview.length
                            ? ` +${restockForm.items.length - restockProductsPreview.length}`
                            : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {t('restock.computed_total')}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          {restockTotalCost === null ? '-' : formatXafCurrency(restockTotalCost, locale)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t('restock.sections.invoice')}
                </p>

                <div className="grid gap-3 rounded-2xl border border-border bg-background/60 p-4 sm:grid-cols-3">
                  <Input
                    label={t('restock.reference')}
                    value={restockForm.referenceNumber}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setRestockForm((current) => ({
                        ...current,
                        referenceNumber: event.target.value,
                      }))
                    }
                    className="h-10 rounded-xl"
                  />

                  <NumberInput
                    label={t('restock.total_amount')}
                    min="0"
                    step="0.01"
                    value={restockForm.totalAmount}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setRestockForm((current) => ({
                        ...current,
                        totalAmount: event.target.value,
                      }))
                    }
                    placeholder={t('restock.total_amount_optional')}
                  />

                  <Input
                    label={t('restock.computed_total')}
                    value={
                      restockTotalCost === null
                        ? '-'
                        : formatXafCurrency(restockTotalCost, locale)
                    }
                    readOnly
                    disabled
                    className="h-10 rounded-xl"
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  {t('restock.total_amount_hint')}
                </p>
              </section>

              <section className="space-y-3">
                <RestockPaymentEditor
                  payments={restockForm.payments}
                  onChange={(payments) =>
                    setRestockForm((current) => ({
                      ...current,
                      payments,
                    }))
                  }
                />

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border bg-background/60 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t('restock.total_amount')}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-foreground">
                      {restockEffectiveTotal === null
                        ? '-'
                        : formatXafCurrency(restockEffectiveTotal, locale)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border bg-background/60 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t('restock.amount_paid')}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-foreground">
                      {formatXafCurrency(restockAmountPaid, locale)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border bg-background/60 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t('restock.balance_on_credit')}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-foreground">
                      {restockCreditAmount === null
                        ? '-'
                        : formatXafCurrency(restockCreditAmount, locale)}
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t('restock.sections.invoice')}
                </p>

                {restockInvoiceFile ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-sm text-emerald-700">
                      +
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-emerald-950">
                        {restockInvoiceFile.name}
                      </p>
                      <p className="text-xs text-emerald-700">
                        {formatFileSize(restockInvoiceFile.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRestockInvoiceFile(null)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-sm text-emerald-900 transition hover:bg-emerald-200"
                    >
                      x
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={openRestockInvoicePicker}
                    className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border bg-background/60 px-4 py-4 text-left transition hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-base text-foreground">
                      +
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {t('restock.attach_invoice')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('restock.attach_invoice_hint')}
                      </p>
                    </div>
                  </button>
                )}
              </section>

              <section className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t('restock.notes')}
                </p>
                <textarea
                  value={restockForm.notes}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                    setRestockForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder={t('restock.notes_placeholder')}
                    className="min-h-[92px] w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </section>
            </div>

            <DialogFooter className="justify-between bg-card">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t('restock.total_amount')}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                    {restockEffectiveTotal === null
                      ? '-'
                      : formatXafCurrency(restockEffectiveTotal, locale)}
                  </p>
                </div>
                {restockInvoiceFile ? (
                  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                    {t('restock.invoice_attached')}
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={closeRestockDialog}>
                  {t('dialog.close_action')}
                </Button>
                <Button type="submit" variant="primary" disabled={savingRestock}>
                  {savingRestock ? t('restock.submitting') : t('restock.submit')}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={restockProductsOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeRestockProductsDialog()
          }
        }}
      >
        <DialogContent
          className="min-h-0 h-[92vh] max-h-[900px] max-w-4xl overflow-hidden p-0"
          closeLabel={t('dialog.close')}
        >
          <DialogHeader>
            <DialogTitle>{t('restock.select_products_title')}</DialogTitle>
            <DialogDescription>{t('restock.select_products_description')}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t('restock.products_added_count', { count: restockProductPicker.items.length })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {restockProductPicker.items.length > 0
                  ? `${restockPickerPreview.join(', ')}${
                      restockProductPicker.items.length > restockPickerPreview.length
                        ? ` +${restockProductPicker.items.length - restockPickerPreview.length}`
                        : ''
                    }`
                  : t('restock.no_products_selected')}
              </p>
            </div>

            <Button type="button" variant="secondary" onClick={() => setRestockCreateProductOpen(true)}>
              {tProducts('actions.add_product')}
            </Button>
          </div>

          <div className="border-b border-border px-6 py-5">
            <div className="grid gap-3 min-[500px]:grid-cols-[minmax(0,1.8fr)_minmax(84px,0.75fr)_minmax(104px,0.9fr)_auto_auto] min-[500px]:items-end">
              <label className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('form.product')}
                </span>
                <CommandSelect
                  value={restockProductPicker.draftProductId}
                  staticOptions={getSelectedInventoryStaticOptions(restockProductPicker.draftProductId)}
                  selectedOption={productSelectOptionMap.get(restockProductPicker.draftProductId) ?? null}
                  placeholder={t('form.select_product')}
                  searchPlaceholder={t('form.search_product')}
                  emptyMessage={t('form.no_products_found')}
                  loadingMessage={t('form.loading_products')}
                  loadMoreLabel={t('form.load_more_products')}
                  showAvatar={false}
                  loadOptions={loadTrackedProductOptions}
                  onChange={(value) => handleRestockDraftProductChange(value)}
                />
              </label>

              <NumberInput
                label={t('restock.quantity')}
                min="0.001"
                step="0.001"
                value={restockProductPicker.draftQuantity}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setRestockProductPicker((current) => {
                    const nextState = {
                      ...current,
                      draftQuantity: event.target.value,
                    }
                    const synced = syncRestockCostFields({
                      quantity: nextState.draftQuantity,
                      unitCost: nextState.draftUnitCost,
                      lineTotal: nextState.draftLineTotal,
                      costMode: nextState.draftCostMode,
                    })
                    return {
                      ...nextState,
                      draftUnitCost: synced.unitCost,
                      draftLineTotal: synced.lineTotal,
                    }
                  })
                }
                placeholder="0"
                className="h-10 rounded-xl"
              />

              <NumberInput
                label={t('restock.unit_cost')}
                min="0"
                step="0.01"
                value={restockProductPicker.draftUnitCost}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setRestockProductPicker((current) => {
                    const nextState = {
                      ...current,
                      draftUnitCost: event.target.value,
                      draftCostMode: 'unit' as const,
                    }
                    const synced = syncRestockCostFields({
                      quantity: nextState.draftQuantity,
                      unitCost: nextState.draftUnitCost,
                      lineTotal: nextState.draftLineTotal,
                      costMode: nextState.draftCostMode,
                    })
                    return {
                      ...nextState,
                      draftLineTotal: synced.lineTotal,
                    }
                  })
                }
                placeholder={t('restock.unit_cost_optional')}
                className="h-10 rounded-xl"
              />

              <NumberInput
                label={t('restock.line_total')}
                min="0"
                step="0.01"
                value={restockProductPicker.draftLineTotal}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setRestockProductPicker((current) => {
                    const nextState = {
                      ...current,
                      draftLineTotal: event.target.value,
                      draftCostMode: 'total' as const,
                    }
                    const synced = syncRestockCostFields({
                      quantity: nextState.draftQuantity,
                      unitCost: nextState.draftUnitCost,
                      lineTotal: nextState.draftLineTotal,
                      costMode: nextState.draftCostMode,
                    })
                    return {
                      ...nextState,
                      draftUnitCost: synced.unitCost,
                    }
                  })
                }
                placeholder={t('restock.total_amount_optional')}
                className="h-10 rounded-xl"
              />

              <Button type="button" variant="primary" onClick={addRestockLine}>
                {t('restock.add_to_list')}
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden px-6 py-5">
            {restockProductPicker.items.length === 0 ? (
              <div className="flex h-full min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-border bg-background/60 px-6 text-center text-sm text-muted-foreground">
                {t('restock.empty_items')}
              </div>
            ) : (
              <div className="min-h-0 h-full space-y-3 overflow-y-auto pr-1">
                {restockProductPicker.items.map((item) => {
                  return (
                    <div key={item.id} className="rounded-2xl border border-border bg-secondary/30 p-3">
                      <div className="grid gap-3 min-[500px]:grid-cols-[minmax(0,1.5fr)_minmax(84px,0.7fr)_minmax(104px,0.85fr)_minmax(110px,0.85fr)_auto] min-[500px]:items-end">
                        <label className="space-y-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            {t('form.product')}
                          </span>
                          <CommandSelect
                            value={item.productId}
                            staticOptions={getSelectedInventoryStaticOptions(item.productId)}
                            selectedOption={productSelectOptionMap.get(item.productId) ?? null}
                            placeholder={t('form.select_product')}
                            searchPlaceholder={t('form.search_product')}
                            emptyMessage={t('form.no_products_found')}
                            loadingMessage={t('form.loading_products')}
                            loadMoreLabel={t('form.load_more_products')}
                            showAvatar={false}
                            loadOptions={loadTrackedProductOptions}
                            onChange={(value) => updateRestockLineProduct(item.id, value)}
                          />
                        </label>

                        <NumberInput
                          label={t('restock.quantity')}
                          min="0.001"
                          step="0.001"
                          value={item.quantity}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateRestockLine(item.id, 'quantity', event.target.value)
                          }
                          className="h-10 rounded-xl"
                        />

                        <NumberInput
                          label={t('restock.unit_cost')}
                          min="0"
                          step="0.01"
                          value={item.unitCost}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateRestockLine(item.id, 'unitCost', event.target.value)
                          }
                          placeholder={t('restock.unit_cost_optional')}
                          className="h-10 rounded-xl"
                        />

                        <NumberInput
                          label={t('restock.line_total')}
                          min="0"
                          step="0.01"
                          value={item.lineTotal}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateRestockLine(item.id, 'lineTotal', event.target.value)
                          }
                          placeholder={t('restock.total_amount_optional')}
                          className="h-10 rounded-xl"
                        />

                        <button
                          type="button"
                          aria-label={t('restock.remove_line')}
                          onClick={() => removeRestockLine(item.id)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-lg text-muted-foreground transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                        >
                          x
                        </button>
                      </div>

                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <DialogFooter className="justify-between bg-card">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t('restock.computed_total')}
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                  {restockPickerTotalCost === null
                    ? '-'
                    : formatXafCurrency(restockPickerTotalCost, locale)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={closeRestockProductsDialog}>
                {t('dialog.close_action')}
              </Button>
              <Button type="button" variant="primary" onClick={confirmRestockProductsDialog}>
                {t('restock.confirm_products')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductCreateDialog
        businessId={businessId}
        categories={categories}
        units={units}
        open={restockCreateProductOpen}
        onOpenChange={setRestockCreateProductOpen}
        onCreated={handleRestockProductCreated}
        quotaReached={productsQuotaReached}
      />

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-xl" closeLabel={t('dialog.close')}>
          <DialogHeader>
            <DialogTitle>{t('adjustment.title')}</DialogTitle>
            <DialogDescription>{t('adjustment.description')}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAdjustmentSubmit} className="flex min-h-0 flex-col">
            <div className="grid gap-4 overflow-y-auto px-6 py-5">
              <label className="space-y-1">
                <span className="text-sm font-medium text-foreground">{t('form.product')}</span>
                <CommandSelect
                  value={adjustForm.productId}
                  staticOptions={getSelectedInventoryStaticOptions(adjustForm.productId)}
                  selectedOption={productSelectOptionMap.get(adjustForm.productId) ?? null}
                  placeholder={t('form.select_product')}
                  searchPlaceholder={t('form.search_product')}
                  emptyMessage={t('form.no_products_found')}
                  loadingMessage={t('form.loading_products')}
                  loadMoreLabel={t('form.load_more_products')}
                  showAvatar={false}
                  loadOptions={loadTrackedProductOptions}
                  onChange={(value) =>
                    setAdjustForm((current) => ({
                      ...current,
                      productId: value,
                    }))
                  }
                />
              </label>

              <Input
                label={t('form.current_quantity')}
                value={formatInventoryQuantity(inventoryMap.get(adjustForm.productId) ?? null)}
                readOnly
                disabled
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm font-medium text-foreground">{t('adjustment.type')}</span>
                  <select
                    className={selectClassName}
                    value={adjustForm.type}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setAdjustForm((current) => ({
                        ...current,
                        type: event.target.value as StockAdjustmentType,
                      }))
                    }
                  >
                    <option value={StockAdjustmentType.ADD}>{t('adjustment.types.add')}</option>
                    <option value={StockAdjustmentType.REMOVE}>{t('adjustment.types.remove')}</option>
                    <option value={StockAdjustmentType.SET}>{t('adjustment.types.set')}</option>
                  </select>
                </label>

                <NumberInput
                  label={t('adjustment.quantity')}
                  min="0"
                  step="0.001"
                  value={adjustForm.quantity}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setAdjustForm((current) => ({ ...current, quantity: event.target.value }))
                  }
                />
              </div>

              <Input
                label={t('adjustment.notes')}
                value={adjustForm.notes}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setAdjustForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAdjustOpen(false)}>
                {t('dialog.close_action')}
              </Button>
              <Button type="submit" variant="primary" disabled={savingAdjustment}>
                {savingAdjustment ? t('adjustment.submitting') : t('adjustment.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
