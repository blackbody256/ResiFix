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

describe('PB-027 recurring-fault analytics', () => {
  let t: TestApp;
  let home: PropertyFixture;
  let away: PropertyFixture;

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Recurring Hall');
    away = await createProperty(t.prisma, 'Other Recurring Hall');

    await createTicket(t.prisma, home, {
      reporter: home.residents[0],
      room: 'Block A-101',
      item: 'Leaking tap',
      createdAt: new Date(Date.now() - 3 * HOUR),
    });
    await createTicket(t.prisma, home, {
      reporter: home.residents[1],
      room: 'Block A-102',
      item: 'Leaking tap',
      createdAt: new Date(Date.now() - 2 * HOUR),
    });
    await createTicket(t.prisma, home, {
      reporter: home.residents[2],
      room: 'Block B-201',
      item: 'Blocked toilet',
      status: TicketStatus.REVIEWED,
      createdAt: new Date(Date.now() - HOUR),
    });
    await createTicket(t.prisma, home, {
      reporter: home.residents[0],
      room: 'Block A-101',
      item: 'No power in room',
      createdAt: new Date(),
    });
    await createTicket(t.prisma, away, {
      reporter: away.residents[0],
      item: 'Leaking tap',
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await destroyProperty(t.prisma, away.property.id);
    await t.close();
  });

  it('counts faults by category, item, block and room', async () => {
    const response = await t.as(home.admin).get('/completion/recurring-faults').expect(200);

    expect(response.body.totalReports).toBe(4);
    expect(response.body.byCategory).toEqual([
      expect.objectContaining({ name: 'Plumbing', reports: 3 }),
      expect.objectContaining({ name: 'Electrical', reports: 1 }),
    ]);
    expect(response.body.byItem).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Leaking tap', group: 'Plumbing', reports: 2 }),
        expect.objectContaining({ name: 'Blocked toilet', group: 'Plumbing', reports: 1 }),
        expect.objectContaining({ name: 'No power in room', group: 'Electrical', reports: 1 }),
      ]),
    );
    expect(response.body.byBlock).toEqual([
      expect.objectContaining({ name: 'Block A', reports: 3 }),
      expect.objectContaining({ name: 'Block B', reports: 1 }),
    ]);
    expect(response.body.byRoom).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: '101', group: 'Block A', reports: 2 }),
        expect.objectContaining({ name: '102', group: 'Block A', reports: 1 }),
        expect.objectContaining({ name: '201', group: 'Block B', reports: 1 }),
      ]),
    );
    expect(response.body.byRoomFault).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          room: '101',
          block: 'Block A',
          faultItem: 'Leaking tap',
          category: 'Plumbing',
          reports: 1,
        }),
        expect.objectContaining({
          room: '102',
          block: 'Block A',
          faultItem: 'Leaking tap',
          category: 'Plumbing',
          reports: 1,
        }),
      ]),
    );
  });

  it('filters by report date and keeps data isolated', async () => {
    const from = new Date(Date.now() - 150 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const response = await t
      .as(home.admin)
      .get(
        `/completion/recurring-faults?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      )
      .expect(200);
    expect(response.body.totalReports).toBe(3);
    expect(response.body.byCategory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Plumbing', reports: 2 }),
        expect.objectContaining({ name: 'Electrical', reports: 1 }),
      ]),
    );

    await t.as(home.custodian).get('/completion/recurring-faults').expect(403);
    const awayResponse = await t.as(away.admin).get('/completion/recurring-faults').expect(200);
    expect(awayResponse.body.totalReports).toBe(1);
    expect(awayResponse.body.byItem).toEqual([
      expect.objectContaining({ name: 'Leaking tap', reports: 1 }),
    ]);
  });
});
