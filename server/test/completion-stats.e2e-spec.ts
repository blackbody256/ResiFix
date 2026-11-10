import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Priority, TicketStatus } from '@prisma/client';
import { startApp, type TestApp } from './app';
import {
  createProperty,
  createTicket,
  destroyProperty,
  HOUR,
  type PropertyFixture,
} from './fixtures';

describe('PB-026 response and repair-time stats', () => {
  let t: TestApp;
  let home: PropertyFixture;
  let away: PropertyFixture;

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Stats Hall');
    away = await createProperty(t.prisma, 'Other Stats Hall');

    const now = Date.now();
    const withinTarget = await createTicket(t.prisma, home, {
      reporter: home.residents[0],
      status: TicketStatus.COMPLETED,
      priority: Priority.HIGH,
      assignee: home.custodian,
      createdAt: new Date(now - 2 * HOUR),
    });
    const overdue = await createTicket(t.prisma, home, {
      reporter: home.residents[1],
      status: TicketStatus.COMPLETED,
      priority: Priority.HIGH,
      assignee: home.custodian,
      createdAt: new Date(now - 100 * HOUR),
    });
    await createTicket(t.prisma, home, {
      reporter: home.residents[2],
      status: TicketStatus.REVIEWED,
      priority: Priority.LOW,
      createdAt: new Date(now - HOUR),
    });

    await t.prisma.visit.createMany({
      data: [
        {
          ticketId: withinTarget.id,
          custodianId: home.custodian.id,
          scheduledAt: new Date(now - HOUR),
          arrivedAt: new Date(now - HOUR),
        },
        {
          ticketId: overdue.id,
          custodianId: home.custodian.id,
          scheduledAt: new Date(now - 80 * HOUR),
          arrivedAt: new Date(now - 80 * HOUR),
        },
      ],
    });
    await t.prisma.auditLog.createMany({
      data: [
        {
          propertyId: home.property.id,
          ticketId: withinTarget.id,
          actorId: home.custodian.id,
          action: 'ticket.repair_completed',
          fromStatus: TicketStatus.IN_PROGRESS,
          toStatus: TicketStatus.COMPLETED,
          createdAt: new Date(now - 30 * 60 * 1000),
        },
        {
          propertyId: home.property.id,
          ticketId: overdue.id,
          actorId: home.custodian.id,
          action: 'ticket.repair_completed',
          fromStatus: TicketStatus.IN_PROGRESS,
          toStatus: TicketStatus.COMPLETED,
          createdAt: new Date(now - HOUR),
        },
      ],
    });
  });

  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await destroyProperty(t.prisma, away.property.id);
    await t.close();
  });

  it('returns scoped totals, durations and target compliance for admins', async () => {
    const response = await t.as(home.admin).get('/completion/stats').expect(200);

    expect(response.body.totals).toEqual({ reported: 3, responded: 2, completed: 2 });
    expect(response.body.response).toMatchObject({
      sampleSize: 2,
      withinTarget: 1,
      overdue: 1,
      averageMinutes: expect.any(Number),
      medianMinutes: expect.any(Number),
    });
    expect(response.body.repair).toMatchObject({
      sampleSize: 2,
      withinTarget: 1,
      overdue: 1,
    });
    expect(response.body.byPriority).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ priority: 'HIGH', reported: 2, responded: 2, completed: 2 }),
        expect.objectContaining({ priority: 'LOW', reported: 1, responded: 0, completed: 0 }),
      ]),
    );
    expect(response.body.daily).toHaveLength(2);
  });

  it('does not expose stats to custodians or another property', async () => {
    await t.as(home.custodian).get('/completion/stats').expect(403);
    const response = await t.as(away.admin).get('/completion/stats').expect(200);
    expect(response.body).toMatchObject({
      range: { from: null, to: null },
      totals: { reported: 0, responded: 0, completed: 0 },
      response: {
        sampleSize: 0,
        averageMinutes: null,
        medianMinutes: null,
        withinTarget: 0,
        overdue: 0,
      },
      repair: {
        sampleSize: 0,
        averageMinutes: null,
        medianMinutes: null,
        withinTarget: 0,
        overdue: 0,
      },
      byPriority: expect.any(Array),
      daily: [],
    });
  });

  it('accepts an ISO date range and rejects an inverted range', async () => {
    const from = new Date(Date.now() - 3 * HOUR).toISOString();
    const to = new Date().toISOString();
    const response = await t
      .as(home.admin)
      .get(`/completion/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .expect(200);
    expect(response.body.totals).toEqual({ reported: 2, responded: 1, completed: 1 });

    const invalid = await t
      .as(home.admin)
      .get(`/completion/stats?from=${encodeURIComponent(to)}&to=${encodeURIComponent(from)}`)
      .expect(400);
    expect(invalid.body.error.code).toBe('BAD_REQUEST');
  });
});
