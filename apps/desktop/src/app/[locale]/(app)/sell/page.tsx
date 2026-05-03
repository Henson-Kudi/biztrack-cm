'use client'

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Badge, Button, NumberInput, Spinner } from '@biztrack/ui'
import {
  PaymentMethod,
  type JwtPayload,
  type Product,
  type ProductCategory,
  type UnitOfMeasure,
} from '@biztrack/types'
import { toast } from 'sonner'
import { ProductCreateDialog } from '@/components/products/ProductCreateDialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDateLabel, formatQuantity } from '@/components/products/product-utils'
import { decodeJwtPayload } from '@/lib/jwt'
import { cn } from '@/lib/utils'
import { hasDesktopIpc, ipc } from '@/services/ipc.bridge'
import {
  getProductByBarcodeLocal,
  listCategoriesLocal,
  listProductsLocal,
  listUnitOfMeasuresLocal,
} from '@/services/products.local'
import { createSaleLocal, SaleLocalError, type LocalSaleRecord } from '@/services/sales.local'
import { useAuthStore } from '@/stores/auth.store'

type ViewMode = 'grid' | 'list'
type Stage = 'cart' | 'payment' | 'success'
type DiscountType = 'percent' | 'amount'
type PaymentOption = 'cash' | 'mtn' | 'orange' | 'card'

type SellCartItem = {
  productId: string
  name: string
  sku: string | null
  price: number
  qty: number
  categoryName: string | null
  emoji: string
  unitLabel: string | null
  trackInventory: boolean
  stock: number | null
  lowStockThreshold: number | null
  imageUrl: string | null
}

type HeldSale = {
  id: string
  saleId: string
  items: SellCartItem[]
  discount: {
    type: DiscountType
    value: number
  }
  chargesAmount: number
  createdAt: string
}

type CompletedSaleSummary = {
  sale: LocalSaleRecord
  paymentOption: PaymentOption
  momoNumber: string
  momoReference: string
  receiptText: string
}

const THERMAL_RECEIPT_PAPER_WIDTH_MM = 58
const THERMAL_RECEIPT_PRINTABLE_WIDTH_MM = 48
const THERMAL_RECEIPT_TEXT_COLUMNS = 27

type SellCopy = {
  localeTag: string
  pos: string
  searchPlaceholder: string
  scan: string
  scanHint: string
  barcodeNotFoundTitle: string
  barcodeNotFoundDescription: string
  scannedBarcode: string
  addScannedProduct: string
  productAddedFromScan: string
  productsCount: string
  allCategories: string
  uncategorized: string
  catalogueTitle: string
  catalogueSubtitle: string
  currentSale: string
  saleNo: string
  saleNumberPending: string
  walkIn: string
  noCustomer: string
  changeCustomer: string
  customerComingSoon: string
  emptyCartTitle: string
  emptyCartHint: string
  item: string
  items: string
  subtotal: string
  discount: string
  charges: string
  addDiscount: string
  addCharges: string
  removeDiscount: string
  removeCharges: string
  hideSummary: string
  showSummary: string
  total: string
  clear: string
  hold: string
  charge: string
  selectPayment: string
  cash: string
  mtnMomo: string
  orangeMoney: string
  card: string
  amountReceived: string
  changeDue: string
  momoNumber: string
  referenceId: string
  quickAmounts: string
  confirmPayment: string
  processing: string
  cardHint: string
  paymentReceived: string
  paymentSavedHint: string
  paidWith: string
  print: string
  shareReceipt: string
  printingReceipt: string
  sharingReceipt: string
  newSale: string
  heldSales: string
  seeHeldSales: string
  noHolds: string
  resume: string
  lowStock: string
  outOfStock: string
  inStock: string
  notTracked: string
  noProductsFound: string
  cancel: string
  discountTitle: string
  discountBy: string
  chargesTitle: string
  chargesHint: string
  percent: string
  amount: string
  customValue: string
  apply: string
  thermalReceipt: string
  thermalReceiptTitle: string
  cashier: string
  localUser: string
  businessFallback: string
  receiptDateLabel: string
  receiptCustomerLabel: string
  receiptItemsLabel: string
  receiptTotalLabel: string
  receiptPhoneLabel: string
  receiptReferenceLabel: string
  receiptThanks: string
  receiptPrinted: string
  receiptPrintUnavailable: string
  receiptPrintFailed: string
  receiptShared: string
  receiptShareUnavailable: string
  receiptShareFailed: string
  receiptShareSaved: string
  saleSaved: string
  paymentBack: string
  businessRequired: string
  loadError: string
  errors: Record<string, string>
}

function draftSaleId() {
  return `V${Date.now().toString().slice(-5)}`
}

function holdId() {
  return `H${Date.now().toString().slice(-5)}`
}

function formatAmount(value: number, localeTag: string) {
  return new Intl.NumberFormat(localeTag, {
    maximumFractionDigits: 0,
  }).format(Math.round(value))
}

function formatEditableQuantity(value: number) {
  if (Number.isInteger(value)) {
    return String(value)
  }

  return value.toFixed(3).replace(/\.?0+$/, '')
}

function translatePayment(copy: SellCopy, option: PaymentOption) {
  if (option === 'cash') return copy.cash
  if (option === 'mtn') return copy.mtnMomo
  if (option === 'orange') return copy.orangeMoney
  return copy.card
}

function toPaymentMethod(option: PaymentOption) {
  if (option === 'cash') return PaymentMethod.CASH
  if (option === 'mtn') return PaymentMethod.MTN_MOMO
  if (option === 'orange') return PaymentMethod.ORANGE_MONEY
  return PaymentMethod.CARD
}

