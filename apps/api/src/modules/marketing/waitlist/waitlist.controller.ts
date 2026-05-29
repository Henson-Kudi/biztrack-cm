import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { WaitlistService } from './waitlist.service'
import { CreateWaitlistDto } from './dto/create-waitlist.dto'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import { ConfigService } from '@nestjs/config'
import { AppConfig } from '@/config/configuration'

@Controller('marketing')
export class WaitlistController {
  constructor(
    private readonly waitlistService: WaitlistService,
    private readonly configService: ConfigService<AppConfig>,
  ) {}

  @Post('waitlist')
  async create(
    @Body() dto: CreateWaitlistDto,
    @Headers('x-internal-secret') secret: string,
    @Headers('authorization') authHeader: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const expected = this.configService.get('INTERNAL_API_SECRET')
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    
    if (!expected || (secret.trim() !== expected && bearerToken?.trim() !== expected)) {
      throw new UnauthorizedException('Invalid internal secret')
    }
    const entry = await this.waitlistService.create(dto, { userAgent })
    return { success: true, id: entry.id }
  }

  @Get('waitlist/stats')
  @UseGuards(JwtAuthGuard)
  async getStats() {
    return this.waitlistService.getStats()
  }

  @Get('waitlist')
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query('status') status?: string,
    @Query('locale') locale?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.waitlistService.findAll({
      status,
      locale,
      dateFrom,
      dateTo,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    })
  }

  @Patch('waitlist/:id/status')
  @UseGuards(JwtAuthGuard)
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Body('notes') notes?: string,
  ) {
    return this.waitlistService.updateStatus(id, status, notes)
  }
}
