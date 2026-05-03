import { ApiProperty } from '@nestjs/swagger'
import { IsUUID } from 'class-validator'
import type { SelectBusinessRequest } from '@biztrack/types'

export class SelectBusinessDto implements SelectBusinessRequest {
  @ApiProperty({ example: '00000000-0000-0000-0000-000000000000' })
  @IsUUID()
  businessId!: string
}
