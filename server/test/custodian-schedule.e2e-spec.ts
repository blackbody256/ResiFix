// PB-015: schedule a repair visit and notify the resident (POST /custodian/tickets/:id/visits).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ticket, TicketStatus, type User } from '@prisma/client';
import { kampalaTime } from '../src/custodian/kampala-time';
import { startApp, type TestApp } from './app';
import {
  createProperty,
  createTicket,
  destroyProperty,
  HOUR,
  type PropertyFixture,
} from './fixtures';

const S = TicketStatus;

describe('PB-015 schedule a repair visit', () => {
  let t: TestApp;
  let home: PropertyFixture;
  let away: PropertyFixture;

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Schedule Hall');
    away = await createProperty(t.prisma, 'Other Schedule Hall');
  });
  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await destroyProperty(t.prisma, away.property.id);
    await t.close();
  });

  /** Tomorrow at a whole hour, as the client would send it. */
  const tomorrow = (hour = 16) => {
    const d = new Date(Date.now() + 24 * HOUR);
    d.setUTCHours(hour - 3, 0, 0, 0); // hour:00 Kampala time
    return d;
  };
  const book = (ticket: Ticket, body: object, caller: User = home.custodian) =>
    t.as(caller).post(`/custodian/tickets/${ticket.id}/visits`).send(body);
  const notesFor = (user: User, ticket: Ticket) =>
    t.prisma.notification.findMany({ where: { userId: user.id, ticketId: ticket.id } });

  it('books a visit, schedules the ticket, assigns it and tells the resident', async () => {
    const ticket = await createTicket(t.prisma, home, {
      reporter: home.residents[0],
      status: S.REVIEWED,
    });
    const at = tomorrow();

    const res = await book(ticket, {
      scheduledAt: at.toISOString(),
      notes: 'Bring a new washer',
    }).expect(201);

    expect(res.body.visit).toMatchObject({
      scheduledAt: at.toISOString(),
      arrivedAt: null,
      missed: false,
      notes: 'Bring a new washer',
      custodian: { id: home.custodian.id },
    });
    expect(res.body.ticket).toMatchObject({
      status: 'SCHEDULED',
      assignee: { id: home.custodian.id },
      nextVisit: { id: res.body.visit.id },
      next: 'VISIT',
      target: { clock: 'RESOLVE' },
    });

    const row = await t.prisma.auditLog.findFirstOrThrow({
      where: { ticketId: ticket.id, action: 'visit.scheduled' },
    });
    expect(row).toMatchObject({
      actorId: home.custodian.id,
      fromStatus: 'REVIEWED',
      toStatus: 'SCHEDULED',
      meta: {
        visitId: res.body.visit.id,
        scheduledAt: at.toISOString(),
        custodianId: home.custodian.id,
      },
    });

    const [note] = await notesFor(home.residents[0], ticket);
    expect(note.message).toContain('Repair visit booked');
    expect(note.message).toContain('Leaking tap, Block A 101');
    expect(note.message).toContain(kampalaTime(at));
    expect(await notesFor(home.custodian, ticket)).toHaveLength(0); // booked it themselves
  });

  it("sends the ticket's assignee and tells them when someone else books for them", async () => {
    const ticket = await createTicket(t.prisma, home, {
      reporter: home.residents[1],
      status: S.ASSIGNED,
      assignee: home.custodian2,
    });
    const res = await book(ticket, { scheduledAt: tomorrow(10).toISOString() }).expect(201);
    expect(res.body.visit.custodian.id).toBe(home.custodian2.id);
    const [note] = await notesFor(home.custodian2, ticket);
    expect(note.message).toContain('Visit booked for you');
  });

  it('makes an admin say who will visit an unassigned ticket', async () => {
    const ticket = await createTicket(t.prisma, home, {
      reporter: home.residents[2],
      status: S.REOPENED,
    });
    const missing = await book(
      ticket,
      { scheduledAt: tomorrow().toISOString() },
      home.admin,
    ).expect(400);
    expect(missing.body.error.details.fieldErrors).toHaveProperty('custodianId');

    const res = await book(
      ticket,
      { scheduledAt: tomorrow().toISOString(), custodianId: home.custodian2.id },
      home.admin,
    ).expect(201);
    expect(res.body.ticket).toMatchObject({
      status: 'SCHEDULED',
      assignee: { id: home.custodian2.id },
    });
  });

  it('allows one upcoming visit at a time', async () => {
    const ticket = await createTicket(t.prisma, home, {
      reporter: home.residents[0],
      status: S.REVIEWED,
    });
    await book(ticket, { scheduledAt: tomorrow().toISOString() }).expect(201);
    const again = await book(ticket, { scheduledAt: tomorrow(9).toISOString() }).expect(409);
    expect(again.body.error.message).toMatch(/already booked/);
  });

  it('books a new visit after a missed one, and a follow-up during the work', async () => {
    for (const status of [S.SCHEDULED, S.IN_PROGRESS]) {
      const ticket = await createTicket(t.prisma, home, {
        reporter: home.residents[1],
        status,
        assignee: home.custodian,
      });
      await t.prisma.visit.create({
        data: {
          ticketId: ticket.id,
          custodianId: home.custodian.id,
          scheduledAt: new Date(Date.now() - 2 * HOUR),
          ...(status === S.SCHEDULED ? { missed: true } : { arrivedAt: new Date() }),
        },
      });

      const res = await book(ticket, { scheduledAt: tomorrow().toISOString() }).expect(201);
      expect(res.body.ticket.status).toBe(status);
      const row = await t.prisma.auditLog.findFirstOrThrow({
        where: { ticketId: ticket.id, action: 'visit.scheduled' },
      });
      expect(row).toMatchObject({ fromStatus: null, toStatus: null });
    }
  });

  it('needs a review first, and refuses finished tickets (409)', async () => {
    const reported = await createTicket(t.prisma, home, { reporter: home.residents[2] });
    const res = await book(reported, { scheduledAt: tomorrow().toISOString() }).expect(409);
    expect(res.body.error.message).toMatch(/review/i);
    for (const status of [S.COMPLETED, S.CLOSED]) {
      const done = await createTicket(t.prisma, home, { reporter: home.residents[2], status });
      await book(done, { scheduledAt: tomorrow().toISOString() }).expect(409);
    }
  });

  it('checks the time and the custodian (400)', async () => {
    const ticket = await createTicket(t.prisma, home, {
      reporter: home.residents[0],
      status: S.REVIEWED,
    });
    const past = await book(ticket, {
      scheduledAt: new Date(Date.now() - HOUR).toISOString(),
    }).expect(400);
    expect(past.body.error.details.fieldErrors).toHaveProperty('scheduledAt');
    const far = await book(ticket, {
      scheduledAt: new Date(Date.now() + 61 * 24 * HOUR).toISOString(),
    }).expect(400);
    expect(far.body.error.details.fieldErrors).toHaveProperty('scheduledAt');

    for (const body of [{}, { scheduledAt: '2026-11-10 16:00' }, { scheduledAt: 'tomorrow' }]) {
      const res = await book(ticket, body).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
    for (const custodianId of [home.residents[0].id, away.custodian.id]) {
      const res = await book(ticket, {
        scheduledAt: tomorrow().toISOString(),
        custodianId,
      }).expect(400);
      expect(res.body.error.details.fieldErrors).toHaveProperty('custodianId');
    }
    expect(await t.prisma.visit.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it("cannot book for another property's ticket, and is for staff only", async () => {
    const elsewhere = await createTicket(t.prisma, away, {
      reporter: away.residents[0],
      status: S.REVIEWED,
    });
    await book(elsewhere, { scheduledAt: tomorrow().toISOString() }).expect(404);
    const mine = await createTicket(t.prisma, home, {
      reporter: home.residents[0],
      status: S.REVIEWED,
    });
    await book(mine, { scheduledAt: tomorrow().toISOString() }, home.residents[0]).expect(403);
  });
});
