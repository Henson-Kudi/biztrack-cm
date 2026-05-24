/// <reference types="jest" />
import { HttpStatus } from '@nestjs/common'
import { SubscriptionPlan } from '@biztrack/types'
import { QuotaService } from '../quota.service'

const makeService = () => {
  const productsRepo = { count: jest.fn().mockResolvedValue(0) }
  const categoriesRepo = { count: jest.fn().mockResolvedValue(0) }
  const contactsRepo = { count: jest.fn().mockResolvedValue(0) }
  const businessMembersRepo = { count: jest.fn().mockResolvedValue(0) }
  const permissionsService = {
    getBusinessEntitlement: jest.fn().mockResolvedValue({
      effectivePlan: SubscriptionPlan.FREE,
    }),
    getQuotaMapForBusiness: jest.fn().mockResolvedValue({
      products: 50,
      contacts: 20,
      categories: 10,
      users: 1,
    }),
    getMinimumPlanForQuota: jest.fn().mockResolvedValue(SubscriptionPlan.SOLO),
  }
  const i18n = {
    translate: jest.fn(async () => 'quota_upgrade_required'),
  }

  const service = new QuotaService(
    productsRepo as any,
    categoriesRepo as any,
    contactsRepo as any,
    businessMembersRepo as any,
    permissionsService as any,
    i18n as any,
  )

  return {
    service,
    productsRepo,
    permissionsService,
  }
}

describe('QuotaService', () => {
  it('throws a 402 payment-required exception when a quota would be exceeded', async () => {
    const { service, productsRepo, permissionsService } = makeService()
    productsRepo.count.mockResolvedValue(50)

    await expect(service.assertWithinQuota('business-1', 'products')).rejects.toMatchObject({
      status: HttpStatus.PAYMENT_REQUIRED,
      code: 'QUOTA_EXCEEDED',
      details: {
        requiredPlan: SubscriptionPlan.SOLO,
        quota: {
          resource: 'products',
          limit: 50,
          used: 50,
          remaining: 0,
        },
      },
    })
    expect(permissionsService.getMinimumPlanForQuota).toHaveBeenCalledWith('products', 51)
  })

  it('returns usage snapshots with the next required plan for limited resources', async () => {
    const { service, productsRepo } = makeService()
    productsRepo.count.mockResolvedValue(49)

    const usage = await service.getQuotaUsage('business-1')
    const productsUsage = usage.find((entry) => entry.resource === 'products')

    expect(productsUsage).toEqual(
      expect.objectContaining({
        resource: 'products',
        limit: 50,
        used: 49,
        remaining: 1,
        unlimited: false,
        requiredPlan: SubscriptionPlan.SOLO,
      }),
    )
  })
})
