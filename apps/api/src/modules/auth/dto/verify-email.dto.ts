import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsEmail, Length, IsOptional, IsString } from 'class-validator'
import type { VerifyEmailRequest } from '@biztrack/types'

export class VerifyEmailDto implements VerifyEmailRequest {
  @ApiProperty({ example: 'jean@example.com' })
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string

  @ApiProperty({ example: '123456' })
  @Length(6, 6)
  code!: string

  @ApiProperty({ required: false, description: 'Invite token for staff onboarding' })
  @IsOptional()
  @IsString()
  inviteToken?: string
}
