import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RedisModule } from '@/common/redis/redis.module'
import { Business } from '@/entities/business.entity'
import { BusinessMember } from '@/entities/business-member.entity'
import { BusinessOverride } from '@/entities/business-override.entity'
import { Contact } from '@/entities/contact.entity'
import { PlanConfig } from '@/entities/plan-config.entity'
import { ProductCategory } from '@/entities/product-category.entity'
import { Product } from '@/entities/product.entity'
import { BusinessesRepository } from '@/modules/business/repositories/businesses.repository'
import { PlanConfigsRepository } from './repositories/plan-configs.repository'
import { BusinessOverridesRepository } from './repositories/business-overrides.repository'
import { PermissionsService } from './permissions.service'
import { ResourceGuard } from './guards/resource.guard'
import { QuotaService } from './quota.service'

@Module({
  imports: [
    RedisModule,
    TypeOrmModule.forFeature([
      Business,
      BusinessMember,
      BusinessOverride,
      Contact,
      PlanConfig,
      Product,
      ProductCategory,
    ]),
  ],
  providers: [
    BusinessesRepository,
    PlanConfigsRepository,
    BusinessOverridesRepository,
    PermissionsService,
    QuotaService,
    ResourceGuard,
  ],
  exports: [PermissionsService, QuotaService, ResourceGuard],
})
export class PermissionsModule {}
