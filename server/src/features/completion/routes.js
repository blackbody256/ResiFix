// OWNER: Selina
// TODO:
//   [ ] PB-019
//   [ ] PB-021
//   [ ] PB-025
//   [ ] PB-026
//   [ ] PB-027
//   [ ] PB-028
//   [ ] PB-029
// Resident verification (confirm / dispute -> reopen), ratings, notifications, closure.
import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { notImplemented } from '../../lib/httpError.js';

export const completionRoutes = Router();
completionRoutes.use(authenticate);

completionRoutes.post('/tickets/:id/verify', requireRole('RESIDENT'), notImplemented('PB-019'));
completionRoutes.post('/tickets/:id/rating', requireRole('RESIDENT'), notImplemented('PB-025'));
completionRoutes.get('/notifications', notImplemented('PB-027'));
