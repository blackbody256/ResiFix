// PB-014: custodian reviews a report and corrects its category (POST /custodian/tickets/:id/review).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ticket, TicketStatus } from '@prisma/client';
import { QUEUES } from '../src/queue/queue.constants';
import { startApp, type TestApp } from './app';
import {
  createProperty,
  createTicket,
  destroyProperty,
  HOUR,
  type PropertyFixture,
} from './fixtures';

const S = TicketStatus;

describe('PB-014 review and correct a ticket', () => {
  let t: TestApp;
  let home: PropertyFixture;
  let away: PropertyFixture;

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Review Hall');
    away = await createProperty(t.prisma, 'Other Review Hall');
  });
  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await destroyProperty(t.prisma, away.property.id);
    await t.close();
  });

  const review = (ticket: Ticket, body: object = {}, caller = home.custodian) =>
    t.as(caller).post(`/custodian/tickets/${ticket.id}/review`).send(body);
  const saved = (ticket: Ticket) => t.prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
  const audit = (ticket: Ticket) =>
    t.prisma.auditLog.findMany({ where: { ticketId: ticket.id }, orderBy: { createdAt: 'asc' } });
  const deadlineJob = (ticket: Ticket) =>
    t.queue(QUEUES.TICKET_TIMERS).getJob(`response-deadline-${ticket.id}`);

  it('confirms a report as it is and starts the respond clock', async () => {
    const ticket = await createTicket(t.prisma, home, {
      reporter: home.residents[0],
      item: 'Blocked toilet', // HIGH: respond within 12 h
    });

    const res = await review(ticket).expect(200);
    expect(res.body.ticket).toMatchObject({
      id: ticket.id,
      status: 'REVIEWED',
      priority: 'HIGH',
      next: 'SCHEDULE',
      target: { clock: 'RESPOND', state: 'ON_TRACK' },
    });

    const after = await saved(ticket);
    expect(after.dueAt).toEqual(new Date(ticket.createdAt.getTime() + 12 * HOUR));
    expect(await deadlineJob(ticket)).toBeDefined();
    const [row] = await audit(ticket);
    expect(row).toMatchObject({
      action: 'ticket.reviewed',
      actorId: home.custodian.id,
      fromStatus: 'REPORTED',
      toStatus: 'REVIEWED',
      meta: {},
    });
  });

  it("reclassifies the fault, takes the new item's priority and keeps the resident's words", async () => {
    const ticket = await createTicket(t.prisma, home, {
      reporter: home.residents[1],
      item: 'Leaking tap', // MEDIUM
      description: 'Water everywhere near the socket',
    });

    const res = await review(ticket, {
      faultItemId: home.items['Broken socket'].id, // Electrical, HIGH by default
      note: 'Water is leaking into the socket box: electrical first.',
    }).expect(200);

    expect(res.body.ticket).toMatchObject({
      status: 'REVIEWED',
      priority: 'HIGH',
      faultItem: { name: 'Broken socket', category: { name: 'Electrical' } },
      description: 'Water everywhere near the socket',
    });
    const [row] = await audit(ticket);
    expect(row.meta).toEqual({
      faultItem: {
        from: { id: home.items['Leaking tap'].id, name: 'Leaking tap' },
        to: { id: home.items['Broken socket'].id, name: 'Broken socket' },
      },
      priority: { from: 'MEDIUM', to: 'HIGH' },
      note: 'Water is leaking into the socket box: electrical first.',
    });
  });

  it('lets the custodian set the priority explicitly', async () => {
    const ticket = await createTicket(t.prisma, home, {
      reporter: home.residents[2],
      item: 'Bulb not working', // LOW, respond within 48 h
    });
    const res = await review(ticket, { priority: 'URGENT' }).expect(200);
    expect(res.body.ticket.priority).toBe('URGENT');
    expect((await saved(ticket)).dueAt).toEqual(new Date(ticket.createdAt.getTime() + 2 * HOUR));
  });

  it('reviews a reopened ticket, timing it from the reopen', async () => {
    const ticket = await createTicket(t.prisma, home, {
      reporter: home.residents[0],
      item: 'Leaking tap', // MEDIUM: 24 h
      status: S.REOPENED,
      createdAt: new Date(Date.now() - 200 * HOUR),
    });
    const reopenedAt = new Date(Date.now() - HOUR);
    await t.prisma.auditLog.create({
      data: {
        propertyId: home.property.id,
        ticketId: ticket.id,
        action: 'ticket.status_changed',
        fromStatus: S.COMPLETED,
        toStatus: S.REOPENED,
        createdAt: reopenedAt,
      },
    });

    const res = await review(ticket).expect(200);
    expect(res.body.ticket).toMatchObject({ status: 'REVIEWED', target: { state: 'ON_TRACK' } });
    expect((await saved(ticket)).dueAt).toEqual(new Date(reopenedAt.getTime() + 24 * HOUR));
  });

  it('reclassifies a scheduled ticket without changing its status', async () => {
    const ticket = await createTicket(t.prisma, home, {
      reporter: home.residents[1],
      item: 'Leaking tap',
      status: S.SCHEDULED,
      assignee: home.custodian,
    });
    const res = await review(ticket, { priority: 'HIGH' }).expect(200);
    expect(res.body.ticket).toMatchObject({ status: 'SCHEDULED', priority: 'HIGH' });
    const [row] = await audit(ticket);
    expect(row).toMatchObject({
      action: 'ticket.reclassified',
      fromStatus: null,
      toStatus: null,
      meta: { priority: { from: 'MEDIUM', to: 'HIGH' } },
    });
    // Already responded to: no new respond deadline.
    expect(await deadlineJob(ticket)).toBeUndefined();
  });

  it('refuses a second review that changes nothing, and finished tickets (409)', async () => {
    const reviewed = await createTicket(t.prisma, home, {
      reporter: home.residents[2],
      status: S.REVIEWED,
    });
    const res = await review(reviewed).expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
    await review(reviewed, { priority: reviewed.priority }).expect(409);

    for (const status of [S.COMPLETED, S.CLOSED, S.STUDENT_CONFIRMED]) {
      const done = await createTicket(t.prisma, home, { reporter: home.residents[2], status });
      await review(done, { priority: 'HIGH' }).expect(409);
    }
  });

  it("only accepts this property's active catalogue items, and checks the body (400)", async () => {
    const ticket = await createTicket(t.prisma, home, { reporter: home.residents[0] });
    const inactive = await t.prisma.faultItem.create({
      data: { categoryId: home.categories.Plumbing.id, name: 'Old boiler', isActive: false },
    });
    for (const faultItemId of [away.items['Broken socket'].id, inactive.id, 'nope']) {
      const res = await review(ticket, { faultItemId }).expect(400);
      expect(res.body.error.details.fieldErrors).toHaveProperty('faultItemId');
    }
    for (const body of [{ priority: 'SOON' }, { note: '' }, { note: 'x'.repeat(501) }]) {
      const res = await review(ticket, body).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
    expect((await saved(ticket)).status).toBe('REPORTED');
  });

  it("cannot review another property's ticket, and is for staff only", async () => {
    const elsewhere = await createTicket(t.prisma, away, { reporter: away.residents[0] });
    await review(elsewhere).expect(404);
    const mine = await createTicket(t.prisma, home, { reporter: home.residents[0] });
    await review(mine, {}, home.residents[0]).expect(403);
    await review(mine, {}, home.admin).expect(200);
  });
});
