import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Public } from '@/common/decorators/public.decorator'
import { AuthService } from './auth.service'
import { Phase2Guard } from './guards/phase2.guard'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import type {
  AuthNextStepResponse,
  InvitePreviewResponse,
  JwtPayload,
  RejectInviteResponse,
  SendInviteResponse,
} from '@biztrack/types'
import { serializeDto } from '@/common/http/serialization'
import { SendInviteDto } from './dto/send-invite.dto'
import {
  AuthNextStepResponseDto,
  InvitePreviewDto,
  RejectInviteResponseDto,
  SendInviteResponseDto,
} from './dto/auth-response.dto'

@ApiTags('Invites')
@Controller('invites')
export class InvitesController {
  constructor(private authService: AuthService) {}

  @Post()
  @UseGuards(Phase2Guard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a staff invite' })
  async send(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendInviteDto,
  ): Promise<SendInviteResponse> {
    return serializeDto(
      SendInviteResponseDto.fromModel(
        await this.authService.sendInvite(user.sub, user.businessId as string, dto),
      ),
    )
  }

  @Public()
  @Get(':token')
  @ApiOperation({ summary: 'Preview an invite before registration' })
  async preview(@Param('token') token: string): Promise<InvitePreviewResponse> {
    return serializeDto(InvitePreviewDto.fromModel(await this.authService.getInvitePreview(token)))
  }

  @Post(':token/accept')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept an invite (existing user)' })
  async accept(
    @CurrentUser() user: JwtPayload,
    @Param('token') token: string,
  ): Promise<AuthNextStepResponse> {
    return serializeDto(
      AuthNextStepResponseDto.fromResult(await this.authService.acceptInvite(user.sub, token)),
    )
  }

  @Post(':token/reject')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject an invite (existing user)' })
  async reject(
    @CurrentUser() user: JwtPayload,
    @Param('token') token: string,
  ): Promise<RejectInviteResponse> {
    return serializeDto(
      RejectInviteResponseDto.fromModel(await this.authService.rejectInvite(user.sub, token)),
    )
  }
}
