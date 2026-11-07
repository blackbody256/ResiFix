// Throw these from controllers/services; AllExceptionsFilter renders
//   { "error": { "code": "NOT_FOUND", "message": "...", "details": <optional> } }
import { HttpException, HttpStatus } from '@nestjs/common';

export class AppException extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppException(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Authentication required') =>
  new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have access to this resource') =>
  new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', message);
export const notFound = (message = 'Not found') =>
  new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', message);
export const conflict = (message: string) =>
  new AppException(HttpStatus.CONFLICT, 'CONFLICT', message);
export const tooManyRequests = (message: string) =>
  new AppException(HttpStatus.TOO_MANY_REQUESTS, 'TOO_MANY_REQUESTS', message);

/** Body for routes whose backlog item is not built yet. */
export function notImplemented(backlogId: string): never {
  throw new AppException(
    HttpStatus.NOT_IMPLEMENTED,
    'NOT_IMPLEMENTED',
    `${backlogId} is not implemented yet`,
  );
}
