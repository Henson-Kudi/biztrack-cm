/// <reference types="jest" />
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { Resource } from '@biztrack/types'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { InventoryController } from '../controllers/inventory.controller'

describe('InventoryController permissions', () => {
  it('attaches the phase2 and resource guards', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, InventoryController)).toEqual(
      expect.arrayContaining([Phase2Guard, ResourceGuard]),
    )
  })

  it('requires the documented inventory resources per handler', () => {
    expect(Reflect.getMetadata('required_resource', InventoryController.prototype.findAll)).toBe(
      Resource.INVENTORY_VIEW,
    )
    expect(Reflect.getMetadata('required_resource', InventoryController.prototype.getAlerts)).toBe(
      Resource.INVENTORY_ALERTS,
    )
    expect(Reflect.getMetadata('required_resource', InventoryController.prototype.getAllMovements)).toBe(
      Resource.INVENTORY_VIEW,
    )
    expect(Reflect.getMetadata('required_resource', InventoryController.prototype.restock)).toBe(
      Resource.INVENTORY_ADJUST,
    )
    expect(Reflect.getMetadata('required_resource', InventoryController.prototype.adjust)).toBe(
      Resource.INVENTORY_ADJUST,
    )
  })
})
