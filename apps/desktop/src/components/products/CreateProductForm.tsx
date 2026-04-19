'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Button, Input, NumberInput } from '@biztrack/ui'
import {
  type CreateProductRequest,
  type Product,
  type ProductCategory,
  type UnitOfMeasure,
  type UpdateProductRequest,
} from '@biztrack/types'
import { cn } from '@/lib/utils'
import { getApiErrorMessage } from '@/services/api-response'
import {
  ProductLocalError,
  createProductLocal,
  findCreateProductConflictsLocal,
  isValidProductBarcodeCandidate,
  isValidProductSkuCandidate,
  listCategoriesLocal,
  listUnitOfMeasuresLocal,
  updateProductLocal,
} from '@/services/products.local'
import { CommandSelect, type CommandSelectOption } from '@/components/ui/command-select'
import { Form, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

type ProductFormMode = 'create' | 'update'

type ProductFormValues = {
  name: string
  description: string
  sku: string
  barcode: string
  sellingPrice: string
  costPrice: string
  taxRate: string
  openingStock: string
  lowStockThreshold: string
  imageUrl: string
  categoryId: string
  unitOfMeasureId: string
  isService: boolean
  trackInventory: boolean
  isActive: boolean
}

type CreateProductFormProps = {
  businessId: string | null
  categories: ProductCategory[]
  units: UnitOfMeasure[]
  defaultUnitId?: string
  mode?: ProductFormMode
  product?: Product | null
  onCancel: () => void
  onSaved: (product: Product) => void
}

const textareaClassName =
  'block min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60'

function createInitialProductForm(
  defaultUnitId?: string,
  product?: Product | null,
): ProductFormValues {
  if (!product) {
    return {
      name: '',
      description: '',
      sku: '',
      barcode: '',
      sellingPrice: '',
      costPrice: '',
      taxRate: '0',
      openingStock: '',
      lowStockThreshold: '',
      imageUrl: '',
      categoryId: '',
      unitOfMeasureId: defaultUnitId ?? '',
      isService: false,
      trackInventory: true,
      isActive: true,
    }
  }

  return {
    name: product.name,
    description: product.description ?? '',
    sku: product.sku ?? '',
    barcode: product.barcode ?? '',
    sellingPrice: String(product.sellingPrice),
    costPrice:
      product.costPrice !== null && product.costPrice !== undefined ? String(product.costPrice) : '',
    taxRate: String(product.taxRate ?? 0),
    openingStock:
      product.currentStock !== null && product.currentStock !== undefined
        ? String(product.currentStock)
        : '',
    lowStockThreshold:
      product.lowStockThreshold !== null && product.lowStockThreshold !== undefined
        ? String(product.lowStockThreshold)
        : '',
    imageUrl: product.primaryImageUrl ?? product.imageUrl ?? '',
    categoryId: product.category?.id ?? product.categoryId ?? '',
    unitOfMeasureId: product.unitOfMeasure?.id ?? defaultUnitId ?? '',
    isService: product.isService,
    trackInventory: product.trackInventory,
    isActive: product.isActive,
  }
}

function toOptionalString(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function toOptionalNumber(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
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

function isServiceUnit(unit?: Pick<UnitOfMeasure, 'name' | 'abbreviation'> | null) {
  if (!unit) return false

  const normalizedName = unit.name.trim().toLowerCase()
  const normalizedAbbreviation = unit.abbreviation?.trim().toLowerCase()

  return normalizedName === 'service' || normalizedAbbreviation === 'svc'
}

function toCategoryOption(category: Pick<ProductCategory, 'id' | 'name' | 'imageUrl'>): CommandSelectOption {
  return {
    value: category.id,
    label: category.name,
    imageUrl: category.imageUrl ?? null,
  }
}

function toUnitOption(unit: Pick<UnitOfMeasure, 'id' | 'name' | 'abbreviation'>): CommandSelectOption {
  return {
    value: unit.id,
    label: unit.abbreviation ? `${unit.name} (${unit.abbreviation})` : unit.name,
    keywords: [unit.name, unit.abbreviation ?? ''],
  }
}

function TooltipHint({ content }: { content: string }) {
  return (
    <span className="group relative inline-flex items-center">
      <span
        tabIndex={0}
        title={content}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-[11px] font-semibold text-muted-foreground outline-none transition-colors group-hover:border-primary/40 group-focus-within:border-primary/40"
        aria-label={content}
      >
        ?
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full z-10 hidden w-64 -translate-x-1/2 rounded-xl border border-border bg-card px-3 py-2 text-xs leading-5 text-card-foreground shadow-xl group-hover:block group-focus-within:block">
        {content}
      </span>
    </span>
  )
}

function createProductFormSchema(
  categories: ProductCategory[],
  units: UnitOfMeasure[],
  mode: ProductFormMode,
  t: ReturnType<typeof useTranslations<'app.products'>>,
) {
  return z
    .object({
      name: z.string().trim().min(1, t('errors.name_required')).max(200, t('errors.name_too_long')),
      description: z.string(),
      sku: z.string(),
      barcode: z.string(),
      sellingPrice: z.string(),
      costPrice: z.string(),
      taxRate: z.string(),
      openingStock: z.string(),
      lowStockThreshold: z.string(),
      imageUrl: z.string(),
      categoryId: z.string(),
      unitOfMeasureId: z.string(),
      isService: z.boolean(),
      trackInventory: z.boolean(),
      isActive: z.boolean(),
    })
    .superRefine((value, ctx) => {
      const trimmedDescription = value.description.trim()
      const trimmedSku = value.sku.trim()
      const trimmedBarcode = value.barcode.trim()
      const trimmedImageUrl = value.imageUrl.trim()

      if (trimmedDescription.length > 2000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['description'],
          message: t('errors.description_too_long'),
        })
      }

      const sellingPriceInput = parseRequiredNumberInput(value.sellingPrice)
      if (sellingPriceInput.kind !== 'value' || sellingPriceInput.value < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sellingPrice'],
          message: t('errors.price_required'),
        })
      }

      const costPriceInput = parseOptionalNumberInput(value.costPrice)
      if (
        costPriceInput.kind === 'invalid' ||
        (costPriceInput.kind === 'value' && costPriceInput.value < 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['costPrice'],
          message: t('errors.cost_price_invalid'),
        })
      }

      const taxRateInput = parseOptionalNumberInput(value.taxRate)
      if (
        taxRateInput.kind === 'invalid' ||
        (taxRateInput.kind === 'value' && taxRateInput.value < 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['taxRate'],
          message: t('errors.tax_rate_invalid'),
        })
      }

      if (!value.unitOfMeasureId.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['unitOfMeasureId'],
          message: t('errors.unit_required'),
        })
      }

      if (!value.categoryId.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['categoryId'],
          message: t('errors.category_required'),
        })
      }

      if (trimmedSku && !isValidProductSkuCandidate(trimmedSku)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sku'],
          message: t('errors.sku_invalid'),
        })
      }

      if (trimmedBarcode && !isValidProductBarcodeCandidate(trimmedBarcode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['barcode'],
          message: t('errors.barcode_invalid'),
        })
      }

      if (trimmedImageUrl.length > 500) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['imageUrl'],
          message: t('errors.image_url_too_long'),
        })
      }

      if (mode === 'create' && value.trackInventory) {
        const openingStockInput = parseOptionalNumberInput(value.openingStock)
        if (
          openingStockInput.kind === 'invalid' ||
          (openingStockInput.kind === 'value' && openingStockInput.value < 0)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['openingStock'],
            message: t('errors.opening_stock_invalid'),
          })
        }

        const lowStockThresholdInput = parseOptionalNumberInput(value.lowStockThreshold)
        if (
          lowStockThresholdInput.kind === 'invalid' ||
          (lowStockThresholdInput.kind === 'value' && lowStockThresholdInput.value < 0)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['lowStockThreshold'],
            message: t('errors.low_stock_threshold_invalid'),
          })
        }
      }
    })
}

