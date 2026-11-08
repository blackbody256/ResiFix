// PB-013: prioritised work queue (GET /custodian/queue) and assignment
// (POST /custodian/tickets/:id/assign).
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

describe('PB-013 work queue', () => {
  let t: TestApp;
  let home: PropertyFixture;
  let away: PropertyFixture;
  // Open tickets, in the order the queue must show them:
  let overdue: Ticket; //   URGENT, reported 3 h ago, respond target 2 h, not reviewed
  let reviewed: Ticket; //  HIGH, reported 1 h ago, respond by +12 h
  let scheduled: Ticket; // MEDIUM, visit booked, resolve by +72 h from 10 h ago
  let missed: Ticket; //    LOW, last visit missed, resolve by +168 h from 2 h ago
  let completed: Ticket; // waiting for the resident: only shown on request
  let elsewhere: Ticket;

  const ago = (h: number) => new Date(Date.now() - h * HOUR);

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Queue Hall');
    away = await createProperty(t.prisma, 'Other Queue Hall');
    const [r1, r2, r3] = home.residents;

    overdue = await createTicket(t.prisma, home, {
      reporter: r1,
      item: 'No water',
      createdAt: ago(3),
      description: 'No water from any tap',
    });
    reviewed = await createTicket(t.prisma, home, {
      reporter: r2,
      item: 'Blocked toilet',
      status: S.REVIEWED,
      createdAt: ago(1),
      dueAt: new Date(ago(1).getTime() + 12 * HOUR),
      description: 'Toilet will not flush',
    });
    scheduled = await createTicket(t.prisma, home, {
      reporter: r3,
      item: 'Leaking tap',
      status: S.SCHEDULED,
      assignee: home.custodian,
      createdAt: ago(10),
    });
    await t.prisma.visit.create({
      data: {
        ticketId: scheduled.id,
        custodianId: home.custodian.id,
        scheduledAt: new Date(Date.now() + 20 * HOUR),
      },
    });
    missed = await createTicket(t.prisma, home, {
      reporter: r1,
      item: 'Bulb not working',
      status: S.SCHEDULED,
      assignee: home.custodian2,
      createdAt: ago(2),
    });
    await t.prisma.visit.create({
      data: {
        ticketId: missed.id,
        custodianId: home.custodian2.id,
        scheduledAt: ago(1),
        missed: true,
      },
    });
    completed = await createTicket(t.prisma, home, {
      reporter: r2,
      status: S.COMPLETED,
      assignee: home.custodian,
    });
    await createTicket(t.prisma, home, { reporter: r3, status: S.CLOSED });
    await t.prisma.photo.create({
      data: {
        ticketId: reviewed.id,
        uploadedById: r2.id,
        kind: 'REPORT',
        url: `properties/${home.property.id}/tickets/${reviewed.id}/x.png`,
      },
    });
    elsewhere = await createTicket(t.prisma, away, { reporter: away.residents[0] });
  });
  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await destroyProperty(t.prisma, away.property.id);
    await t.close();
  });

  type Item = { id: string; [key: string]: unknown };
  const queue = async (query = '', caller = home.custodian) =>
    (await t.as(caller).get(`/custodian/queue${query}`).expect(200)).body as {
      tickets: Item[];
      summary: Record<string, number>;
    };
  const ids = (items: Item[]) => items.map((i) => i.id);

  describe('GET /custodian/queue', () => {
    it('lists open tickets, most pressing first, with a summary', async () => {
      const res = await queue();
      expect(ids(res.tickets)).toEqual([overdue.id, reviewed.id, scheduled.id, missed.id]);
      expect(res.summary).toEqual({ total: 4, overdue: 1, dueSoon: 0, unassigned: 2 });
    });

    it('describes each ticket by room, target and next step, without naming the resident', async () => {
      const { tickets } = await queue();
      const [first, second, third, fourth] = tickets;

      expect(first).toMatchObject({
        status: 'REPORTED',
        priority: 'URGENT',
        room: { number: '101', block: { name: 'Block A' } },
        faultItem: { name: 'No water', category: { name: 'Plumbing' } },
        assignee: null,
        target: { clock: 'RESPOND', state: 'OVERDUE' },
        next: 'REVIEW',
      });
      expect((first.target as { minutesLeft: number }).minutesLeft).toBeLessThan(-55);
      expect(second).toMatchObject({
        photoCount: 1,
        next: 'SCHEDULE',
        target: { state: 'ON_TRACK' },
      });
      expect(third).toMatchObject({
        next: 'VISIT',
        assignee: { id: home.custodian.id },
        nextVisit: { custodian: { id: home.custodian.id } },
        target: { clock: 'RESOLVE' },
      });
      expect(fourth).toMatchObject({
        next: 'RESCHEDULE',
        nextVisit: null,
        lastMissedVisit: { id: expect.any(String) },
      });

      for (const item of tickets) {
        expect(item).not.toHaveProperty('reporter');
        expect(item).not.toHaveProperty('reporterId');
      }
    });

    it.each([
      ['?state=OVERDUE', () => [overdue]],
      ['?state=ON_TRACK,DUE_SOON', () => [reviewed, scheduled, missed]],
      ['?priority=URGENT,HIGH', () => [overdue, reviewed]],
      ['?assignee=me', () => [scheduled]],
      ['?assignee=unassigned', () => [overdue, reviewed]],
      ['?status=COMPLETED', () => [completed]],
    ])('filters %s', async (query, expected) => {
      expect(ids((await queue(query)).tickets)).toEqual(expected().map((x) => x.id));
    });

    it('filters by assignee, category and block', async () => {
      expect(ids((await queue(`?assignee=${home.custodian2.id}`)).tickets)).toEqual([missed.id]);
      const electrical = home.categories.Electrical.id;
      expect(ids((await queue(`?categoryId=${electrical}`)).tickets)).toEqual([missed.id]);
      const blockB = home.blocks['Block B'].id;
      expect(ids((await queue(`?blockId=${blockB}`)).tickets)).toEqual([scheduled.id]);
    });

    it('searches the description, room, block, fault and category', async () => {
      expect(ids((await queue('?q=flush')).tickets)).toEqual([reviewed.id]);
      expect(ids((await queue('?q=102')).tickets)).toEqual([reviewed.id]);
      expect(ids((await queue('?q=block%20b')).tickets)).toEqual([scheduled.id]);
      expect(ids((await queue('?q=electrical')).tickets)).toEqual([missed.id]);
      expect(ids((await queue(`?q=${overdue.id}`)).tickets)).toEqual([overdue.id]);
    });

    it('counts a reopened ticket from the reopen, even after it is scheduled again', async () => {
      const again = await createTicket(t.prisma, away, {
        reporter: away.residents[1],
        item: 'Leaking tap', // MEDIUM: resolve within 72 h
        status: S.SCHEDULED,
        createdAt: ago(200),
      });
      await t.prisma.auditLog.create({
        data: {
          propertyId: away.property.id,
          ticketId: again.id,
          action: 'ticket.status_changed',
          fromStatus: S.COMPLETED,
          toStatus: S.REOPENED,
          createdAt: ago(5),
        },
      });
      const { tickets } = await queue(`?q=${again.id}`, away.custodian);
      expect(tickets).toEqual([
        expect.objectContaining({
          id: again.id,
          target: expect.objectContaining({ state: 'ON_TRACK' }),
        }),
      ]);
    });

    it('limits the list but counts everything in the summary', async () => {
      const res = await queue('?limit=2');
      expect(ids(res.tickets)).toEqual([overdue.id, reviewed.id]);
      expect(res.summary.total).toBe(4);
    });

    it('rejects bad filters', async () => {
      for (const query of [
        '?status=CLOSED',
        '?status=NOPE',
        '?state=LATE',
        '?limit=0',
        '?limit=500',
      ]) {
        const res = await t.as(home.custodian).get(`/custodian/queue${query}`).expect(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
      }
    });

    it("only shows the caller's property, and only to staff", async () => {
      expect(ids((await queue('', away.custodian)).tickets)).toContain(elsewhere.id);
      expect(ids((await queue('', away.custodian)).tickets)).not.toContain(overdue.id);
      expect(ids((await queue('', home.admin)).tickets)).toHaveLength(4);
      await t.as(home.residents[0]).get('/custodian/queue').expect(403);
    });
  });

  describe('POST /custodian/tickets/:id/assign', () => {
    const assign = (ticket: Ticket, assigneeId: string, caller = home.custodian) =>
      t.as(caller).post(`/custodian/tickets/${ticket.id}/assign`).send({ assigneeId });
    const auditRows = (ticket: Ticket) =>
      t.prisma.auditLog.findMany({
        where: { ticketId: ticket.id, action: 'ticket.assigned' },
        orderBy: { createdAt: 'asc' },
      });

    it('assigns a reviewed ticket, records it and tells the new assignee', async () => {
      const res = await assign(reviewed, home.custodian2.id).expect(200);
      expect(res.body.ticket).toMatchObject({
        id: reviewed.id,
        status: 'ASSIGNED',
        assignee: { id: home.custodian2.id },
        next: 'SCHEDULE',
      });

      const [row] = await auditRows(reviewed);
      expect(row).toMatchObject({
        actorId: home.custodian.id,
        fromStatus: 'REVIEWED',
        toStatus: 'ASSIGNED',
        meta: { assigneeId: home.custodian2.id, previousAssigneeId: null },
      });

      const notes = await t.prisma.notification.findMany({ where: { userId: home.custodian2.id } });
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({ ticketId: reviewed.id });
      expect(notes[0].message).toContain('Blocked toilet, Block A 102');
      const jobs = await t.queue(QUEUES.NOTIFICATIONS).getJobs(['waiting', 'delayed']);
      expect(jobs.some((j) => j.data.notificationId === notes[0].id)).toBe(true);
    });

    it('reassigns a scheduled ticket without changing its status, and moves its visit', async () => {
      await assign(scheduled, home.custodian2.id).expect(200);

      const ticket = await t.prisma.ticket.findUniqueOrThrow({
        where: { id: scheduled.id },
        include: { visits: true },
      });
      expect(ticket.status).toBe('SCHEDULED');
      expect(ticket.assigneeId).toBe(home.custodian2.id);
      expect(ticket.visits.map((v) => v.custodianId)).toEqual([home.custodian2.id]);
      const [row] = await auditRows(scheduled);
      expect(row).toMatchObject({ fromStatus: null, toStatus: null });
    });

    it('does nothing when the ticket already belongs to that custodian', async () => {
      await assign(scheduled, home.custodian2.id).expect(200);
      expect(await auditRows(scheduled)).toHaveLength(1);
    });

    it('does not notify a custodian who assigns a ticket to themselves', async () => {
      const reopened = await createTicket(t.prisma, home, {
        reporter: home.residents[2],
        status: S.REOPENED,
      });
      await assign(reopened, home.custodian.id).expect(200);
      expect(
        await t.prisma.notification.count({
          where: { userId: home.custodian.id, ticketId: reopened.id },
        }),
      ).toBe(0);
    });

    it('needs a review first, and refuses finished tickets (409)', async () => {
      const notReviewed = await assign(overdue, home.custodian.id).expect(409);
      expect(notReviewed.body.error).toMatchObject({
        code: 'CONFLICT',
        message: expect.stringMatching(/review/i),
      });
      await assign(completed, home.custodian2.id).expect(409);
    });

    it('only assigns to an active custodian of the same property (400)', async () => {
      for (const assigneeId of [home.residents[0].id, home.admin.id, away.custodian.id, 'nobody']) {
        const res = await assign(missed, assigneeId).expect(400);
        expect(res.body.error.details).toHaveProperty('assigneeId');
      }
      await t
        .as(home.custodian)
        .post(`/custodian/tickets/${missed.id}/assign`)
        .send({})
        .expect(400);
    });

    it("cannot touch another property's ticket, and is for staff only", async () => {
      await assign(elsewhere, home.custodian.id).expect(404);
      await assign(missed, home.custodian.id, home.residents[0]).expect(403);
    });
  });
});
