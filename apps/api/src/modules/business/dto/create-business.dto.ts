import { IsString, IsOptional, IsEnum, MinLength, MaxLength, IsEmail } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import type { CreateBusinessRequest } from '@biztrack/types'
import { BusinessType } from '@biztrack/types'

export class CreateBusinessDto implements CreateBusinessRequest {
  @ApiProperty({ example: 'Boutique Kamga' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string

  @ApiPropertyOptional({ enum: BusinessType, example: BusinessType.BOUTIQUE })
  @IsOptional()
  @IsEnum(BusinessType)
  type?: BusinessType

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @ApiPropertyOptional({ example: '+237612345678' })
  @IsOptional()
  @IsString()
  phone?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string

  @ApiPropertyOptional({ example: 'Akwa, Douala' })
  @IsOptional()
  @IsString()
  address?: string

  @ApiPropertyOptional({ example: 'Douala' })
  @IsOptional()
  @IsString()
  city?: string

  @ApiPropertyOptional({ example: 'CM', default: 'CM' })
  @IsOptional()
  @IsString()
  country?: string

  @ApiPropertyOptional({ enum: ['XAF', 'USD', 'EUR'], default: 'XAF' })
  @IsOptional()
  @IsString()
  currency?: string
}
