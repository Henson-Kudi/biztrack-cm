'use client'

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Badge, Button, Input, Spinner } from '@biztrack/ui'
import type {
  PaginatedResult,
  Product,
  ProductCategory,
  ProductsQuery,
  UnitOfMeasure,
} from '@biztrack/types'
import { PaginationControls } from '@/components/catalog/PaginationControls'
import { SurfaceCard } from '@/components/catalog/SurfaceCard'
import { ProductCreateDialog } from '@/components/products/ProductCreateDialog'
import {
  buildProductDetailHref,
  formatDateLabel,
  formatProductPrice,
  formatQuantity,
  isLowStockProduct,
} from '@/components/products/product-utils'
import { CommandSelect, type CommandSelectOption } from '@/components/ui/command-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { getApiErrorMessage } from '@/services/api-response'
import {
  listCategoriesLocal,
  listProductsLocal,
  listUnitOfMeasuresLocal,
} from '@/services/products.local'
import { useAuthStore } from '@/stores/auth.store'
import { usePlanStore } from '@/stores/plan.store'

type ActivityFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'
type TypeFilter = 'ALL' | 'TRACKED' | 'SERVICE'

export default function ProductsListPage() {
  const t = useTranslations('app.products')
  const planGateT = useTranslations('app.plan_gate')
  const locale = useLocale()
  const router = useRouter()
  const businessId = useAuthStore((state) => state.businessId)
  const businessCurrency = useAuthStore((state) => state.businessCurrency)
  const planState = usePlanStore((state) => state.current)
  const [products, setProducts] = useState<PaginatedResult<Product> | null>(null)
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [units, setUnits] = useState<UnitOfMeasure[]>([])
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('ACTIVE')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL')
  const [categoryId, setCategoryId] = useState('')
  const [selectedCategoryOption, setSelectedCategoryOption] = useState<CommandSelectOption | null>(
    null,
  )
  const [page, setPage] = useState(1)
  const [reloadKey, setReloadKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [metadataLoading, setMetadataLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
      setProducts(null)
      setLoading(false)
      return
    }

    const currentBusinessId = businessId
    let active = true

    async function loadProducts() {
      setLoading(true)
      setError(null)

      try {
        const query: ProductsQuery = {
          page,
          limit: 12,
          sortBy: 'updatedAt',
          sortOrder: 'DESC',
          search: deferredSearch.trim() || undefined,
          categoryId: categoryId || undefined,
          isActive: activityFilter === 'ALL' ? undefined : activityFilter === 'ACTIVE',
          isService: typeFilter === 'SERVICE' ? true : undefined,
          trackInventory: typeFilter === 'TRACKED' ? true : undefined,
        }

        const result = await listProductsLocal(currentBusinessId, query)

        if (!active) {
          return
        }

        setProducts(result)
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

    void loadProducts()

    return () => {
      active = false
    }
  }, [activityFilter, businessId, categoryId, deferredSearch, page, reloadKey, t, typeFilter])

  const rows = useMemo(() => products?.data ?? [], [products])
  const productsQuotaUsage =
    planState?.quotaUsage.find((entry) => entry.resource === 'products' && !entry.unlimited) ?? null
  const productsQuotaReached = Boolean(
    productsQuotaUsage && productsQuotaUsage.used >= (productsQuotaUsage.limit ?? 0),
  )
  const allCategoriesOption = useMemo<CommandSelectOption>(
    () => ({
      value: 'ALL',
      label: t('filters.all_categories'),
      keywords: [t('filters.category')],
    }),
    [t],
  )
  const categoryOptions = useMemo<CommandSelectOption[]>(
    () =>
      categories.map((category) => ({
        value: category.id,
        label: category.name,
        imageUrl: category.imageUrl ?? null,
        keywords: [category.name],
      })),
    [categories],
  )
  const resolvedSelectedCategoryOption = useMemo(() => {
    if (!categoryId) {
      return allCategoriesOption
    }

    const matchedCategory = categories.find((category) => category.id === categoryId)
    if (matchedCategory) {
      return {
        value: matchedCategory.id,
        label: matchedCategory.name,
        imageUrl: matchedCategory.imageUrl ?? null,
        keywords: [matchedCategory.name],
      }
    }

    return selectedCategoryOption
  }, [allCategoriesOption, categories, categoryId, selectedCategoryOption])
  const loadCategoryOptions = useCallback(
    async ({ search: searchTerm, page: nextPage }: { search: string; page: number }) => {
      if (!businessId) {
        return {
          data: [],
          total: 0,
          page: nextPage,
          limit: 20,
          totalPages: 1,
        }
      }

      const result = await listCategoriesLocal(businessId, {
        page: nextPage,
        limit: 20,
        sortBy: 'name',
        sortOrder: 'ASC',
        search: searchTerm || undefined,
      })

      return {
        ...result,
        data: result.data.map((category) => ({
          value: category.id,
          label: category.name,
          imageUrl: category.imageUrl ?? null,
          keywords: [category.name],
        })),
      }
    },
    [businessId],
  )

  useEffect(() => {
    if (!businessId || !categoryId) {
      setSelectedCategoryOption(allCategoriesOption)
    }
  }, [allCategoriesOption, businessId, categoryId])

  const goToProduct = (productId: string) => {
    router.push(buildProductDetailHref(locale, productId))
  }

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, productId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      goToProduct(productId)
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
            {t('list.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('list.description')}</p>
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

        <SurfaceCard>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => router.back()} className="px-0">
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
              <span>{t('actions.back')}</span>
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                onClick={() => setIsAddProductOpen(true)}
                disabled={metadataLoading || productsQuotaReached}
              >
                {t('actions.add_product')}
              </Button>
              <Button variant="secondary" onClick={() => setReloadKey((current) => current + 1)}>
                {t('actions.refresh')}
              </Button>
            </div>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Input
              label={t('filters.search')}
              value={search}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder={t('filters.search_placeholder')}
            />

            <div className="space-y-1">
              <span className="text-sm font-medium text-foreground">{t('filters.category')}</span>
              <CommandSelect
                value={categoryId || 'ALL'}
                onChange={(value, option) => {
                  setCategoryId(value === 'ALL' ? '' : value)
                  setSelectedCategoryOption(value === 'ALL' ? allCategoriesOption : option ?? null)
                  setPage(1)
                }}
                options={categoryOptions}
                staticOptions={[allCategoriesOption]}
                selectedOption={resolvedSelectedCategoryOption}
                loadOptions={loadCategoryOptions}
                placeholder={t('filters.all_categories')}
                searchPlaceholder={t('form.search_categories')}
                emptyMessage={t('form.no_categories')}
                loadingMessage={t('form.loading_options')}
                loadMoreLabel={t('form.load_more')}
                showAvatar={false}
                disabled={!businessId}
              />
            </div>

            <div className="space-y-1">
              <span className="text-sm font-medium text-foreground">{t('filters.activity')}</span>
              <Select
                value={activityFilter}
                onValueChange={(value) => {
                  setActivityFilter(value as ActivityFilter)
                  setPage(1)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('filters.all_statuses')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('filters.all_statuses')}</SelectItem>
                  <SelectItem value="ACTIVE">{t('filters.active_only')}</SelectItem>
                  <SelectItem value="INACTIVE">{t('filters.inactive_only')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <span className="text-sm font-medium text-foreground">{t('filters.product_type')}</span>
              <Select
                value={typeFilter}
                onValueChange={(value) => {
                  setTypeFilter(value as TypeFilter)
                  setPage(1)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('filters.all_types')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('filters.all_types')}</SelectItem>
                  <SelectItem value="TRACKED">{t('filters.tracked_only')}</SelectItem>
                  <SelectItem value="SERVICE">{t('filters.services_only')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {loading || metadataLoading ? (
            <div className="flex min-h-[420px] items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background px-6 text-center">
              <h4 className="text-lg font-semibold text-foreground">{t('empty.title')}</h4>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                {t('empty.description')}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-2xl border border-border">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          {t('table.product')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          {t('table.category')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          {t('table.unit')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          {t('table.status')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          {t('table.price')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          {t('table.stock')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          {t('table.updated')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {rows.map((product) => {
                        const lowStock = isLowStockProduct(product)

                        return (
                          <tr
                            key={product.id}
                            tabIndex={0}
                            onClick={() => goToProduct(product.id)}
                            onKeyDown={(event) => handleRowKeyDown(event, product.id)}
                            className="cursor-pointer transition-colors hover:bg-primary/5 focus:bg-primary/5 focus:outline-none"
                          >
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xs font-semibold text-primary">
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
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-foreground">
                                    {product.name}
                                  </p>
                                  <p className="truncate text-sm text-muted-foreground">
                                    {product.sku || product.barcode || t('table.no_identifier')}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-sm text-muted-foreground">
                              {product.category?.name || t('list.uncategorized')}
                            </td>
                            <td className="px-4 py-4 text-sm text-muted-foreground">
                              {product.unitOfMeasure?.abbreviation || t('list.no_unit')}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex flex-wrap gap-2">
                                <Badge variant={product.isActive ? 'success' : 'neutral'}>
                                  {product.isActive ? t('badges.active') : t('badges.inactive')}
                                </Badge>
                                <Badge variant={product.isService ? 'info' : 'neutral'}>
                                  {product.isService
                                    ? t('badges.service')
                                    : t('badges.product')}
                                </Badge>
                                {lowStock ? (
                                  <Badge variant="warning">{t('badges.low_stock')}</Badge>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-sm font-medium text-foreground">
                              {formatProductPrice(product, locale, businessCurrency)}
                            </td>
                            <td className="px-4 py-4">
                              <p
                                className={cn(
                                  'text-sm font-medium',
                                  lowStock ? 'text-amber-600' : 'text-foreground',
                                )}
                              >
                                {product.trackInventory
                                  ? formatQuantity(product.currentStock)
                                  : t('list.not_tracked')}
                              </p>
                              {product.trackInventory ? (
                                <p className="text-xs text-muted-foreground">
                                  {t('list.threshold')}: {formatQuantity(product.lowStockThreshold)}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-4 py-4 text-sm text-muted-foreground">
                              {formatDateLabel(product.updatedAt, locale)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4">
                <PaginationControls
                  page={products?.page ?? 1}
                  totalPages={products?.totalPages ?? 1}
                  pageLabel={t('pagination.page_label', {
                    page: products?.page ?? 1,
                    totalPages: products?.totalPages ?? 1,
                  })}
                  previousLabel={t('pagination.previous')}
                  nextLabel={t('pagination.next')}
                  onPrevious={() => setPage((current) => Math.max(current - 1, 1))}
                  onNext={() =>
                    setPage((current) =>
                      Math.min(current + 1, products?.totalPages ?? current + 1),
                    )
                  }
                />
              </div>
            </>
          )}
        </SurfaceCard>
      </div>

      <ProductCreateDialog
        businessId={businessId}
        categories={categories}
        units={units}
        open={isAddProductOpen}
        onOpenChange={setIsAddProductOpen}
        onCreated={() => {
          setPage(1)
          setReloadKey((current) => current + 1)
        }}
        quotaReached={productsQuotaReached}
      />
    </>
  )
}
