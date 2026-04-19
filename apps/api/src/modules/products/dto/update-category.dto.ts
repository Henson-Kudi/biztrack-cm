import { PartialType } from '@nestjs/mapped-types'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional } from 'class-validator'
import type { UpdateCategoryRequest } from '@biztrack/types'
import { CreateCategoryDto } from './create-category.dto'

export class UpdateCategoryDto
  extends PartialType(CreateCategoryDto)
  implements UpdateCategoryRequest
{
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
