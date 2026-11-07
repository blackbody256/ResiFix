// OWNER: Amabe
// TODO:
//   [ ] PB-003
//   [ ] PB-004
// Property / block / room / occupancy management. Admin-only writes; everything scoped.
import { Router } from 'express';
import { prisma } from '../../db.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { notImplemented } from '../../lib/httpError.js';

export const propertyRoutes = Router();
propertyRoutes.use(authenticate);

// Working example of a scoped read: the caller's own property with blocks and rooms.
// GET /api/properties/mine
propertyRoutes.get('/mine', async (req, res) => {
  const property = await prisma.property.findUniqueOrThrow({
    where: { id: req.user.propertyId },
    include: {
      blocks: { orderBy: { name: 'asc' }, include: { rooms: { orderBy: { number: 'asc' } } } },
    },
  });
  res.json({ property });
});

propertyRoutes.post('/blocks', requireRole('ADMIN'), notImplemented('PB-003'));
propertyRoutes.post('/blocks/:blockId/rooms', requireRole('ADMIN'), notImplemented('PB-003'));
propertyRoutes.post('/occupancies', requireRole('ADMIN'), notImplemented('PB-004'));
