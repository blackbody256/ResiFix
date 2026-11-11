// OWNER: Ann (PB-001, PB-002)
// Registers the three global guards, in this order, for every route:
//   JwtAuthGuard (skip with @Public) -> RolesGuard (@Roles) -> PropertyScopeGuard (req.scope)
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { PropertyScopeGuard } from '../common/guards/property-scope.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpRateLimitService } from './otp-rate-limit.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    NotificationsModule,
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.jwt.secret,
        signOptions: { expiresIn: config.jwt.expiresIn as `${number}d` },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpRateLimitService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PropertyScopeGuard },
  ],
})
export class AuthModule {}
