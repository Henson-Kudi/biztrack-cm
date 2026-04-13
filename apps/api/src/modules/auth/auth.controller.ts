import { Controller, Post, Body, HttpCode, HttpStatus, Get, UseGuards, Res, Req } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { RefreshTokenDto } from './dto/refresh-token.dto'
import { RequestLoginOtpDto } from './dto/request-login-otp.dto'
import { RequestLoginDto } from './dto/request-login.dto'
import { LoginOtpDto } from './dto/login-otp.dto'
import { VerifyPhoneDto } from './dto/verify-phone.dto'
import { VerifyEmailDto } from './dto/verify-email.dto'
import { ResendOtpDto } from './dto/resend-otp.dto'
import { SelectBusinessDto } from './dto/select-business.dto'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import type { JwtPayload } from '@biztrack/types'
import { AuthRateLimitGuard } from '@/common/guards/auth-rate-limit.guard'
import type { Request, Response } from 'express'
import { ConfigService } from '@nestjs/config'
import type { AppConfig } from '@/config/configuration'
import { NodeEnv } from '@/config/configuration'
import { AppUnauthorizedException } from '@/common/exceptions/app-exceptions'

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService<AppConfig>,
  ) {}

  private setRefreshCookie(res: Response, refreshToken?: string) {
    if (!refreshToken) return
    const nodeEnv = this.config.get('NODE_ENV', { infer: true })
    const cookieName = this.config.get('REFRESH_COOKIE_NAME', { infer: true }) ?? 'refresh_token'
    const domain = this.config.get('REFRESH_COOKIE_DOMAIN', { infer: true })
    const sameSite =
      this.config.get('REFRESH_COOKIE_SAMESITE', { infer: true }) ??
      (nodeEnv === NodeEnv.PRODUCTION ? 'none' : 'lax')

    res.cookie(cookieName, refreshToken, {
      httpOnly: true,
      secure: nodeEnv === NodeEnv.PRODUCTION,
      sameSite,
      path: '/api',
      domain: domain || undefined,
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    })
  }

  @Post('register')
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Register a new user' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto)
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Login with phone/email + password' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto)
    if ((result as any)?.tokens?.refreshToken) {
      this.setRefreshCookie(res, (result as any).tokens.refreshToken)
    }
    return result
  }

  @Post('request-login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Request login (phone or email)' })
  requestLogin(@Body() dto: RequestLoginDto) {
    return this.authService.requestLogin(dto)
  }

  @Post('request-login-otp')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Request a login OTP via phone' })
  requestLoginOtp(@Body() dto: RequestLoginOtpDto) {
    return this.authService.requestLogin({ identifier: dto.phone })
  }

  @Post('login-otp')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Login with phone + OTP' })
  async loginWithOtp(@Body() dto: LoginOtpDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.loginWithOtp(dto.identifier, dto.code)
    if ((result as any)?.tokens?.refreshToken) {
      this.setRefreshCookie(res, (result as any).tokens.refreshToken)
    }
    return result
  }

  @Post('verify-phone')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Verify phone number with OTP' })
  async verifyPhone(@Body() dto: VerifyPhoneDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.verifyPhone(dto.phone, dto.code, dto.inviteToken)
    if ((result as any)?.tokens?.refreshToken) {
      this.setRefreshCookie(res, (result as any).tokens.refreshToken)
    }
    return result
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Verify email address with OTP' })
  async verifyEmail(@Body() dto: VerifyEmailDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.verifyEmail(dto.email, dto.code, dto.inviteToken)
    if ((result as any)?.tokens?.refreshToken) {
      this.setRefreshCookie(res, (result as any).tokens.refreshToken)
    }
    return result
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieName = this.config.get('REFRESH_COOKIE_NAME', { infer: true }) ?? 'refresh_token'
    const refreshToken = dto.refreshToken ?? req.cookies?.[cookieName]
    if (!refreshToken) {
      throw new AppUnauthorizedException('auth.token.invalid', 'INVALID_REFRESH_TOKEN')
    }
    const result = await this.authService.refreshTokens(refreshToken)
    if ((result as any)?.tokens?.refreshToken) {
      this.setRefreshCookie(res, (result as any).tokens.refreshToken)
    }
    return result
  }

  @Post('select-business')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Select business context (Phase 1 -> Phase 2)' })
  async selectBusiness(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SelectBusinessDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.selectBusiness(user.sub, dto.businessId)
    if ((result as any)?.tokens?.refreshToken) {
      this.setRefreshCookie(res, (result as any).tokens.refreshToken)
    }
    return result
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Resend OTP (phone/email/login)' })
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto)
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout (revoke refresh token)' })
  logout(
    @CurrentUser() user: JwtPayload,
    @Body() body: { refreshToken?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieName = this.config.get('REFRESH_COOKIE_NAME', { infer: true }) ?? 'refresh_token'
    const refreshToken = body.refreshToken ?? req.cookies?.[cookieName]
    res.clearCookie(cookieName, { path: '/api' })
    if (!refreshToken) {
      throw new AppUnauthorizedException('auth.token.invalid', 'INVALID_REFRESH_TOKEN')
    }
    return this.authService.logout(user.sub, refreshToken)
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user from JWT payload' })
  me(@CurrentUser() user: JwtPayload) {
    return user
  }
}
