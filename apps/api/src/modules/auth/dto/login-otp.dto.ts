import { ApiProperty } from '@nestjs/swagger'
import { Length, IsString } from 'class-validator'
import type { LoginOtpRequest } from '@biztrack/types'

export class LoginOtpDto implements LoginOtpRequest {
  @ApiProperty({ example: '+237612345678' })
  @IsString()
  identifier!: string

  @ApiProperty({ example: '123456' })
  @Length(6, 6)
  code!: string
}
