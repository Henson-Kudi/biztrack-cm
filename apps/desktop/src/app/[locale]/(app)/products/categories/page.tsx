'use client'

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Badge, Button, Spinner } from '@biztrack/ui'
import { toast } from 'sonner'
import type { PaginatedResult, ProductCategory } from '@biztrack/types'
import { PaginationControls } from '@/components/catalog/PaginationControls'
import { SurfaceCard } from '@/components/catalog/SurfaceCard'
import { CategoryDialog } from '@/components/products/CategoryDialog'
import { ResourceActionMenu } from '@/components/products/ResourceActionMenu'
import { ViewModeToggle } from '@/components/products/ViewModeToggle'
import { getCategoryErrorMessage } from '@/components/products/resource-error-messages'
import { formatDateLabel } from '@/components/products/product-utils'
import {
  deleteCategoryLocal,
  fetchProductRowsForBusiness,
  listCategoriesLocal,
  restoreCategoryLocal,
  setCategoryActiveStateLocal,
  type ProductRow,
} from '@/services/products.local'
import { useAuthStore } from '@/stores/auth.store'

type ViewMode = 'list' | 'grid'

type CategorySummary = {
  category: ProductCategory
  productCount: number
}

const PAGE_SIZE = 12

export default function ProductCategoriesPage() {
  const t = useTranslations('app.products')
  const locale = useLocale()
  const businessId = useAuthStore((state) => state.businessId)
  const role = useAuthStore((state) => state.role)
  const [categories, setCategories] = useState<PaginatedResult<ProductCategory> | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [page, setPage] = useState(1)
  const [productCounts, setProductCounts] = useState<Record<string, number>>({})
  const [uncategorizedCount, setUncategorizedCount] = useState(0)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null)
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(null)

  const translateKey = (key: string) => t(key as never)
  const canUndoDelete = String(role ?? '') === 'SUPER_ADMIN'

  useEffect(() => {
    if (!businessId) {
      setCategories(null)
      setLoading(false)
      return
    }

    const currentBusinessId = businessId
    let active = true

    async function loadCategories() {
      setLoading(true)
      setError(null)

      try {
        const [categoriesResult, productRows] = await Promise.all([
          listCategoriesLocal(currentBusinessId, {
            page,
            limit: PAGE_SIZE,
            sortBy: 'sortOrder',
            sortOrder: 'ASC',
            search: deferredSearch.trim() || undefined,
            includeInactive: true,
          }),
          fetchProductRowsForBusiness(currentBusinessId),
        ])

        if (!active) {
          return
        }

        const countByCategory = new Map<string, number>()
        let nextUncategorizedCount = 0

        for (const row of productRows as ProductRow[]) {
          if (!row.category_id) {
            nextUncategorizedCount += 1
            continue
          }

          countByCategory.set(row.category_id, (countByCategory.get(row.category_id) ?? 0) + 1)
        }

        setCategories(categoriesResult)
        setProductCounts(Object.fromEntries(countByCategory.entries()))
        setUncategorizedCount(nextUncategorizedCount)
      } catch (loadError) {
        if (!active) {
          return
        }

        setError(
          getCategoryErrorMessage(loadError, translateKey, t('errors.category_load')),
        )
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadCategories()

    return () => {
      active = false
    }
  }, [businessId, deferredSearch, page, reloadKey, t])

  useEffect(() => {
    if (!categories || categories.totalPages === 0 || page <= categories.totalPages) {
      return
    }

    setPage(categories.totalPages)
  }, [categories, page])

  const items = useMemo<CategorySummary[]>(
    () =>
      (categories?.data ?? []).map((category) => ({
        category,
        productCount: productCounts[category.id] ?? 0,
      })),
    [categories, productCounts],
  )

  const handleToggleActive = async (category: ProductCategory) => {
    if (!businessId) {
      toast.error(t('errors.business_required'))
      return
    }

    setBusyCategoryId(category.id)

    try {
      const isActive = category.isActive !== false
      await setCategoryActiveStateLocal(businessId, category.id, !isActive)
      toast.success(
        isActive
          ? t('categories_page.inactive_success')
          : t('categories_page.active_success'),
      )
      setReloadKey((current) => current + 1)
    } catch (actionError) {
      toast.error(
        getCategoryErrorMessage(actionError, translateKey, t('errors.category_toggle')),
      )
    } finally {
      setBusyCategoryId(null)
    }
  }

  const handleDelete = async (category: ProductCategory) => {
    if (!businessId) {
      toast.error(t('errors.business_required'))
      return
    }

    if (
      !window.confirm(
        canUndoDelete
          ? t('categories_page.delete_confirm_super_admin')
          : t('categories_page.delete_confirm'),
      )
    ) {
      return
    }

    setBusyCategoryId(category.id)

    try {
      await deleteCategoryLocal(businessId, category.id)

      if (canUndoDelete) {
        toast.success(t('categories_page.delete_success'), {
          action: {
            label: t('actions.undo_delete'),
            onClick: () => {
              void handleUndoDelete(category.id)
            },
          },
        })
      } else {
        toast.success(t('categories_page.delete_success'))
      }

      setReloadKey((current) => current + 1)
    } catch (actionError) {
      toast.error(
        getCategoryErrorMessage(actionError, translateKey, t('errors.category_delete')),
      )
    } finally {
      setBusyCategoryId(null)
    }
  }

  const handleUndoDelete = async (categoryId: string) => {
    if (!businessId) {
      toast.error(t('errors.business_required'))
      return
    }

    setBusyCategoryId(categoryId)

    try {
      await restoreCategoryLocal(businessId, categoryId)
      toast.success(t('categories_page.undo_delete_success'))
      setReloadKey((current) => current + 1)
    } catch (actionError) {
      toast.error(
        getCategoryErrorMessage(actionError, translateKey, t('errors.category_restore')),
      )
    } finally {
      setBusyCategoryId(null)
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
            {t('categories_page.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('categories_page.description')}</p>
        </div>

        <SurfaceCard
          action={
            <div className="flex flex-wrap items-center gap-2">
              <ViewModeToggle
                value={viewMode}
                onChange={setViewMode}
                listLabel={t('categories_page.views.list')}
                gridLabel={t('categories_page.views.grid')}
              />
              <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
                {t('actions.add_category')}
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
                placeholder={t('categories_page.search_placeholder')}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {t('categories_page.summary', {
                total: categories?.total ?? 0,
                uncategorized: uncategorizedCount,
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
                {t('categories_page.empty_title')}
              </h4>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                {t('categories_page.empty_description')}
              </p>
            </div>
          ) : viewMode === 'list' ? (
            <div className="overflow-hidden rounded-2xl border border-border">
              <div className="divide-y divide-border bg-card">
                {items.map(({ category, productCount }) => {
                  const isActive = category.isActive !== false

                  return (
                    <div
                      key={category.id}
                      className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-4">
                        <ColorSwatch color={category.color} />
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-semibold text-foreground">
                              {category.name}
                            </h3>
                            <Badge variant={isActive ? 'success' : 'neutral'}>
                              {isActive
                                ? t('categories_page.badges.active')
                                : t('categories_page.badges.inactive')}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {category.icon || t('categories_page.no_icon')}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3 lg:min-w-[430px] lg:grid-cols-3">
                        <DetailMeta
                          label={t('categories_page.fields.products')}
                          value={t('categories_page.product_count', { count: productCount })}
                        />
                        <DetailMeta
                          label={t('categories_page.fields.sort_order')}
                          value={String(category.sortOrder ?? 0)}
                        />
                        <DetailMeta
                          label={t('categories_page.fields.updated_at')}
                          value={formatDateLabel(category.updatedAt, locale)}
                        />
                      </div>

                      <div className="self-start lg:self-center">
                        <ResourceActionMenu
                          label={t('actions.more_actions')}
                          orientation="horizontal"
                          items={[
                            {
                              label: t('actions.update_category'),
                              onSelect: () => setEditingCategory(category),
                              disabled: busyCategoryId === category.id,
                            },
                            {
                              label: isActive ? t('actions.deactivate') : t('actions.activate'),
                              onSelect: () => void handleToggleActive(category),
                              disabled: busyCategoryId === category.id,
                            },
                            {
                              label: t('actions.delete'),
                              onSelect: () => void handleDelete(category),
                              disabled: busyCategoryId === category.id,
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
              {items.map(({ category, productCount }) => {
                const isActive = category.isActive !== false

                return (
                  <div
                    key={category.id}
                    className="rounded-2xl border border-border bg-background/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <ColorSwatch color={category.color} />
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold text-foreground">
                            {category.name}
                          </h3>
                          <p className="truncate text-sm text-muted-foreground">
                            {category.icon || t('categories_page.no_icon')}
                          </p>
                        </div>
                      </div>
                      <ResourceActionMenu
                        label={t('actions.more_actions')}
                        orientation="vertical"
                        items={[
                          {
                            label: t('actions.update_category'),
                            onSelect: () => setEditingCategory(category),
                            disabled: busyCategoryId === category.id,
                          },
                          {
                            label: isActive ? t('actions.deactivate') : t('actions.activate'),
                            onSelect: () => void handleToggleActive(category),
                            disabled: busyCategoryId === category.id,
                          },
                          {
                            label: t('actions.delete'),
                            onSelect: () => void handleDelete(category),
                            disabled: busyCategoryId === category.id,
                            tone: 'danger',
                          },
                        ]}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge variant={isActive ? 'success' : 'neutral'}>
                        {isActive
                          ? t('categories_page.badges.active')
                          : t('categories_page.badges.inactive')}
                      </Badge>
                      <Badge variant="info">
                        {t('categories_page.product_count', { count: productCount })}
                      </Badge>
                    </div>

                    <div className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                      <DetailMeta
                        label={t('categories_page.fields.sort_order')}
                        value={String(category.sortOrder ?? 0)}
                      />
                      <DetailMeta
                        label={t('categories_page.fields.updated_at')}
                        value={formatDateLabel(category.updatedAt, locale)}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-4">
            <PaginationControls
              page={categories?.page ?? 1}
              totalPages={categories?.totalPages ?? 1}
              pageLabel={t('pagination.page_label', {
                page: categories?.page ?? 1,
                totalPages: categories?.totalPages ?? 1,
              })}
              previousLabel={t('pagination.previous')}
              nextLabel={t('pagination.next')}
              onPrevious={() => setPage((current) => Math.max(current - 1, 1))}
              onNext={() =>
                setPage((current) =>
                  Math.min(current + 1, categories?.totalPages ?? current + 1),
                )
              }
            />
          </div>
        </SurfaceCard>
      </div>

      <CategoryDialog
        businessId={businessId}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSaved={() => {
          setPage(1)
          setReloadKey((current) => current + 1)
        }}
      />

      <CategoryDialog
        businessId={businessId}
        category={editingCategory}
        open={Boolean(editingCategory)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCategory(null)
          }
        }}
        onSaved={() => {
          setReloadKey((current) => current + 1)
          setEditingCategory(null)
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

function ColorSwatch({ color }: { color?: string | null }) {
  return (
    <div
      className="h-12 w-12 shrink-0 rounded-2xl border border-border"
      style={{ backgroundColor: color || '#E5E7EB' }}
    />
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
