import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { JwtModule } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PasswordManager } from '@/common/security/password-manager'
import { BusinessMember } from '@/entities/business-member.entity'
import { Business } from '@/entities/business.entity'
import { ContactOpeningBalance } from '@/entities/contact-opening-balance.entity'
import { Contact } from '@/entities/contact.entity'
import { Debt } from '@/entities/debt.entity'
import { DebtPayment } from '@/entities/debt-payment.entity'
import { ExpenseCategory } from '@/entities/expense-category.entity'
import { Expense } from '@/entities/expense.entity'
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
import { SyncDeviceSession } from '@/entities/sync-device-session.entity'
import { SyncLog } from '@/entities/sync-log.entity'
import { SyncOperation } from '@/entities/sync-operation.entity'
import { Role } from '@/entities/role.entity'
import { UnitOfMeasure } from '@/entities/unit-of-measure.entity'
import { User } from '@/entities/user.entity'
import { RedisModule } from '@/common/redis/redis.module'
import { ProductCategoriesRepository } from '@/modules/products/repositories/product-categories.repository'
import { ProductsRepository } from '@/modules/products/repositories/products.repository'
import { BarcodeService } from '@/modules/products/services/barcode.service'
import { SlugService } from '@/modules/products/services/slug.service'
import { SkuService } from '@/modules/products/services/sku.service'
import { ExpensesModule } from '@/modules/expenses/expenses.module'
import { InventoryModule } from '@/modules/inventory/inventory.module'
import { PermissionsModule } from '@/modules/permissions/permissions.module'
import { SalesModule } from '@/modules/sales/sales.module'
import { SavingsModule } from '@/modules/savings/savings.module'
import type { AppConfig } from '@/config/configuration'
import { SYNC_BATCHES_QUEUE } from './constants/sync.constants'
import { SyncController } from './sync.controller'
import { SyncTokenGuard } from './guards/sync-token.guard'
import { SyncBatchesProcessor } from './processors/sync-batches.processor'
import { SyncAuthService } from './services/sync-auth.service'
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
    ExpensesModule,
    InventoryModule,
    PermissionsModule,
    SavingsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => ({
        // Sync credentials deliberately use their own secret so a leaked sync token
        // cannot be replayed as a normal phase1/phase2 bearer token elsewhere.
        secret:
          config.get<string>('SYNC_JWT_SECRET', { infer: true }) ??
          config.get<string>('JWT_SECRET', { infer: true }),
      }),
    }),
    TypeOrmModule.forFeature([
      BusinessMember,
      Business,
      Contact,
      ContactOpeningBalance,
      Debt,
      DebtPayment,
      Expense,
      ExpenseCategory,
      InventoryLevel,
      InventoryMovement,
      Product,
      ProductCategory,
      Role,
      RestockRecord,
      RestockItem,
      Sale,
      SaleItem,
      SalePayment,
      SyncBatch,
      SyncDeviceSession,
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
    PasswordManager,
    SyncAuthService,
    SyncTokenGuard,
    SyncService,
    SyncQueueMonitorService,
    SyncRealtimeService,
    SyncBatchesProcessor,
  ],
})
export class SyncModule {}
