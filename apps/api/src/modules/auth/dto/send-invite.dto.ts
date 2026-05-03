import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsEnum, IsOptional, IsString, Matches } from 'class-validator'
import { BusinessMemberRole, type SendInviteRequest } from '@biztrack/types'

export class SendInviteDto implements SendInviteRequest {
  @ApiProperty({ enum: BusinessMemberRole, example: BusinessMemberRole.CASHIER })
  @IsEnum(BusinessMemberRole)
  role!: BusinessMemberRole

  @ApiProperty({ required: false, example: '+237612345678' })
  @IsOptional()
  @IsString()
  @Matches(/^\+237[6-9]\d{8}$/)
  phone?: string

  @ApiProperty({ required: false, example: 'staff@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string
}
