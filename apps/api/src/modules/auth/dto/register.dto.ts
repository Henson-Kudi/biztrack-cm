import { IsEmail, IsString, MinLength, MaxLength, IsOptional, Matches, IsEnum } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { PrefferedPhoneChannel } from '@biztrack/types'
import { Transform } from 'class-transformer'
import { Locale } from '@/common/enums/locale.enum'

export class RegisterDto {
  @ApiProperty({ example: 'Jean Dupont' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string

  @ApiProperty({ example: '+237612345678' })
  @Matches(/^\+2376[524789]\d{7}$/, { message: 'Invalid Cameroonian phone number' })
  phone!: string

  @ApiPropertyOptional({ example: 'jean@example.com' })
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  email?: string

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'Password must include lowercase, uppercase, number, and special character',
  })
  password!: string

  @ApiPropertyOptional({ enum: Locale, default: Locale.FR })
  @IsOptional()
  @IsEnum(Locale)
  language?: Locale

  @ApiPropertyOptional({ enum: Locale, default: Locale.FR, description: 'Alias for language' })
  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale

  @ApiPropertyOptional({ enum: PrefferedPhoneChannel, default: PrefferedPhoneChannel.WHATSAPP })
  @IsOptional()
  @IsEnum(PrefferedPhoneChannel)
  preferredPhoneChannel?: PrefferedPhoneChannel

  @ApiPropertyOptional({ description: 'Invite token for staff onboarding' })
  @IsOptional()
  @IsString()
  inviteToken?: string
}
