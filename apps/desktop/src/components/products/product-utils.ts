'use client'

import type { Product, UnitOfMeasure } from '@biztrack/types'

export function formatQuantity(value?: number | null) {
  if (value === null || value === undefined) return '-'

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 3,
  }).format(value)
}

export function formatProductPrice(
  product: Pick<Product, 'sellingPrice' | 'currency'>,
  locale: string,
  businessCurrency: string,
) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: product.currency || businessCurrency,
    maximumFractionDigits: 0,
  }).format(product.sellingPrice)
}

export function formatDateLabel(value?: string | null, locale?: string) {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function isServiceUnit(unit?: Pick<UnitOfMeasure, 'name' | 'abbreviation'> | null) {
  if (!unit) return false

  const normalizedName = unit.name.trim().toLowerCase()
  const normalizedAbbreviation = unit.abbreviation?.trim().toLowerCase()

  return normalizedName === 'service' || normalizedAbbreviation === 'svc'
}

export function isQuantityUnit(unit?: Pick<UnitOfMeasure, 'name' | 'abbreviation'> | null) {
  if (!unit) return false

  const normalizedName = unit.name.trim().toLowerCase()
  const normalizedAbbreviation = unit.abbreviation?.trim().toLowerCase()

  return normalizedName === 'qty' || normalizedAbbreviation === 'qty'
}

export function resolveFallbackUnit(units: UnitOfMeasure[]) {
  return (
    units.find((unit) => isQuantityUnit(unit) && !isServiceUnit(unit)) ??
    units.find((unit) => unit.isDefault && !isServiceUnit(unit)) ??
    units.find((unit) => !isServiceUnit(unit)) ??
    units[0] ??
    null
  )
}

export function isLowStockProduct(
  product: Pick<Product, 'trackInventory' | 'currentStock' | 'lowStockThreshold'>,
) {
  return Boolean(
    product.trackInventory &&
      product.currentStock !== null &&
      product.currentStock !== undefined &&
      product.lowStockThreshold !== null &&
      product.lowStockThreshold !== undefined &&
      product.currentStock <= product.lowStockThreshold,
  )
}

export function buildProductDetailHref(locale: string, productId: string) {
  return `/${locale}/products/detail?productId=${encodeURIComponent(productId)}`
}
