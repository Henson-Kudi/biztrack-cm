import { Transform } from 'class-transformer'
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator'

export class CreateWaitlistDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 200)
  @Transform(({ value }) => value?.trim())
  name!: string

  @IsEmail()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim().toLowerCase())
  email!: string

  @IsString()
  @IsNotEmpty()
  @Length(8, 50)
  @Transform(({ value }) => value?.trim())
  phone!: string

  @IsOptional()
  @IsIn(['fr', 'en'])
  locale?: string

  @IsOptional()
  @IsString()
  @Length(0, 200)
  utm_source?: string

  @IsOptional()
  @IsString()
  @Length(0, 200)
  utm_medium?: string

  @IsOptional()
  @IsString()
  @Length(0, 200)
  utm_campaign?: string
}
