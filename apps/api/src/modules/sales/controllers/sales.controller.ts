import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Resource, type DailySalesSummary, type JwtPayload, type PaginatedResult, type Sale, type SaleListItem, type SaleReceipt } from '@biztrack/types'
import { serializeDto, serializePaginatedResult } from '@/common/http/serialization'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { RequireResource, ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { CreateSaleDto } from '../dto/create-sale.dto'
import { DailySalesSummaryQueryDto } from '../dto/daily-sales-summary-query.dto'
import { ListSalesQueryDto } from '../dto/list-sales-query.dto'
import {
  DailySalesSummaryDto,
  SaleListItemDto,
  SaleReceiptDto,
  SaleResponseDto,
} from '../dto/sale-response.dto'
import { VoidSaleDto } from '../dto/void-sale.dto'
import { SalesService } from '../services/sales.service'

@ApiTags('Sales')
@ApiBearerAuth()
@UseGuards(Phase2Guard, ResourceGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequireResource(Resource.SALES_CREATE)
  @ApiOperation({ summary: 'Create a completed sale' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateSaleDto): Promise<Sale> {
    return serializeDto(
      SaleResponseDto.fromEntity(
        await this.salesService.create(user.businessId as string, user, dto),
      ),
    )
  }

  @Get()
  @RequireResource(Resource.SALES_VIEW)
  @ApiOperation({ summary: 'List sales' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListSalesQueryDto,
  ): Promise<PaginatedResult<SaleListItem>> {
    return serializePaginatedResult(
      await this.salesService.findAll(user.businessId as string, query),
      (sale) => SaleListItemDto.fromEntity(sale as never),
    )
  }

  @Get('summary/daily')
  @RequireResource(Resource.SALES_VIEW)
  @ApiOperation({ summary: 'Get daily sales summary' })
  async getDailySummary(
    @CurrentUser() user: JwtPayload,
    @Query() query: DailySalesSummaryQueryDto,
  ): Promise<DailySalesSummary> {
    return serializeDto(
      DailySalesSummaryDto.fromEntity(
        await this.salesService.getDailySummary(user.businessId as string, query.date),
      ),
    )
  }

  @Get('by-number/:saleNumber')
  @RequireResource(Resource.SALES_VIEW)
  @ApiOperation({ summary: 'Get sale by human-readable sale number' })
  async findByNumber(
    @CurrentUser() user: JwtPayload,
    @Param('saleNumber') saleNumber: string,
  ): Promise<Sale> {
    return serializeDto(
      SaleResponseDto.fromEntity(
        await this.salesService.findByNumber(saleNumber, user.businessId as string),
      ),
    )
  }

  @Get(':id/receipt')
  @RequireResource(Resource.SALES_VIEW)
  @ApiOperation({ summary: 'Get structured receipt payload for a sale' })
  async getReceipt(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<SaleReceipt> {
    const payload = await this.salesService.getReceipt(id, user.businessId as string)
    return serializeDto(SaleReceiptDto.fromSale(payload.sale, payload.business))
  }

  @Post(':id/void')
  @RequireResource(Resource.SALES_VOID)
  @ApiOperation({ summary: 'Void a sale and reverse inventory' })
  async void(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: VoidSaleDto,
  ): Promise<Sale> {
    return serializeDto(
      SaleResponseDto.fromEntity(
        await this.salesService.void(id, user.businessId as string, user, dto),
      ),
    )
  }

  @Get(':id')
  @RequireResource(Resource.SALES_VIEW)
  @ApiOperation({ summary: 'Get sale detail' })
  async findById(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<Sale> {
    return serializeDto(
      SaleResponseDto.fromEntity(
        await this.salesService.findById(id, user.businessId as string),
      ),
    )
  }
}
