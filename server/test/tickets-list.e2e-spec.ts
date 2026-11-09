// PB-010: GET /tickets card fields. Access control is in isolation.e2e-spec.ts; this checks
// that each row carries what a ticket card shows: category, assignee and the next visit.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TicketStatus } from '@prisma/client';
import { startApp, type TestApp } from './app';
import {
  createProperty,
  createTicket,
  destroyProperty,
  HOUR,
  type PropertyFixture,
} from './fixtures';

describe('GET /tickets card fields', () => {
  let t: TestApp;
  let home: PropertyFixture;

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'List Hall');
  });
  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await t.close();
  });

  it('includes the category, the assignee and only the next upcoming visit', async () => {
    const ticket = await createTicket(t.prisma, home, {
      reporter: home.residents[0],
      status: TicketStatus.SCHEDULED,
      assignee: home.custodian,
    });
    const visit = (offsetH: number, extra: { missed?: boolean; arrivedAt?: Date } = {}) =>
      t.prisma.visit.create({
        data: {
          ticketId: ticket.id,
          custodianId: home.custodian.id,
          scheduledAt: new Date(Date.now() + offsetH * HOUR),
          ...extra,
        },
      });
    await visit(-24, { missed: true });
    await visit(-2, { arrivedAt: new Date() });
    const next = await visit(3);
    await visit(30);

    const res = await t.as(home.residents[0]).get('/tickets').expect(200);
    const [row] = res.body.tickets;
    expect(row.faultItem.category.name).toBe('Plumbing');
    expect(row.assignee).toEqual({ id: home.custodian.id, name: home.custodian.name });
    expect(row.nextVisit).toEqual({ id: next.id, scheduledAt: next.scheduledAt.toISOString() });
    expect(row).not.toHaveProperty('visits');
  });

  it('gives nextVisit null when nothing is booked', async () => {
    const ticket = await createTicket(t.prisma, home, { reporter: home.residents[1] });
    const res = await t.as(home.residents[1]).get('/tickets').expect(200);
    const row = res.body.tickets.find((x: { id: string }) => x.id === ticket.id);
    expect(row.nextVisit).toBeNull();
    expect(row.assignee).toBeNull();
  });
});
