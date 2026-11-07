import express from 'express';
import { prisma } from './db.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRoutes } from './features/auth/routes.js';
import { propertyRoutes } from './features/properties/routes.js';
import { reportingRoutes } from './features/reporting/routes.js';
import { ticketRoutes } from './features/tickets/routes.js';
import { custodianRoutes } from './features/custodian/routes.js';
import { completionRoutes } from './features/completion/routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(requestLogger);
  app.use(express.json({ limit: '1mb' }));

  // GET /api/health -> { status, db, time }
  app.get('/api/health', async (_req, res) => {
    let db = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    res
      .status(db === 'ok' ? 200 : 503)
      .json({ status: db === 'ok' ? 'ok' : 'degraded', db, time: new Date() });
  });

  // OWNER: Ann — PB-001, PB-002
  app.use('/api/auth', authRoutes);

  // OWNER: Amabe — PB-003, PB-004
  app.use('/api/properties', propertyRoutes);

  // OWNER: Amabe / Ayan — PB-005..PB-009
  app.use('/api/reporting', reportingRoutes);

  // OWNER: Ayan — PB-010, PB-011, PB-020, PB-022, PB-023
  app.use('/api/tickets', ticketRoutes);

  // OWNER: Andrew — PB-012..PB-018, PB-024
  app.use('/api/custodian', custodianRoutes);

  // OWNER: Selina — PB-019, PB-021, PB-025..PB-029
  app.use('/api/completion', completionRoutes);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
