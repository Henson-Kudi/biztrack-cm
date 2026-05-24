'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button, Input, NumberInput } from '@biztrack/ui'
import type { ProductCategory } from '@biztrack/types'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { createCategoryLocal, updateCategoryLocal } from '@/services/products.local'
import { getCategoryErrorMessage } from './resource-error-messages'

type CategoryDialogProps = {
  businessId: string | null
  category?: ProductCategory | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (category: ProductCategory) => void
  quotaReached?: boolean
}

type CategoryFormValues = {
  name: string
  color: string
  icon: string
  imageUrl: string
  sortOrder: string
}

function createInitialValues(category?: ProductCategory | null): CategoryFormValues {
  return {
    name: category?.name ?? '',
    color: category?.color ?? '',
    icon: category?.icon ?? '',
    imageUrl: category?.imageUrl ?? '',
    sortOrder:
      category?.sortOrder !== null && category?.sortOrder !== undefined
        ? String(category.sortOrder)
        : '',
  }
}

function toOptionalString(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function toOptionalInteger(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  return Number(trimmed)
}

export function CategoryDialog({
  businessId,
  category,
  open,
  onOpenChange,
  onSaved,
  quotaReached = false,
}: CategoryDialogProps) {
  const t = useTranslations('app.products')
  const [submitting, setSubmitting] = useState(false)
  const isUpdateMode = Boolean(category)
  const translateKey = (key: string) => t(key as never)

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('errors.category_name_required'))
          .max(100, t('errors.category_name_too_long')),
        color: z.string().trim().max(7, t('errors.category_color_invalid')),
        icon: z.string().trim().max(50, t('errors.category_icon_too_long')),
        imageUrl: z.string().trim().max(500, t('errors.category_image_url_too_long')),
        sortOrder: z
          .string()
          .trim()
          .refine((value) => {
            if (!value) {
              return true
            }

            const parsed = Number(value)
            return Number.isInteger(parsed) && parsed >= 0
          }, t('errors.category_sort_order_invalid')),
      }),
    [t],
  )

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(schema),
    defaultValues: createInitialValues(category),
  })

  useEffect(() => {
    if (!open) {
      return
    }

    form.reset(createInitialValues(category))
  }, [category, form, open])

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!businessId) {
      toast.error(t('errors.business_required'))
      return
    }

    setSubmitting(true)

    try {
      const payload = {
        name: values.name.trim(),
        color: toOptionalString(values.color),
        icon: toOptionalString(values.icon),
        imageUrl: toOptionalString(values.imageUrl),
        sortOrder: toOptionalInteger(values.sortOrder),
      }

      const savedCategory = category
        ? await updateCategoryLocal(businessId, category.id, payload)
        : await createCategoryLocal(businessId, payload)

      toast.success(
        category ? t('categories_page.update_success') : t('categories_page.create_success'),
      )
      onSaved(savedCategory)
      onOpenChange(false)
    } catch (error) {
      toast.error(
        getCategoryErrorMessage(
          error,
          translateKey,
          category ? t('errors.category_update') : t('errors.category_create'),
        ),
      )
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-4rem)]" closeLabel={t('form.close')}>
        <DialogHeader>
          <DialogTitle>
            {isUpdateMode ? t('categories_page.update_title') : t('categories_page.create_title')}
          </DialogTitle>
          <DialogDescription>
            {isUpdateMode
              ? t('categories_page.update_description')
              : t('categories_page.create_description')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
            <div className="grid gap-4 overflow-y-auto px-6 py-5 md:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>{t('categories_page.form.fields.name')}</FormLabel>
                    <Input {...field} />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('categories_page.form.fields.color')}</FormLabel>
                    <Input
                      {...field}
                      placeholder={t('categories_page.form.placeholders.color')}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('categories_page.form.fields.sort_order')}</FormLabel>
                    <NumberInput
                      {...field}
                      min={0}
                      step="1"
                      placeholder={t('categories_page.form.placeholders.sort_order')}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('categories_page.form.fields.icon')}</FormLabel>
                    <Input
                      {...field}
                      placeholder={t('categories_page.form.placeholders.icon')}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="imageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('categories_page.form.fields.image_url')}</FormLabel>
                    <Input
                      {...field}
                      placeholder={t('categories_page.form.placeholders.image_url')}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                {t('form.cancel')}
              </Button>
              <Button type="submit" variant="primary" disabled={submitting || (quotaReached && !isUpdateMode)}>
                {submitting
                  ? isUpdateMode
                    ? t('categories_page.form.updating')
                    : t('categories_page.form.submitting')
                  : isUpdateMode
                    ? t('categories_page.form.update_submit')
                    : t('categories_page.form.submit')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
