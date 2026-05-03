import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength } from 'class-validator'
import type { AssignBarcodeRequest } from '@biztrack/types'

export class AssignBarcodeDto implements AssignBarcodeRequest {
  @ApiProperty({ example: '5449000000996' })
  @IsString()
  @MaxLength(100)
  barcode!: string
}
