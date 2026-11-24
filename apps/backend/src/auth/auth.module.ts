import { Module } from '@nestjs/common';
import { ClinicsModule } from '../clinics/clinics.module.js';
import { AuthController } from './auth.controller.js';
import { CookieSessionAuth, ServiceTokenAuth } from './providers.js';
import { RolePolicy } from './role.policy.js';
import { SessionTokenService } from './token.service.js';
import { UsersRepository } from './users.repository.js';

@Module({
  imports: [ClinicsModule],
  controllers: [AuthController],
  providers: [UsersRepository, SessionTokenService, CookieSessionAuth, ServiceTokenAuth, RolePolicy],
  exports: [RolePolicy],
})
export class AuthModule {}
