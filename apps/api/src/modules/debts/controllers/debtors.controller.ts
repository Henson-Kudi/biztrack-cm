import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  DebtDirection,
  Resource,
  type AgeingReport,
  type Debt,
  type DebtDirectionSummary,
  type DebtListResult,
  type JwtPayload,
} from '@biztrack/types'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { RequireResource, ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { ListDebtsQueryDto } from '../dto/list-debts-query.dto'
import { RecordDebtPaymentDto } from '../dto/record-debt-payment.dto'
import { WriteOffDebtDto } from '../dto/write-off-debt.dto'
import { DebtsService } from '../services/debts.service'
import { OpeningBalancesService } from '../services/opening-balances.service'

@ApiTags('Debtors')
@ApiBearerAuth()
@UseGuards(Phase2Guard, ResourceGuard)
@Controller('debtors')
export class DebtorsController {
  constructor(
    private readonly debtsService: DebtsService,
    private readonly openingBalancesService: OpeningBalancesService,
  ) {}

  @Get('ageing')
  @RequireResource(Resource.DEBTS_VIEW)
  @ApiOperation({ summary: 'Get receivable ageing report' })
  getAgeingReport(@CurrentUser() user: JwtPayload): Promise<AgeingReport> {
    return this.openingBalancesService.getAgeingReport(
      user.businessId as string,
      DebtDirection.RECEIVABLE,
    )
  }

  @Get()
  @RequireResource(Resource.DEBTS_VIEW)
  @ApiOperation({ summary: 'List receivable debts' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListDebtsQueryDto,
  ): Promise<DebtListResult> {
    return this.debtsService.findAllByDirection(
      user.businessId as string,
      DebtDirection.RECEIVABLE,
      query,
    )
  }

  @Get('summary')
  @RequireResource(Resource.DEBTS_VIEW)
  @ApiOperation({ summary: 'Get debtors summary' })
  getSummary(@CurrentUser() user: JwtPayload): Promise<DebtDirectionSummary> {
    return this.debtsService.getSummary(user.businessId as string, DebtDirection.RECEIVABLE)
  }

  @Get(':debtId')
  @RequireResource(Resource.DEBTS_VIEW)
  @ApiOperation({ summary: 'Get receivable debt detail' })
  findById(@CurrentUser() user: JwtPayload, @Param('debtId') debtId: string): Promise<Debt> {
    return this.debtsService.findById(debtId, user.businessId as string, DebtDirection.RECEIVABLE)
  }

  @Post(':debtId/payments')
  @RequireResource(Resource.DEBTS_RECORD_PAYMENT)
  @ApiOperation({ summary: 'Record a payment against a receivable debt' })
  recordPayment(
    @CurrentUser() user: JwtPayload,
    @Param('debtId') debtId: string,
    @Body() dto: RecordDebtPaymentDto,
  ): Promise<Debt> {
    return this.debtsService.recordPayment(
      user.businessId as string,
      user,
      DebtDirection.RECEIVABLE,
      debtId,
      dto,
    )
  }

  @Delete(':debtId/payments/:paymentId')
  @RequireResource(Resource.DEBTS_DELETE_PAYMENT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a receivable debt payment' })
  deletePayment(
    @CurrentUser() user: JwtPayload,
    @Param('debtId') debtId: string,
    @Param('paymentId') paymentId: string,
  ): Promise<void> {
    return this.debtsService.deletePayment(
      user.businessId as string,
      user,
      DebtDirection.RECEIVABLE,
      debtId,
      paymentId,
    )
  }

  @Post(':debtId/write-off')
  @RequireResource(Resource.DEBTS_WRITE_OFF)
  @ApiOperation({ summary: 'Write off a receivable debt' })
  writeOff(
    @CurrentUser() user: JwtPayload,
    @Param('debtId') debtId: string,
    @Body() dto: WriteOffDebtDto,
  ): Promise<Debt> {
    return this.debtsService.writeOff(
      user.businessId as string,
      user,
      DebtDirection.RECEIVABLE,
      debtId,
      dto,
    )
  }
}
