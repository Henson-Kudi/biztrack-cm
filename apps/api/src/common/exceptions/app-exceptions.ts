import { HttpStatus } from '@nestjs/common'
import { AppException } from './app.exception'

export class AppBadRequestException extends AppException {
  constructor(message = 'Bad request', code = 'BAD_REQUEST', details?: unknown) {
    super(message, HttpStatus.BAD_REQUEST, code, details)
  }
}

export class AppUnauthorizedException extends AppException {
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED', details?: unknown) {
    super(message, HttpStatus.UNAUTHORIZED, code, details)
  }
}

export class AppForbiddenException extends AppException {
  constructor(message = 'Forbidden', code = 'FORBIDDEN', details?: unknown) {
    super(message, HttpStatus.FORBIDDEN, code, details)
  }
}

export class AppPaymentRequiredException extends AppException {
  constructor(message = 'Payment required', code = 'PAYMENT_REQUIRED', details?: unknown) {
    super(message, HttpStatus.PAYMENT_REQUIRED, code, details)
  }
}

export class AppNotFoundException extends AppException {
  constructor(message = 'Not found', code = 'NOT_FOUND', details?: unknown) {
    super(message, HttpStatus.NOT_FOUND, code, details)
  }
}

export class AppConflictException extends AppException {
  constructor(message = 'Conflict', code = 'CONFLICT', details?: unknown) {
    super(message, HttpStatus.CONFLICT, code, details)
  }
}

export class AppInternalServerException extends AppException {
  constructor(message = 'Internal server error', code = 'INTERNAL_SERVER_ERROR', details?: unknown) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, code, details)
  }
}

export class AppTooManyRequestsException extends AppException {
  constructor(message = 'Too many requests', code = 'TOO_MANY_REQUESTS', details?: unknown) {
    super(message, HttpStatus.TOO_MANY_REQUESTS, code, details)
  }
}
