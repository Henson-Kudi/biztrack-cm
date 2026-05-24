'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { Badge, Button, Spinner } from '@biztrack/ui'
import type {
  LowStockProduct,
  PaginatedResult,
  Product,
  ProductCategory,
  UnitOfMeasure,
} from '@biztrack/types'
import { MetricCard } from '@/components/catalog/MetricCard'
import { SurfaceCard } from '@/components/catalog/SurfaceCard'
import { ProductCreateDialog } from '@/components/products/ProductCreateDialog'
import {
  buildProductDetailHref,
  formatProductPrice,
  formatQuantity,
  isLowStockProduct,
} from '@/components/products/product-utils'
import { cn } from '@/lib/utils'
import { getApiErrorMessage } from '@/services/api-response'
import {
  listCategoriesLocal,
  listLowStockProductsLocal,
  listProductsLocal,
  listUnitOfMeasuresLocal,
} from '@/services/products.local'
import { useAuthStore } from '@/stores/auth.store'
import { usePlanStore } from '@/stores/plan.store'

export default function ProductsPage() {
  const t = useTranslations('app.products')
  const planGateT = useTranslations('app.plan_gate')
  const locale = useLocale()
  const businessId = useAuthStore((state) => state.businessId)
  const planState = usePlanStore((state) => state.current)
  const [recentProducts, setRecentProducts] = useState<PaginatedResult<Product> | null>(null)
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [units, setUnits] = useState<UnitOfMeasure[]>([])
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [metadataLoading, setMetadataLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [isAddProductOpen, setIsAddProductOpen] = useState(false)

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

        setError(getApiErrorMessage(loadError, t('errors.metadata')))
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
    if (!businessId) {
      setRecentProducts(null)
      setLowStockProducts([])
      setLoading(false)
      return
    }

    const currentBusinessId = businessId
    let active = true

    async function loadOverview() {
      setLoading(true)
      setError(null)

      try {
        const [productsResult, lowStockResult] = await Promise.all([
          listProductsLocal(currentBusinessId, {
            page: 1,
            limit: 5,
            sortBy: 'updatedAt',
            sortOrder: 'DESC',
          }),
          listLowStockProductsLocal(currentBusinessId),
        ])

        if (!active) {
          return
        }

        setRecentProducts(productsResult)
        setLowStockProducts(lowStockResult)
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

    void loadOverview()

    return () => {
      active = false
    }
  }, [businessId, reloadKey, t])

  const recentItems = recentProducts?.data ?? []
  const totalProducts = recentProducts?.total ?? 0
  const productsQuotaUsage =
    planState?.quotaUsage.find((entry) => entry.resource === 'products' && !entry.unlimited) ?? null
  const productsQuotaReached = Boolean(
    productsQuotaUsage && productsQuotaUsage.used >= (productsQuotaUsage.limit ?? 0),
  )

  return (
    <>
      <div className="space-y-6">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
            {t('eyebrow')}
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">
            {t('title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        {productsQuotaReached ? (
          <p className="text-sm text-muted-foreground">
            {planGateT.rich('quota_hint', {
              link: (chunks) => (
                <a
                  href={`/${locale}/subscription`}
                  className="font-medium text-primary underline underline-offset-2"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label={t('metrics.total_products')}
            value={String(totalProducts)}
            hint={t('metrics.total_products_hint')}
          />
          <MetricCard
            label={t('metrics.low_stock')}
            value={String(lowStockProducts.length)}
            hint={t('metrics.low_stock_hint')}
            tone={lowStockProducts.length > 0 ? 'warning' : 'default'}
          />
          <MetricCard
            label={t('metrics.categories')}
            value={String(categories.length)}
            hint={t('metrics.categories_hint')}
            tone="accent"
          />
          <MetricCard
            label={t('metrics.units')}
            value={String(units.length)}
            hint={t('metrics.units_hint')}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(300px,0.9fr)]">
          <SurfaceCard
            title={t('recent.title')}
            description={t('recent.description')}
            className="min-h-[560px]"
            action={
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  onClick={() => setIsAddProductOpen(true)}
                  disabled={metadataLoading || productsQuotaReached}
                >
                  {t('actions.add_product')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setReloadKey((current) => current + 1)}
                >
                  {t('actions.refresh')}
                </Button>
              </div>
            }
          >
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-primary/20 bg-primary/5 px-4 py-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{t('recent.cta_title')}</p>
                <p className="text-sm text-muted-foreground">{t('recent.cta_description')}</p>
              </div>
              <Link
                href={`/${locale}/products/list`}
                className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
              >
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
                  <path d="M4 5h12" />
                  <path d="M4 10h12" />
                  <path d="M4 15h12" />
                  <path d="M15 4l2 1-2 1" />
                  <path d="M15 9l2 1-2 1" />
                  <path d="M15 14l2 1-2 1" />
                </svg>
                <span>{t('recent.cta_link')}</span>
              </Link>
            </div>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {loading || metadataLoading ? (
              <div className="flex min-h-[320px] items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : recentItems.length === 0 ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background px-6 text-center">
                <h4 className="text-lg font-semibold text-foreground">{t('recent.empty_title')}</h4>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  {t('recent.empty_description')}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentItems.map((product) => {
                  const isLowStock = isLowStockProduct(product)

                  return (
                    <Link
                      key={product.id}
                      href={buildProductDetailHref(locale, product.id)}
                      className="block rounded-2xl border border-border bg-background/60 p-4 transition-colors hover:border-primary/30 hover:bg-background"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-sm font-semibold text-primary">
                            {product.primaryImageUrl ? (
                              <img
                                src={product.primaryImageUrl}
                                alt={product.name}
                                className="h-full w-full rounded-2xl object-cover"
                              />
                            ) : (
                              product.name.slice(0, 2).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0 space-y-2">
                            <div>
                              <h4 className="truncate text-base font-semibold text-foreground">
                                {product.name}
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                {product.category?.name || t('list.uncategorized')}
                                {' | '}
                                {product.unitOfMeasure?.abbreviation || t('list.no_unit')}
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
                                {product.trackInventory
                                  ? t('badges.tracked')
                                  : t('badges.untracked')}
                              </Badge>
                              {isLowStock ? (
                                <Badge variant="warning">{t('badges.low_stock')}</Badge>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-2 text-right sm:grid-cols-2 sm:text-left lg:text-right">
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                              {t('list.price')}
                            </p>
                            <p className="text-base font-semibold text-foreground">
                              {formatProductPrice(product, locale)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                              {t('list.stock')}
                            </p>
                            <p
                              className={cn(
                                'text-base font-semibold',
                                isLowStock ? 'text-amber-600' : 'text-foreground',
                              )}
                            >
                              {product.trackInventory
                                ? formatQuantity(product.currentStock)
                                : t('list.not_tracked')}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                        {product.sku ? (
                          <p>
                            <span className="font-medium text-foreground">{t('list.sku')}:</span>{' '}
                            {product.sku}
                          </p>
                        ) : null}
                        {product.barcode ? (
                          <p>
                            <span className="font-medium text-foreground">
                              {t('list.barcode')}:
                            </span>{' '}
                            {product.barcode}
                          </p>
                        ) : null}
                        {product.trackInventory ? (
                          <p>
                            <span className="font-medium text-foreground">
                              {t('list.threshold')}:
                            </span>{' '}
                            {formatQuantity(product.lowStockThreshold)}
                          </p>
                        ) : null}
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard title={t('low_stock.title')} description={t('low_stock.description')}>
            {loading ? (
              <div className="flex min-h-[220px] items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : lowStockProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('low_stock.empty')}</p>
            ) : (
              <div className="space-y-3">
                {lowStockProducts.slice(0, 5).map((item) => (
                  <Link
                    key={item.productId}
                    href={buildProductDetailHref(locale, item.productId)}
                    className="block rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 transition-colors hover:border-amber-300 hover:bg-amber-100/70"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{item.productName || '-'}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.categoryName || t('list.uncategorized')}
                          {' | '}
                          {item.unitOfMeasure || t('list.no_unit')}
                        </p>
                      </div>
                      <Badge variant="warning">
                        {formatQuantity(item.currentQuantity)} /{' '}
                        {formatQuantity(item.lowStockThreshold)}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </SurfaceCard>
        </div>
      </div>

      <ProductCreateDialog
        businessId={businessId}
        categories={categories}
        units={units}
        open={isAddProductOpen}
        onOpenChange={setIsAddProductOpen}
        onCreated={() => setReloadKey((current) => current + 1)}
        quotaReached={productsQuotaReached}
      />
    </>
  )
}
