import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength, MinLength } from 'class-validator'
import type { VoidSaleRequest } from '@biztrack/types'

export class VoidSaleDto implements VoidSaleRequest {
  @ApiProperty({ minLength: 10, maxLength: 1000 })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string
}
