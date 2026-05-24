import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'

export class IssueSyncTokenDto {
  @ApiProperty({
    description: 'Stable device identifier generated and persisted by the desktop app.',
  })
  @IsUUID()
  deviceId!: string

  @ApiPropertyOptional({
    description: 'Human-readable device name so support can identify which machine owns a sync token.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceName?: string | null

  @ApiPropertyOptional({
    description: 'Platform fingerprint such as win32/x64 used for troubleshooting and audits.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  platform?: string | null

  @ApiPropertyOptional({
    description: 'Desktop app version that requested the sync token.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  appVersion?: string | null
}
