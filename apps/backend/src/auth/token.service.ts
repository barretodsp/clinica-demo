import { Injectable } from '@nestjs/common';
import { JwtSigner, JwtVerifier } from '@nestjs/authentication';
import { env } from '../config/env.js';
import { SESSION_AUDIENCE, TOKEN_ISSUER } from './auth-user.js';

/** Emite e verifica o JWT da sessão (HS256, AUTH_SECRET, 1h). Claims: só sub, iat, exp. */
@Injectable()
export class SessionTokenService {
  private readonly signer = new JwtSigner({
    key: env().AUTH_SECRET,
    alg: 'HS256',
    ttl: env().AUTH_TOKEN_TTL,
    issuer: TOKEN_ISSUER,
    audience: SESSION_AUDIENCE,
  });

  private readonly verifier = new JwtVerifier({
    key: env().AUTH_SECRET,
    algorithms: ['HS256'],
    issuer: TOKEN_ISSUER,
    audience: SESSION_AUDIENCE,
    required: ['exp', 'sub'],
  });

  issue(userId: string): string {
    return this.signer.sign({ sub: userId });
  }

  async verify(token: string): Promise<{ sub: string }> {
    const claims = await this.verifier.verify(token);
    return { sub: claims.sub! };
  }

  /** Duração da sessão em segundos (Max-Age do cookie). */
  get ttlSeconds(): number {
    return parseDurationSeconds(env().AUTH_TOKEN_TTL);
  }
}

export function parseDurationSeconds(value: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d|w)?$/.exec(value.trim());
  if (!match) throw new Error(`Duração inválida: ${value}`);
  const n = Number(match[1]);
  const unit = match[2] ?? 'ms';
  const factor = { ms: 0.001, s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[unit]!;
  return Math.floor(n * factor);
}
