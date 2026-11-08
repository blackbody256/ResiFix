// PB-024: custodian alerts for new, breached and reopened tickets, and the response-deadline job
// that raises the breach alert.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Job } from 'bullmq';
import { type Ticket, TicketStatus, type User } from '@prisma/client';
import { AuditService } from '../src/common/audit.service';
import { APP_CONFIG, type AppConfig } from '../src/config/config';
import { CustodianAlertsService } from '../src/notifications/custodian-alerts.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import type { TicketTimerJob } from '../src/queue/queue.constants';
import { TicketTimersProcessor } from '../src/worker/ticket-timers.processor';
import { startApp, type TestApp } from './app';
import {
  createProperty,
  createTicket,
  destroyProperty,
  HOUR,
  type PropertyFixture,
} from './fixtures';

const S = TicketStatus;

describe('PB-024 custodian alerts', () => {
  let t: TestApp;
  let home: PropertyFixture;
  let quiet: PropertyFixture; // no active custodians
  let alerts: CustodianAlertsService;

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Alerts Hall');
    quiet = await createProperty(t.prisma, 'Quiet Hall');
    await t.prisma.user.updateMany({
      where: { id: { in: [quiet.custodian.id, quiet.custodian2.id] } },
      data: { isActive: false },
    });
    alerts = t.app.get(CustodianAlertsService);
  });
  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await destroyProperty(t.prisma, quiet.property.id);
    await t.close();
  });

  const ids = (users: User[]) => users.map((u) => u.id).sort();
  const alerted = async (ticket: Ticket) =>
    (await t.prisma.notification.findMany({ where: { ticketId: ticket.id } }))
      .map((n) => n.userId)
      .sort();
  const messageTo = async (user: User, ticket: Ticket) =>
    (
      await t.prisma.notification.findFirstOrThrow({
        where: { userId: user.id, ticketId: ticket.id },
      })
    ).message;

  describe('ticketReported', () => {
    it("alerts every active custodian of the ticket's property", async () => {
      const ticket = await createTicket(t.prisma, home, {
        reporter: home.residents[0],
        item: 'No water',
        dueAt: new Date(Date.now() + 2 * HOUR),
      });
      const sent = await alerts.ticketReported(ticket.id);
      expect(sent.sort()).toEqual(ids([home.custodian, home.custodian2]));
      expect(await alerted(ticket)).toEqual(ids([home.custodian, home.custodian2]));
      const message = await messageTo(home.custodian, ticket);
      expect(message).toContain('New fault reported');
      expect(message).toContain('No water, Block A 101 (urgent priority)');
      expect(message).toContain('Respond by');
    });

    it('falls back to the admins when the property has no active custodian', async () => {
      const ticket = await createTicket(t.prisma, quiet, { reporter: quiet.residents[0] });
      await alerts.ticketReported(ticket.id);
      expect(await alerted(ticket)).toEqual(ids([quiet.admin]));
    });
  });

  describe('ticketBreached', () => {
    it('alerts the assignee and the admins, not the other custodians', async () => {
      const ticket = await createTicket(t.prisma, home, {
        reporter: home.residents[1],
        status: S.REVIEWED,
        assignee: home.custodian2,
        dueAt: new Date(Date.now() - 3 * HOUR),
      });
      await alerts.ticketBreached(ticket.id);
      expect(await alerted(ticket)).toEqual(ids([home.custodian2, home.admin]));
      const message = await messageTo(home.admin, ticket);
      expect(message).toContain('Response target missed');
      expect(message).toContain('3 h ago');
    });

    it('alerts every custodian when nobody owns the ticket, or its owner has left', async () => {
      const unassigned = await createTicket(t.prisma, home, { reporter: home.residents[2] });
      await alerts.ticketBreached(unassigned.id);
      expect(await alerted(unassigned)).toEqual(ids([home.custodian, home.custodian2, home.admin]));

      const orphaned = await createTicket(t.prisma, quiet, {
        reporter: quiet.residents[1],
        status: S.ASSIGNED,
        assignee: quiet.custodian, // deactivated
      });
      await alerts.ticketBreached(orphaned.id);
      expect(await alerted(orphaned)).toEqual(ids([quiet.admin]));
    });
  });

  describe('ticketReopened', () => {
    it('alerts whoever did the repair, and the admins', async () => {
      const ticket = await createTicket(t.prisma, home, {
        reporter: home.residents[0],
        status: S.REOPENED,
        assignee: home.custodian,
      });
      await alerts.ticketReopened(ticket.id);
      expect(await alerted(ticket)).toEqual(ids([home.custodian, home.admin]));
      expect(await messageTo(home.custodian, ticket)).toContain(
        'the resident says the problem is not fixed',
      );
    });
  });

  describe('response-deadline job', () => {
    let processor: TicketTimersProcessor;
    beforeAll(() => {
      processor = new TicketTimersProcessor(
        t.app.get<AppConfig>(APP_CONFIG),
        t.prisma,
        t.app.get(AuditService),
        t.app.get(NotificationsService),
        alerts,
      );
    });
    const run = (ticket: Ticket) =>
      processor.process({
        name: 'response-deadline',
        data: { ticketId: ticket.id },
      } as Job<TicketTimerJob>);

    it('records the breach and alerts the custodians and admins of an unanswered ticket', async () => {
      const ticket = await createTicket(t.prisma, home, {
        reporter: home.residents[1],
        dueAt: new Date(Date.now() - HOUR),
      });
      expect(await run(ticket)).toBe('missed');
      expect(
        await t.prisma.auditLog.count({
          where: { ticketId: ticket.id, action: 'ticket.response_target_missed' },
        }),
      ).toBe(1);
      expect(await alerted(ticket)).toEqual(ids([home.custodian, home.custodian2, home.admin]));
    });

    it('stays quiet once the ticket has been responded to', async () => {
      const ticket = await createTicket(t.prisma, home, {
        reporter: home.residents[2],
        status: S.SCHEDULED,
        assignee: home.custodian,
        dueAt: new Date(Date.now() - HOUR),
      });
      expect(await run(ticket)).toBe('met');
      expect(await alerted(ticket)).toEqual([]);
    });
  });
});
