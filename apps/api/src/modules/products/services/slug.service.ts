import { Injectable } from '@nestjs/common'
import { Not } from 'typeorm'
import { ProductCategoriesRepository } from '../repositories/product-categories.repository'
import { ProductsRepository } from '../repositories/products.repository'

@Injectable()
export class SlugService {
  constructor(
    private readonly productsRepo: ProductsRepository,
    private readonly categoriesRepo: ProductCategoriesRepository,
  ) {}

  async generateProductSlug(name: string, businessId: string, excludeId?: string): Promise<string> {
    return this.ensureUnique(this.toSlug(name), businessId, 'product', excludeId)
  }

  async generateCategorySlug(name: string, businessId: string, excludeId?: string): Promise<string> {
    return this.ensureUnique(this.toSlug(name), businessId, 'category', excludeId)
  }

  private async ensureUnique(
    baseSlug: string,
    businessId: string,
    type: 'product' | 'category',
    excludeId?: string,
  ) {
    const base = baseSlug || 'item'
    let slug = base
    let suffix = 2

    while (true) {
      const where = {
        businessId,
        slug,
        ...(excludeId ? { id: Not(excludeId) } : {}),
      }
      const existing =
        type === 'product'
          ? await this.productsRepo.findOne({ where })
          : await this.categoriesRepo.findOne({ where })

      if (!existing) return slug
      slug = `${base}-${suffix++}`
    }
  }

  private toSlug(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 200)
  }
}
