// PB-005 -> PB-012 and PB-024: a report sent by a resident starts its response clock (dueAt and
// the breach job) and alerts the custodians of that property straight away.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CustodianAlertsService } from '../src/notifications/custodian-alerts.service';
import { ResponseTargetsService } from '../src/custodian/response-targets.service';
import { QUEUES } from '../src/queue/queue.constants';
import { startApp, type TestApp } from './app';
import { createProperty, destroyProperty, HOUR, type PropertyFixture } from './fixtures';

describe('a resident report starts the clock and alerts the custodians', () => {
  let t: TestApp;
  let home: PropertyFixture;
  let away: PropertyFixture;

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Report Hall');
    away = await createProperty(t.prisma, 'Other Hall');
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await destroyProperty(t.prisma, away.property.id);
    await t.close();
  });

  const report = (item: string, expected = 201) =>
    t
      .as(home.residents[0])
      .post('/reporting/tickets')
      .send({ roomId: home.rooms['Block A-101'].id, faultItemId: home.items[item].id })
      .expect(expected);
  const alertedIds = async (ticketId: string) =>
    (await t.prisma.notification.findMany({ where: { ticketId } })).map((n) => n.userId).sort();

  it('sets the respond-by time from the target and schedules the breach alert', async () => {
    const res = await report('No water'); // URGENT: respond within 2 h
    const { id, createdAt, dueAt } = res.body.ticket;

    expect(new Date(dueAt).getTime()).toBe(new Date(createdAt).getTime() + 2 * HOUR);
    const saved = await t.prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(saved.dueAt?.toISOString()).toBe(dueAt);

    const job = await t.queue(QUEUES.TICKET_TIMERS).getJob(`response-deadline-${id}`);
    expect(job?.data).toEqual({ ticketId: id });
    expect(job?.opts.delay).toBeGreaterThan(1.9 * HOUR);
  });

  it("alerts the property's custodians, and nobody else", async () => {
    const res = await report('Broken socket'); // HIGH
    const id = res.body.ticket.id;

    expect(await alertedIds(id)).toEqual([home.custodian.id, home.custodian2.id].sort());
    const message = await t.prisma.notification.findFirstOrThrow({
      where: { ticketId: id, userId: home.custodian.id },
    });
    expect(message.message).toContain('New fault reported');
    expect(message.message).toContain('Broken socket, Block A 101 (high priority)');
    expect(message.message).toContain('Respond by');

    const others = await t.prisma.notification.count({
      where: { ticketId: id, userId: { in: away.users.map((u) => u.id) } },
    });
    expect(others).toBe(0);
  });

  it('keeps the report when the alert cannot be sent', async () => {
    vi.spyOn(t.app.get(CustodianAlertsService), 'ticketReported').mockRejectedValueOnce(
      new Error('queue down'),
    );
    const res = await report('Leaking tap');
    const id = res.body.ticket.id;

    expect(res.body.ticket.dueAt).toEqual(expect.any(String)); // the clock still started
    expect(await t.prisma.ticket.count({ where: { id } })).toBe(1);
    expect(await alertedIds(id)).toEqual([]);
  });

  it('keeps the report when the clock cannot be started, and still alerts', async () => {
    vi.spyOn(t.app.get(ResponseTargetsService), 'startClock').mockRejectedValueOnce(
      new Error('database busy'),
    );
    const res = await report('Bulb not working');
    const id = res.body.ticket.id;

    expect(res.body.ticket.dueAt).toBeNull();
    expect(await alertedIds(id)).toEqual([home.custodian.id, home.custodian2.id].sort());
  });
});
