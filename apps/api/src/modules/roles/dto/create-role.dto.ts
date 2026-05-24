import { ApiProperty } from '@nestjs/swagger'
import { IsArray, IsHexColor, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import type { CreateRoleRequest } from '@biztrack/types'

export class CreateRoleDto implements CreateRoleRequest {
  @ApiProperty({ example: 'Superviseur' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string

  @ApiProperty({ type: [String], example: ['sales:create', 'sales:view_own'] })
  @IsArray()
  @IsString({ each: true })
  permissions!: string[]

  @ApiProperty({ required: false, example: '#1D9E75' })
  @IsOptional()
  @IsHexColor()
  colour?: string
}
