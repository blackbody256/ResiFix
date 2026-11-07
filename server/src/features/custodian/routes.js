// OWNER: Andrew
// TODO:
//   [ ] PB-012
//   [ ] PB-013
//   [ ] PB-014
//   [ ] PB-015
//   [ ] PB-016
//   [ ] PB-017
//   [ ] PB-018
//   [ ] PB-024
// Custodian work queue, assignment, visit scheduling, missed visits, repair proof.
import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { notImplemented } from '../../lib/httpError.js';

export const custodianRoutes = Router();
custodianRoutes.use(authenticate, requireRole('CUSTODIAN', 'ADMIN'));

custodianRoutes.get('/queue', notImplemented('PB-012'));
custodianRoutes.post('/tickets/:id/assign', notImplemented('PB-013'));
custodianRoutes.post('/tickets/:id/visits', notImplemented('PB-014'));
custodianRoutes.post('/visits/:visitId/missed', notImplemented('PB-016'));
custodianRoutes.post('/tickets/:id/repair-proof', notImplemented('PB-018'));
