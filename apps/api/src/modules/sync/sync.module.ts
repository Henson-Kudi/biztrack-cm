import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { JwtModule } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Business } from '@/entities/business.entity'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { InventoryMovement } from '@/entities/inventory-movement.entity'
import { ProductCategory } from '@/entities/product-category.entity'
import { Product } from '@/entities/product.entity'
import { RestockItem } from '@/entities/restock-item.entity'
import { RestockRecord } from '@/entities/restock-record.entity'
import { SaleItem } from '@/entities/sale-item.entity'
import { SalePayment } from '@/entities/sale-payment.entity'
import { Sale } from '@/entities/sale.entity'
import { SyncBatch } from '@/entities/sync-batch.entity'
import { SyncLog } from '@/entities/sync-log.entity'
import { SyncOperation } from '@/entities/sync-operation.entity'
import { UnitOfMeasure } from '@/entities/unit-of-measure.entity'
import { User } from '@/entities/user.entity'
import { RedisModule } from '@/common/redis/redis.module'
import { ProductCategoriesRepository } from '@/modules/products/repositories/product-categories.repository'
import { ProductsRepository } from '@/modules/products/repositories/products.repository'
import { BarcodeService } from '@/modules/products/services/barcode.service'
import { SlugService } from '@/modules/products/services/slug.service'
import { SkuService } from '@/modules/products/services/sku.service'
import { SalesModule } from '@/modules/sales/sales.module'
import type { AppConfig } from '@/config/configuration'
import { SYNC_BATCHES_QUEUE } from './constants/sync.constants'
import { SyncController } from './sync.controller'
import { SyncBatchesProcessor } from './processors/sync-batches.processor'
import { SyncQueueMonitorService } from './services/sync-queue-monitor.service'
import { SyncRealtimeService } from './services/sync-realtime.service'
import { SyncService } from './sync.service'

@Module({
  imports: [
    BullModule.registerQueue({
      name: SYNC_BATCHES_QUEUE,
    }),
    RedisModule,
    SalesModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => ({
        secret: config.get<string>('JWT_SECRET', { infer: true }),
      }),
    }),
    TypeOrmModule.forFeature([
      Business,
      InventoryLevel,
      InventoryMovement,
      Product,
      ProductCategory,
      RestockRecord,
      RestockItem,
      Sale,
      SaleItem,
      SalePayment,
      SyncBatch,
      SyncLog,
      SyncOperation,
      UnitOfMeasure,
      User,
    ]),
  ],
  controllers: [SyncController],
  providers: [
    ProductCategoriesRepository,
    ProductsRepository,
    BarcodeService,
    SlugService,
    SkuService,
    SyncService,
    SyncQueueMonitorService,
    SyncRealtimeService,
    SyncBatchesProcessor,
  ],
})
export class SyncModule {}
