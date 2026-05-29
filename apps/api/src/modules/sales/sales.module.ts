import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Business } from '@/entities/business.entity'
import { DailySaleSummary } from '@/entities/daily-sale-summary.entity'
import { Product } from '@/entities/product.entity'
import { SaleItem } from '@/entities/sale-item.entity'
import { SalePayment } from '@/entities/sale-payment.entity'
import { Sale } from '@/entities/sale.entity'
import { DebtsModule } from '@/modules/debts/debts.module'
import { InventoryModule } from '@/modules/inventory/inventory.module'
import { PermissionsModule } from '@/modules/permissions/permissions.module'
import { SavingsModule } from '@/modules/savings/savings.module'
import { SalesController } from './controllers/sales.controller'
import { DailySalesSummaryService } from './services/daily-sales-summary.service'
import { SaleNumberService } from './services/sale-number.service'
import { SalesService } from './services/sales.service'

@Module({
  imports: [
    PermissionsModule,
    DebtsModule,
    InventoryModule,
    SavingsModule,
    TypeOrmModule.forFeature([
      Business,
      DailySaleSummary,
      Product,
      Sale,
      SaleItem,
      SalePayment,
    ]),
  ],
  controllers: [SalesController],
  providers: [DailySalesSummaryService, SaleNumberService, SalesService],
  exports: [SalesService],
})
export class SalesModule {}
