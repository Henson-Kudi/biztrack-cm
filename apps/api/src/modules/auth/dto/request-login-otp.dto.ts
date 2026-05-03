import { ApiProperty } from '@nestjs/swagger'
import { Matches } from 'class-validator'
import type { RequestLoginOtpRequest } from '@biztrack/types'

export class RequestLoginOtpDto implements RequestLoginOtpRequest {
  @ApiProperty({ example: '+237612345678' })
  @Matches(/^\+237[6-9]\d{8}$/, { message: 'Invalid Cameroonian phone number' })
  phone!: string
}
