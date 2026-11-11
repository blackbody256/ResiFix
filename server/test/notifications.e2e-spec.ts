// PB-023: student notifications. The in-app inbox (GET /notifications, mark read) and the
// resident updates that no other story sends (reviewed, assigned, repair finished).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { User } from '@prisma/client';
import { ResidentUpdatesService } from '../src/notifications/resident-updates.service';
import { startApp, type TestApp } from './app';
import { createProperty, createTicket, destroyProperty, type PropertyFixture } from './fixtures';

describe('PB-023 student notifications', () => {
  let t: TestApp;
  let home: PropertyFixture;
  let away: PropertyFixture;

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Inbox Hall');
    away = await createProperty(t.prisma, 'Other Inbox Hall');
  });
  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await destroyProperty(t.prisma, away.property.id);
    await t.close();
  });

  // `createdAt` is set by the tests that check the order: rows created back to back can share a
  // millisecond, and then the database may return them either way round.
  const note = (user: User, message: string, readAt: Date | null = null, createdAt?: Date) =>
    t.prisma.notification.create({ data: { userId: user.id, message, readAt, createdAt } });

  describe('inbox', () => {
    let resident: User;
    beforeAll(() => {
      resident = home.residents[0];
    });

    it('lists only the caller’s notifications, newest first, with the unread count', async () => {
      const now = Date.now();
      await note(resident, 'Old: read already', new Date(now - 60_000), new Date(now - 120_000));
      await note(resident, 'First: unread', null, new Date(now - 60_000));
      await note(resident, 'Second: unread', null, new Date(now));
      await note(home.residents[1], 'Neighbour: not yours');

      const res = await t.as(resident).get('/notifications').expect(200);
      expect(res.body.unread).toBe(2);
      expect(res.body.notifications.map((n: { message: string }) => n.message)).toEqual([
        'Second: unread',
        'First: unread',
        'Old: read already',
      ]);
      expect(Object.keys(res.body.notifications[0]).sort()).toEqual(
        ['channel', 'createdAt', 'id', 'message', 'readAt', 'sentAt', 'ticketId'].sort(),
      );
    });

    it('marks one notification read, keeping the first read time', async () => {
      const n = await note(resident, 'Mark me: once');
      const first = await t.as(resident).post(`/notifications/${n.id}/read`).expect(200);
      expect(first.body.notification.readAt).toEqual(expect.any(String));

      const again = await t.as(resident).post(`/notifications/${n.id}/read`).expect(200);
      expect(again.body.notification.readAt).toBe(first.body.notification.readAt);
    });

    it("answers 404 for someone else's notification and leaves it unread", async () => {
      for (const owner of [home.residents[1], away.residents[0]]) {
        const n = await note(owner, 'Private: not yours');
        const res = await t.as(resident).post(`/notifications/${n.id}/read`).expect(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
        const stored = await t.prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
        expect(stored.readAt).toBeNull();
      }
    });

    it('marks all of the caller’s notifications read and nobody else’s', async () => {
      const other = await note(home.residents[1], 'Other: stays unread');
      const res = await t.as(resident).post('/notifications/read-all').expect(200);
      expect(res.body.updated).toBeGreaterThan(0);

      const after = await t.as(resident).get('/notifications').expect(200);
      expect(after.body.unread).toBe(0);
      const stored = await t.prisma.notification.findUniqueOrThrow({ where: { id: other.id } });
      expect(stored.readAt).toBeNull();
    });

    it('needs a token', async () => {
      await t.anon().get('/notifications').expect(401);
      await t.anon().post('/notifications/read-all').expect(401);
    });
  });

  describe('ResidentUpdatesService', () => {
    let updates: ResidentUpdatesService;
    beforeAll(() => {
      updates = t.app.get(ResidentUpdatesService);
    });

    const sentFor = (ticketId: string) =>
      t.prisma.notification.findMany({ where: { ticketId }, orderBy: { createdAt: 'asc' } });

    it('tells only the reporting resident, with the ticket in the message', async () => {
      const ticket = await createTicket(t.prisma, home, {
        reporter: home.residents[1],
        assignee: home.custodian,
      });

      expect(await updates.ticketReviewed(ticket.id)).toEqual([home.residents[1].id]);
      expect(await updates.ticketAssigned(ticket.id)).toEqual([home.residents[1].id]);
      expect(await updates.repairCompleted(ticket.id)).toEqual([home.residents[1].id]);

      const sent = await sentFor(ticket.id);
      expect(sent.map((n) => n.userId)).toEqual(Array(3).fill(home.residents[1].id));
      expect(sent[0].message).toBe(
        'Report reviewed: Leaking tap, Block A 102: your report has been reviewed and a repair is being arranged.',
      );
      expect(sent[1].message).toContain(`${home.custodian.name} will handle the repair`);
      expect(sent[2].message).toMatch(/^Repair finished: .*within 48 hours\.$/);
    });

    it('says "A custodian" when nobody is assigned yet', async () => {
      const ticket = await createTicket(t.prisma, home, { reporter: home.residents[0] });
      await updates.ticketAssigned(ticket.id);
      const [sent] = await sentFor(ticket.id);
      expect(sent.message).toContain('A custodian will handle the repair');
    });

    it('sends nothing when the reporter’s account is inactive', async () => {
      const ticket = await createTicket(t.prisma, home, { reporter: home.residents[2] });
      await t.prisma.user.update({
        where: { id: home.residents[2].id },
        data: { isActive: false },
      });
      expect(await updates.ticketReviewed(ticket.id)).toEqual([]);
      expect(await sentFor(ticket.id)).toHaveLength(0);
    });
  });
});
