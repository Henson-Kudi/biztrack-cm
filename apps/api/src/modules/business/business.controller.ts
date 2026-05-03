import { Controller, Get, Post, Patch, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import type { Business, JwtPayload } from '@biztrack/types'
import { BusinessService } from './business.service'
import { serializeDto } from '@/common/http/serialization'
import { CreateBusinessDto } from './dto/create-business.dto'
import { BusinessDto } from './dto/business-response.dto'
import { UpdateBusinessDto } from './dto/update-business.dto'
import { Phase2Guard } from '../auth/guards/phase2.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'

@ApiTags('Business')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('business')
export class BusinessController {
  constructor(private businessService: BusinessService) {}

  @Post()
  @ApiOperation({ summary: 'Create a business (called once after registration)' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateBusinessDto): Promise<Business> {
    return serializeDto(BusinessDto.fromEntity(await this.businessService.create(user.sub, dto))!)
  }

  @Get('me')
  @ApiOperation({ summary: 'Get my business' })
  async getMyBusiness(@CurrentUser() user: JwtPayload): Promise<Business> {
    return serializeDto(
      BusinessDto.fromEntity(await this.businessService.findById(user.businessId as string))!,
    )
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update my business' })
  async update(@CurrentUser() user: JwtPayload, @Body() dto: UpdateBusinessDto): Promise<Business> {
    return serializeDto(
      BusinessDto.fromEntity(
        await this.businessService.update(user.businessId as string, user.sub, dto),
      )!,
    )
  }
}
