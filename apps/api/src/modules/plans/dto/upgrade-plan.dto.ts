import { ApiProperty } from '@nestjs/swagger'
import { IsEnum } from 'class-validator'
import { SubscriptionPlan, type UpgradePlanRequest } from '@biztrack/types'

export class UpgradePlanDto implements UpgradePlanRequest {
  @ApiProperty({ enum: SubscriptionPlan })
  @IsEnum(SubscriptionPlan)
  plan!: SubscriptionPlan
}