export function CreateProductForm({
  businessId,
  categories,
  units,
  defaultUnitId,
  mode = 'create',
  product,
  onCancel,
  onSaved,
}: CreateProductFormProps) {
  const t = useTranslations('app.products')
  const isUpdateMode = mode === 'update'
  const initialValues = useMemo(
    () => createInitialProductForm(defaultUnitId, isUpdateMode ? product : null),
    [defaultUnitId, isUpdateMode, product],
  )
  const categoryOptions = useMemo<CommandSelectOption[]>(
    () => categories.map(toCategoryOption),
    [categories],
  )
  const unitOptions = useMemo<CommandSelectOption[]>(
    () => units.map(toUnitOption),
    [units],
  )
  const serviceUnit = useMemo(() => units.find((unit) => isServiceUnit(unit)) ?? null, [units])
  const schema = useMemo(
    () => createProductFormSchema(categories, units, mode, t),
    [categories, mode, t, units],
  )
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: initialValues,
  })

  useEffect(() => {
    form.reset(initialValues)
  }, [form, initialValues])

  const isService = form.watch('isService')
  const categoryId = form.watch('categoryId')
  const unitOfMeasureId = form.watch('unitOfMeasureId')
  const trackInventory = form.watch('trackInventory')
  const selectedCategoryOption = useMemo(() => {
    if (!categoryId) {
      return null
    }

    const currentCategory = categories.find((category) => category.id === categoryId)
    if (currentCategory) {
      return toCategoryOption(currentCategory)
    }

    if (product?.category?.id === categoryId) {
      return toCategoryOption(product.category)
    }

    return null
  }, [categories, categoryId, product?.category])
  const selectedUnitOption = useMemo(() => {
    if (!unitOfMeasureId) {
      return null
    }

    const currentUnit = units.find((unit) => unit.id === unitOfMeasureId)
    if (currentUnit) {
      return toUnitOption(currentUnit)
    }

    if (product?.unitOfMeasure?.id === unitOfMeasureId) {
      return toUnitOption(product.unitOfMeasure)
    }

    return null
  }, [product?.unitOfMeasure, unitOfMeasureId, units])
  const trackInventoryLocked =
    isService || (serviceUnit?.id ? unitOfMeasureId === serviceUnit.id : false)
  const trackInventoryTooltip = trackInventoryLocked
    ? t('form.tooltips.track_inventory_disabled_service')
    : t('form.tooltips.track_inventory')
  const fallbackUnitId = product?.unitOfMeasure?.id ?? defaultUnitId ?? ''
  const loadCategoryOptions = useCallback(
    async ({ search, page }: { search: string; page: number }) => {
      if (!businessId) {
        return {
          data: [],
          total: 0,
          page,
          limit: 20,
          totalPages: 1,
        }
      }

      const result = await listCategoriesLocal(businessId, {
        page,
        limit: 20,
        sortBy: 'name',
        sortOrder: 'ASC',
        search: search || undefined,
      })

      return {
        ...result,
        data: result.data.map(toCategoryOption),
      }
    },
    [businessId],
  )
  const loadUnitOptions = useCallback(
    async ({ search, page }: { search: string; page: number }) => {
      if (!businessId) {
        return {
          data: [],
          total: 0,
          page,
          limit: 20,
          totalPages: 1,
        }
      }

      const result = await listUnitOfMeasuresLocal(businessId, {
        page,
        limit: 20,
        sortBy: 'name',
        sortOrder: 'ASC',
        search: search || undefined,
      })

      return {
        ...result,
        data: result.data.map(toUnitOption),
      }
    },
    [businessId],
  )

  const handleIsServiceChange = (checked: boolean) => {
    form.setValue('isService', checked, { shouldDirty: true, shouldValidate: true })

    if (checked) {
      if (serviceUnit?.id) {
        form.setValue('unitOfMeasureId', serviceUnit.id, {
          shouldDirty: true,
          shouldValidate: true,
        })
      }
      form.setValue('trackInventory', false, { shouldDirty: true, shouldValidate: true })
      form.setValue('openingStock', '', { shouldDirty: true, shouldValidate: true })
      form.setValue('lowStockThreshold', '', { shouldDirty: true, shouldValidate: true })
      return
    }

    if (serviceUnit?.id && form.getValues('unitOfMeasureId') === serviceUnit.id) {
      form.setValue('unitOfMeasureId', fallbackUnitId, { shouldDirty: true, shouldValidate: true })
    }
  }

  const handleUnitChange = (value: string) => {
    form.setValue('unitOfMeasureId', value, { shouldDirty: true, shouldValidate: true })

    if (serviceUnit?.id === value) {
      form.setValue('isService', true, { shouldDirty: true, shouldValidate: true })
      form.setValue('trackInventory', false, { shouldDirty: true, shouldValidate: true })
      form.setValue('openingStock', '', { shouldDirty: true, shouldValidate: true })
      form.setValue('lowStockThreshold', '', { shouldDirty: true, shouldValidate: true })
    }
  }

  const handleTrackInventoryChange = (checked: boolean) => {
    if (trackInventoryLocked) {
      return
    }

    form.setValue('trackInventory', checked, { shouldDirty: true, shouldValidate: true })
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!businessId) {
      toast.error(t('errors.business_required'))
      return
    }

    if (isUpdateMode && !product) {
      toast.error(t('errors.product_not_found'))
      return
    }

    const uniquenessConflicts = await findCreateProductConflictsLocal(
      businessId,
      {
        name: values.name,
        sku: isUpdateMode ? product?.sku ?? undefined : toOptionalString(values.sku),
        barcode: values.barcode.trim() || undefined,
      },
      isUpdateMode ? product?.id : undefined,
    )

    let hasConflict = false
    if (uniquenessConflicts.name) {
      form.setError('name', { message: t('errors.name_in_use') })
      hasConflict = true
    }
    if (!isUpdateMode && uniquenessConflicts.sku) {
      form.setError('sku', { message: t('errors.sku_in_use') })
      hasConflict = true
    }
    if (uniquenessConflicts.barcode) {
      form.setError('barcode', { message: t('errors.barcode_in_use') })
      hasConflict = true
    }
    if (hasConflict) {
      return
    }

    try {
      const savedProduct = isUpdateMode
        ? await updateProductLocal(businessId, product!.id, {
            name: values.name.trim(),
            description: values.description,
            sku: values.sku.trim(),
            barcode: values.barcode,
            sellingPrice: Number(values.sellingPrice),
            costPrice: values.costPrice.trim() ? Number(values.costPrice) : undefined,
            taxRate: toOptionalNumber(values.taxRate) ?? 0,
            unitOfMeasureId: values.unitOfMeasureId,
            categoryId: values.categoryId,
            imageUrl: values.imageUrl,
            isService: values.isService,
            trackInventory: values.trackInventory,
            isActive: values.isActive,
          } satisfies UpdateProductRequest)
        : await createProductLocal(businessId, {
            name: values.name.trim(),
            description: toOptionalString(values.description),
            sku: toOptionalString(values.sku),
            barcode: toOptionalString(values.barcode),
            sellingPrice: Number(values.sellingPrice),
            costPrice: toOptionalNumber(values.costPrice),
            taxRate: toOptionalNumber(values.taxRate) ?? 0,
            openingStock: values.trackInventory ? toOptionalNumber(values.openingStock) : undefined,
            lowStockThreshold: values.trackInventory
              ? toOptionalNumber(values.lowStockThreshold)
              : undefined,
            unitOfMeasureId: values.unitOfMeasureId,
            categoryId: values.categoryId,
            imageUrl: toOptionalString(values.imageUrl),
            isService: values.isService,
            trackInventory: values.trackInventory,
            isActive: values.isActive,
          } satisfies CreateProductRequest)

      toast.success(isUpdateMode ? t('form.update_success') : t('form.success'))

      if (!isUpdateMode) {
        form.reset(createInitialProductForm(defaultUnitId))
      }

      onSaved(savedProduct)
    } catch (error) {
      if (error instanceof ProductLocalError) {
        switch (error.code) {
          case 'PRODUCT_NOT_FOUND':
            toast.error(t('errors.product_not_found'))
            return
          case 'PRODUCT_NAME_REQUIRED':
            form.setError('name', { message: t('errors.name_required') })
            return
          case 'PRODUCT_NAME_TOO_LONG':
            form.setError('name', { message: t('errors.name_too_long') })
            return
          case 'PRODUCT_NAME_IN_USE':
            form.setError('name', { message: t('errors.name_in_use') })
            return
          case 'PRODUCT_DESCRIPTION_TOO_LONG':
            form.setError('description', { message: t('errors.description_too_long') })
            return
          case 'PRODUCT_PRICE_INVALID':
            form.setError('sellingPrice', { message: t('errors.price_required') })
            return
          case 'PRODUCT_COST_PRICE_INVALID':
            form.setError('costPrice', { message: t('errors.cost_price_invalid') })
            return
          case 'PRODUCT_TAX_RATE_INVALID':
            form.setError('taxRate', { message: t('errors.tax_rate_invalid') })
            return
          case 'PRODUCT_OPENING_STOCK_INVALID':
            form.setError('openingStock', { message: t('errors.opening_stock_invalid') })
            return
          case 'PRODUCT_LOW_STOCK_THRESHOLD_INVALID':
            form.setError('lowStockThreshold', {
              message: t('errors.low_stock_threshold_invalid'),
            })
            return
          case 'PRODUCT_UNIT_REQUIRED':
            form.setError('unitOfMeasureId', { message: t('errors.unit_required') })
            return
          case 'PRODUCT_UNIT_INVALID':
            form.setError('unitOfMeasureId', { message: t('errors.unit_invalid') })
            return
          case 'PRODUCT_CATEGORY_REQUIRED':
            form.setError('categoryId', { message: t('errors.category_required') })
            return
          case 'PRODUCT_CATEGORY_INVALID':
            form.setError('categoryId', { message: t('errors.category_invalid') })
            return
          case 'PRODUCT_SKU_INVALID':
            form.setError('sku', { message: t('errors.sku_invalid') })
            return
          case 'PRODUCT_SKU_IMMUTABLE':
            form.setError('sku', { message: t('errors.sku_immutable') })
            return
          case 'PRODUCT_SKU_IN_USE':
            form.setError('sku', { message: t('errors.sku_in_use') })
            return
          case 'PRODUCT_SKU_GENERATION_FAILED':
            form.setError('sku', { message: t('errors.sku_generation_failed') })
            return
          case 'PRODUCT_BARCODE_INVALID':
            form.setError('barcode', { message: t('errors.barcode_invalid') })
            return
          case 'PRODUCT_BARCODE_IN_USE':
            form.setError('barcode', { message: t('errors.barcode_in_use') })
            return
          case 'PRODUCT_IMAGE_URL_TOO_LONG':
            form.setError('imageUrl', { message: t('errors.image_url_too_long') })
            return
          default:
            break
        }
      }

      toast.error(getApiErrorMessage(error, isUpdateMode ? t('errors.update') : t('errors.create')))
    }
  })

  return (
    <Form {...form}>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field, fieldState }) => (
                <FormItem>
                  <Input
                    label={t('form.fields.name')}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    required
                  />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.fields.description')}</FormLabel>
                  <textarea
                    className={cn(
                      textareaClassName,
                      form.formState.errors.description ? 'border-destructive text-destructive' : '',
                    )}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder={t('form.placeholders.description')}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="sellingPrice"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <NumberInput
                      label={t('form.fields.selling_price')}
                      min="0"
                      step="0.01"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                      required
                    />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="costPrice"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <NumberInput
                      label={t('form.fields.cost_price')}
                      min="0"
                      step="0.01"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={form.control}
                name="sku"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <Input
                      label={t('form.fields.sku')}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={() => {
                        const normalized = field.value.trim().toUpperCase()
                        field.onChange(normalized)
                        field.onBlur()
                      }}
                      placeholder={t('form.placeholders.sku')}
                      error={fieldState.error?.message}
                      disabled={isUpdateMode}
                    />
                  </FormItem>
                )}
              />

              <Controller
                control={form.control}
                name="barcode"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <Input
                      label={t('form.fields.barcode')}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={() => {
                        const normalized = field.value.trim()
                        field.onChange(normalized)
                        field.onBlur()
                      }}
                      placeholder={t('form.placeholders.barcode')}
                      error={fieldState.error?.message}
                    />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('form.fields.category')}</FormLabel>
                    <CommandSelect
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      options={categoryOptions}
                      selectedOption={selectedCategoryOption}
                      loadOptions={loadCategoryOptions}
                      placeholder={t('form.select_category')}
                      searchPlaceholder={t('form.search_categories')}
                      emptyMessage={t('form.no_categories')}
                      loadingMessage={t('form.loading_options')}
                      loadMoreLabel={t('form.load_more')}
                      invalid={Boolean(fieldState.error)}
                      required
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="unitOfMeasureId"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('form.fields.unit')}</FormLabel>
                    <CommandSelect
                      value={field.value}
                      onChange={handleUnitChange}
                      onBlur={field.onBlur}
                      options={unitOptions}
                      selectedOption={selectedUnitOption}
                      loadOptions={loadUnitOptions}
                      placeholder={t('form.select_unit')}
                      searchPlaceholder={t('form.search_units')}
                      emptyMessage={t('form.no_units')}
                      loadingMessage={t('form.loading_options')}
                      loadMoreLabel={t('form.load_more')}
                      invalid={Boolean(fieldState.error)}
                      required
                      disabled={isService && Boolean(serviceUnit?.id)}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {!isUpdateMode ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="openingStock"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <NumberInput
                        label={t('form.fields.opening_stock')}
                        min="0"
                        step="0.001"
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        disabled={!trackInventory || trackInventoryLocked}
                        error={fieldState.error?.message}
                      />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="lowStockThreshold"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <NumberInput
                        label={t('form.fields.low_stock_threshold')}
                        min="0"
                        step="0.001"
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        disabled={!trackInventory || trackInventoryLocked}
                        error={fieldState.error?.message}
                      />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="taxRate"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <NumberInput
                      label={t('form.fields.tax_rate')}
                      min="0"
                      step="0.01"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  </FormItem>
                )}
              />

              <Controller
                control={form.control}
                name="imageUrl"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <Input
                      label={t('form.fields.image_url')}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={() => {
                        const normalized = field.value.trim()
                        field.onChange(normalized)
                        field.onBlur()
                      }}
                      placeholder={t('form.placeholders.image_url')}
                      error={fieldState.error?.message}
                    />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-3 rounded-2xl border border-border bg-background px-4 py-3">
              <Controller
                control={form.control}
                name="isService"
                render={({ field }) => (
                  <label className="flex items-center gap-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={(event) => handleIsServiceChange(event.target.checked)}
                    />
                    {t('form.fields.is_service')}
                  </label>
                )}
              />

              <Controller
                control={form.control}
                name="trackInventory"
                render={({ field }) => (
                  <label className="flex items-center gap-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={(event) => handleTrackInventoryChange(event.target.checked)}
                      disabled={trackInventoryLocked}
                    />
                    <span>{t('form.fields.track_inventory')}</span>
                    <TooltipHint content={trackInventoryTooltip} />
                  </label>
                )}
              />

              <Controller
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <label className="flex items-center gap-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={(event) => field.onChange(event.target.checked)}
                    />
                    {t('form.fields.is_active')}
                  </label>
                )}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('form.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? isUpdateMode
                ? t('form.updating')
                : t('form.submitting')
              : isUpdateMode
                ? t('form.update_submit')
                : t('form.submit')}
          </Button>
        </div>
      </form>
    </Form>
  )
}
