// PB-018: the custodian marks when repair work starts (POST /custodian/tickets/:id/start).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ticket, TicketStatus, type User, type Visit } from '@prisma/client';
import { startApp, type TestApp } from './app';
import {
  createProperty,
  createTicket,
  destroyProperty,
  HOUR,
  type PropertyFixture,
} from './fixtures';

const S = TicketStatus;
const UNASSIGNED: TicketStatus[] = [S.REPORTED, S.REVIEWED, S.REOPENED];

describe('PB-018 mark work in progress', () => {
  let t: TestApp;
  let home: PropertyFixture;
  let away: PropertyFixture;

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Start Hall');
    away = await createProperty(t.prisma, 'Other Start Hall');
  });
  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await destroyProperty(t.prisma, away.property.id);
    await t.close();
  });

  const inHours = (h: number) => new Date(Date.now() + h * HOUR);
  const ticketIn = (status: TicketStatus, fx = home) =>
    createTicket(t.prisma, fx, {
      reporter: fx.residents[0],
      status,
      assignee: UNASSIGNED.includes(status) ? null : fx.custodian,
    });
  const visitFor = (ticket: Ticket, extra: Partial<Visit> = {}) =>
    t.prisma.visit.create({
      data: {
        ticketId: ticket.id,
        custodianId: home.custodian.id,
        scheduledAt: inHours(-0.25),
        ...extra,
      },
    });
  const start = (ticket: Ticket, body?: object, caller: User = home.custodian) => {
    const req = t.as(caller).post(`/custodian/tickets/${ticket.id}/start`);
    return body ? req.send(body) : req;
  };
  const arrivals = (ticket: Ticket) =>
    t.prisma.auditLog.findMany({ where: { ticketId: ticket.id, action: 'visit.arrived' } });

  it('records arrival on the booked visit, starts the work and tells the resident', async () => {
    const ticket = await ticketIn(S.SCHEDULED);
    const visit = await visitFor(ticket);

    const res = await start(ticket).expect(200); // no body needed
    expect(res.body.visit).toMatchObject({ id: visit.id, missed: false });
    expect(new Date(res.body.visit.arrivedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(res.body.ticket).toMatchObject({
      status: 'IN_PROGRESS',
      next: 'COMPLETE',
      nextVisit: null,
      target: { clock: 'RESOLVE' },
    });

    const [row] = await arrivals(ticket);
    expect(row).toMatchObject({
      actorId: home.custodian.id,
      fromStatus: 'SCHEDULED',
      toStatus: 'IN_PROGRESS',
      meta: { visitId: visit.id, walkIn: false },
    });
    const note = await t.prisma.notification.findFirstOrThrow({
      where: { userId: home.residents[0].id, ticketId: ticket.id },
    });
    expect(note.message).toContain('Repair started');
  });

  it('records a walk-in when no visit is booked', async () => {
    for (const setup of ['assigned', 'after a missed visit'] as const) {
      const ticket = await ticketIn(S[setup === 'assigned' ? 'ASSIGNED' : 'SCHEDULED']);
      if (setup !== 'assigned') await visitFor(ticket, { missed: true });

      const res = await start(ticket, {}).expect(200);
      expect(res.body.ticket.status).toBe('IN_PROGRESS');
      expect(res.body.visit).toMatchObject({ custodian: { id: home.custodian.id } });
      expect(res.body.visit.scheduledAt).toBe(res.body.visit.arrivedAt);
      const [row] = await arrivals(ticket);
      expect(row.meta).toMatchObject({ walkIn: true });
    }
  });

  it('records arrival for a follow-up visit without changing the status', async () => {
    const ticket = await ticketIn(S.IN_PROGRESS);
    await visitFor(ticket, { scheduledAt: inHours(-30), arrivedAt: inHours(-30) });
    const followUp = await visitFor(ticket, { scheduledAt: inHours(-0.1) });

    const res = await start(ticket, { visitId: followUp.id }).expect(200);
    expect(res.body.ticket.status).toBe('IN_PROGRESS');
    const [row] = await arrivals(ticket);
    expect(row).toMatchObject({ fromStatus: null, toStatus: null, meta: { walkIn: false } });

    const again = await start(ticket).expect(409);
    expect(again.body.error.message).toMatch(/already in progress/);
  });

  it('only uses an upcoming visit of this ticket', async () => {
    const ticket = await ticketIn(S.SCHEDULED);
    const other = await ticketIn(S.SCHEDULED);
    const otherVisit = await visitFor(other);
    await start(ticket, { visitId: otherVisit.id }).expect(404);

    const done = await visitFor(ticket, { missed: true });
    await start(ticket, { visitId: done.id }).expect(409);
  });

  it('follows the lifecycle (409)', async () => {
    const cases: [TicketStatus, RegExp][] = [
      [S.REPORTED, /review/i],
      [S.REVIEWED, /assign the ticket or book a visit/i],
      [S.REOPENED, /assign the ticket or book a visit/i],
      [S.COMPLETED, /cannot start/],
      [S.CLOSED, /cannot start/],
    ];
    for (const [status, message] of cases) {
      const res = await start(await ticketIn(status)).expect(409);
      expect(res.body.error.message).toMatch(message);
    }
  });

  it("cannot start work on another property's ticket, and is for staff only", async () => {
    await start(await ticketIn(S.ASSIGNED, away)).expect(404);
    const mine = await ticketIn(S.ASSIGNED);
    await start(mine, {}, home.residents[0]).expect(403);
    await start(mine, { visitId: '' }).expect(400);
    await start(mine, {}, home.admin).expect(200);
  });
});
