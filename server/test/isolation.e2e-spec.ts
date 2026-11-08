// Data isolation and role checks for every implemented endpoint. Two properties ("home" and
// "away"); nobody may read the other property's data, and residents only see their own tickets.
// When you build an endpoint, add it here: a cross-property case and a wrong-role case.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Ticket } from '@prisma/client';
import { startApp, type TestApp } from './app';
import { createProperty, createTicket, destroyProperty, type PropertyFixture } from './fixtures';

describe('data isolation and roles', () => {
  let t: TestApp;
  let home: PropertyFixture;
  let away: PropertyFixture;
  let mine: Ticket; // reported by home.residents[0]
  let neighbours: Ticket; // reported by home.residents[1]
  let elsewhere: Ticket; // in the other property

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Home Hall');
    away = await createProperty(t.prisma, 'Away Hostel');
    mine = await createTicket(t.prisma, home, { reporter: home.residents[0] });
    neighbours = await createTicket(t.prisma, home, {
      reporter: home.residents[1],
      item: 'Broken socket',
    });
    elsewhere = await createTicket(t.prisma, away, { reporter: away.residents[0] });
  });
  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await destroyProperty(t.prisma, away.property.id);
    await t.close();
  });

  const ids = (tickets: { id: string }[]) => tickets.map((x) => x.id).sort();

  describe('GET /tickets', () => {
    it('shows a resident only the tickets they reported', async () => {
      const res = await t.as(home.residents[0]).get('/tickets').expect(200);
      expect(ids(res.body.tickets)).toEqual([mine.id]);
    });

    it('shows staff every ticket in their own property and none from another', async () => {
      for (const staff of [home.custodian, home.admin]) {
        const res = await t.as(staff).get('/tickets').expect(200);
        expect(ids(res.body.tickets)).toEqual(ids([mine, neighbours]));
      }
      const res = await t.as(away.custodian).get('/tickets').expect(200);
      expect(ids(res.body.tickets)).toEqual([elsewhere.id]);
    });
  });

  describe('GET /tickets/:id', () => {
    it.each([
      ['resident, own ticket', () => [home.residents[0], mine] as const, 200],
      ['resident, neighbour ticket', () => [home.residents[0], neighbours] as const, 404],
      ['resident, other property', () => [home.residents[0], elsewhere] as const, 404],
      ['custodian, own property', () => [home.custodian, neighbours] as const, 200],
      ['custodian, other property', () => [home.custodian, elsewhere] as const, 404],
      ['admin, other property', () => [home.admin, elsewhere] as const, 404],
      ['other custodian, this property', () => [away.custodian, mine] as const, 404],
    ])('%s -> %i', async (_label, pick, status) => {
      const [caller, ticket] = pick();
      const res = await t.as(caller).get(`/tickets/${ticket.id}`).expect(status);
      if (status === 404) expect(res.body.error.code).toBe('NOT_FOUND');
      else expect(res.body.ticket.id).toBe(ticket.id);
    });

    it('answers 404 for an unknown id and 401 without a token', async () => {
      await t.as(home.admin).get('/tickets/does-not-exist').expect(404);
      await t.anon().get(`/tickets/${mine.id}`).expect(401);
    });
  });

  it('GET /properties/mine returns only the caller property', async () => {
    const res = await t.as(away.residents[0]).get('/properties/mine').expect(200);
    expect(res.body.property.id).toBe(away.property.id);
    const roomIds = res.body.property.blocks.flatMap((b: { rooms: { id: string }[] }) =>
      b.rooms.map((r) => r.id),
    );
    expect(roomIds.sort()).toEqual(
      Object.values(away.rooms)
        .map((r) => r.id)
        .sort(),
    );
  });

  it('GET /reporting/fault-categories returns only the caller property catalogue', async () => {
    const res = await t.as(home.residents[0]).get('/reporting/fault-categories').expect(200);
    expect(ids(res.body.categories)).toEqual(ids(Object.values(home.categories)));
  });

  it('GET /notifications returns only the caller notifications', async () => {
    await t.prisma.notification.createMany({
      data: [
        { userId: home.residents[0].id, ticketId: mine.id, message: 'For resident 1' },
        { userId: home.residents[1].id, ticketId: neighbours.id, message: 'For resident 2' },
      ],
    });
    const res = await t.as(home.residents[0]).get('/notifications').expect(200);
    expect(res.body.notifications.map((n: { message: string }) => n.message)).toEqual([
      'For resident 1',
    ]);
  });

  describe('role gates', () => {
    it.each([
      ['resident', 'get', '/custodian/queue'],
      ['resident', 'post', '/properties/blocks'],
      ['resident', 'post', '/properties/occupancies'],
      ['custodian', 'post', '/properties/blocks'],
      ['custodian', 'post', '/reporting/tickets'],
      ['custodian', 'post', '/completion/tickets/x/verify'],
      ['admin', 'post', '/reporting/tickets'],
    ] as const)('%s cannot %s %s (403)', async (role, method, path) => {
      const caller = { resident: home.residents[0], custodian: home.custodian, admin: home.admin }[
        role
      ];
      const res = await t.as(caller)[method](path).send({}).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  it('returns field errors for an invalid body', async () => {
    const res = await t
      .as(home.residents[0])
      .post('/notifications/push/subscriptions')
      .send({ endpoint: 'not-a-url' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toBeDefined();
  });
});
