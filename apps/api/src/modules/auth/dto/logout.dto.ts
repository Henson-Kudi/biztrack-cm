import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'
import type { LogoutRequest } from '@biztrack/types'

export class LogoutDto implements LogoutRequest {
  @ApiPropertyOptional({
    description: 'Refresh token to revoke. Falls back to the auth cookie when omitted.',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string
}
