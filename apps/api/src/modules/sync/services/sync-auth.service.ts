import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import type { IssueSyncTokenResponse, JwtPayload } from '@biztrack/types'
import { BusinessMemberStatus } from '@biztrack/types'
import { v4 as uuidv4 } from 'uuid'
import { Repository } from 'typeorm'
import { AppUnauthorizedException } from '@/common/exceptions/app-exceptions'
import { PasswordManager } from '@/common/security/password-manager'
import { BusinessMember } from '@/entities/business-member.entity'
import { SyncDeviceSession } from '@/entities/sync-device-session.entity'
import { User } from '@/entities/user.entity'
import type { IssueSyncTokenDto } from '../dto/issue-sync-token.dto'

@Injectable()
export class SyncAuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly passwordManager: PasswordManager,
    @InjectRepository(SyncDeviceSession)
    private readonly syncSessionsRepo: Repository<SyncDeviceSession>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(BusinessMember)
    private readonly membersRepo: Repository<BusinessMember>,
  ) {}

  /**
   * Sync uses a dedicated credential because the desktop can stay offline longer
   * than the normal phase2 access + refresh token lifecycle. We still persist the
   * token server-side so the backend can revoke a stolen device credential later.
   */
  async issueSyncToken(user: JwtPayload, dto: IssueSyncTokenDto): Promise<IssueSyncTokenResponse> {
    const businessId = user.businessId ?? null
    if (!businessId) {
      throw new AppUnauthorizedException(
        'Sync token issuance requires a selected business.',
        'SYNC_TOKEN_BUSINESS_REQUIRED',
      )
    }

    const membership = await this.requireActiveMembership(user.sub, businessId)
    const tokenId = uuidv4()
    const now = new Date()

    const payload: JwtPayload = {
      sub: user.sub,
      email: user.email ?? null,
      phone: user.phone ?? null,
      role: membership.role,
      businessId,
      deviceId: dto.deviceId,
      tokenId,
      type: 'sync',
    }

    const syncToken = await this.jwtService.signAsync(payload)
    const tokenHash = await this.passwordManager.hashToken(syncToken)

    await this.syncSessionsRepo.manager.transaction(async (manager) => {
      // We intentionally keep one active sync token per user/business/device tuple.
      // That keeps re-issuance deterministic and avoids having several immortal
      // device credentials hanging around for the same local installation.
      await manager
        .createQueryBuilder()
        .update(SyncDeviceSession)
        .set({ revokedAt: now })
        .where(
          `"user_id" = :userId
           AND "business_id" = :businessId
           AND "device_id" = :deviceId
           AND "revoked_at" IS NULL`,
          {
            userId: user.sub,
            businessId,
            deviceId: dto.deviceId,
          },
        )
        .execute()

      await manager.getRepository(SyncDeviceSession).save(
        manager.getRepository(SyncDeviceSession).create({
          tokenId,
          tokenHash,
          userId: user.sub,
          businessId,
          deviceId: dto.deviceId,
          deviceName: this.normalizeMetadata(dto.deviceName, 255),
          platform: this.normalizeMetadata(dto.platform, 255),
          appVersion: this.normalizeMetadata(dto.appVersion, 64),
          lastUsedAt: now,
          revokedAt: null,
        }),
      )
    })

    return {
      syncToken,
      deviceId: dto.deviceId,
      issuedAt: now.toISOString(),
    }
  }

  /**
   * Validation is stricter than a plain JWT verify:
   * 1. signature must be valid
   * 2. token must still exist in the server-side device-session table
   * 3. the owning user and business membership must still be active
   *
   * That extra lookup is what lets us keep a long-lived sync credential without
   * turning it into an irrevocable permanent login token.
   */
  async authenticateSyncToken(rawToken: string): Promise<JwtPayload> {
    const payload = await this.verifySignedToken(rawToken)
    const membership = await this.requireActiveMembership(payload.sub, payload.businessId as string)

    const session = await this.syncSessionsRepo.findOne({
      where: {
        tokenId: payload.tokenId as string,
        userId: payload.sub,
        businessId: payload.businessId as string,
        deviceId: payload.deviceId as string,
      },
    })

    if (!session || session.revokedAt) {
      throw new AppUnauthorizedException(
        'Sync token has been revoked.',
        'SYNC_TOKEN_REVOKED',
      )
    }

    const matches = await this.passwordManager.verifyToken(rawToken, session.tokenHash)
    if (!matches) {
      throw new AppUnauthorizedException(
        'Sync token could not be verified.',
        'SYNC_TOKEN_INVALID',
      )
    }

    if (this.shouldTouchLastUsedAt(session.lastUsedAt)) {
      await this.syncSessionsRepo.update(session.id, { lastUsedAt: new Date() })
    }

    return {
      ...payload,
      role: membership.role,
      businessId: membership.businessId,
      deviceId: session.deviceId,
      type: 'sync',
    }
  }

  private async verifySignedToken(rawToken: string): Promise<JwtPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(rawToken)
      if (
        payload.type !== 'sync' ||
        !payload.sub ||
        !payload.businessId ||
        !payload.deviceId ||
        !payload.tokenId
      ) {
        throw new AppUnauthorizedException(
          'Sync token payload is invalid.',
          'SYNC_TOKEN_INVALID',
        )
      }

      return payload
    } catch (error) {
      if (error instanceof AppUnauthorizedException) {
        throw error
      }

      throw new AppUnauthorizedException(
        'Sync token could not be validated.',
        'SYNC_TOKEN_INVALID',
      )
    }
  }

  private async requireActiveMembership(userId: string, businessId: string): Promise<BusinessMember> {
    const [user, membership] = await Promise.all([
      this.usersRepo.findOne({ where: { id: userId } }),
      this.membersRepo.findOne({
        where: {
          userId,
          businessId,
          status: BusinessMemberStatus.ACTIVE,
        },
      }),
    ])

    if (!user || !user.isActive || !membership) {
      throw new AppUnauthorizedException(
        'Sync access is no longer active for this business.',
        'SYNC_ACCESS_REVOKED',
      )
    }

    return membership
  }

  private normalizeMetadata(value: string | null | undefined, limit: number): string | null {
    const normalized = value?.trim()
    if (!normalized) {
      return null
    }

    return normalized.slice(0, limit)
  }

  private shouldTouchLastUsedAt(lastUsedAt?: Date | null): boolean {
    if (!lastUsedAt) {
      return true
    }

    return Date.now() - lastUsedAt.getTime() >= 5 * 60 * 1000
  }
}
