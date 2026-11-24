import { createHmac } from 'node:crypto';
import { SERVICE_AUDIENCE, SERVICE_CLIENT_ID, SERVICE_SCOPE, TOKEN_ISSUER } from './auth-user.js';

const b64url = (data: Buffer | string) => Buffer.from(data).toString('base64url');

/**
 * Token de serviço FIXO (sem `exp`), assinado com SERVICE_TOKEN_SECRET (HS256).
 * O `JwtSigner` do pacote sempre define expiração, por isso a assinatura é feita aqui;
 * a verificação usa o `JwtVerifier` do pacote (tempo constante, claims).
 * Revogação: trocar SERVICE_TOKEN_SECRET.
 */
export function signServiceToken(secret: string, extraClaims: Record<string, unknown> = {}): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      iss: TOKEN_ISSUER,
      aud: SERVICE_AUDIENCE,
      sub: SERVICE_CLIENT_ID,
      scope: SERVICE_SCOPE,
      iat: Math.floor(Date.now() / 1000),
      ...extraClaims,
    }),
  );
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}
