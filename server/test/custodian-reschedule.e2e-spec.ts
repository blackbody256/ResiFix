// PB-016: the resident asks for another time (POST /visits/:visitId/change-request) and the
// custodian moves the visit (PATCH /custodian/visits/:visitId).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ticket, TicketStatus, type User, type Visit } from '@prisma/client';
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

describe('PB-016 request another time', () => {
  let t: TestApp;
  let home: PropertyFixture;
  let away: PropertyFixture;

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Reschedule Hall');
    away = await createProperty(t.prisma, 'Other Reschedule Hall');
  });
  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await destroyProperty(t.prisma, away.property.id);
    await t.close();
  });

  const inHours = (h: number) => new Date(Date.now() + h * HOUR);

  /** A scheduled ticket of `fx.residents[i]` with a visit by fx.custodian at `at`. */
  async function booked(fx: PropertyFixture, i = 0, at = inHours(20), extra: Partial<Visit> = {}) {
    const ticket = await createTicket(t.prisma, fx, {
      reporter: fx.residents[i],
      status: S.SCHEDULED,
      assignee: fx.custodian,
    });
    const visit = await t.prisma.visit.create({
      data: { ticketId: ticket.id, custodianId: fx.custodian.id, scheduledAt: at, ...extra },
    });
    return { ticket, visit };
  }

  const ask = (visit: Visit, caller: User, message = 'I have an exam then. After 2 pm works.') =>
    t.as(caller).post(`/visits/${visit.id}/change-request`).send({ message });
  const move = (visit: Visit, body: object, caller: User = home.custodian) =>
    t.as(caller).patch(`/custodian/visits/${visit.id}`).send(body);
  const queueItem = async (ticket: Ticket) =>
    (await t.as(home.custodian).get(`/custodian/queue?q=${ticket.id}`).expect(200)).body.tickets[0];
  const notesFor = (user: User, ticket: Ticket) =>
    t.prisma.notification.findMany({
      where: { userId: user.id, ticketId: ticket.id },
      orderBy: { createdAt: 'asc' },
    });

  it('runs the whole loop: ask, flag, move, notify, ask again', async () => {
    const { ticket, visit } = await booked(home);
    const resident = home.residents[0];

    // The resident asks.
    const asked = await ask(visit, resident).expect(201);
    expect(asked.body.changeRequest).toEqual({
      visitId: visit.id,
      message: 'I have an exam then. After 2 pm works.',
      requestedAt: expect.any(String),
    });
    const [alert] = await notesFor(home.custodian, ticket);
    expect(alert.message).toContain('Resident asks for another time');
    expect(alert.message).toContain('After 2 pm works');

    // The queue flags it for the custodian.
    expect(await queueItem(ticket)).toMatchObject({
      next: 'RESCHEDULE',
      nextVisit: { id: visit.id, changeRequest: { message: expect.stringContaining('exam') } },
    });

    // Only one open request per visit.
    const twice = await ask(visit, resident).expect(409);
    expect(twice.body.error.message).toMatch(/already asked/);

    // The custodian moves it.
    const newTime = inHours(30);
    const moved = await move(visit, { scheduledAt: newTime.toISOString() }).expect(200);
    expect(moved.body.visit).toMatchObject({ id: visit.id, scheduledAt: newTime.toISOString() });
    expect(moved.body.ticket).toMatchObject({
      status: 'SCHEDULED',
      next: 'VISIT',
      nextVisit: { changeRequest: null },
    });
    const row = await t.prisma.auditLog.findFirstOrThrow({
      where: { ticketId: ticket.id, action: 'visit.rescheduled' },
    });
    expect(row.meta).toEqual({
      visitId: visit.id,
      from: visit.scheduledAt.toISOString(),
      to: newTime.toISOString(),
    });
    const [told] = await notesFor(resident, ticket);
    expect(told.message).toContain('Repair visit moved');
    expect(told.message).toContain(kampalaTime(newTime));

    // A new time can be questioned again.
    await ask(visit, resident, 'Sorry, Thursday is better').expect(201);
  });

  it('tells the visiting custodian when someone else moves their visit', async () => {
    const { ticket, visit } = await booked(home, 1);
    await move(visit, { scheduledAt: inHours(40).toISOString() }, home.admin).expect(200);
    const notes = await notesFor(home.custodian, ticket);
    expect(notes.map((n) => n.message).join()).toContain('Your visit was moved');
  });

  it('does nothing when the time and notes are unchanged', async () => {
    const { ticket, visit } = await booked(home, 2);
    await move(visit, { scheduledAt: visit.scheduledAt.toISOString() }).expect(200);
    expect(
      await t.prisma.auditLog.count({
        where: { ticketId: ticket.id, action: 'visit.rescheduled' },
      }),
    ).toBe(0);
  });

  describe('the resident request', () => {
    it("is only for the resident's own upcoming visit", async () => {
      const { visit } = await booked(home, 1);
      await ask(visit, home.residents[0]).expect(404); // a neighbour's visit
      const { visit: elsewhere } = await booked(away);
      await ask(elsewhere, home.residents[0]).expect(404);
      await ask(visit, home.custodian).expect(403);
    });

    it('is too late once the visit has happened or its time has passed (409)', async () => {
      const resident = home.residents[2];
      const { visit: missed } = await booked(home, 2, inHours(-2), { missed: true });
      const { visit: done } = await booked(home, 2, inHours(-2), { arrivedAt: new Date() });
      const { visit: due } = await booked(home, 2, inHours(-0.1));
      for (const visit of [missed, done, due]) await ask(visit, resident).expect(409);
    });

    it('needs a message of 1 to 300 characters', async () => {
      const { visit } = await booked(home, 0);
      for (const message of ['', '   ', 'x'.repeat(301)]) {
        const res = await ask(visit, home.residents[0], message).expect(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
      }
    });
  });

  describe('moving a visit', () => {
    it('only moves upcoming visits, to a valid time', async () => {
      const { visit: missed } = await booked(home, 0, inHours(-2), { missed: true });
      await move(missed, { scheduledAt: inHours(5).toISOString() }).expect(409);

      const { visit } = await booked(home, 0);
      const past = await move(visit, { scheduledAt: inHours(-1).toISOString() }).expect(400);
      expect(past.body.error.details.fieldErrors).toHaveProperty('scheduledAt');
      await move(visit, {}).expect(400);
    });

    it("cannot touch another property's visit, and is for staff only", async () => {
      const { visit: elsewhere } = await booked(away);
      await move(elsewhere, { scheduledAt: inHours(5).toISOString() }).expect(404);
      const { visit } = await booked(home, 1);
      await move(visit, { scheduledAt: inHours(5).toISOString() }, home.residents[1]).expect(403);
    });
  });
});