function parseOptionalNumber(value: string) {
  const parsed = Number(value.replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function pickEmoji(product: Product) {
  const haystack = `${product.name} ${product.category?.name ?? ''}`.toLowerCase()

  if (haystack.includes('drink') || haystack.includes('boisson') || haystack.includes('juice')) {
    return '🥤'
  }
  if (haystack.includes('water') || haystack.includes('eau')) return '💧'
  if (haystack.includes('beer') || haystack.includes('biere')) return '🍺'
  if (haystack.includes('rice') || haystack.includes('riz')) return '🍚'
  if (haystack.includes('oil') || haystack.includes('huile')) return '🫒'
  if (haystack.includes('soap') || haystack.includes('savon')) return '🧼'
  if (haystack.includes('toilet') || haystack.includes('papier')) return '🧻'
  if (haystack.includes('tooth') || haystack.includes('dentifrice')) return '🪥'
  if (haystack.includes('lotion')) return '🧴'
  if (haystack.includes('battery') || haystack.includes('pile')) return '🔋'
  if (haystack.includes('service')) return '🛠️'
  if (haystack.includes('phone') || haystack.includes('credit') || haystack.includes('airtime')) {
    return '📱'
  }

  return '📦'
}

function isTrackedOut(product: Product) {
  return Boolean(
    product.trackInventory &&
    product.currentStock !== null &&
    product.currentStock !== undefined &&
    product.currentStock <= 0,
  )
}

function isTrackedLow(product: Product) {
  return Boolean(
    product.trackInventory &&
    product.currentStock !== null &&
    product.currentStock !== undefined &&
    product.lowStockThreshold !== null &&
    product.lowStockThreshold !== undefined &&
    product.currentStock <= product.lowStockThreshold &&
    product.currentStock > 0,
  )
}

function centerLine(text: string, cols: number) {
  const trimmed = text.slice(0, cols)
  const padding = Math.max(cols - trimmed.length, 0)
  return `${' '.repeat(Math.floor(padding / 2))}${trimmed}`
}

function padLine(left: string, right: string, cols: number) {
  const gap = cols - left.length - right.length
  if (gap <= 1) {
    const truncated = left.slice(0, Math.max(cols - right.length - 2, 0))
    return `${truncated} ${right}`
  }
  return `${left}${' '.repeat(gap)}${right}`
}

function sanitizeReceiptFileName(value: string) {
  const cleaned = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

  return `${cleaned || 'receipt'}.pdf`
}

function toPdfLiteralString(value: string) {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?')

  return `(${normalized.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`
}

function buildReceiptPdfBlob(
  receiptText: string,
  paperWidthMm = THERMAL_RECEIPT_PAPER_WIDTH_MM,
) {
  const lines = receiptText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const isCompactRoll = paperWidthMm <= THERMAL_RECEIPT_PAPER_WIDTH_MM
  const pageWidth = (paperWidthMm / 25.4) * 72
  const printableWidthMm = isCompactRoll
    ? THERMAL_RECEIPT_PRINTABLE_WIDTH_MM
    : Math.max(paperWidthMm - 12, THERMAL_RECEIPT_PRINTABLE_WIDTH_MM)
  const printableWidth = (printableWidthMm / 25.4) * 72
  const baseHorizontalInset = Math.max((pageWidth - printableWidth) / 2, 0)
  const paddingX = isCompactRoll ? Math.max(baseHorizontalInset + 4, 18) : 14
  const topPaddingY = isCompactRoll ? 24 : 18
  const bottomPaddingY = isCompactRoll ? 34 : 22
  const fontSize = isCompactRoll ? 7.15 : 8.5
  const lineHeight = isCompactRoll ? 9.25 : 11.5
  const pageHeight = Math.max(
    isCompactRoll ? 260 : 320,
    topPaddingY + bottomPaddingY + lines.length * lineHeight,
  )
  const topY = pageHeight - topPaddingY - fontSize
  const streamLines = [
    'BT',
    `/F1 ${fontSize} Tf`,
    ...lines.map((line, index) => {
      const y = topY - index * lineHeight
      return `1 0 0 1 ${paddingX} ${y.toFixed(2)} Tm ${toPdfLiteralString(line)} Tj`
    }),
    'ET',
  ]
  const content = streamLines.join('\n')
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight.toFixed(
      2,
    )}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>\nendobj\n',
    `5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
  ]
  const offsets: number[] = []
  let pdf = '%PDF-1.4\n'

  for (const object of objects) {
    offsets.push(pdf.length)
    pdf += object
  }

  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'

  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return new Blob([pdf], { type: 'application/pdf' })
}

function downloadReceiptFile(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function isShareCancelled(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function isPrintCancelled(error: unknown) {
  return (
    error instanceof Error &&
    /cancelled|canceled|cancel/i.test(error.message)
  )
}

function buildReceiptText({
  businessName,
  copy,
  sale,
  paymentOption,
  momoNumber,
  paperWidthMm = THERMAL_RECEIPT_PAPER_WIDTH_MM,
}: {
  businessName: string
  copy: SellCopy
  sale: LocalSaleRecord
  paymentOption: PaymentOption
  momoNumber: string
  paperWidthMm?: number
}) {
  const cols =
    paperWidthMm <= THERMAL_RECEIPT_PRINTABLE_WIDTH_MM
      ? THERMAL_RECEIPT_TEXT_COLUMNS
      : paperWidthMm <= THERMAL_RECEIPT_PAPER_WIDTH_MM
        ? 32
        : 42
  const divider = '-'.repeat(cols)
  const heavyDivider = '='.repeat(cols)
  const amount = (value: number) => formatAmount(value, copy.localeTag)
  const dateLabel = new Intl.DateTimeFormat(copy.localeTag, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(sale.soldAt))

  const lines = [
    centerLine(businessName.toUpperCase(), cols),
    centerLine(copy.pos.toUpperCase(), cols),
    divider,
    centerLine(copy.thermalReceiptTitle, cols),
    divider,
    `${copy.receiptDateLabel}: ${dateLabel}`,
    `${copy.saleNo}: ${sale.receiptNumber}`,
    `${copy.cashier}: ${sale.cashierName ?? copy.localUser}`,
  ]

  if (sale.customerName) {
    lines.push(`${copy.receiptCustomerLabel}: ${sale.customerName}`)
  }

  lines.push(divider)
  lines.push(padLine(copy.receiptItemsLabel, copy.receiptTotalLabel, cols))
  lines.push(divider)

  for (const item of sale.items) {
    const itemTotal = amount(item.totalPrice)
    lines.push(padLine(item.productName, itemTotal, cols))
    lines.push(`  ${formatQuantity(item.quantity)} x ${amount(item.unitPrice)} XAF`)
  }

  lines.push(divider)

  if (sale.discountAmount > 0 || sale.chargesAmount > 0) {
    lines.push(padLine(copy.subtotal, `${amount(sale.subtotalAmount)} XAF`, cols))
    if (sale.discountAmount > 0) {
      lines.push(padLine(copy.discount, `-${amount(sale.discountAmount)} XAF`, cols))
    }
    if (sale.chargesAmount > 0) {
      lines.push(padLine(copy.charges, `+${amount(sale.chargesAmount)} XAF`, cols))
    }
  }

  lines.push(heavyDivider)
  lines.push(padLine(copy.total, `${amount(sale.totalAmount)} XAF`, cols))
  lines.push(heavyDivider)
  lines.push(padLine(translatePayment(copy, paymentOption), `${amount(sale.amountPaid)} XAF`, cols))

  if (sale.changeGiven > 0) {
    lines.push(padLine(copy.changeDue, `${amount(sale.changeGiven)} XAF`, cols))
  }

  if (paymentOption === 'mtn' || paymentOption === 'orange') {
    lines.push(`${copy.receiptPhoneLabel}: ${momoNumber || sale.customerPhone || '-'}`)
    if (sale.momoReference) {
      lines.push(`${copy.receiptReferenceLabel}: ${sale.momoReference}`)
    }
  }

  lines.push(divider)
  lines.push(centerLine(copy.receiptThanks, cols))
  lines.push('')

  return lines.join('\n')
}

function Icon({
  name,
  className,
}: {
  name:
    | 'search'
    | 'grid'
    | 'list'
    | 'scan'
    | 'refresh'
    | 'user'
    | 'user-plus'
    | 'close'
    | 'minus'
    | 'plus'
    | 'trash'
    | 'pause'
    | 'arrow-left'
    | 'cash'
    | 'phone'
    | 'card'
    | 'check'
    | 'share'
    | 'print'
    | 'discount'
    | 'panel-open'
    | 'package'
  className?: string
}) {
  const common = {
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  }

  if (name === 'search') {
    return (
      <svg {...common}>
        <circle cx="9" cy="9" r="5.5" />
        <path d="m14 14 3 3" />
      </svg>
    )
  }

  if (name === 'grid') {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="5" height="5" rx="1" />
        <rect x="12" y="3" width="5" height="5" rx="1" />
        <rect x="3" y="12" width="5" height="5" rx="1" />
        <rect x="12" y="12" width="5" height="5" rx="1" />
      </svg>
    )
  }

  if (name === 'list') {
    return (
      <svg {...common}>
        <path d="M7 5h10" />
        <path d="M7 10h10" />
        <path d="M7 15h10" />
        <circle cx="4" cy="5" r="1" />
        <circle cx="4" cy="10" r="1" />
        <circle cx="4" cy="15" r="1" />
      </svg>
    )
  }

  if (name === 'scan') {
    return (
      <svg {...common}>
        <path d="M4 5V3h3" />
        <path d="M13 3h3v2" />
        <path d="M17 13v4h-3" />
        <path d="M7 17H4v-4" />
        <path d="M6 8h1" />
        <path d="M9 8h1" />
        <path d="M12 8h1" />
        <path d="M6 12h1" />
        <path d="M9 12h1" />
        <path d="M12 12h2" />
      </svg>
    )
  }

  if (name === 'refresh') {
    return (
      <svg {...common}>
        <path d="M16 10a6 6 0 1 1-1.76-4.24" />
        <path d="M16 4v4h-4" />
      </svg>
    )
  }

  if (name === 'user') {
    return (
      <svg {...common}>
        <circle cx="10" cy="6.5" r="3" />
        <path d="M4.5 16a5.5 5.5 0 0 1 11 0" />
      </svg>
    )
  }

  if (name === 'user-plus') {
    return (
      <svg {...common}>
        <circle cx="8" cy="7" r="3" />
        <path d="M2.5 16a5.5 5.5 0 0 1 11 0" />
        <path d="M15 6h4" />
        <path d="M17 4v4" />
      </svg>
    )
  }

  if (name === 'close') {
    return (
      <svg {...common}>
        <path d="M5 5 15 15" />
        <path d="M15 5 5 15" />
      </svg>
    )
  }

  if (name === 'minus') {
    return (
      <svg {...common}>
        <path d="M4 10h12" />
      </svg>
    )
  }

  if (name === 'plus') {
    return (
      <svg {...common}>
        <path d="M10 4v12" />
        <path d="M4 10h12" />
      </svg>
    )
  }

  if (name === 'trash') {
    return (
      <svg {...common}>
        <path d="M4 6h12" />
        <path d="M7 6V4h6v2" />
        <path d="m6 6 1 10h6l1-10" />
      </svg>
    )
  }

  if (name === 'pause') {
    return (
      <svg {...common}>
        <rect x="5" y="4" width="3" height="12" rx="1" />
        <rect x="12" y="4" width="3" height="12" rx="1" />
      </svg>
    )
  }

  if (name === 'arrow-left') {
    return (
      <svg {...common}>
        <path d="m8 4-6 6 6 6" />
        <path d="M3 10h15" />
      </svg>
    )
  }

  if (name === 'cash') {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="14" height="10" rx="2" />
        <circle cx="10" cy="10" r="2.2" />
        <path d="M5 8h.01" />
        <path d="M15 12h.01" />
      </svg>
    )
  }

  if (name === 'phone') {
    return (
      <svg {...common}>
        <rect x="6" y="2.5" width="8" height="15" rx="2" />
        <path d="M9 5.5h2" />
        <path d="M9.5 14.5h1" />
      </svg>
    )
  }

  if (name === 'card') {
    return (
      <svg {...common}>
        <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
        <path d="M2.5 8.5h15" />
        <path d="M6 12.5h3" />
      </svg>
    )
  }

  if (name === 'check') {
    return (
      <svg {...common}>
        <path d="m4 10 4 4 8-8" />
      </svg>
    )
  }

  if (name === 'share') {
    return (
      <svg {...common}>
        <circle cx="5" cy="10" r="1.5" />
        <circle cx="15" cy="5" r="1.5" />
        <circle cx="15" cy="15" r="1.5" />
        <path d="m6.5 9 7-3" />
        <path d="m6.5 11 7 3" />
      </svg>
    )
  }

  if (name === 'print') {
    return (
      <svg {...common}>
        <path d="M6 7V3h8v4" />
        <rect x="4" y="10" width="12" height="6" rx="1.5" />
        <path d="M5.5 10h9" />
      </svg>
    )
  }

  if (name === 'discount') {
    return (
      <svg {...common}>
        <path d="m3 10 7-7 7 7-7 7-7-7Z" />
        <path d="M7 7h.01" />
        <path d="M13 13h.01" />
        <path d="m7 13 6-6" />
      </svg>
    )
  }

  if (name === 'panel-open') {
    return (
      <svg {...common}>
        <path d="M4 4v12" />
        <path d="m8 7 3 3-3 3" />
        <path d="m11 7 3 3-3 3" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M4 6h12v10H4z" />
      <path d="M7 6V4h6v2" />
    </svg>
  )
}

export default function SellPage() {
  const locale = useLocale()
  const t = useTranslations('app.sell')
  const businessId = useAuthStore((state) => state.businessId)
  const businessName = useAuthStore((state) => state.businessName)
  const accessToken = useAuthStore((state) => state.accessToken)
  const role = useAuthStore((state) => state.role)
  const [products, setProducts] = useState<Product[]>([])
  const [productCount, setProductCount] = useState(0)
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [units, setUnits] = useState<UnitOfMeasure[]>([])
  const [loading, setLoading] = useState(true)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [productsError, setProductsError] = useState<string | null>(null)
  const [categoriesError, setCategoriesError] = useState<string | null>(null)
  const [unitsError, setUnitsError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [stage, setStage] = useState<Stage>('cart')
  const [cart, setCart] = useState<SellCartItem[]>([])
  const [cartQuantityInputs, setCartQuantityInputs] = useState<Record<string, string>>({})
  const [discount, setDiscount] = useState<{ type: DiscountType; value: number }>({
    type: 'percent',
    value: 0,
  })
  const [chargesAmount, setChargesAmount] = useState(0)
  const [discountOpen, setDiscountOpen] = useState(false)
  const [discountDraftType, setDiscountDraftType] = useState<DiscountType>('percent')
  const [discountDraftValue, setDiscountDraftValue] = useState('')
  const [chargesOpen, setChargesOpen] = useState(false)
  const [chargesDraftValue, setChargesDraftValue] = useState('')
  const [isCartSummaryHidden, setIsCartSummaryHidden] = useState(false)
  const [holds, setHolds] = useState<HeldSale[]>([])
  const [holdsOpen, setHoldsOpen] = useState(false)
  const [paymentOption, setPaymentOption] = useState<PaymentOption>('cash')
  const [amountReceived, setAmountReceived] = useState('')
  const [momoNumber, setMomoNumber] = useState('')
  const [momoReference, setMomoReference] = useState('')
  const [processingSale, setProcessingSale] = useState(false)
  const [isPrintingReceipt, setIsPrintingReceipt] = useState(false)
  const [isSharingReceipt, setIsSharingReceipt] = useState(false)
  const [draftId, setDraftId] = useState(draftSaleId())
  const [completedSale, setCompletedSale] = useState<CompletedSaleSummary | null>(null)
  const [showPaymentSummaryToast, setShowPaymentSummaryToast] = useState(false)
  const [pendingScannedBarcode, setPendingScannedBarcode] = useState<string | null>(null)
  const [barcodePromptOpen, setBarcodePromptOpen] = useState(false)
  const [isAddScannedProductOpen, setIsAddScannedProductOpen] = useState(false)
  const [scanResolving, setScanResolving] = useState(false)
  const searchRef = useRef<HTMLInputElement | null>(null)

  const holdsKey = businessId ? `biztrack.sell.holds.${businessId}` : null
  const error = productsError ?? categoriesError ?? unitsError

  const cashierPayload = accessToken ? decodeJwtPayload<JwtPayload>(accessToken) : null
  const cashierId = cashierPayload?.sub ?? null
  const cashierName = role ? role.toLowerCase() : t('local_user')
  const receiptBusinessName = businessName?.trim() || t('business_fallback')

  const copy = useMemo<SellCopy>(
    () => ({
      localeTag: locale.startsWith('fr') ? 'fr-CM' : 'en-GB',
      pos: t('pos'),
      searchPlaceholder: t('search_placeholder'),
      scan: t('scan'),
      scanHint: t('scan_hint'),
      barcodeNotFoundTitle: t('barcode_not_found_title'),
      barcodeNotFoundDescription: t('barcode_not_found_description'),
      scannedBarcode: t('scanned_barcode'),
      addScannedProduct: t('add_scanned_product'),
      productAddedFromScan: t('product_added_from_scan'),
      productsCount: t('products_count'),
      allCategories: t('all_categories'),
      uncategorized: t('uncategorized'),
      catalogueTitle: t('catalogue_title'),
      catalogueSubtitle: t('catalogue_subtitle'),
      currentSale: t('current_sale'),
      saleNo: t('sale_no'),
      saleNumberPending: t('sale_number_pending'),
      walkIn: t('walk_in'),
      noCustomer: t('no_customer'),
      changeCustomer: t('change_customer'),
      customerComingSoon: t('customer_coming_soon'),
      emptyCartTitle: t('empty_cart_title'),
      emptyCartHint: t('empty_cart_hint'),
      item: t('item'),
      items: t('items'),
      subtotal: t('subtotal'),
      discount: t('discount'),
      charges: t('charges'),
      addDiscount: t('add_discount'),
      addCharges: t('add_charges'),
      removeDiscount: t('remove_discount'),
      removeCharges: t('remove_charges'),
      hideSummary: t('hide_summary'),
      showSummary: t('show_summary'),
      total: t('total'),
      clear: t('clear'),
      hold: t('hold'),
      charge: t('charge'),
      selectPayment: t('select_payment'),
      cash: t('cash'),
      mtnMomo: t('mtn_momo'),
      orangeMoney: t('orange_money'),
      card: t('card'),
      amountReceived: t('amount_received'),
      changeDue: t('change_due'),
      momoNumber: t('momo_number'),
      referenceId: t('reference_id'),
      quickAmounts: t('quick_amounts'),
      confirmPayment: t('confirm_payment'),
      processing: t('processing'),
      cardHint: t('card_hint'),
      paymentReceived: t('payment_received'),
      paymentSavedHint: t('payment_saved_hint'),
      paidWith: t('paid_with'),
      print: t('print'),
      shareReceipt: t('share_receipt'),
      printingReceipt: t('printing_receipt'),
      sharingReceipt: t('sharing_receipt'),
      newSale: t('new_sale'),
      heldSales: t('held_sales'),
      seeHeldSales: t('see_held_sales'),
      noHolds: t('no_holds'),
      resume: t('resume'),
      lowStock: t('low_stock'),
      outOfStock: t('out_of_stock'),
      inStock: t('in_stock'),
      notTracked: t('not_tracked'),
      noProductsFound: t('no_products_found'),
      cancel: t('cancel'),
      discountTitle: t('discount_title'),
      discountBy: t('discount_by'),
      chargesTitle: t('charges_title'),
      chargesHint: t('charges_hint'),
      percent: t('percent'),
      amount: t('amount'),
      customValue: t('custom_value'),
      apply: t('apply'),
      thermalReceipt: t('thermal_receipt'),
      thermalReceiptTitle: t('receipt.title'),
      cashier: t('cashier'),
      localUser: t('local_user'),
      businessFallback: t('business_fallback'),
      receiptDateLabel: t('receipt.date'),
      receiptCustomerLabel: t('receipt.customer'),
      receiptItemsLabel: t('receipt.items'),
      receiptTotalLabel: t('receipt.total'),
      receiptPhoneLabel: t('receipt.phone'),
      receiptReferenceLabel: t('receipt.reference'),
      receiptThanks: t('receipt.thanks'),
      receiptPrinted: t('receipt_printed'),
      receiptPrintUnavailable: t('receipt_print_unavailable'),
      receiptPrintFailed: t('receipt_print_failed'),
      receiptShared: t('receipt_shared'),
      receiptShareUnavailable: t('receipt_share_unavailable'),
      receiptShareFailed: t('receipt_share_failed'),
      receiptShareSaved: t('receipt_share_saved'),
      saleSaved: t('sale_saved'),
      paymentBack: t('payment_back'),
      businessRequired: t('business_required'),
      loadError: t('load_error'),
      errors: {
        SALE_EMPTY: t('errors.SALE_EMPTY'),
        SALE_QUANTITY_INVALID: t('errors.SALE_QUANTITY_INVALID'),
        SALE_UNIT_PRICE_INVALID: t('errors.SALE_UNIT_PRICE_INVALID'),
        SALE_DISCOUNT_INVALID: t('errors.SALE_DISCOUNT_INVALID'),
        SALE_CHARGES_INVALID: t('errors.SALE_CHARGES_INVALID'),
        SALE_UNDERPAID: t('errors.SALE_UNDERPAID'),
        SALE_PRODUCT_NOT_FOUND: t('errors.SALE_PRODUCT_NOT_FOUND'),
        SALE_PRODUCT_INACTIVE: t('errors.SALE_PRODUCT_INACTIVE'),
        SALE_INSUFFICIENT_STOCK: t('errors.SALE_INSUFFICIENT_STOCK'),
        SALE_PAYMENT_METHOD_INVALID: t('errors.SALE_PAYMENT_METHOD_INVALID'),
      },
    }),
    [locale, t],
  )

  useEffect(() => {
    if (!holdsKey || typeof window === 'undefined') return

    const storedHolds = window.localStorage.getItem(holdsKey)
    if (storedHolds) {
      try {
        const parsed = JSON.parse(storedHolds) as HeldSale[]
        if (Array.isArray(parsed)) {
          setHolds(
            parsed.map((hold) => ({
              ...hold,
              chargesAmount:
                typeof hold?.chargesAmount === 'number' && Number.isFinite(hold.chargesAmount)
                  ? hold.chargesAmount
                  : 0,
            })),
          )
        }
      } catch {
        setHolds([])
      }
    } else {
      setHolds([])
    }
  }, [holdsKey])

  useEffect(() => {
    if (!holdsKey || typeof window === 'undefined') return
    window.localStorage.setItem(holdsKey, JSON.stringify(holds))
  }, [holds, holdsKey])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName
      if (event.key === '/' && tagName !== 'INPUT' && tagName !== 'TEXTAREA') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!businessId) {
      setCategories([])
      setCategoriesError(null)
      return
    }

    let active = true
    const currentBusinessId = businessId

    async function loadCategories() {
      setCategoriesError(null)

      try {
        const categoriesResult = await listCategoriesLocal(currentBusinessId, {
          page: 1,
          limit: 200,
          sortBy: 'sortOrder',
          sortOrder: 'ASC',
        })

        if (!active) return
        setCategories(categoriesResult.data)
      } catch {
        if (!active) return
        setCategories([])
        setCategoriesError(copy.loadError)
      }
    }

    void loadCategories()

    return () => {
      active = false
    }
  }, [businessId, copy.loadError, reloadKey])

  useEffect(() => {
    if (!businessId) {
      setUnits([])
      setUnitsError(null)
      return
    }

    let active = true
    const currentBusinessId = businessId

    async function loadUnits() {
      setUnitsError(null)

      try {
        const unitsResult = await listUnitOfMeasuresLocal(currentBusinessId, {
          page: 1,
          limit: 200,
          sortBy: 'name',
          sortOrder: 'ASC',
        })

        if (!active) return
        setUnits(unitsResult.data)
      } catch {
        if (!active) return
        setUnits([])
        setUnitsError(copy.loadError)
      }
    }

    void loadUnits()

    return () => {
      active = false
    }
  }, [businessId, copy.loadError, reloadKey])

  useEffect(() => {
    if (!businessId) {
      setProducts([])
      setProductCount(0)
      setLoading(false)
      setLoadedOnce(true)
      setProductsError(copy.businessRequired)
      return
    }

    let active = true
    const currentBusinessId = businessId

    async function loadProducts() {
      setLoading(true)
      setProductsError(null)

      try {
        const productsResult = await listProductsLocal(currentBusinessId, {
          page: 1,
          limit: 500,
          sortBy: 'name',
          sortOrder: 'ASC',
          isActive: true,
          search: deferredSearch.trim() || undefined,
          categoryId: categoryFilter === 'all' ? undefined : categoryFilter,
        })

        if (!active) return
        setProducts(productsResult.data)
        setProductCount(productsResult.total)
      } catch {
        if (!active) return
        setProducts([])
        setProductCount(0)
        setProductsError(copy.loadError)
      } finally {
        if (active) {
          setLoading(false)
          setLoadedOnce(true)
        }
      }
    }

    void loadProducts()

    return () => {
      active = false
    }
  }, [
    businessId,
    categoryFilter,
    copy.businessRequired,
    copy.loadError,
    deferredSearch,
    reloadKey,
  ])

  const categoryOptions = useMemo(() => {
    return [
      { id: 'all', label: copy.allCategories },
      ...categories.map((category) => ({ id: category.id, label: category.name })),
    ]
  }, [categories, copy.allCategories])

  const scannedProductDefaultValues = useMemo(
    () => (pendingScannedBarcode ? { barcode: pendingScannedBarcode } : undefined),
    [pendingScannedBarcode],
  )

  useEffect(() => {
    setCartQuantityInputs((current) => {
      const next: Record<string, string> = {}

      for (const item of cart) {
        next[item.productId] = formatEditableQuantity(item.qty)
      }

      const currentKeys = Object.keys(current)
      const nextKeys = Object.keys(next)
      if (
        currentKeys.length === nextKeys.length &&
        nextKeys.every((key) => current[key] === next[key])
      ) {
        return current
      }

      return next
    })
  }, [cart])

  const subtotalAmount = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.qty, 0),
    [cart],
  )

  const discountAmount = useMemo(() => {
    if (discount.value <= 0) return 0
    if (discount.type === 'percent') {
      return subtotalAmount * (discount.value / 100)
    }
    return Math.min(discount.value, subtotalAmount)
  }, [discount, subtotalAmount])

  const totalAmount = useMemo(
    () => Math.max(0, subtotalAmount - discountAmount + chargesAmount),
    [chargesAmount, discountAmount, subtotalAmount],
  )

  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.qty, 0), [cart])
  const changeDue = useMemo(() => {
    const received = parseOptionalNumber(amountReceived)
    if (paymentOption !== 'cash') return 0
    return Math.max(0, received - totalAmount)
  }, [amountReceived, paymentOption, totalAmount])

  const quickAmounts = useMemo(() => {
    if (totalAmount <= 0) return []

    const roundUp = (value: number, step: number) => Math.ceil(value / step) * step
    const values = new Set<number>([
      Math.ceil(totalAmount),
      roundUp(totalAmount, 500),
      roundUp(totalAmount, 1000),
      roundUp(totalAmount, 5000),
      roundUp(totalAmount, 10000),
    ])

    return Array.from(values)
      .filter((value) => value >= totalAmount)
      .sort((left, right) => left - right)
      .slice(0, 5)
  }, [totalAmount])

  const canConfirmPayment = useMemo(() => {
    if (cart.length === 0 || totalAmount <= 0) return false

    if (paymentOption === 'cash') {
      return parseOptionalNumber(amountReceived) >= totalAmount
    }

    if (paymentOption === 'mtn' || paymentOption === 'orange') {
      return momoNumber.replace(/\D/g, '').length >= 9 && momoReference.trim().length >= 4
    }

    return true
  }, [amountReceived, cart.length, momoNumber, momoReference, paymentOption, totalAmount])

  useEffect(() => {
    if (stage !== 'success' || !completedSale) {
      setShowPaymentSummaryToast(false)
      return
    }

    setShowPaymentSummaryToast(true)
    const timeout = window.setTimeout(() => setShowPaymentSummaryToast(false), 3_500)

    return () => window.clearTimeout(timeout)
  }, [completedSale, stage])

  const resetDraftSale = () => {
    setCart([])
    setDiscount({ type: 'percent', value: 0 })
    setChargesAmount(0)
    setChargesOpen(false)
    setChargesDraftValue('')
    setStage('cart')
    setCompletedSale(null)
    setShowPaymentSummaryToast(false)
    setPaymentOption('cash')
    setAmountReceived('')
    setMomoNumber('')
    setMomoReference('')
    setIsPrintingReceipt(false)
    setIsSharingReceipt(false)
    setDraftId(draftSaleId())
  }

  const ensureCartStage = () => {
    if (stage === 'success') {
      resetDraftSale()
      return
    }

    if (stage === 'payment') {
      setStage('cart')
    }
  }

  const addToCart = (product: Product) => {
    ensureCartStage()

    if (isTrackedOut(product)) {
      return false
    }

    const availableStock =
      product.trackInventory &&
      product.currentStock !== null &&
      product.currentStock !== undefined
        ? product.currentStock
        : null
    const cartForStockCheck = stage === 'success' ? [] : cart
    const currentCartItem = cartForStockCheck.find((item) => item.productId === product.id)
    if (availableStock !== null && currentCartItem && currentCartItem.qty >= availableStock) {
      return false
    }

    setCart((current) => {
      const currentStock =
        product.trackInventory &&
        product.currentStock !== null &&
        product.currentStock !== undefined
          ? product.currentStock
          : null

      const existing = current.find((item) => item.productId === product.id)
      if (existing) {
        if (currentStock !== null && existing.qty >= currentStock) {
          return current
        }

        return current.map((item) =>
          item.productId === product.id ? { ...item, qty: item.qty + 1 } : item,
        )
      }

      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          price: product.sellingPrice,
          qty: 1,
          categoryName: product.category?.name ?? null,
          emoji: pickEmoji(product),
          unitLabel: product.unitOfMeasure?.abbreviation ?? product.unitOfMeasure?.name ?? null,
          trackInventory: product.trackInventory,
          stock: currentStock,
          lowStockThreshold: product.lowStockThreshold ?? null,
          imageUrl: product.primaryImageUrl ?? product.imageUrl ?? null,
        },
      ]
    })

    return true
  }

  const handleBarcodeScan = async (rawBarcode: string) => {
    const barcode = rawBarcode.trim()
    if (!barcode || scanResolving) return

    if (!businessId) {
      toast.error(copy.businessRequired)
      return
    }

    setScanResolving(true)

    try {
      const product = await getProductByBarcodeLocal(businessId, barcode)

      if (product) {
        if (!product.isActive) {
          toast.error(copy.errors.SALE_PRODUCT_INACTIVE)
          return
        }

        const wasAdded = addToCart(product)
        setSearch('')
        if (wasAdded) {
          toast.success(`${product.name} ${copy.productAddedFromScan}`)
        } else {
          toast.error(copy.errors.SALE_INSUFFICIENT_STOCK)
        }
        return
      }

      setPendingScannedBarcode(barcode)
      setBarcodePromptOpen(true)
      setSearch('')
    } catch {
      toast.error(copy.loadError)
    } finally {
      setScanResolving(false)
    }
  }

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return

    event.preventDefault()
    void handleBarcodeScan(search)
  }

  const openScannedProductDialog = () => {
    setBarcodePromptOpen(false)
    setIsAddScannedProductOpen(true)
  }

  const cancelScannedProductCreate = () => {
    setBarcodePromptOpen(false)
    setPendingScannedBarcode(null)
  }

  const handleScannedProductCreated = (product: Product) => {
    setReloadKey((current) => current + 1)
    addToCart(product)
    setPendingScannedBarcode(null)
  }

  const setItemQuantity = (productId: string, nextQty: number) => {
    setCart((current) =>
      current.flatMap((item) => {
        if (item.productId !== productId) return item

        if (nextQty <= 0) return []
        if (item.stock !== null && nextQty > item.stock) return item
        return { ...item, qty: nextQty }
      }),
    )
  }

  const handleItemQuantityInputChange = (productId: string, value: string) => {
    setCartQuantityInputs((current) => ({
      ...current,
      [productId]: value,
    }))
  }

  const commitItemQuantityInput = (productId: string) => {
    const item = cart.find((cartItem) => cartItem.productId === productId)
    if (!item) {
      return
    }

    const rawValue = cartQuantityInputs[productId] ?? ''
    const trimmedValue = rawValue.trim()

    if (!trimmedValue) {
      setCartQuantityInputs((current) => ({
        ...current,
        [productId]: formatEditableQuantity(item.qty),
      }))
      return
    }

    const parsedValue = Number(trimmedValue)
    if (!Number.isFinite(parsedValue)) {
      setCartQuantityInputs((current) => ({
        ...current,
        [productId]: formatEditableQuantity(item.qty),
      }))
      return
    }

    const normalizedQty = Number(parsedValue.toFixed(3))

    if (normalizedQty <= 0) {
      removeItem(productId)
      return
    }

    if (item.stock !== null && normalizedQty > item.stock) {
      toast.error(copy.errors.SALE_INSUFFICIENT_STOCK)
      setItemQuantity(productId, item.stock)
      return
    }

    setItemQuantity(productId, normalizedQty)
  }

  const handleItemQuantityKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
    productId: string,
    fallbackQty: number,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitItemQuantityInput(productId)
      event.currentTarget.blur()
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setCartQuantityInputs((current) => ({
        ...current,
        [productId]: formatEditableQuantity(fallbackQty),
      }))
      event.currentTarget.blur()
    }
  }

  const removeItem = (productId: string) => {
    setCart((current) => current.filter((item) => item.productId !== productId))
  }

  const applyDiscount = (event: FormEvent) => {
    event.preventDefault()
    const value = Math.max(0, parseOptionalNumber(discountDraftValue))
    setDiscount({
      type: discountDraftType,
      value: discountDraftType === 'percent' ? Math.min(value, 100) : value,
    })
    setDiscountOpen(false)
  }

  const applyCharges = (event: FormEvent) => {
    event.preventDefault()
    setChargesAmount(Math.max(0, parseOptionalNumber(chargesDraftValue)))
    setChargesOpen(false)
  }

  const holdCurrentSale = () => {
    if (cart.length === 0) return

    setHolds((current) => [
      {
        id: holdId(),
        saleId: draftId,
        items: cart,
        discount,
        chargesAmount,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ])

    resetDraftSale()
    toast.success(copy.heldSales)
  }

  const resumeHold = (hold: HeldSale) => {
    setCart(hold.items)
    setDiscount(hold.discount)
    setChargesAmount(hold.chargesAmount ?? 0)
    setStage('cart')
    setCompletedSale(null)
    setDraftId(hold.saleId)
    setHolds((current) => current.filter((item) => item.id !== hold.id))
    setHoldsOpen(false)
  }

  const clearCurrentSale = () => {
    setCart([])
    setDiscount({ type: 'percent', value: 0 })
    setChargesAmount(0)
    setDraftId(draftSaleId())
  }

  const notifyCustomerComingSoon = () => toast.message(copy.customerComingSoon)

  const handleConfirmPayment = async () => {
    if (!businessId || !canConfirmPayment || processingSale || cart.length === 0) {
      return
    }

    setProcessingSale(true)

    try {
      const amountPaid =
        paymentOption === 'cash' ? parseOptionalNumber(amountReceived) : totalAmount
      const sale = await createSaleLocal(businessId, {
        soldAt: new Date().toISOString(),
        cashierId,
        cashierName,
        discountAmount,
        chargesAmount,
        notes:
          paymentOption === 'mtn' || paymentOption === 'orange'
            ? `${translatePayment(copy, paymentOption)} ${momoNumber.trim()}`
            : undefined,
        payments: [
          {
            method: toPaymentMethod(paymentOption),
            amount: amountPaid,
            mobileMoneyReference:
              paymentOption === 'mtn' || paymentOption === 'orange'
                ? momoReference.trim()
                : undefined,
          },
        ],
        items: cart.map((item) => ({
          productId: item.productId,
          quantity: item.qty,
          unitPrice: item.price,
          discountAmount: 0,
          costPrice: undefined,
        })),
      })

      const receiptText = buildReceiptText({
        businessName: receiptBusinessName,
        copy,
        sale,
        paymentOption,
        momoNumber,
        paperWidthMm: THERMAL_RECEIPT_PRINTABLE_WIDTH_MM,
      })

      setCompletedSale({
        sale,
        paymentOption,
        momoNumber,
        momoReference,
        receiptText,
      })
      setProcessingSale(false)
      setCart([])
      setDiscount({ type: 'percent', value: 0 })
      setChargesAmount(0)
      setStage('success')
      setPaymentOption('cash')
      setAmountReceived('')
      setMomoNumber('')
      setMomoReference('')
      setDraftId(draftSaleId())
      setReloadKey((current) => current + 1)
      toast.success(copy.saleSaved)
    } catch (saleError) {
      setProcessingSale(false)
      if (saleError instanceof SaleLocalError) {
        toast.error(copy.errors[saleError.code] ?? copy.loadError)
        return
      }

      toast.error(copy.loadError)
    }
  }

  const shareReceipt = async () => {
    if (!completedSale || processingSale || isPrintingReceipt || isSharingReceipt) return

    setIsSharingReceipt(true)

    const receiptNumber = completedSale.sale.receiptNumber || completedSale.sale.saleNumber
    const pdfBlob = buildReceiptPdfBlob(
      completedSale.receiptText,
      THERMAL_RECEIPT_PAPER_WIDTH_MM,
    )
    const receiptFile = new File([pdfBlob], sanitizeReceiptFileName(receiptNumber), {
      type: 'application/pdf',
      lastModified: Date.now(),
    })
    const files = [receiptFile]
    const shareData: ShareData = {
      files,
      title: receiptNumber,
      text: receiptNumber,
    }

    try {
      if (navigator.canShare?.({ files }) && navigator.share) {
        await navigator.share(shareData)
        toast.success(copy.receiptShared)
        return
      }

      if (hasDesktopIpc()) {
        const pdfBytes = Array.from(new Uint8Array(await pdfBlob.arrayBuffer()))
        const result = await ipc.share.file({
          buffer: pdfBytes,
          filename: receiptFile.name,
          mimeType: receiptFile.type,
        })

        if (result.shared) {
          toast.success(copy.receiptShared)
          return
        }

        toast(copy.receiptShareSaved)
        return
      }

      downloadReceiptFile(receiptFile)
      toast(copy.receiptShareUnavailable)
    } catch (error) {
      if (isShareCancelled(error)) return

      try {
        downloadReceiptFile(receiptFile)
        toast(copy.receiptShareFailed)
      } catch {
        toast.error(copy.loadError)
      }
    } finally {
      setIsSharingReceipt(false)
    }
  }

  const printReceipt = async () => {
    if (!completedSale || processingSale || isPrintingReceipt || isSharingReceipt) return

    setIsPrintingReceipt(true)

    const receiptNumber = completedSale.sale.receiptNumber || completedSale.sale.saleNumber
    const receiptFileName = sanitizeReceiptFileName(receiptNumber)

    if (!hasDesktopIpc()) {
      const pdfBlob = buildReceiptPdfBlob(
        completedSale.receiptText,
        THERMAL_RECEIPT_PAPER_WIDTH_MM,
      )
      const receiptFile = new File([pdfBlob], receiptFileName, {
        type: 'application/pdf',
        lastModified: Date.now(),
      })
      downloadReceiptFile(receiptFile)
      toast(copy.receiptPrintUnavailable)
      setIsPrintingReceipt(false)
      return
    }

    try {
      const pdfBlob = buildReceiptPdfBlob(
        completedSale.receiptText,
        THERMAL_RECEIPT_PAPER_WIDTH_MM,
      )
      const pdfBytes = Array.from(new Uint8Array(await pdfBlob.arrayBuffer()))

      await ipc.print.receipt({
        buffer: pdfBytes,
        filename: receiptFileName,
        paperWidthMm: THERMAL_RECEIPT_PAPER_WIDTH_MM,
        silent: true,
      })
      toast.success(copy.receiptPrinted)
    } catch (error) {
      if (isPrintCancelled(error)) return

      toast.error(error instanceof Error ? error.message : copy.receiptPrintFailed)
    } finally {
      setIsPrintingReceipt(false)
    }
  }

  const renderPaymentHelper = () => {
    if (paymentOption === 'card') {
      return (
        <div className="rounded-2xl border border-border bg-secondary px-4 py-3 text-sm text-foreground/80">
          {copy.cardHint}
        </div>
      )
    }

    if (paymentOption === 'mtn' || paymentOption === 'orange') {
      return (
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-secondary px-4 py-3 text-sm text-foreground/80">
            {translatePayment(copy, paymentOption)} · {formatAmount(totalAmount, copy.localeTag)}{' '}
            FCFA
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {copy.momoNumber}
            </span>
            <input
              value={momoNumber}
              onChange={(event) => setMomoNumber(event.target.value)}
              className="block h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/20"
              placeholder="+237 6XX XXX XXX"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {copy.referenceId}
            </span>
            <input
              value={momoReference}
              onChange={(event) => setMomoReference(event.target.value.toUpperCase())}
              className="block h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground uppercase outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/20"
              placeholder="TXN-240422-1234"
            />
          </label>
        </div>
      )
    }

    return (
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {copy.amountReceived}
          </span>
          <input
            value={amountReceived}
            onChange={(event) => setAmountReceived(event.target.value)}
            className="block h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/20"
            placeholder={formatAmount(totalAmount, copy.localeTag)}
          />
        </label>
        <div className="rounded-2xl border border-border bg-background px-4 py-3">
          <div className="flex items-center justify-between text-sm text-foreground/80">
            <span>{copy.changeDue}</span>
            <span className="font-semibold text-foreground">
              {formatAmount(changeDue, copy.localeTag)} FCFA
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickAmounts.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAmountReceived(String(value))}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-ring hover:bg-accent"
            >
              {formatAmount(value, copy.localeTag)}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (loading && !loadedOnce) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  const receiptActionBusy = processingSale || isPrintingReceipt || isSharingReceipt

  return (
    <>
      <div className="-m-6 flex min-h-[calc(100vh-70px)] flex-col bg-background text-foreground lg:h-[calc(100vh-70px)] lg:overflow-hidden">
        <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
          <section className="flex min-h-0 min-w-0 flex-1 flex-col lg:border-r lg:border-border">
            <div className="border-b border-border bg-card">
              <div className="flex flex-wrap items-center gap-3 px-4 py-4">
                <div className="relative min-w-[240px] flex-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Icon name="search" className="h-4 w-4" />
                  </span>
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="block h-11 w-full rounded-xl border border-input bg-background pl-10 pr-14 text-sm text-foreground outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/20"
                    placeholder={copy.searchPlaceholder}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-border bg-card px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                    /
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (search.trim()) {
                      void handleBarcodeScan(search)
                      return
                    }

                    searchRef.current?.focus()
                    toast.message(copy.scanHint)
                  }}
                  disabled={scanResolving}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#185FA5] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0C447C] disabled:cursor-not-allowed disabled:bg-[#C2BFB7]"
                >
                  {scanResolving ? <Spinner size="sm" /> : <Icon name="scan" className="h-4 w-4" />}
                  <span>{copy.scan}</span>
                </button>

                <div className="flex h-11 overflow-hidden rounded-xl border border-border">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={cn(
                      'inline-flex w-11 items-center justify-center transition',
                      viewMode === 'grid'
                        ? 'bg-accent text-primary'
                        : 'bg-card text-foreground/80 hover:bg-secondary',
                    )}
                  >
                    <Icon name="grid" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={cn(
                      'inline-flex w-11 items-center justify-center border-l border-border transition',
                      viewMode === 'list'
                        ? 'bg-accent text-primary'
                        : 'bg-card text-foreground/80 hover:bg-secondary',
                    )}
                  >
                    <Icon name="list" className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 px-4 pb-4">
                <div className="flex min-w-0 gap-2 overflow-x-auto rounded-xl bg-secondary p-1">
                  {categoryOptions.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setCategoryFilter(category.id)}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition',
                        categoryFilter === category.id
                          ? 'bg-[#042C53] text-white shadow-sm'
                          : 'text-foreground/80 hover:text-foreground',
                      )}
                    >
                      {category.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 whitespace-nowrap text-xs font-medium text-muted-foreground">
                  {loading && loadedOnce ? <Spinner size="sm" /> : null}
                  <span>
                    {productCount} {copy.productsCount}
                  </span>
                </div>
              </div>
            </div>

            <div
              className="px-4 py-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 1px 1px, rgba(4,44,83,0.04) 1px, transparent 0)',
                backgroundSize: '20px 20px',
              }}
            >
              <div className="mb-4">
                <div className="text-sm font-semibold">{copy.catalogueTitle}</div>
                <p className="mt-1 text-sm text-muted-foreground">{copy.catalogueSubtitle}</p>
              </div>

              {error ? (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              {products.length === 0 ? (
                <div className="flex min-h-[260px] flex-col items-center justify-center rounded-[28px] border border-dashed border-border bg-card/80 px-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                    <Icon name="package" className="h-7 w-7" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{copy.noProductsFound}</h3>
                </div>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {products.map((product) => {
                    const disabled = isTrackedOut(product)

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => addToCart(product)}
                        disabled={disabled}
                        className={cn(
                          'relative rounded-[20px] border border-border bg-card p-3 text-left shadow-sm transition',
                          disabled
                            ? 'cursor-not-allowed opacity-55'
                            : 'hover:-translate-y-0.5 hover:border-ring hover:shadow-md',
                        )}
                      >
                        {isTrackedLow(product) ? (
                          <Badge variant="warning" className="absolute right-3 top-3">
                            {copy.lowStock}
                          </Badge>
                        ) : null}
                        {disabled ? (
                          <Badge variant="danger" className="absolute right-3 top-3">
                            {copy.outOfStock}
                          </Badge>
                        ) : null}
                        <div className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-background to-secondary text-4xl">
                          {product.primaryImageUrl ? (
                            <img
                              src={product.primaryImageUrl}
                              alt={product.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            pickEmoji(product)
                          )}
                        </div>
                        <div className="min-h-[2.75rem] text-sm font-semibold leading-5">
                          {product.name}
                        </div>
                        <div className="mt-3 flex items-end justify-between gap-2">
                          <div>
                            <div className="text-base font-bold text-primary dark:text-[#B5D4F4]">
                              {formatAmount(product.sellingPrice, copy.localeTag)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">FCFA</div>
                          </div>
                          <div className="text-right text-[11px] text-muted-foreground">
                            {product.trackInventory &&
                            product.currentStock !== null &&
                            product.currentStock !== undefined
                              ? `${formatQuantity(product.currentStock)} ${copy.inStock}`
                              : copy.notTracked}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {products.map((product) => {
                    const disabled = isTrackedOut(product)

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => addToCart(product)}
                        disabled={disabled}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3 text-left transition',
                          disabled
                            ? 'cursor-not-allowed opacity-55'
                            : 'hover:border-ring hover:bg-accent/40',
                        )}
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-background to-secondary text-2xl">
                          {product.primaryImageUrl ? (
                            <img
                              src={product.primaryImageUrl}
                              alt={product.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            pickEmoji(product)
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{product.name}</div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {product.sku || product.barcode || copy.uncategorized}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-base font-bold text-primary dark:text-[#B5D4F4]">
                            {formatAmount(product.sellingPrice, copy.localeTag)}
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {product.trackInventory &&
                            product.currentStock !== null &&
                            product.currentStock !== undefined
                              ? formatQuantity(product.currentStock)
                              : copy.notTracked}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </section>

          <aside className="flex w-full shrink-0 flex-col border-t border-border bg-card lg:min-h-0 lg:w-[420px] lg:border-t-0">
            {stage === 'payment' ? (
              <>
                <div className="border-b border-border px-5 py-5">
                  <button
                    type="button"
                    onClick={() => setStage('cart')}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-primary"
                  >
                    <Icon name="arrow-left" className="h-4 w-4" />
                    {copy.paymentBack}
                  </button>
                  <div className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {copy.total}
                  </div>
                  <div className="mt-1 text-4xl font-bold text-primary dark:text-[#B5D4F4]">
                    {formatAmount(totalAmount, copy.localeTag)}
                    <span className="ml-2 text-base font-medium text-muted-foreground">FCFA</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-5">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {copy.selectPayment}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {(
                      [
                        ['cash', 'cash'],
                        ['mtn', 'phone'],
                        ['orange', 'phone'],
                        ['card', 'card'],
                      ] as Array<[PaymentOption, 'cash' | 'phone' | 'card']>
                    ).map(([option, icon]) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setPaymentOption(option)}
                        className={cn(
                          'rounded-2xl border p-4 text-left transition',
                          paymentOption === option
                            ? 'border-ring bg-accent shadow-sm'
                            : 'border-border hover:border-ring',
                        )}
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card text-primary">
                          <Icon name={icon} className="h-5 w-5" />
                        </div>
                        <div className="mt-3 text-sm font-semibold">
                          {translatePayment(copy, option)}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="mt-5">{renderPaymentHelper()}</div>
                </div>

                <div className="border-t border-border p-5">
                  <button
                    type="button"
                    onClick={() => void handleConfirmPayment()}
                    disabled={!canConfirmPayment || processingSale}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#185FA5] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#0C447C] disabled:cursor-not-allowed disabled:bg-[#C2BFB7]"
                  >
                    {processingSale ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                        {copy.processing}
                      </>
                    ) : (
                      <>
                        <Icon name="check" className="h-4 w-4" />
                        {copy.confirmPayment} · {formatAmount(totalAmount, copy.localeTag)} FCFA
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : stage === 'success' && completedSale ? (
              <>
                <div className="relative min-h-0 flex-1 overflow-hidden">
                  {showPaymentSummaryToast ? (
                    <div className="pointer-events-none absolute left-5 right-5 top-4 z-10 rounded-2xl border border-border bg-popover/95 p-3 text-popover-foreground shadow-xl backdrop-blur">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EAF3DE] text-[#2F5E0C] ring-1 ring-[#BBD9A1] dark:bg-[#223019] dark:text-[#B8E18E] dark:ring-[#3E5B2C]">
                          <Icon name="check" className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold">{copy.paymentReceived}</div>
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            {copy.paidWith}: {translatePayment(copy, completedSale.paymentOption)}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-base font-bold tabular-nums text-primary dark:text-[#B5D4F4]">
                          {formatAmount(completedSale.sale.totalAmount, copy.localeTag)}
                          <span className="ml-1 text-[10px] font-semibold text-muted-foreground">
                            FCFA
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="h-full overflow-y-auto px-5 py-5">
                    <div className="rounded-[28px] border border-border bg-background p-5 shadow-sm">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {copy.thermalReceipt}
                      </div>
                      <div className="mt-4 flex justify-center overflow-x-auto">
                        <pre className="inline-block whitespace-pre rounded-2xl bg-card p-4 font-mono text-[11px] leading-5 text-foreground shadow-sm">
                          {completedSale.receiptText}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border p-5">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => void shareReceipt()}
                      disabled={receiptActionBusy}
                      aria-busy={isSharingReceipt}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSharingReceipt ? (
                        <Spinner size="sm" />
                      ) : (
                        <Icon name="share" className="h-4 w-4" />
                      )}
                      {isSharingReceipt ? copy.sharingReceipt : copy.shareReceipt}
                    </button>
                    <button
                      type="button"
                      onClick={() => void printReceipt()}
                      disabled={receiptActionBusy}
                      aria-busy={isPrintingReceipt}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPrintingReceipt ? (
                        <Spinner size="sm" />
                      ) : (
                        <Icon name="print" className="h-4 w-4" />
                      )}
                      {isPrintingReceipt ? copy.printingReceipt : copy.print}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={resetDraftSale}
                    className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#185FA5] px-4 text-sm font-bold text-white transition hover:bg-[#0C447C]"
                  >
                    <Icon name="plus" className="h-4 w-4" />
                    {copy.newSale}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="border-b border-border px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{copy.currentSale}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {copy.saleNumberPending}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground/80">
                        {cartCount} {cartCount === 1 ? copy.item : copy.items}
                      </div>
                      <div className="group relative">
                        <button
                          type="button"
                          onClick={() => setHoldsOpen(true)}
                          aria-label={copy.seeHeldSales}
                          className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition hover:bg-accent"
                        >
                          <Icon name="pause" className="h-4 w-4" />
                          {holds.length > 0 ? (
                            <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-[#FAEEDA] px-1.5 py-0.5 text-[10px] font-bold text-[#854F0B]">
                              {holds.length}
                            </span>
                          ) : null}
                        </button>
                        <div className="pointer-events-none absolute right-0 top-[calc(100%+0.45rem)] z-10 hidden whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[11px] font-medium text-popover-foreground shadow-lg group-hover:block group-focus-within:block">
                          {copy.seeHeldSales}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-b border-border bg-background px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-bold text-primary">
                        <Icon name="user" className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {copy.walkIn}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{copy.noCustomer}</div>
                        </div>
                      </div>
                    <button
                      type="button"
                      onClick={notifyCustomerComingSoon}
                      className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-primary transition hover:bg-accent"
                    >
                      <Icon name="user-plus" className="h-4 w-4" />
                      {copy.changeCustomer}
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  {cart.length === 0 ? (
                    <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-8 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
                        <Icon name="package" className="h-7 w-7" />
                      </div>
                      <h3 className="mt-4 text-lg font-semibold">{copy.emptyCartTitle}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">{copy.emptyCartHint}</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {cart.map((item) => (
                          <div
                            key={item.productId}
                            className="rounded-[22px] border border-border bg-card p-3 shadow-sm"
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-gradient-to-br from-background to-secondary text-2xl">
                                {item.imageUrl ? (
                                  <img
                                    src={item.imageUrl}
                                    alt={item.name}
                                    className="h-full w-full rounded-2xl object-cover"
                                  />
                                ) : (
                                  item.emoji
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold">{item.name}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span>{item.sku || item.categoryName || copy.uncategorized}</span>
                                  {item.trackInventory && item.stock !== null ? (
                                    <span>
                                      {formatQuantity(item.stock)} {copy.inStock}
                                    </span>
                                  ) : (
                                    <span>{copy.notTracked}</span>
                                  )}
                                </div>
                                <div className="mt-3 flex items-center justify-between gap-3">
                                  <div className="text-sm font-bold text-primary dark:text-[#B5D4F4]">
                                    {formatAmount(item.price, copy.localeTag)} FCFA
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setItemQuantity(item.productId, item.qty - 1)}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background transition hover:bg-secondary"
                                    >
                                      <Icon name="minus" className="h-4 w-4" />
                                    </button>
                                    <div className="w-[72px]">
                                      <NumberInput
                                        value={cartQuantityInputs[item.productId] ?? formatEditableQuantity(item.qty)}
                                        min="0"
                                        step="0.001"
                                        inputMode="decimal"
                                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                          handleItemQuantityInputChange(item.productId, event.target.value)
                                        }
                                        onBlur={() => commitItemQuantityInput(item.productId)}
                                        onFocus={(event: FocusEvent<HTMLInputElement>) =>
                                          event.currentTarget.select()
                                        }
                                        onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) =>
                                          handleItemQuantityKeyDown(event, item.productId, item.qty)
                                        }
                                        className="h-8 rounded-lg px-2 text-center text-sm font-semibold"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setItemQuantity(item.productId, item.qty + 1)}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background transition hover:bg-secondary"
                                    >
                                      <Icon name="plus" className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeItem(item.productId)}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#FCEBEB] hover:text-[#A32D2D]"
                                    >
                                      <Icon name="trash" className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div
                        className={cn(
                          'sticky bottom-0 z-10 -mx-5 border-t border-border bg-card transition-all duration-200 ease-out origin-left',
                          isCartSummaryHidden
                            ? 'mt-0 max-h-0 -translate-x-4 overflow-hidden border-transparent py-0 opacity-0 shadow-none'
                            : 'mt-4 max-h-[18rem] translate-x-0 py-4 opacity-100 shadow-[0_-10px_24px_rgba(15,23,42,0.08)]',
                        )}
                        aria-hidden={isCartSummaryHidden}
                      >
                        <div className="mb-3 flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => setIsCartSummaryHidden(true)}
                            aria-label={copy.hideSummary}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background hover:text-foreground"
                          >
                            <Icon name="close" className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="flex items-stretch gap-2 px-5">
                          <button
                            type="button"
                            onClick={() => {
                              setDiscountDraftType(discount.type)
                              setDiscountDraftValue(discount.value > 0 ? String(discount.value) : '')
                              setDiscountOpen(true)
                            }}
                            className={cn(
                              'flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition',
                              discount.value > 0
                                ? 'bg-accent text-primary'
                                : 'text-foreground/80 hover:bg-background',
                            )}
                          >
                            <Icon name="discount" className="h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {discount.value > 0
                                ? `${copy.discount} · ${discount.type === 'percent' ? `${discount.value}%` : `${formatAmount(discount.value, copy.localeTag)} FCFA`}`
                                : copy.addDiscount}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setChargesDraftValue(chargesAmount > 0 ? String(chargesAmount) : '')
                              setChargesOpen(true)
                            }}
                            className={cn(
                              'flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition',
                              chargesAmount > 0
                                ? 'bg-accent text-primary'
                                : 'text-foreground/80 hover:bg-background',
                            )}
                          >
                            <Icon name="cash" className="h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {chargesAmount > 0
                                ? `${copy.charges} · ${formatAmount(chargesAmount, copy.localeTag)} FCFA`
                                : copy.addCharges}
                            </span>
                          </button>
                        </div>

                        <div className="mt-4 space-y-2 text-sm text-foreground/80 px-5">
                          <div className="flex items-center justify-between">
                            <span>{copy.subtotal}</span>
                            <span className="font-semibold text-foreground">
                              {formatAmount(subtotalAmount, copy.localeTag)} FCFA
                            </span>
                          </div>
                          {discountAmount > 0 ? (
                            <div className="flex items-center justify-between text-[#3B6D11]">
                              <span>{copy.discount}</span>
                              <span className="font-semibold">
                                -{formatAmount(discountAmount, copy.localeTag)} FCFA
                              </span>
                            </div>
                          ) : null}
                          {chargesAmount > 0 ? (
                            <div className="flex items-center justify-between text-[#0C447C]">
                              <span>{copy.charges}</span>
                              <span className="font-semibold">
                                +{formatAmount(chargesAmount, copy.localeTag)} FCFA
                              </span>
                            </div>
                          ) : null}
                          <div className="border-t border-border pt-3">
                            <div className="flex items-end justify-between">
                              <span className="text-base font-semibold text-foreground">
                                {copy.total}
                              </span>
                              <span className="text-3xl font-bold text-primary dark:text-[#B5D4F4]">
                                {formatAmount(totalAmount, copy.localeTag)}
                                <span className="ml-2 text-sm font-medium text-muted-foreground">
                                  FCFA
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {isCartSummaryHidden ? (
                        <div className="sticky bottom-0 -left-5 z-20 border-t border-border bg-card p-0 rounded-xl w-max">
                          <button
                            type="button"
                            onClick={() => setIsCartSummaryHidden(false)}
                            aria-label={copy.showSummary}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-foreground/80 transition hover:bg-accent hover:text-primary"
                          >
                            <Icon name="panel-open" className="h-4 w-4" />
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>

                <div className="shrink-0 border-t border-border bg-card p-5">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={clearCurrentSale}
                      disabled={cart.length === 0}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-foreground/80 transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Icon name="trash" className="h-4 w-4" />
                      {copy.clear}
                    </button>
                    <button
                      type="button"
                      onClick={holdCurrentSale}
                      disabled={cart.length === 0}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-foreground/80 transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Icon name="pause" className="h-4 w-4" />
                      {copy.hold}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStage('payment')}
                      disabled={cart.length === 0}
                      className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#185FA5] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#0C447C] disabled:cursor-not-allowed disabled:bg-[#C2BFB7]"
                    >
                      <Icon name="cash" className="h-4 w-4" />
                      {copy.charge}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>

      <Dialog open={discountOpen} onOpenChange={setDiscountOpen}>
        <DialogContent className="max-w-md" closeLabel={copy.cancel}>
          <DialogHeader>
            <DialogTitle>{copy.discountTitle}</DialogTitle>
            <DialogDescription>{copy.discountBy}</DialogDescription>
          </DialogHeader>

          <form id="discount-form" onSubmit={applyDiscount} className="space-y-4 px-6 py-5">
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
              <button
                type="button"
                onClick={() => setDiscountDraftType('percent')}
                className={cn(
                  'rounded-xl px-3 py-2 text-sm font-semibold transition',
                  discountDraftType === 'percent' ? 'bg-[#042C53] text-white' : 'text-foreground/80',
                )}
              >
                {copy.percent}
              </button>
              <button
                type="button"
                onClick={() => setDiscountDraftType('amount')}
                className={cn(
                  'rounded-xl px-3 py-2 text-sm font-semibold transition',
                  discountDraftType === 'amount' ? 'bg-[#042C53] text-white' : 'text-foreground/80',
                )}
              >
                {copy.amount}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {(discountDraftType === 'percent' ? [5, 10, 15, 20] : [500, 1000, 2000, 5000]).map(
                (value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDiscountDraftValue(String(value))}
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-ring hover:bg-accent"
                  >
                    {discountDraftType === 'percent'
                      ? `${value}%`
                      : `${formatAmount(value, copy.localeTag)} FCFA`}
                  </button>
                ),
              )}
            </div>

            <label className="block space-y-1">
              <span className="text-sm font-medium text-foreground">{copy.customValue}</span>
              <input
                value={discountDraftValue}
                onChange={(event) => setDiscountDraftValue(event.target.value)}
                className="block h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/20"
                placeholder={discountDraftType === 'percent' ? '10' : '1000'}
              />
            </label>
          </form>

          <DialogFooter>
            {discount.value > 0 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDiscount({ type: 'percent', value: 0 })
                  setDiscountOpen(false)
                }}
              >
                {copy.removeDiscount}
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => setDiscountOpen(false)}>
              {copy.cancel}
            </Button>
            <Button type="submit" form="discount-form" variant="primary">
              {copy.apply}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={chargesOpen} onOpenChange={setChargesOpen}>
        <DialogContent className="max-w-md" closeLabel={copy.cancel}>
          <DialogHeader>
            <DialogTitle>{copy.chargesTitle}</DialogTitle>
            <DialogDescription>{copy.chargesHint}</DialogDescription>
          </DialogHeader>

          <form id="charges-form" onSubmit={applyCharges} className="space-y-4 px-6 py-5">
            <div className="flex flex-wrap gap-2">
              {[100, 250, 500, 1000].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setChargesDraftValue(String(value))}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-ring hover:bg-accent"
                >
                  {formatAmount(value, copy.localeTag)} FCFA
                </button>
              ))}
            </div>

            <label className="block space-y-1">
              <span className="text-sm font-medium text-foreground">{copy.amount}</span>
              <NumberInput
                value={chargesDraftValue}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setChargesDraftValue(event.target.value)
                }
                min="0"
                step="0.01"
                className="h-11 rounded-xl px-3 text-sm"
                placeholder="500"
              />
            </label>
          </form>

          <DialogFooter>
            {chargesAmount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setChargesAmount(0)
                  setChargesOpen(false)
                }}
              >
                {copy.removeCharges}
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => setChargesOpen(false)}>
              {copy.cancel}
            </Button>
            <Button type="submit" form="charges-form" variant="primary">
              {copy.apply}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={barcodePromptOpen}
        onOpenChange={setBarcodePromptOpen}
      >
        <DialogContent className="max-w-md" closeLabel={copy.cancel}>
          <DialogHeader>
            <DialogTitle>{copy.barcodeNotFoundTitle}</DialogTitle>
            <DialogDescription>{copy.barcodeNotFoundDescription}</DialogDescription>
          </DialogHeader>

          <div className="px-6 py-5">
            <div className="rounded-2xl border border-border bg-background px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {copy.scannedBarcode}
              </div>
              <div className="mt-1 break-all font-mono text-sm font-semibold text-foreground">
                {pendingScannedBarcode}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={cancelScannedProductCreate}>
              {copy.cancel}
            </Button>
            <Button type="button" variant="primary" onClick={openScannedProductDialog}>
              {copy.addScannedProduct}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductCreateDialog
        businessId={businessId}
        categories={categories}
        units={units}
        defaultValues={scannedProductDefaultValues}
        open={isAddScannedProductOpen}
        onOpenChange={(open) => {
          setIsAddScannedProductOpen(open)
          if (!open) setPendingScannedBarcode(null)
        }}
        onCreated={handleScannedProductCreated}
      />

      {holdsOpen ? (
        <>
          <button
            type="button"
            aria-label={copy.cancel}
            onClick={() => setHoldsOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/40"
          />
          <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md border-l border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <div className="text-base font-semibold">{copy.heldSales}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {holds.length} {holds.length === 1 ? copy.item : copy.items}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHoldsOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:bg-background hover:text-foreground"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <div className="h-[calc(100%-81px)] overflow-y-auto px-5 py-4">
              {holds.length === 0 ? (
                <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background text-muted-foreground">
                    <Icon name="pause" className="h-7 w-7" />
                  </div>
                  <div className="mt-4 text-sm text-muted-foreground">{copy.noHolds}</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {holds.map((hold) => {
                    const holdSubtotal = hold.items.reduce(
                      (sum, item) => sum + item.price * item.qty,
                      0,
                    )
                    const holdDiscount =
                      hold.discount.type === 'percent'
                        ? holdSubtotal * (hold.discount.value / 100)
                        : hold.discount.value
                    const holdTotal = Math.max(0, holdSubtotal - holdDiscount + (hold.chargesAmount ?? 0))

                    return (
                      <div
                        key={hold.id}
                        className="rounded-[24px] border border-border bg-card p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              #{hold.id}
                            </div>
                            <div className="mt-1 text-lg font-bold text-primary dark:text-[#B5D4F4]">
                              {formatAmount(holdTotal, copy.localeTag)} FCFA
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              {hold.items.length} {hold.items.length === 1 ? copy.item : copy.items}
                              {/* {hold.customer ? ` · ${hold.customer.name}` : ''} */}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatDateLabel(hold.createdAt, copy.localeTag)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => resumeHold(hold)}
                            className="inline-flex h-10 items-center justify-center rounded-xl bg-[#185FA5] px-4 text-sm font-semibold text-white transition hover:bg-[#0C447C]"
                          >
                            {copy.resume}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </>
  )
}
