import { ApiProperty } from '@nestjs/swagger'
import { IsEnum } from 'class-validator'
import { SubscriptionPlan, type SelectPlanRequest } from '@biztrack/types'

export class SelectPlanDto implements SelectPlanRequest {
  @ApiProperty({ enum: SubscriptionPlan })
  @IsEnum(SubscriptionPlan)
  plan!: SubscriptionPlan
}
