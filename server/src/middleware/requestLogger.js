import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger.js';

export function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  req.id = req.get('x-request-id') ?? randomUUID();
  res.set('x-request-id', req.id);

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`, {
      reqId: req.id,
      userId: req.user?.id,
    });
  });
  next();
}
