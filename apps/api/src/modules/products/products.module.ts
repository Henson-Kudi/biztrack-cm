import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Business } from '@/entities/business.entity'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { InventoryMovement } from '@/entities/inventory-movement.entity'
import { ProductCategory } from '@/entities/product-category.entity'
import { ProductImage } from '@/entities/product-image.entity'
import { Product } from '@/entities/product.entity'
import { UnitOfMeasure } from '@/entities/unit-of-measure.entity'
import { PermissionsModule } from '@/modules/permissions/permissions.module'
import { CategoriesController } from './controllers/categories.controller'
import { ProductImagesController } from './controllers/product-images.controller'
import { ProductsController } from './controllers/products.controller'
import { UnitOfMeasuresController } from './controllers/unit-of-measures.controller'
import { ProductsRepository } from './repositories/products.repository'
import { ProductCategoriesRepository } from './repositories/product-categories.repository'
import { BarcodeService } from './services/barcode.service'
import { CategoriesService } from './services/categories.service'
import { ProductImagesService } from './services/product-images.service'
import { ProductsService } from './services/products.service'
import { SlugService } from './services/slug.service'
import { SkuService } from './services/sku.service'
import { UnitOfMeasuresService } from './services/unit-of-measures.service'

@Module({
  imports: [
    PermissionsModule,
    TypeOrmModule.forFeature([
      Business,
      InventoryLevel,
      InventoryMovement,
      Product,
      ProductCategory,
      ProductImage,
      UnitOfMeasure,
    ]),
  ],
  controllers: [
    UnitOfMeasuresController,
    ProductImagesController,
    CategoriesController,
    ProductsController,
  ],
  providers: [
    ProductsRepository,
    ProductCategoriesRepository,
    BarcodeService,
    CategoriesService,
    ProductImagesService,
    ProductsService,
    SlugService,
    SkuService,
    UnitOfMeasuresService,
  ],
  exports: [ProductsService],
})
export class ProductsModule { }
