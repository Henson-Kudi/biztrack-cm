import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Public } from '@/common/decorators/public.decorator'
import { AuthService } from './auth.service'
import { Phase2Guard } from './guards/phase2.guard'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import type {
  AuthNextStepResponse,
  CancelInviteResponse,
  InvitePreviewResponse,
  JwtPayload,
  ListPendingInvitesResponse,
  RejectInviteResponse,
  ResendInviteResponse,
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

  @Get()
  @UseGuards(Phase2Guard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List pending and expired invites for the current business' })
  async list(@CurrentUser() user: JwtPayload): Promise<ListPendingInvitesResponse> {
    return serializeDto(
      await this.authService.listPendingInvites(user.businessId as string),
    )
  }

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

  @Post(':id/resend')
  @UseGuards(Phase2Guard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resend an expired invite' })
  async resend(
    @CurrentUser() user: JwtPayload,
    @Param('id') inviteId: string,
  ): Promise<ResendInviteResponse> {
    return serializeDto(
      await this.authService.resendInvite(user.sub, user.businessId as string, inviteId),
    )
  }

  @Delete(':id')
  @UseGuards(Phase2Guard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel/delete an invite' })
  async cancel(
    @CurrentUser() user: JwtPayload,
    @Param('id') inviteId: string,
  ): Promise<CancelInviteResponse> {
    return serializeDto(
      await this.authService.cancelInvite(user.sub, user.businessId as string, inviteId),
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
