import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString } from 'class-validator'
import { OtpType, PrefferedPhoneChannel, type ResendOtpRequest } from '@biztrack/types'
import { Transform } from 'class-transformer'

export { OtpType }

export class ResendOtpDto implements ResendOtpRequest {
  @ApiProperty({ example: '+237612345678 OR jean@example.com' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  identifier!: string

  @ApiProperty({ enum: OtpType })
  @IsEnum(OtpType)
  type!: OtpType

  @ApiProperty({ enum: PrefferedPhoneChannel, required: false })
  @IsOptional()
  @IsEnum(PrefferedPhoneChannel)
  channel?: PrefferedPhoneChannel
}
