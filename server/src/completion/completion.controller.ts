// OWNER: Selina
// TODO:
//   [ ] PB-019  proof of repair: photo (StorageService, kind PROOF) + work note,
//               IN_PROGRESS -> COMPLETED; then TicketTimersService.scheduleAutoClose()
//   [ ] PB-020  resident verification API: Fixed / Still a problem (-> REOPENED); UI by Ayan.
//               Cancel the auto-close timer with TicketTimersService.cancelAutoClose(). On reopen:
//               ResponseTargetsService.startClock(id) and CustodianAlertsService.ticketReopened(id)
//   [x] PB-021  48-hour auto-close: worker job in src/worker/ticket-timers.processor.ts
//   [ ] PB-026  response and repair-time stats
//   [ ] PB-027  recurring-fault analytics
//   [ ] PB-028  missed visits and ratings analytics
//   [ ] PB-029  manage categories and response targets
// The rating endpoint below is PB-022 (Ayan).
import { Controller, Param, Post, UploadedFile, UseInterceptors, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { notImplemented } from '../common/app-exception';
import { CurrentUser, Roles, Scope } from '../common/decorators';
import type { PropertyScope } from '../common/property-scope';
import type { AuthUser } from '../auth/auth-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CompletionService, RepairProofBody } from './completion.service';

@Controller('completion')
export class CompletionController {
  constructor(private readonly completion: CompletionService) {}

  @Post('tickets/:id/repair-proof')
  @Roles(Role.CUSTODIAN, Role.ADMIN)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  repairProof(
    @Param('id') ticketId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(RepairProofBody)) body: RepairProofBody,
    @CurrentUser() user: AuthUser,
    @Scope() scope: PropertyScope,
  ) {
    return this.completion.repairProof(ticketId, file, body, user, scope);
  }

  @Post('tickets/:id/verify')
  @Roles(Role.RESIDENT)
  verify() {
    notImplemented('PB-020');
  }

  @Post('tickets/:id/rating')
  @Roles(Role.RESIDENT)
  rate() {
    notImplemented('PB-022');
  }
}
