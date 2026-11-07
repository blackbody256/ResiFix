// Append-only audit trail. Pass the transaction client (`tx`) when inside $transaction.
import { Injectable } from '@nestjs/common';
import type { Prisma, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  propertyId: string;
  actorId?: string | null;
  ticketId?: string | null;
  action: string; // e.g. ticket.status_changed, auth.login
  fromStatus?: TicketStatus;
  toStatus?: TicketStatus;
  meta?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(entry: AuditEntry, db: Prisma.TransactionClient = this.prisma) {
    return db.auditLog.create({ data: entry });
  }
}
