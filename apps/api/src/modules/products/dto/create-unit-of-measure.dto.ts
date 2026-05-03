import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsString, MaxLength } from 'class-validator'
import { UnitOfMeasureType, type CreateUnitOfMeasureRequest } from '@biztrack/types'

export class CreateUnitOfMeasureDto implements CreateUnitOfMeasureRequest {
  @ApiProperty({ example: 'Cuvette' })
  @IsString()
  @MaxLength(50)
  name!: string

  @ApiProperty({ example: 'cuv' })
  @IsString()
  @MaxLength(10)
  abbreviation!: string

  @ApiProperty({ enum: UnitOfMeasureType, example: UnitOfMeasureType.CUSTOM })
  @IsEnum(UnitOfMeasureType)
  type!: UnitOfMeasureType
}
