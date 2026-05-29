import type { SaleReceipt } from '@biztrack/types'
import { PaymentMethod } from '@biztrack/types'

export const THERMAL_RECEIPT_PAPER_WIDTH_MM = 58
export const THERMAL_RECEIPT_PRINTABLE_WIDTH_MM = 48
export const THERMAL_RECEIPT_TEXT_COLUMNS = 27

export type SaleReceiptCopy = {
  localeTag: string
  currency: string
  saleLabel: string
  dateLabel: string
  cashierLabel: string
  customerLabel: string
  itemsLabel: string
  totalLabel: string
  phoneLabel: string
  referenceLabel: string
  subtotalLabel: string
  discountLabel: string
  chargesLabel: string
  changeDueLabel: string
  thanksLabel: string
  localUserLabel: string
}

export type PaymentReceiptCopy = {
  localeTag: string
  currency: string
  titleLabel: string
  saleRefLabel: string
  clientLabel: string
  dateLabel: string
  paidLabel: string
  methodLabel: string
  referenceLabel: string
  remainingLabel: string
  thanksLabel: string
}

export function sanitizeReceiptFileName(value: string) {
  const base = Array.from(value.trim())
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
  const cleaned = base
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

  return `${cleaned || 'receipt'}.pdf`
}

function toPdfLiteralString(value: string) {
  const normalized = value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '?')

  return `(${normalized.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`
}

export function downloadReceiptFile(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function isShareCancelled(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function isPrintCancelled(error: unknown) {
  return error instanceof Error && /cancelled|canceled|cancel/i.test(error.message)
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

export function buildReceiptPdfBlob(
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

export function buildSaleReceiptText(
  receipt: SaleReceipt,
  copy: SaleReceiptCopy,
  paymentLabel: (method: PaymentMethod) => string,
) {
  const cols = THERMAL_RECEIPT_TEXT_COLUMNS
  const divider = '-'.repeat(cols)
  const heavyDivider = '='.repeat(cols)
  const amount = (value: number) =>
    new Intl.NumberFormat(copy.localeTag, { maximumFractionDigits: 0 }).format(Math.round(value))
  const dateLabel = new Intl.DateTimeFormat(copy.localeTag, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(receipt.soldAt))

  const lines = [
    centerLine(receipt.businessName.toUpperCase(), cols),
    divider,
    centerLine(copy.saleLabel.toUpperCase(), cols),
    divider,
    `${copy.dateLabel}: ${dateLabel}`,
    `${copy.saleLabel}: ${receipt.saleNumber}`,
    `${copy.cashierLabel}: ${receipt.cashierName || copy.localUserLabel}`,
  ]

  if (receipt.customerName) {
    lines.push(`${copy.customerLabel}: ${receipt.customerName}`)
  }

  lines.push(divider)
  lines.push(padLine(copy.itemsLabel, copy.totalLabel, cols))
  lines.push(divider)

  for (const item of receipt.items) {
    lines.push(padLine(item.name, amount(item.total), cols))
    lines.push(`  ${item.qty} x ${amount(item.unitPrice)} ${copy.currency}`)
  }

  lines.push(divider)
  lines.push(padLine(copy.subtotalLabel, `${amount(receipt.subtotal)} ${copy.currency}`, cols))

  if (receipt.discountLines && receipt.discountLines.length > 0) {
    for (const disc of receipt.discountLines) {
      lines.push(
        padLine(disc.description || copy.discountLabel, `-${amount(disc.amount)} ${copy.currency}`, cols),
      )
    }
  } else if (receipt.discountAmount > 0) {
    lines.push(padLine(copy.discountLabel, `-${amount(receipt.discountAmount)} ${copy.currency}`, cols))
  }

  if (receipt.chargeLines && receipt.chargeLines.length > 0) {
    for (const charge of receipt.chargeLines) {
      lines.push(padLine(charge.name, `+${amount(charge.amount)} ${copy.currency}`, cols))
    }
  } else if (receipt.chargesAmount > 0) {
    lines.push(padLine(copy.chargesLabel, `+${amount(receipt.chargesAmount)} ${copy.currency}`, cols))
  }

  lines.push(heavyDivider)
  lines.push(padLine(copy.totalLabel, `${amount(receipt.totalAmount)} ${copy.currency}`, cols))
  lines.push(heavyDivider)

  for (const payment of receipt.payments) {
    lines.push(
      padLine(paymentLabel(payment.method), `${amount(payment.amount)} ${copy.currency}`, cols),
    )

    if (payment.mobileMoneyReference) {
      lines.push(`${copy.referenceLabel}: ${payment.mobileMoneyReference}`)
    }
  }

  if (receipt.changeGiven > 0) {
    lines.push(
      padLine(copy.changeDueLabel, `${amount(receipt.changeGiven)} ${copy.currency}`, cols),
    )
  }

  if (receipt.customerPhone) {
    lines.push(`${copy.phoneLabel}: ${receipt.customerPhone}`)
  }

  lines.push(divider)
  lines.push(centerLine(copy.thanksLabel, cols))
  lines.push('')

  return lines.join('\n')
}

export function buildPaymentReceiptText(
  payment: {
    amount: number
    method: PaymentMethod
    mobileMoneyReference?: string | null
    paymentDate: string
  },
  sale: { saleNumber: string; customerName?: string | null },
  remaining: number,
  businessName: string,
  copy: PaymentReceiptCopy,
  paymentLabel: (method: PaymentMethod) => string,
) {
  const cols = THERMAL_RECEIPT_TEXT_COLUMNS
  const divider = '-'.repeat(cols)
  const amount = (value: number) =>
    `${copy.currency} ${new Intl.NumberFormat(copy.localeTag, { maximumFractionDigits: 0 }).format(Math.round(value))}`
  const dateLabel = new Intl.DateTimeFormat(copy.localeTag, { dateStyle: 'medium' }).format(
    new Date(`${payment.paymentDate}T00:00:00`),
  )

  const lines = [
    centerLine(businessName.toUpperCase(), cols),
    divider,
    centerLine(copy.titleLabel.toUpperCase(), cols),
    divider,
    `${copy.saleRefLabel}: ${sale.saleNumber}`,
  ]

  if (sale.customerName) {
    lines.push(`${copy.clientLabel}: ${sale.customerName}`)
  }

  lines.push(`${copy.dateLabel}: ${dateLabel}`)
  lines.push(divider)
  lines.push(padLine(copy.paidLabel, amount(payment.amount), cols))
  lines.push(padLine(copy.methodLabel, paymentLabel(payment.method), cols))

  if (payment.mobileMoneyReference) {
    lines.push(padLine(copy.referenceLabel, payment.mobileMoneyReference, cols))
  }

  lines.push(divider)
  lines.push(padLine(copy.remainingLabel, amount(remaining), cols))
  lines.push(divider)
  lines.push(centerLine(copy.thanksLabel, cols))
  lines.push('')

  return lines.join('\n')
}
