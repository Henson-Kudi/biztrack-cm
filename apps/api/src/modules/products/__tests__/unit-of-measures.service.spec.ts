/// <reference types="jest" />
import { UnitOfMeasureType } from '@biztrack/types'
import { UnitOfMeasuresService } from '../services/unit-of-measures.service'

const makeService = () => {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    getOne: jest.fn(),
  }
  const unitsRepo = {
    createQueryBuilder: jest.fn(() => qb),
    create: jest.fn((input) => input),
    save: jest.fn(async (input) => ({ id: 'uom-1', ...input })),
  }

  const productsRepo = {
    count: jest.fn(),
  }
  const i18n = { translate: jest.fn(async (key: string) => key) }
  const logger = {
    setContext: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }

  const service = new UnitOfMeasuresService(unitsRepo as any, productsRepo as any, i18n as any, logger as any)

  return {
    service,
    qb,
    unitsRepo,
  }
}

describe('UnitOfMeasuresService', () => {
  it('lists system and business units with default-first ordering', async () => {
    const { service, qb } = makeService()
    qb.getManyAndCount.mockResolvedValue([
      [{ id: 'system-piece', name: 'Piece' }, { id: 'custom-cuv', name: 'Cuvette' }],
      2,
    ])

    const result = await service.findForBusiness('business-1', {})

    expect(qb.orderBy).toHaveBeenCalledWith('uom.is_default', 'DESC')
    expect(qb.addOrderBy).toHaveBeenCalledWith('uom.name', 'ASC')
    expect(result).toEqual({
      data: [{ id: 'system-piece', name: 'Piece' }, { id: 'custom-cuv', name: 'Cuvette' }],
      total: 2,
      page: 1,
      limit: 20,
      totalPages: 1,
    })
  })

  it('checks uniqueness only within the current business when creating a custom unit', async () => {
    const { service, qb, unitsRepo } = makeService()
    qb.getOne.mockResolvedValue(null)

    await service.create('business-1', {
      name: 'Piece',
      abbreviation: 'pc',
      type: UnitOfMeasureType.CUSTOM,
    })

    expect(qb.where).toHaveBeenCalledWith('uom.business_id = :businessId', {
      businessId: 'business-1',
    })
    expect(unitsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'business-1',
        name: 'Piece',
        abbreviation: 'pc',
        type: UnitOfMeasureType.CUSTOM,
        isDefault: false,
      }),
    )
  })
})
