// OWNER: Amabe / Ayan
// TODO:
//   [ ] PB-005
//   [ ] PB-006
//   [ ] PB-007
//   [ ] PB-008
//   [ ] PB-009
// Resident fault reporting: fault catalogue, create ticket, photos, duplicate detection.
import { Router } from 'express';
import { prisma } from '../../db.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { notImplemented } from '../../lib/httpError.js';
import { scopeToProperty } from '../../lib/scope.js';

export const reportingRoutes = Router();
reportingRoutes.use(authenticate);

// Working example: the fault catalogue for the caller's property.
// GET /api/reporting/fault-categories
reportingRoutes.get('/fault-categories', async (req, res) => {
  const categories = await prisma.faultCategory.findMany(
    scopeToProperty(req.user, {
      orderBy: { name: 'asc' },
      include: { items: { where: { isActive: true }, orderBy: { name: 'asc' } } },
    }),
  );
  res.json({ categories });
});

reportingRoutes.post('/tickets', requireRole('RESIDENT'), notImplemented('PB-005'));
reportingRoutes.post('/tickets/:id/photos', requireRole('RESIDENT'), notImplemented('PB-006'));
reportingRoutes.get('/tickets/:id/possible-duplicates', notImplemented('PB-007'));
