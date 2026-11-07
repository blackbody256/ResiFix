// OWNER: Ayan
// TODO:
//   [ ] PB-010
//   [ ] PB-011
//   [ ] PB-020
//   [ ] PB-022
//   [ ] PB-023
// Ticket listing/detail, review, status changes (use lib/ticketStatus.js + lib/audit.js).
import { Router } from 'express';
import { prisma } from '../../db.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { notImplemented } from '../../lib/httpError.js';
import { scopeToProperty } from '../../lib/scope.js';

export const ticketRoutes = Router();
ticketRoutes.use(authenticate);

// Working example: list tickets visible to the caller. Residents only see their own.
// GET /api/tickets
ticketRoutes.get('/', async (req, res) => {
  const where = req.user.role === 'RESIDENT' ? { reporterId: req.user.id } : {};
  const tickets = await prisma.ticket.findMany(
    scopeToProperty(req.user, {
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { room: { include: { block: true } }, faultItem: true },
    }),
  );
  res.json({ tickets });
});

ticketRoutes.get('/:id', notImplemented('PB-010'));
ticketRoutes.post('/:id/review', requireRole('ADMIN'), notImplemented('PB-011'));
ticketRoutes.post('/:id/status', requireRole('ADMIN', 'CUSTODIAN'), notImplemented('PB-020'));
