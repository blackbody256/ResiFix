import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Priority, TicketStatus } from '@prisma/client';
import { startApp, type TestApp } from './app';
import { createProperty, createTicket, destroyProperty, type PropertyFixture } from './fixtures';

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8cf000003010100c9fe92ef0000000049454e44ae426082',
  'hex',
);

describe('PB-019 proof of repair', () => {
  let t: TestApp;
  let home: PropertyFixture;
  let ticket: Awaited<ReturnType<typeof createTicket>>;

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Completion Hall');
    ticket = await createTicket(t.prisma, home, {
      reporter: home.residents[0],
      status: TicketStatus.IN_PROGRESS,
      priority: Priority.HIGH,
      assignee: home.custodian,
    });
  });

  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await t.close();
  });

  const upload = () =>
    t
      .as(home.custodian)
      .post(`/completion/tickets/${ticket.id}/repair-proof`)
      .field('notes', 'Replaced the damaged tap cartridge and tested the water flow.')
      .attach('photo', PNG, { filename: 'repair.png', contentType: 'image/png' });

  it('stores proof, completes the ticket, audits the change and notifies the resident', async () => {
    const response = await upload().expect(201);

    expect(response.body.proof).toMatchObject({
      id: expect.any(String),
      notes: 'Replaced the damaged tap cartridge and tested the water flow.',
      submittedById: home.custodian.id,
      createdAt: expect.any(String),
      photos: [{ id: expect.any(String), kind: 'PROOF', createdAt: expect.any(String) }],
    });

    const storedTicket = await t.prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(storedTicket.status).toBe(TicketStatus.COMPLETED);

    const proof = await t.prisma.repairProof.findUniqueOrThrow({
      where: { id: response.body.proof.id },
      include: { photos: true },
    });
    expect(proof.photos).toHaveLength(1);
    expect(proof.photos[0].kind).toBe('PROOF');
    expect(proof.photos[0].url).toMatch(
      new RegExp(`^properties/${home.property.id}/tickets/${ticket.id}/[\\w-]+\\.png$`),
    );

    await expect(
      t.prisma.auditLog.findFirst({
        where: { ticketId: ticket.id, action: 'ticket.repair_completed' },
      }),
    ).resolves.toMatchObject({
      fromStatus: TicketStatus.IN_PROGRESS,
      toStatus: TicketStatus.COMPLETED,
      actorId: home.custodian.id,
    });
    await expect(
      t.prisma.notification.findFirst({
        where: { ticketId: ticket.id, userId: home.residents[0].id },
      }),
    ).resolves.toMatchObject({ message: expect.stringContaining('Repair finished') });
  });

  it('rejects proof for a ticket that is no longer in progress', async () => {
    await upload().expect(409);
  });
});
