// The one PrismaClient for the whole server. Never `new PrismaClient()` anywhere else.
import { PrismaClient } from '@prisma/client';
import { config } from './config.js';

export const prisma = new PrismaClient({
  log: config.logLevel === 'debug' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});
