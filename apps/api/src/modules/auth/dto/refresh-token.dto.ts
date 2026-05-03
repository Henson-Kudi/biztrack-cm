import { IsOptional, IsString } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import type { RefreshTokenRequest } from '@biztrack/types'

export class RefreshTokenDto implements RefreshTokenRequest {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  refreshToken?: string
}
