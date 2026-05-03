import type {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  QueryDeepPartialEntity,
  Repository,
} from 'typeorm'
import type { BaseEntity } from '../entities/base.entity'
import type { PaginatedResult, PaginationOptions } from './pagination'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export abstract class BaseRepository<T extends BaseEntity> {
  protected constructor(protected readonly repo: Repository<T>) { }

  async findById(id: string, options?: FindOneOptions<T>): Promise<T | null> {
    return this.repo.findOne({ where: { id } as FindOptionsWhere<T>, ...options })
  }

  async findOne(options: FindOneOptions<T>) {
    return this.repo.findOne(options)
  }

  async find(options?: FindManyOptions<T>) {
    return this.repo.find(options)
  }

  create(data: DeepPartial<T>[]): T[]
  create(data: DeepPartial<T>): T
  create(data: DeepPartial<T> | DeepPartial<T>[]) {
    return Array.isArray(data) ? this.repo.create(data) : this.repo.create(data)
  }

  save(entities: DeepPartial<T>[]): Promise<(DeepPartial<T> & T)[]>
  save(entity: DeepPartial<T>): Promise<DeepPartial<T> & T>
  save(entityOrEntities: DeepPartial<T> | DeepPartial<T>[]) {
    return Array.isArray(entityOrEntities)
      ? this.repo.save(entityOrEntities)
      : this.repo.save(entityOrEntities)
  }

  update(id: string, data: QueryDeepPartialEntity<T>) {
    return this.repo.update(id, data)
  }

  delete(criteria: FindOptionsWhere<T> | FindOptionsWhere<T>[]) {
    return this.repo.delete(criteria)
  }

  createQueryBuilder(alias: string) {
    return this.repo.createQueryBuilder(alias)
  }

  async findAll(options?: FindManyOptions<T>) {
    return this.repo.find(options)
  }

  async createOne(data: DeepPartial<T>): Promise<DeepPartial<T> & T> {
    const entity = this.repo.create(data)
    return this.repo.save(entity)
  }

  async updateById(id: string, data: QueryDeepPartialEntity<T>): Promise<T | null> {
    await this.repo.update(id, data)
    return this.findById(id)
  }

  async softDeleteById(id: string) {
    return this.repo.softDelete(id)
  }

  async paginate(
    where?: FindOptionsWhere<T>,
    options?: PaginationOptions<T>,
  ): Promise<PaginatedResult<T>> {
    const page = Math.max(options?.page ?? 1, 1)
    const limit = Math.min(Math.max(options?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
    const skip = (page - 1) * limit

    console.log('where clauses', where);


    const [data, total] = await this.repo.findAndCount({
      where,
      order: options?.order,
      skip,
      take: limit,
    })

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }
}
