// PB-017: record a missed visit; the ticket stays open for rescheduling
// (POST /custodian/visits/:visitId/missed).
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

describe('PB-017 missed visit', () => {
  let t: TestApp;
  let home: PropertyFixture;
  let away: PropertyFixture;

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Missed Hall');
    away = await createProperty(t.prisma, 'Other Missed Hall');
  });
  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await destroyProperty(t.prisma, away.property.id);
    await t.close();
  });

  const inHours = (h: number) => new Date(Date.now() + h * HOUR);

  async function booked(
    fx: PropertyFixture,
    at = inHours(-1),
    status: TicketStatus = S.SCHEDULED,
    extra: Partial<Visit> = {},
  ) {
    const ticket = await createTicket(t.prisma, fx, {
      reporter: fx.residents[0],
      status,
      assignee: fx.custodian,
    });
    const visit = await t.prisma.visit.create({
      data: { ticketId: ticket.id, custodianId: fx.custodian.id, scheduledAt: at, ...extra },
    });
    return { ticket, visit };
  }

  const miss = (visit: Visit, body: object, caller: User = home.custodian) =>
    t.as(caller).post(`/custodian/visits/${visit.id}/missed`).send(body);
  const residentNote = async (ticket: Ticket) =>
    (
      await t.prisma.notification.findFirstOrThrow({
        where: { userId: ticket.reporterId, ticketId: ticket.id },
      })
    ).message;

  it('records the miss with its reason, keeps the ticket open and asks for a new time', async () => {
    const { ticket, visit } = await booked(home);

    const res = await miss(visit, { reason: 'RESIDENT_ABSENT' }).expect(200);
    expect(res.body.visit).toMatchObject({ id: visit.id, missed: true, arrivedAt: null });
    expect(res.body.ticket).toMatchObject({
      status: 'SCHEDULED',
      next: 'RESCHEDULE',
      nextVisit: null,
      lastMissedVisit: { id: visit.id },
    });

    const row = await t.prisma.auditLog.findFirstOrThrow({
      where: { ticketId: ticket.id, action: 'visit.missed' },
    });
    expect(row).toMatchObject({
      actorId: home.custodian.id,
      fromStatus: null,
      toStatus: null,
      meta: {
        visitId: visit.id,
        reason: 'RESIDENT_ABSENT',
        scheduledAt: visit.scheduledAt.toISOString(),
      },
    });
    const message = await residentNote(ticket);
    expect(message).toContain('Repair visit missed');
    expect(message).toContain('nobody was in');
    expect(message).toContain('stays open');

    // The missed visit no longer blocks booking a new one (PB-015).
    await t
      .as(home.custodian)
      .post(`/custodian/tickets/${ticket.id}/visits`)
      .send({ scheduledAt: inHours(24).toISOString() })
      .expect(201);
  });

  it('apologises when the custodian could not come', async () => {
    const { ticket, visit } = await booked(home);
    await miss(visit, { reason: 'CUSTODIAN_UNAVAILABLE' }).expect(200);
    expect(await residentNote(ticket)).toContain('Sorry, the custodian could not make the visit');
  });

  it('works for a follow-up visit while the work is in progress', async () => {
    const { visit } = await booked(home, inHours(-1), S.IN_PROGRESS);
    const res = await miss(visit, { reason: 'NO_ACCESS', notes: 'Water main locked' }).expect(200);
    expect(res.body.ticket.status).toBe('IN_PROGRESS');
  });

  it('needs notes for OTHER, and passes them on to the resident', async () => {
    const { ticket, visit } = await booked(home);
    const bare = await miss(visit, { reason: 'OTHER' }).expect(400);
    expect(bare.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fieldErrors: { notes: [expect.any(String)] } },
    });

    await miss(visit, { reason: 'OTHER', notes: 'Power cut across the block' }).expect(200);
    expect(await residentNote(ticket)).toContain('Power cut across the block');
  });

  it('only records a visit once, and not before it is due (409)', async () => {
    const { visit: future } = await booked(home, inHours(3));
    const early = await miss(future, { reason: 'RESIDENT_ABSENT' }).expect(409);
    expect(early.body.error.message).toMatch(/not due/);

    const { visit: done } = await booked(home, inHours(-2), S.IN_PROGRESS, {
      arrivedAt: new Date(),
    });
    await miss(done, { reason: 'RESIDENT_ABSENT' }).expect(409);

    const { visit } = await booked(home);
    await miss(visit, { reason: 'RESIDENT_ABSENT' }).expect(200);
    await miss(visit, { reason: 'RESIDENT_ABSENT' }).expect(409);
  });

  it('checks the reason (400)', async () => {
    const { visit } = await booked(home);
    for (const body of [{}, { reason: 'LATE' }, { reason: 'NO_ACCESS', notes: 'x'.repeat(301) }]) {
      const res = await miss(visit, body).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it("cannot touch another property's visit, and is for staff only", async () => {
    const { visit: elsewhere } = await booked(away);
    await miss(elsewhere, { reason: 'RESIDENT_ABSENT' }).expect(404);
    const { visit } = await booked(home);
    await miss(visit, { reason: 'RESIDENT_ABSENT' }, home.residents[0]).expect(403);
    await miss(visit, { reason: 'RESIDENT_ABSENT' }, home.admin).expect(200);
  });
});
