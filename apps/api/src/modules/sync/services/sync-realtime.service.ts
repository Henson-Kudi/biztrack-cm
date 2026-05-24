import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  UnauthorizedException,
} from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import type {
  SyncBatchStatus,
  SyncBatchStatusResponse,
  SyncChangesAvailableEvent,
  SyncRealtimeAuthPayload,
  SyncRealtimeConnectionPayload,
  SyncRealtimeErrorEvent,
  SyncRealtimeServerEventName,
} from '@biztrack/types'
import type { Logger } from '@biztrack/logger'
import type { Server as HttpServer } from 'http'
import { Server as SocketIoServer, type Socket } from 'socket.io'
import { LOGGER } from '@/logger/logger.module'
import { SYNC_REALTIME_PATH } from '../constants/sync.constants'
import { SyncAuthService } from './sync-auth.service'

type SyncSocket = Socket

const SOCKET_AUTH_TIMEOUT_MS = 10_000

@Injectable()
export class SyncRealtimeService implements OnApplicationBootstrap, OnApplicationShutdown {
  private server: SocketIoServer | null = null

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly syncAuthService: SyncAuthService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  onApplicationBootstrap(): void {
    const httpServer = this.httpAdapterHost.httpAdapter.getHttpServer() as HttpServer | undefined
    if (!httpServer) {
      this.logger.warn('Sync realtime server could not attach to HTTP server', 'SyncRealtimeService')
      return
    }

    this.server = new SocketIoServer(httpServer, {
      path: SYNC_REALTIME_PATH,
      cors: {
        origin: true,
        credentials: true,
      },
    })

    this.server.on('connection', (socket) => {
      this.handleConnection(socket as SyncSocket)
    })

    this.logger.log('Sync realtime server is ready', 'SyncRealtimeService', {
      path: SYNC_REALTIME_PATH,
    })
  }

  onApplicationShutdown(): void {
    this.server?.close()
    this.server = null
  }

  emitBatchStatus(
    businessId: string,
    deviceId: string,
    batch: SyncBatchStatusResponse,
  ): void {
    if (!this.server) {
      return
    }

    const eventName = this.toBatchEventName(batch.status)
    if (!eventName) {
      return
    }

    this.server.to(this.getDeviceRoom(deviceId)).emit(eventName, batch)

    if (
      (batch.status === 'completed' || batch.status === 'partial') &&
      batch.appliedCount > 0
    ) {
      const payload: SyncChangesAvailableEvent = {
        businessId,
        batchId: batch.batchId,
        availableAt: batch.completedAt ?? new Date().toISOString(),
        appliedCount: batch.appliedCount,
        conflictCount: batch.conflictCount,
        failedCount: batch.failedCount,
      }

      this.server.to(this.getBusinessRoom(businessId)).emit('sync.changes.available', payload)
    }
  }

  private handleConnection(socket: SyncSocket): void {
    const authTimeout = setTimeout(() => {
      this.sendError(socket, {
        code: 'SYNC_SOCKET_AUTH_TIMEOUT',
        message: 'Realtime sync authentication timed out.',
      })
      socket.disconnect(true)
    }, SOCKET_AUTH_TIMEOUT_MS)

    socket.data.authTimeout = authTimeout
    socket.data.businessId = null
    socket.data.deviceId = null
    socket.data.userId = null

    socket.on('auth.authenticate', (payload) => {
      void this.authenticateConnection(socket, payload)
    })

    socket.on('disconnect', () => {
      if (socket.data.authTimeout) {
        clearTimeout(socket.data.authTimeout as NodeJS.Timeout)
      }
    })
  }

  private async authenticateConnection(socket: SyncSocket, payload: SyncRealtimeAuthPayload) {
    try {
      const auth = this.readAuthPayload(payload)
      const jwt = await this.syncAuthService.authenticateSyncToken(auth.syncToken)
      const businessId = String(jwt.businessId)
      const tokenDeviceId = String(jwt.deviceId)

      if (tokenDeviceId !== auth.deviceId) {
        throw new UnauthorizedException('Realtime sync device does not match the issued sync token.')
      }

      if (socket.data.authTimeout) {
        clearTimeout(socket.data.authTimeout as NodeJS.Timeout)
        socket.data.authTimeout = null
      }

      if (socket.data.businessId) {
        await socket.leave(this.getBusinessRoom(String(socket.data.businessId)))
      }

      if (socket.data.deviceId) {
        await socket.leave(this.getDeviceRoom(String(socket.data.deviceId)))
      }

      socket.data.userId = jwt.sub
      socket.data.businessId = businessId
      socket.data.deviceId = tokenDeviceId

      await socket.join(this.getBusinessRoom(businessId))
      await socket.join(this.getDeviceRoom(tokenDeviceId))

      const connectedPayload: SyncRealtimeConnectionPayload = {
        businessId,
        deviceId: tokenDeviceId,
        connectedAt: new Date().toISOString(),
      }

      socket.emit('sync.connected', connectedPayload)
    } catch (error) {
      this.sendError(socket, {
        code: 'SYNC_SOCKET_UNAUTHORIZED',
        message: error instanceof Error ? error.message : 'Realtime sync authentication failed.',
      })
      socket.disconnect(true)
    }
  }

  private readAuthPayload(payload: SyncRealtimeAuthPayload): SyncRealtimeAuthPayload {
    const syncToken = payload?.syncToken?.trim() ?? ''
    const deviceId = payload?.deviceId?.trim() ?? ''

    if (!syncToken || !deviceId) {
      throw new UnauthorizedException('Realtime sync auth payload is invalid.')
    }

    return { syncToken, deviceId }
  }

  private toBatchEventName(status: SyncBatchStatus): SyncRealtimeServerEventName | null {
    if (status === 'queued') return 'sync.batch.queued'
    if (status === 'processing') return 'sync.batch.processing'
    if (status === 'completed') return 'sync.batch.completed'
    if (status === 'partial') return 'sync.batch.partial'
    if (status === 'failed') return 'sync.batch.failed'
    if (status === 'enqueue_failed') return 'sync.batch.enqueue_failed'
    return null
  }

  private sendError(socket: SyncSocket, payload: SyncRealtimeErrorEvent) {
    socket.emit('sync.error', payload)
  }

  private getBusinessRoom(businessId: string) {
    return `business:${businessId}`
  }

  private getDeviceRoom(deviceId: string) {
    return `device:${deviceId}`
  }
}
