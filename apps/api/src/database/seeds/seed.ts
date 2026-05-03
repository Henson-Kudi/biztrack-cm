import 'reflect-metadata'
import { AppDataSource } from '../data-source'
import { User } from '../../entities/user.entity'
import { Business, BusinessType, SubscriptionStatus } from '../../entities/business.entity'
import { BusinessMember } from '../../entities/business-member.entity'
import { ProductCategory } from '../../entities/product-category.entity'
import { InventoryLevel } from '../../entities/inventory-level.entity'
import { Product } from '../../entities/product.entity'
import { UnitOfMeasure, UomType } from '../../entities/unit-of-measure.entity'
import * as bcrypt from 'bcryptjs'
import { SubscriptionPlan, UserRole, BusinessMemberRole, BusinessMemberStatus } from '@biztrack/types'
import { Locale } from '@/common/enums/locale.enum'
import { IsNull } from 'typeorm'

async function seed() {
  await AppDataSource.initialize()
  console.log('Seeding database...')

  const usersRepo = AppDataSource.getRepository(User)
  const businessRepo = AppDataSource.getRepository(Business)
  const categoriesRepo = AppDataSource.getRepository(ProductCategory)
  const inventoryLevelsRepo = AppDataSource.getRepository(InventoryLevel)
  const productsRepo = AppDataSource.getRepository(Product)
  const membersRepo = AppDataSource.getRepository(BusinessMember)
  const unitsRepo = AppDataSource.getRepository(UnitOfMeasure)

  const passwordHash = await bcrypt.hash('password123', 12)

  // Create or find demo owner
  let owner = await usersRepo.findOne({ where: { email: 'demo@biztrack.cm' } })
  if (!owner) {
    owner = usersRepo.create({
      name: 'Jean Kamga',
      email: 'demo@biztrack.cm',
      passwordHash,
      role: UserRole.OWNER,
      language: Locale.FR,
      isEmailVerified: true,
    })
    await usersRepo.save(owner)
  }

  // Create or find demo business
  let business = await businessRepo.findOne({ where: { ownerId: owner.id } })
  if (!business) {
    business = businessRepo.create({
      name: 'Boutique Kamga',
      slug: 'boutique-kamga',
      city: 'Douala',
      country: 'CM',
      currency: 'XAF',
      ownerId: owner.id,
      plan: SubscriptionPlan.FREE,
      subscriptionStatus: SubscriptionStatus.TRIAL,
      type: BusinessType.BOUTIQUE,
    })
    await businessRepo.save(business)
  }

  const existingMember = await membersRepo.findOne({ where: { businessId: business.id, userId: owner.id } })
  if (!existingMember) {
    await membersRepo.save(
      membersRepo.create({
        businessId: business.id,
        userId: owner.id,
        role: BusinessMemberRole.OWNER,
        status: BusinessMemberStatus.ACTIVE,
      }),
    )
  }

  const pieceUnit = await unitsRepo.findOne({ where: { businessId: IsNull(), name: 'Piece' } })
    ?? await unitsRepo.save(unitsRepo.create({
      name: 'Piece',
      abbreviation: 'pcs',
      type: UomType.QUANTITY,
      isDefault: true,
    }))

  // Create demo categories
  const catBoissons = await categoriesRepo.findOne({ where: { id: 'cat-boissons-seed' } })
    ?? await categoriesRepo.save(categoriesRepo.create({
      id: 'cat-boissons-seed',
      businessId: business.id,
      name: 'Boissons',
      slug: 'boissons',
    }))

  const catAlimentaire = await categoriesRepo.findOne({ where: { id: 'cat-alimentaire-seed' } })
    ?? await categoriesRepo.save(categoriesRepo.create({
      id: 'cat-alimentaire-seed',
      businessId: business.id,
      name: 'Alimentaire',
      slug: 'alimentaire',
    }))

  // Create demo products (skip if already exist by barcode)
  const products: Partial<Product>[] = [
    {
      businessId: business.id,
      name: 'Coca-Cola 50cl',
      barcode: '5449000000996',
      slug: 'coca-cola-50cl',
      sku: 'BOI-COCA-50CL',
      unitOfMeasureId: pieceUnit.id,
      sellingPrice: 500,
      costPrice: 350,
      categoryId: catBoissons.id,
    },
    {
      businessId: business.id,
      name: 'Eau Minerale 1.5L',
      slug: 'eau-minerale-15l',
      sku: 'BOI-EAU-15L',
      unitOfMeasureId: pieceUnit.id,
      sellingPrice: 350,
      costPrice: 200,
      categoryId: catBoissons.id,
    },
    {
      businessId: business.id,
      name: 'Pain de mie',
      slug: 'pain-de-mie',
      sku: 'ALI-PAIN-MIE',
      unitOfMeasureId: pieceUnit.id,
      sellingPrice: 1200,
      costPrice: 900,
      categoryId: catAlimentaire.id,
    },
  ]

  for (const p of products) {
    const existing = p.barcode
      ? await productsRepo.findOne({ where: { businessId: business.id, barcode: p.barcode } })
      : null
    if (!existing) {
      const created = await productsRepo.save(productsRepo.create(p))
      const defaults = {
        'Coca-Cola 50cl': { quantity: 48, lowStockThreshold: 12 },
        'Eau Minerale 1.5L': { quantity: 72, lowStockThreshold: 24 },
        'Pain de mie': { quantity: 8, lowStockThreshold: 5 },
      } as const

      const inventory = defaults[created.name as keyof typeof defaults]
      if (inventory) {
        await inventoryLevelsRepo.save(inventoryLevelsRepo.create({
          businessId: business.id,
          productId: created.id,
          quantity: inventory.quantity,
          lowStockThreshold: inventory.lowStockThreshold,
        }))
      }
    }
  }

  console.log('Seed complete:', { owner: owner.email, business: business.name })
  await AppDataSource.destroy()
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
