// OWNER: Ann
// TODO:
//   [ ] PB-001  phone + OTP login: dev flow done; resident self-registration
//   [ ] PB-002  sessions/roles: JWT + RolesGuard done; rate-limit request-otp
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Public } from '../common/decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { AuthUser } from './auth-user';
import { AuthService } from './auth.service';

const PhoneBody = z.object({ phone: z.string().min(9).max(20) });
const VerifyBody = PhoneBody.extend({
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /api/auth/request-otp { phone } -> { phone, expiresInSeconds } */
  @Public()
  @Post('request-otp')
  @HttpCode(200)
  requestOtp(@Body(new ZodValidationPipe(PhoneBody)) body: z.infer<typeof PhoneBody>) {
    return this.auth.requestOtp(body.phone);
  }

  /** POST /api/auth/verify-otp { phone, code } -> { token, user } */
  @Public()
  @Post('verify-otp')
  @HttpCode(200)
  verifyOtp(@Body(new ZodValidationPipe(VerifyBody)) body: z.infer<typeof VerifyBody>) {
    return this.auth.verifyOtp(body.phone, body.code);
  }

  /** GET /api/auth/me -> { user } */
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }
}
