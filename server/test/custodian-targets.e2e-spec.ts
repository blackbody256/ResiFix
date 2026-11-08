// PB-012: response targets by category, and the respond clock behind breach alerts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Priority, TicketStatus } from '@prisma/client';
import { ResponseTargetsService } from '../src/custodian/response-targets.service';
import { QUEUES } from '../src/queue/queue.constants';
import { startApp, type TestApp } from './app';
import {
  createProperty,
  createTicket,
  destroyProperty,
  HOUR,
  type PropertyFixture,
} from './fixtures';

describe('PB-012 response targets', () => {
  let t: TestApp;
  let home: PropertyFixture;
  let away: PropertyFixture;
  let targets: ResponseTargetsService;

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Targets Hall');
    away = await createProperty(t.prisma, 'Other Targets Hall');
    targets = t.app.get(ResponseTargetsService);
    // Electrical faults at HIGH priority must be answered faster than the property default.
    await t.prisma.responseTarget.create({
      data: {
        propertyId: home.property.id,
        categoryId: home.categories.Electrical.id,
        priority: Priority.HIGH,
        respondWithinH: 4,
        resolveWithinH: 24,
      },
    });
  });
  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await destroyProperty(t.prisma, away.property.id);
    await t.close();
  });

  describe('GET /custodian/targets', () => {
    it('lists the property-wide targets first, then per category, most urgent first', async () => {
      for (const staff of [home.custodian, home.admin]) {
        const res = await t.as(staff).get('/custodian/targets').expect(200);
        expect(
          res.body.targets.map(
            (x: { category: { name: string } | null; priority: string; respondWithinH: number }) =>
              [x.category?.name ?? '*', x.priority, x.respondWithinH].join(' '),
          ),
        ).toEqual(['* URGENT 2', '* HIGH 12', '* MEDIUM 24', '* LOW 48', 'Electrical HIGH 4']);
      }
    });

    it("never shows another property's targets", async () => {
      const res = await t.as(away.custodian).get('/custodian/targets').expect(200);
      expect(res.body.targets).toHaveLength(4);
      expect(res.body.targets.every((x: { category: unknown }) => x.category === null)).toBe(true);
    });

    it('is for staff only', async () => {
      await t.as(home.residents[0]).get('/custodian/targets').expect(403);
      await t.anon().get('/custodian/targets').expect(401);
    });
  });

  describe('startClock', () => {
    const deadlineJob = (ticketId: string) =>
      t.queue(QUEUES.TICKET_TIMERS).getJob(`response-deadline-${ticketId}`);

    it('sets dueAt from the report time and schedules the breach alert for then', async () => {
      const reported = new Date(Date.now() - HOUR);
      const ticket = await createTicket(t.prisma, home, {
        reporter: home.residents[0],
        item: 'No water', // URGENT: respond within 2 h
        createdAt: reported,
      });

      const dueAt = await targets.startClock(ticket.id);

      expect(dueAt).toEqual(new Date(reported.getTime() + 2 * HOUR));
      const saved = await t.prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect(saved.dueAt).toEqual(dueAt);
      const job = await deadlineJob(ticket.id);
      expect(job?.data).toEqual({ ticketId: ticket.id });
      // About an hour left; allow for test run time.
      expect(job?.opts.delay).toBeGreaterThan(0.9 * HOUR);
      expect(job?.opts.delay).toBeLessThanOrEqual(HOUR);
    });

    it("uses the category's own target when there is one", async () => {
      const ticket = await createTicket(t.prisma, home, {
        reporter: home.residents[1],
        item: 'Broken socket', // Electrical, HIGH: 4 h here instead of the default 12 h
      });
      const dueAt = await targets.startClock(ticket.id);
      expect(dueAt).toEqual(new Date(ticket.createdAt.getTime() + 4 * HOUR));
    });

    it('restarts the clock from the last reopen for a reopened ticket', async () => {
      const ticket = await createTicket(t.prisma, home, {
        reporter: home.residents[2],
        item: 'Leaking tap', // MEDIUM: 24 h
        status: TicketStatus.REOPENED,
        createdAt: new Date(Date.now() - 100 * HOUR),
      });
      const reopenedAt = new Date(Date.now() - 2 * HOUR);
      await t.prisma.auditLog.create({
        data: {
          propertyId: home.property.id,
          ticketId: ticket.id,
          actorId: home.residents[2].id,
          action: 'ticket.status_changed',
          fromStatus: TicketStatus.COMPLETED,
          toStatus: TicketStatus.REOPENED,
          createdAt: reopenedAt,
        },
      });

      const dueAt = await targets.startClock(ticket.id);
      expect(dueAt).toEqual(new Date(reopenedAt.getTime() + 24 * HOUR));

      // Still counted from the reopen once the ticket has moved on from REOPENED.
      await t.prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: TicketStatus.REVIEWED },
      });
      expect(await targets.startClock(ticket.id)).toEqual(dueAt);
    });

    it('clears dueAt and cancels the alert when no target applies', async () => {
      const ticket = await createTicket(t.prisma, away, {
        reporter: away.residents[0],
        item: 'Bulb not working', // LOW
      });
      await targets.startClock(ticket.id);
      expect(await deadlineJob(ticket.id)).toBeDefined();

      await t.prisma.responseTarget.deleteMany({
        where: { propertyId: away.property.id, priority: Priority.LOW },
      });
      expect(await targets.startClock(ticket.id)).toBeNull();
      const saved = await t.prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect(saved.dueAt).toBeNull();
      expect(await deadlineJob(ticket.id)).toBeUndefined();
    });
  });
});
