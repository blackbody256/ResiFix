// Central error handler. Every error response has the shape:
//   { "error": { "code": "NOT_FOUND", "message": "...", "details": <optional> } }
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import type { Request, Response } from 'express';
import { ZodError, z } from 'zod';

const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'TOO_MANY_REQUESTS',
  501: 'NOT_IMPLEMENTED',
};

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(err: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const { status, body } = this.toResponse(err);

    if (status >= 500 && status !== 501) {
      this.logger.error(
        `${req.method} ${req.originalUrl}: ${(err as Error)?.message}`,
        (err as Error)?.stack,
      );
      Sentry.captureException(err);
    }
    res.status(status).json({ error: body });
  }

  private toResponse(err: unknown): { status: number; body: ErrorBody } {
    if (err instanceof HttpException) {
      const status = err.getStatus();
      const response = err.getResponse();
      if (typeof response === 'object' && response && 'code' in response) {
        return { status, body: response as ErrorBody };
      }
      // Body-parser failures (malformed JSON) arrive as a BadRequestException.
      const cause = (err as { cause?: { type?: string } }).cause;
      if (cause?.type === 'entity.parse.failed' || /JSON/.test(err.message)) {
        return { status, body: { code: 'BAD_JSON', message: 'Request body is not valid JSON' } };
      }
      const message =
        typeof response === 'string'
          ? response
          : String((response as { message?: unknown }).message ?? err.message);
      return { status, body: { code: CODE_BY_STATUS[status] ?? 'HTTP_ERROR', message } };
    }
    if (err instanceof ZodError) {
      return {
        status: 400,
        body: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid request',
          details: z.flattenError(err),
        },
      };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') {
        return { status: 404, body: { code: 'NOT_FOUND', message: 'Record not found' } };
      }
      if (err.code === 'P2002') {
        return {
          status: 409,
          body: { code: 'CONFLICT', message: 'Record already exists', details: err.meta },
        };
      }
    }
    const raw = err as { type?: string; status?: number };
    if (raw?.type === 'entity.parse.failed') {
      return { status: 400, body: { code: 'BAD_JSON', message: 'Request body is not valid JSON' } };
    }
    return { status: 500, body: { code: 'INTERNAL', message: 'Something went wrong' } };
  }
}
