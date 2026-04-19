'use client'

import { useTranslations } from 'next-intl'
import type { Product, ProductCategory, UnitOfMeasure } from '@biztrack/types'
import { CreateProductForm } from '@/components/products/CreateProductForm'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type ProductUpdateDialogProps = {
  businessId: string | null
  product: Product | null
  categories: ProductCategory[]
  units: UnitOfMeasure[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: (product: Product) => void
}

export function ProductUpdateDialog({
  businessId,
  product,
  categories,
  units,
  open,
  onOpenChange,
  onUpdated,
}: ProductUpdateDialogProps) {
  const t = useTranslations('app.products')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-4rem)]" closeLabel={t('form.close')}>
        <DialogHeader>
          <DialogTitle>{t('form.update_title')}</DialogTitle>
          <DialogDescription>{t('form.update_description')}</DialogDescription>
        </DialogHeader>
        <CreateProductForm
          businessId={businessId}
          categories={categories}
          units={units}
          mode="update"
          product={product}
          defaultUnitId={product?.unitOfMeasure?.id}
          onCancel={() => onOpenChange(false)}
          onSaved={(savedProduct) => {
            onUpdated(savedProduct)
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
