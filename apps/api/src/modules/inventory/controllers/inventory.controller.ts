import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Resource } from '@biztrack/types'
import type {
  InventoryAlert,
  InventoryDetail,
  InventoryListItem,
  InventoryMovement,
  JwtPayload,
  PaginatedResult,
  RestockResponse,
} from '@biztrack/types'
import { serializeDto, serializePaginatedResult } from '@/common/http/serialization'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { RequireResource, ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { AdjustStockDto } from '../dto/adjust-stock.dto'
import {
  InventoryAlertDto,
  InventoryDetailDto,
  InventoryListItemDto,
  InventoryMovementDto,
  RestockResponseDto,
} from '../dto/inventory-response.dto'
import { ListInventoryAlertsQueryDto } from '../dto/list-inventory-alerts-query.dto'
import { ListInventoryQueryDto } from '../dto/list-inventory-query.dto'
import { ListInventoryMovementsQueryDto } from '../dto/list-inventory-movements-query.dto'
import { RestockDto } from '../dto/restock.dto'
import { SetThresholdDto } from '../dto/set-threshold.dto'
import { InventoryService } from '../services/inventory.service'

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(Phase2Guard, ResourceGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequireResource(Resource.INVENTORY_VIEW)
  @ApiOperation({ summary: 'List inventory levels' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListInventoryQueryDto,
  ): Promise<PaginatedResult<InventoryListItem>> {
    return serializePaginatedResult(
      await this.inventoryService.findAll(user.businessId as string, query),
      (item) => InventoryListItemDto.fromModel(item),
    )
  }

  @Get('alerts')
  @RequireResource(Resource.INVENTORY_ALERTS)
  @ApiOperation({ summary: 'List low stock alerts' })
  async getAlerts(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListInventoryAlertsQueryDto,
  ): Promise<PaginatedResult<InventoryAlert>> {
    return serializePaginatedResult(
      await this.inventoryService.getAlerts(user.businessId as string, query),
      (item) => InventoryAlertDto.fromModel(item),
    )
  }

  @Get('movements')
  @RequireResource(Resource.INVENTORY_VIEW)
  @ApiOperation({ summary: 'List inventory movements across all products' })
  async getAllMovements(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListInventoryMovementsQueryDto,
  ): Promise<PaginatedResult<InventoryMovement>> {
    return serializePaginatedResult(
      await this.inventoryService.getAllMovements(user.businessId as string, query),
      (movement) => InventoryMovementDto.fromEntity(movement),
    )
  }

  @Post('restock')
  @RequireResource(Resource.INVENTORY_ADJUST)
  @ApiOperation({ summary: 'Record a restock event' })
  async restock(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RestockDto,
  ): Promise<RestockResponse> {
    return serializeDto(
      RestockResponseDto.fromModel(
        await this.inventoryService.restock(user.businessId as string, user.sub, dto),
      ),
    )
  }

  @Get(':productId/movements')
  @RequireResource(Resource.INVENTORY_VIEW)
  @ApiOperation({ summary: 'List inventory movements for a product' })
  async getMovements(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Query() query: ListInventoryMovementsQueryDto,
  ): Promise<PaginatedResult<InventoryMovement>> {
    return serializePaginatedResult(
      await this.inventoryService.getMovements(productId, user.businessId as string, query),
      (movement) => InventoryMovementDto.fromEntity(movement),
    )
  }

  @Patch(':productId/threshold')
  @RequireResource(Resource.INVENTORY_ADJUST)
  @ApiOperation({ summary: 'Set low stock threshold for a product' })
  async setThreshold(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Body() dto: SetThresholdDto,
  ): Promise<InventoryDetail> {
    return serializeDto(
      InventoryDetailDto.fromModel(
        await this.inventoryService.setThreshold(productId, user.businessId as string, dto),
      ),
    )
  }

  @Post(':productId/adjust')
  @RequireResource(Resource.INVENTORY_ADJUST)
  @ApiOperation({ summary: 'Adjust product inventory manually' })
  async adjust(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Body() dto: AdjustStockDto,
  ): Promise<InventoryDetail> {
    return serializeDto(
      InventoryDetailDto.fromModel(
        await this.inventoryService.adjust(productId, user.businessId as string, user.sub, dto),
      ),
    )
  }

  @Get(':productId')
  @RequireResource(Resource.INVENTORY_VIEW)
  @ApiOperation({ summary: 'Get inventory details for a product' })
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
  ): Promise<InventoryDetail> {
    return serializeDto(
      InventoryDetailDto.fromModel(
        await this.inventoryService.findOne(productId, user.businessId as string),
      ),
    )
  }
}
