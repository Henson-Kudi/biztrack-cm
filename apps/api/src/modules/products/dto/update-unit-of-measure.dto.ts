import { ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { IsBoolean, IsOptional } from 'class-validator'
import type { UpdateUnitOfMeasureRequest } from '@biztrack/types'
import { CreateUnitOfMeasureDto } from './create-unit-of-measure.dto'

export class UpdateUnitOfMeasureDto
  extends PartialType(CreateUnitOfMeasureDto)
  implements UpdateUnitOfMeasureRequest
{
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
