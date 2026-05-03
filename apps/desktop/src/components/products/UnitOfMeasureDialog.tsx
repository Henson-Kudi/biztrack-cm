'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button, Input } from '@biztrack/ui'
import { UnitOfMeasureType, type UnitOfMeasure } from '@biztrack/types'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createUnitOfMeasureLocal, updateUnitOfMeasureLocal } from '@/services/products.local'
import { getUnitErrorMessage } from './resource-error-messages'

type UnitOfMeasureDialogProps = {
  businessId: string | null
  unit?: UnitOfMeasure | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (unit: UnitOfMeasure) => void
}

type UnitFormValues = {
  name: string
  abbreviation: string
  type: string
}

function createInitialValues(unit?: UnitOfMeasure | null): UnitFormValues {
  return {
    name: unit?.name ?? '',
    abbreviation: unit?.abbreviation ?? '',
    type: unit?.type ?? UnitOfMeasureType.CUSTOM,
  }
}

export function UnitOfMeasureDialog({
  businessId,
  unit,
  open,
  onOpenChange,
  onSaved,
}: UnitOfMeasureDialogProps) {
  const t = useTranslations('app.products')
  const [submitting, setSubmitting] = useState(false)
  const isUpdateMode = Boolean(unit)
  const translateKey = (key: string) => t(key as never)

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('errors.unit_name_required'))
          .max(50, t('errors.unit_name_too_long')),
        abbreviation: z
          .string()
          .trim()
          .min(1, t('errors.unit_abbreviation_required'))
          .max(10, t('errors.unit_abbreviation_too_long')),
        type: z.string().refine(
          (value) => Object.values(UnitOfMeasureType).includes(value as UnitOfMeasureType),
          t('errors.unit_type_invalid'),
        ),
      }),
    [t],
  )

  const form = useForm<UnitFormValues>({
    resolver: zodResolver(schema),
    defaultValues: createInitialValues(unit),
  })

  useEffect(() => {
    if (!open) {
      return
    }

    form.reset(createInitialValues(unit))
  }, [form, open, unit])

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!businessId) {
      toast.error(t('errors.business_required'))
      return
    }

    setSubmitting(true)

    try {
      const payload = {
        name: values.name.trim(),
        abbreviation: values.abbreviation.trim(),
        type: values.type as UnitOfMeasureType,
      }

      const savedUnit = unit
        ? await updateUnitOfMeasureLocal(businessId, unit.id, payload)
        : await createUnitOfMeasureLocal(businessId, payload)

      toast.success(unit ? t('units_page.update_success') : t('units_page.create_success'))
      onSaved(savedUnit)
      onOpenChange(false)
    } catch (error) {
      toast.error(
        getUnitErrorMessage(
          error,
          translateKey,
          unit ? t('errors.unit_update') : t('errors.unit_create'),
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
            {isUpdateMode ? t('units_page.update_title') : t('units_page.create_title')}
          </DialogTitle>
          <DialogDescription>
            {isUpdateMode
              ? t('units_page.update_description')
              : t('units_page.create_description')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
            <div className="grid gap-4 overflow-y-auto px-6 py-5 md:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('units_page.form.fields.name')}</FormLabel>
                    <Input {...field} />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="abbreviation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('units_page.form.fields.abbreviation')}</FormLabel>
                    <Input {...field} />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>{t('units_page.form.fields.type')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('units_page.form.placeholders.type')} />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(UnitOfMeasureType).map((type) => (
                          <SelectItem key={type} value={type}>
                            {t(`form.unit_types.${type.toLowerCase()}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting
                  ? isUpdateMode
                    ? t('units_page.form.updating')
                    : t('units_page.form.submitting')
                  : isUpdateMode
                    ? t('units_page.form.update_submit')
                    : t('units_page.form.submit')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
