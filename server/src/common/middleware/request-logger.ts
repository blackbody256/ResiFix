// Logs one line per request with timing, status and user. Adds an x-request-id header.
import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('HTTP');

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  req.id = req.get('x-request-id') ?? randomUUID();
  res.set('x-request-id', req.id);

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms reqId=${req.id}${
      req.user ? ` user=${req.user.id}` : ''
    }`;
    if (res.statusCode >= 500 && res.statusCode !== 501) logger.error(line);
    else if (res.statusCode >= 400) logger.warn(line);
    else logger.log(line);
  });
  next();
}
