/// <reference types="jest" />
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { Resource } from '@biztrack/types'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { CategoriesController } from '../controllers/categories.controller'
import { ProductImagesController } from '../controllers/product-images.controller'
import { ProductsController } from '../controllers/products.controller'
import { UnitOfMeasuresController } from '../controllers/unit-of-measures.controller'

describe('Products module controller permissions', () => {
  it('attaches the phase2 and resource guards to products controllers', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ProductsController)).toEqual(
      expect.arrayContaining([Phase2Guard, ResourceGuard]),
    )
    expect(Reflect.getMetadata(GUARDS_METADATA, CategoriesController)).toEqual(
      expect.arrayContaining([Phase2Guard, ResourceGuard]),
    )
    expect(Reflect.getMetadata(GUARDS_METADATA, ProductImagesController)).toEqual(
      expect.arrayContaining([Phase2Guard, ResourceGuard]),
    )
    expect(Reflect.getMetadata(GUARDS_METADATA, UnitOfMeasuresController)).toEqual(
      expect.arrayContaining([Phase2Guard, ResourceGuard]),
    )
  })

  it('requires the documented product resources per handler', () => {
    expect(Reflect.getMetadata('required_resource', ProductsController.prototype.create)).toBe(
      Resource.PRODUCTS_CREATE,
    )
    expect(Reflect.getMetadata('required_resource', ProductsController.prototype.findAll)).toBe(
      Resource.PRODUCTS_VIEW,
    )
    expect(Reflect.getMetadata('required_resource', ProductsController.prototype.assignBarcode)).toBe(
      Resource.PRODUCTS_EDIT,
    )
    expect(Reflect.getMetadata('required_resource', ProductsController.prototype.remove)).toBe(
      Resource.PRODUCTS_DELETE,
    )
    expect(Reflect.getMetadata('required_resource', CategoriesController.prototype.create)).toBe(
      Resource.PRODUCTS_CREATE,
    )
    expect(Reflect.getMetadata('required_resource', ProductImagesController.prototype.update)).toBe(
      Resource.PRODUCTS_EDIT,
    )
    expect(Reflect.getMetadata('required_resource', UnitOfMeasuresController.prototype.findAll)).toBe(
      Resource.PRODUCTS_VIEW,
    )
  })
})
