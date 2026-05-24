import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  type PlanQuotaResource,
  type PlanQuotaUsage,
  BusinessMemberStatus,
} from '@biztrack/types'
import { IsNull, Repository } from 'typeorm'
import { AppPaymentRequiredException } from '@/common/exceptions/app-exceptions'
import { BusinessMember } from '@/entities/business-member.entity'
import { Contact } from '@/entities/contact.entity'
import { ProductCategory } from '@/entities/product-category.entity'
import { Product } from '@/entities/product.entity'
import { PermissionsService } from './permissions.service'
import { I18nService } from 'nestjs-i18n'
import type { I18nTranslations } from '@/i18n/i18n.types'

type QuotaSnapshot = {
  resource: PlanQuotaResource
  limit: number | null
  used: number
  remaining: number | null
  unlimited: boolean
}

@Injectable()
export class QuotaService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(ProductCategory)
    private readonly categoriesRepo: Repository<ProductCategory>,
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    @InjectRepository(BusinessMember)
    private readonly businessMembersRepo: Repository<BusinessMember>,
    private readonly permissionsService: PermissionsService,
    private readonly i18n: I18nService<I18nTranslations>,
  ) {}

  async assertWithinQuota(
    businessId: string,
    resource: PlanQuotaResource,
    additionalUsage: number = 1,
  ): Promise<void> {
    const snapshot = await this.getQuotaSnapshot(businessId, resource)
    if (snapshot.unlimited) {
      return
    }

    const projectedUsage = snapshot.used + additionalUsage
    if (snapshot.limit !== null && projectedUsage > snapshot.limit) {
      const requiredPlan = await this.permissionsService.getMinimumPlanForQuota(
        resource,
        projectedUsage,
      )

      throw new AppPaymentRequiredException(
        await this.i18n.translate('errors.quota_upgrade_required' as never, {
          args: {
            resource,
            used: snapshot.used,
            limit: snapshot.limit,
            plan: requiredPlan ?? 'PRO',
          },
        }),
        'QUOTA_EXCEEDED',
        {
          requiredPlan,
          quota: {
            resource,
            limit: snapshot.limit,
            used: snapshot.used,
            remaining: snapshot.remaining,
          },
        },
      )
    }
  }

  async getQuotaUsage(businessId: string): Promise<PlanQuotaUsage[]> {
    const entitlement = await this.permissionsService.getBusinessEntitlement(businessId)
    const quotas = await this.permissionsService.getQuotaMapForBusiness(businessId)

    const usage = await Promise.all(
      (Object.keys(quotas) as PlanQuotaResource[]).map(async (resource) => {
        const snapshot = await this.getQuotaSnapshot(businessId, resource, quotas[resource])
        const requiredPlan =
          snapshot.unlimited || snapshot.limit === null
            ? null
            : await this.permissionsService.getMinimumPlanForQuota(
                resource,
                snapshot.used + 1,
              )

        return {
          ...snapshot,
          requiredPlan:
            requiredPlan && requiredPlan !== entitlement?.effectivePlan ? requiredPlan : null,
        }
      }),
    )

    return usage
  }

  private async getQuotaSnapshot(
    businessId: string,
    resource: PlanQuotaResource,
    explicitLimit?: number | null,
  ): Promise<QuotaSnapshot> {
    const quotas =
      explicitLimit !== undefined
        ? null
        : await this.permissionsService.getQuotaMapForBusiness(businessId)
    const limit = explicitLimit !== undefined ? explicitLimit : quotas![resource]
    const used = await this.countUsage(businessId, resource)

    return {
      resource,
      limit,
      used,
      remaining: limit === null ? null : Math.max(limit - used, 0),
      unlimited: limit === null,
    }
  }

  private async countUsage(businessId: string, resource: PlanQuotaResource): Promise<number> {
    switch (resource) {
      case 'products':
        // Only active, non-deleted products consume a slot. This matches both
        // API write-path reactivation semantics and offline desktop counting.
        return this.productsRepo.count({
          where: {
            businessId,
            isActive: true,
            deletedAt: IsNull(),
          },
        })
      case 'contacts':
        // Contacts use an "active only" count because deactivation is the
        // user's way to intentionally free a quota slot without losing history.
        return this.contactsRepo.count({
          where: {
            businessId,
            isActive: true,
          },
        })
      case 'categories':
        return this.categoriesRepo.count({
          where: {
            businessId,
            isActive: true,
            deletedAt: IsNull(),
          },
        })
      case 'users':
        // User seats are an online-only flow in v1. Pending invites do not
        // consume quota; only active memberships count once the server-side
        // onboarding flow succeeds.
        return this.businessMembersRepo.count({
          where: {
            businessId,
            status: BusinessMemberStatus.ACTIVE,
          },
        })
      default:
        return 0
    }
  }
}
