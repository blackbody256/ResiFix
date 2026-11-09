// PB-010 / PB-011: what GET /tickets/:id exposes. Access control lives in isolation.e2e-spec.ts;
// this file checks the shape: ratings only to the reporting resident, no raw audit meta in the
// timeline, and report photos selected by kind.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PhotoKind, TicketStatus, type Ticket } from '@prisma/client';
import { startApp, type TestApp } from './app';
import { createProperty, createTicket, destroyProperty, type PropertyFixture } from './fixtures';

describe('GET /tickets/:id response shape', () => {
  let t: TestApp;
  let home: PropertyFixture;
  let ticket: Ticket;

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Detail Hall');
    const reporter = home.residents[0];
    ticket = await createTicket(t.prisma, home, {
      reporter,
      status: TicketStatus.CLOSED,
      assignee: home.custodian,
    });

    await t.prisma.rating.create({
      data: { ticketId: ticket.id, userId: reporter.id, score: 2, comment: 'Took a week' },
    });
    await t.prisma.auditLog.create({
      data: {
        propertyId: home.property.id,
        ticketId: ticket.id,
        actorId: home.custodian.id,
        action: 'ticket.status_changed',
        fromStatus: TicketStatus.REPORTED,
        toStatus: TicketStatus.REVIEWED,
        meta: { internalNote: 'resident was rude' },
      },
    });

    const key = (name: string) => `properties/${home.property.id}/tickets/${ticket.id}/${name}`;
    await t.prisma.photo.create({
      data: {
        ticketId: ticket.id,
        uploadedById: reporter.id,
        kind: PhotoKind.REPORT,
        url: key('report.png'),
      },
    });
    // A proof photo without a RepairProof row: must not show up as a report photo.
    await t.prisma.photo.create({
      data: {
        ticketId: ticket.id,
        uploadedById: home.custodian.id,
        kind: PhotoKind.PROOF,
        url: key('proof.png'),
      },
    });
  });
  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await t.close();
  });

  const detail = async (caller: PropertyFixture['admin']) =>
    (await t.as(caller).get(`/tickets/${ticket.id}`).expect(200)).body.ticket;

  it('returns the rating to the resident who reported the ticket', async () => {
    const body = await detail(home.residents[0]);
    expect(body.rating).toMatchObject({ score: 2, comment: 'Took a week' });
  });

  it('never returns an individual rating to staff', async () => {
    for (const staff of [home.custodian, home.admin]) {
      const body = await detail(staff);
      expect(body).not.toHaveProperty('rating');
    }
  });

  it('builds the timeline without the raw audit meta', async () => {
    for (const caller of [home.residents[0], home.admin]) {
      const { timeline } = await detail(caller);
      expect(timeline).toHaveLength(1);
      expect(Object.keys(timeline[0]).sort()).toEqual(
        ['action', 'actor', 'createdAt', 'fromStatus', 'id', 'toStatus'].sort(),
      );
      expect(JSON.stringify(timeline)).not.toContain('internalNote');
    }
  });

  it('lists only REPORT photos as the ticket photos', async () => {
    const { photos } = await detail(home.residents[0]);
    expect(photos).toHaveLength(1);
    expect(photos[0].kind).toBe(PhotoKind.REPORT);
  });
});
