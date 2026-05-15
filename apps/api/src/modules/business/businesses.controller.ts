import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Business, BusinessMembershipSummary, JwtPayload } from '@biztrack/types'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { serializeDto, serializeDtos } from '@/common/http/serialization'
import { BusinessService } from './business.service'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { BusinessDto, BusinessMembershipSummaryDto } from './dto/business-response.dto'
import { UpdateBusinessDto } from './dto/update-business.dto'

@ApiTags('Businesses')
@ApiBearerAuth()
@Controller('businesses')
export class BusinessesController {
  constructor(private businessService: BusinessService) {}

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List businesses for current user' })
  async mine(@CurrentUser() user: JwtPayload) {
  const memberships = await this.businessService.listMembershipsForUser(user.sub)
  const businesses = serializeDtos(memberships, (membership) =>
    BusinessMembershipSummaryDto.fromEntity(membership),
  )
  return businesses


  }

  @Post('setup')
  @UseGuards(Phase2Guard)
  @ApiOperation({ summary: 'Setup business details during onboarding' })
  async setup(@CurrentUser() user: JwtPayload, @Body() dto: UpdateBusinessDto): Promise<Business> {
    return serializeDto(
      BusinessDto.fromEntity(
        await this.businessService.update(user.businessId as string, user.sub, dto),
      )!,
    )
  }
}
