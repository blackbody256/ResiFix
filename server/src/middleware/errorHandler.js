// Central error handler. Every error response has the shape:
//   { "error": { "code": "NOT_FOUND", "message": "...", "details": <optional> } }
import { ZodError, z } from 'zod';
import { Prisma } from '@prisma/client';
import { HttpError } from '../lib/httpError.js';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';

export function notFoundHandler(req, _res, next) {
  next(new HttpError(404, 'NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err, req, res, _next) {
  let status = 500;
  let body = { code: 'INTERNAL', message: 'Something went wrong' };

  if (err instanceof HttpError) {
    status = err.status;
    body = { code: err.code, message: err.message, details: err.details };
  } else if (err instanceof ZodError) {
    status = 400;
    body = { code: 'VALIDATION_FAILED', message: 'Invalid request', details: z.flattenError(err) };
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      status = 404;
      body = { code: 'NOT_FOUND', message: 'Record not found' };
    } else if (err.code === 'P2002') {
      status = 409;
      body = { code: 'CONFLICT', message: 'Record already exists', details: err.meta };
    }
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    body = { code: 'BAD_JSON', message: 'Request body is not valid JSON' };
  }

  if (status === 500) {
    logger.error(err.message, { reqId: req.id, stack: config.isProd ? undefined : err.stack });
  }
  res.status(status).json({ error: body });
}
