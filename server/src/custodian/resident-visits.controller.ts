// OWNER: Andrew
// PB-016: the resident side of rescheduling. Residents reach visits through their own tickets
// (GET /tickets/:id lists them), so this controller is resident-only.
import { Body, Controller, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles, Scope } from '../common/decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { PropertyScope } from '../common/property-scope';
import { ChangeRequestBody, VisitsService } from './visits.service';

@Controller('visits')
@Roles(Role.RESIDENT)
export class ResidentVisitsController {
  constructor(private readonly visits: VisitsService) {}

  /** PB-016: ask for another time. POST /api/visits/:visitId/change-request { message } */
  @Post(':visitId/change-request')
  requestChange(
    @Param('visitId') visitId: string,
    @Body(new ZodValidationPipe(ChangeRequestBody)) body: ChangeRequestBody,
    @CurrentUser() user: AuthUser,
    @Scope() scope: PropertyScope,
  ) {
    return this.visits.requestChange(visitId, body.message, user, scope);
  }
}
