import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessPolicyService } from './access-policy.service';
import { AuthEmailService } from './auth-email.service';
import { AuthController } from './auth.controller';
import { AuthenticationGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { RolesGuard } from './roles.guard';
import { RequestOriginGuard } from './origin.guard';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthEmailService,
    AccessPolicyService,
    { provide: APP_GUARD, useClass: RequestOriginGuard },
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, AccessPolicyService],
})
export class AuthModule {}
