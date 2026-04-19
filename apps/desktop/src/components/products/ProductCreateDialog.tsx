'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ProductCategory, UnitOfMeasure } from '@biztrack/types'
import { CreateProductForm } from '@/components/products/CreateProductForm'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { resolveFallbackUnit } from './product-utils'

type ProductCreateDialogProps = {
  businessId: string | null
  categories: ProductCategory[]
  units: UnitOfMeasure[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export function ProductCreateDialog({
  businessId,
  categories,
  units,
  open,
  onOpenChange,
  onCreated,
}: ProductCreateDialogProps) {
  const t = useTranslations('app.products')
  const [formKey, setFormKey] = useState(0)
  const fallbackUnit = useMemo(() => resolveFallbackUnit(units), [units])

  useEffect(() => {
    if (open) {
      setFormKey((current) => current + 1)
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100vh-4rem)]"
        closeLabel={t('form.close')}
      >
        <DialogHeader>
          <DialogTitle>{t('form.title')}</DialogTitle>
          <DialogDescription>{t('form.description')}</DialogDescription>
        </DialogHeader>
        <CreateProductForm
          key={formKey}
          businessId={businessId}
          categories={categories}
          units={units}
          defaultUnitId={fallbackUnit?.id}
          onCancel={() => onOpenChange(false)}
          onSaved={() => {
            onCreated()
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
