import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString } from 'class-validator'
import { PrefferedPhoneChannel, type RequestLoginRequest } from '@biztrack/types'
import { Transform } from 'class-transformer'

export class RequestLoginDto implements RequestLoginRequest {
  @ApiProperty({ example: '+237612345678 OR jean@example.com' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  identifier!: string

  @ApiProperty({ enum: PrefferedPhoneChannel, required: false })
  @IsOptional()
  @IsEnum(PrefferedPhoneChannel)
  preferredOtpChannel?: PrefferedPhoneChannel
}
