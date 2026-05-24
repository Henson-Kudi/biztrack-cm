import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type {
  CancelPlanResponse,
  CurrentSubscriptionResponse,
  JwtPayload,
  ListPlansResponse,
  PlanStateResponse,
  QuotaUsageResponse,
  SelectPlanResponse,
  UpgradePlanResponse,
} from '@biztrack/types'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { serializeDto } from '@/common/http/serialization'
import { PlansService } from './plans.service'
import {
  CancelPlanResponseDto,
  CurrentSubscriptionResponseDto,
  ListPlansResponseDto,
  PlanStateResponseDto,
  QuotaUsageResponseDto,
  SelectPlanResponseDto,
  UpgradePlanResponseDto,
} from './dto/plan-response.dto'
import { SelectPlanDto } from './dto/select-plan.dto'
import { UpgradePlanDto } from './dto/upgrade-plan.dto'
import { RequireOnboardingStep, OnboardingGuard } from '@/common/guards/onboarding.guard'
import { OnboardingStep } from '@/entities/user.entity'

@ApiTags('Plans')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('plans')
export class PlansController {
  constructor(private plansService: PlansService) {}

  @Get()
  @ApiOperation({ summary: 'List available plans' })
  async getPlans(@CurrentUser() user: JwtPayload): Promise<ListPlansResponse> {
    return serializeDto(
      ListPlansResponseDto.fromModel(await this.plansService.listPlans(user.businessId as string)),
    )
  }

  @Post('select')
  @UseGuards(OnboardingGuard)
  @RequireOnboardingStep(OnboardingStep.SELECT_PLAN)
  @ApiOperation({ summary: 'Select a plan' })
  async selectPlan(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SelectPlanDto,
  ): Promise<SelectPlanResponse> {
    return serializeDto(
      SelectPlanResponseDto.fromModel(
        await this.plansService.selectPlan(user.businessId as string, dto.plan),
      ),
    )
  }

  @Get('my-subscription')
  @ApiOperation({ summary: 'Get current subscription' })
  async mySubscription(@CurrentUser() user: JwtPayload): Promise<CurrentSubscriptionResponse> {
    return serializeDto(
      CurrentSubscriptionResponseDto.fromModel(
        await this.plansService.mySubscription(user.businessId as string),
      ),
    )
  }

  @Get('state')
  @ApiOperation({ summary: 'Get cached desktop plan-state bootstrap data' })
  async getPlanState(@CurrentUser() user: JwtPayload): Promise<PlanStateResponse> {
    return serializeDto(
      PlanStateResponseDto.fromModel(
        await this.plansService.getPlanState(user.businessId as string),
      ),
    )
  }

  @Get('quota-usage')
  @ApiOperation({ summary: 'Get current quota usage for the active business plan' })
  async getQuotaUsage(@CurrentUser() user: JwtPayload): Promise<QuotaUsageResponse> {
    return serializeDto(
      QuotaUsageResponseDto.fromModel(
        await this.plansService.getQuotaUsage(user.businessId as string),
      ),
    )
  }

  @Post('upgrade')
  @ApiOperation({ summary: 'Upgrade or downgrade plan' })
  async upgradePlan(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpgradePlanDto,
  ): Promise<UpgradePlanResponse> {
    return serializeDto(
      UpgradePlanResponseDto.fromModel(
        await this.plansService.upgradePlan(user.businessId as string, dto.plan),
      ),
    )
  }

  @Post('cancel')
  @ApiOperation({ summary: 'Cancel subscription at period end' })
  async cancelPlan(@CurrentUser() user: JwtPayload): Promise<CancelPlanResponse> {
    return serializeDto(
      CancelPlanResponseDto.fromModel(
        await this.plansService.cancelPlan(user.businessId as string),
      ),
    )
  }
}
