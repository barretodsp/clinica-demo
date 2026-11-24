import { Injectable, SetMetadata, applyDecorators, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  Authenticate,
  AuthenticationError,
  AuthenticationProvider,
  AuthenticationRegistry,
  JwtVerifier,
} from '@nestjs/authentication';
import { env } from '../config/env.js';
import {
  SERVICE_AUDIENCE,
  SERVICE_CLIENT_ID,
  SERVICE_SCOPE,
  SESSION_COOKIE,
  TOKEN_ISSUER,
  type AuthUser,
  type ServiceClient,
  type SessionUser,
} from './auth-user.js';
import { SessionTokenService } from './token.service.js';
import { UsersRepository } from './users.repository.js';

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0 && part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * Sessão de usuário: JWT no cookie HttpOnly. O usuário (e o papel) é carregado
 * do banco a cada requisição — desativação e mudança de papel valem na hora.
 */
@Injectable()
export class CookieSessionAuth extends AuthenticationProvider<AuthUser> {
  constructor(
    private readonly tokens: SessionTokenService,
    private readonly users: UsersRepository,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerProvider(this, { order: 1 });
  }

  async authenticate(context: ExecutionContext): Promise<{ user: SessionUser } | null> {
    const token = readCookie(this.header(context, 'cookie'), SESSION_COOKIE);
    if (!token) return null;
    let sub: string;
    try {
      ({ sub } = await this.tokens.verify(token));
    } catch {
      throw new AuthenticationError('Sessão inválida ou expirada');
    }
    const user = await this.users.findActiveById(sub);
    if (!user) throw new AuthenticationError('Sessão inválida ou expirada');
    return { user };
  }
}

const SERVICE_TOKEN_ROUTE = 'clinic:service-token-route';

/**
 * Marca uma rota como exclusiva do token de serviço: só o ServiceTokenAuth autentica.
 * Em qualquer outra rota, o token de serviço é ignorado (sem credencial → 401).
 */
export const ServiceTokenOnly = () =>
  applyDecorators(SetMetadata(SERVICE_TOKEN_ROUTE, true), Authenticate({ providers: [ServiceTokenAuth] }));

/** Token de serviço fixo no header Authorization: Bearer (integração FHIR). */
@Injectable()
export class ServiceTokenAuth extends AuthenticationProvider<AuthUser> {
  private readonly verifier = new JwtVerifier({
    key: env().SERVICE_TOKEN_SECRET,
    algorithms: ['HS256'],
    issuer: TOKEN_ISSUER,
    audience: SERVICE_AUDIENCE,
    // token fixo: sem exp obrigatório
    required: ['sub', 'scope'],
  });

  constructor(
    private readonly reflector: Reflector,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerProvider(this, { order: 2 });
  }

  async authenticate(context: ExecutionContext): Promise<{ user: ServiceClient } | null> {
    const allowed = this.reflector.getAllAndOverride<boolean>(SERVICE_TOKEN_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowed) return null;
    const header = this.header(context, 'authorization');
    if (!header?.startsWith('Bearer ')) return null;
    let claims: Record<string, unknown>;
    try {
      claims = await this.verifier.verify(header.slice(7).trim());
    } catch {
      throw new AuthenticationError('Token de serviço inválido');
    }
    const scopes = String(claims.scope ?? '').split(' ');
    if (claims.sub !== SERVICE_CLIENT_ID || !scopes.includes(SERVICE_SCOPE)) {
      throw new AuthenticationError('Token de serviço sem permissão');
    }
    return { user: { kind: 'service', id: SERVICE_CLIENT_ID, scope: scopes } };
  }

  challenge(): string {
    return 'Bearer';
  }
}
