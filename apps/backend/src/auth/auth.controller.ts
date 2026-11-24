import { Body, Controller, Get, HttpCode, Ip, Post, Res, UseGuards } from '@nestjs/common';
import { CurrentUser, PasswordHasher, Public } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import { DomainError } from '../common/errors.js';
import { env } from '../config/env.js';
import { ClinicsService, toClinicDto } from '../clinics/clinics.service.js';
import { SESSION_COOKIE, type SessionUser } from './auth-user.js';
import { RolePolicy } from './role.policy.js';
import { SessionTokenService } from './token.service.js';
import { UsersRepository } from './users.repository.js';

const loginSchema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(256),
});
type LoginBody = z.infer<typeof loginSchema>;

/** IP com o último octeto zerado (IPv4) — registrado só em login com falha. */
export function truncateIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  const v4 = ip.replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return v4.replace(/\.\d+$/, '.0');
  return ip.split(':').slice(0, 3).join(':') + '::';
}

@ApiTags('autenticação')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly users: UsersRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: SessionTokenService,
    private readonly clinics: ClinicsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext('auth');
  }

  /**
   * Login: grava o JWT em cookie HttpOnly e devolve só o usuário (o token nunca vai no corpo).
   * Limite: 10 tentativas/minuto por IP e por conta → 429.
   */
  @Post('login')
  @Public()
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ service: true })
  async login(@Body({ schema: loginSchema }) body: LoginBody, @Ip() ip: string, @Res({ passthrough: true }) res: Response) {
    const found = await this.users.findCredentials(body.email);
    // verify() com hash fictício quando o usuário não existe: o tempo não revela e-mails cadastrados
    const valid = await this.hasher.verify(body.password, found?.passwordHash);
    if (!valid || !found) {
      this.logger.warn({ event: 'auth.login_failed', ip: truncateIp(ip) }, 'auth.login_failed');
      throw new DomainError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
    }
    res.cookie(SESSION_COOKIE, this.tokens.issue(found.user.id), {
      httpOnly: true,
      secure: env().COOKIE_SECURE,
      sameSite: 'strict',
      path: '/',
      maxAge: this.tokens.ttlSeconds * 1000,
    });
    this.logger.info(
      { event: 'auth.login_succeeded', actorType: 'USER', actorId: found.user.id, actorRole: found.user.role },
      'auth.login_succeeded',
    );
    return { user: await this.me(found.user) };
  }

  /** Apaga o cookie. Público: funciona mesmo com a sessão expirada. */
  @Post('logout')
  @Public()
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: env().COOKIE_SECURE, sameSite: 'strict', path: '/' });
    this.logger.info({ event: 'auth.logout' }, 'auth.logout');
  }

  /** Usuário logado — o frontend não lê o token. */
  @Get('me')
  @Can(RolePolicy, 'anyUser')
  async getMe(@CurrentUser() user: SessionUser) {
    return this.me(user);
  }

  private async me(user: SessionUser) {
    const clinics = user.role === 'PATIENT' ? [] : (await this.clinics.accessibleClinics(user)).map(toClinicDto);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      patientId: user.patientId,
      doctorId: user.doctorId,
      clinics,
    };
  }
}
