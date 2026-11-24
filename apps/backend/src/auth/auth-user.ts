import type { UserRole } from '../common/domain.js';

/** Usuário autenticado por sessão (cookie). Papel lido do banco a cada requisição. */
export interface SessionUser {
  kind: 'user';
  id: string;
  name: string;
  email: string;
  role: UserRole;
  patientId: string | null;
  doctorId: string | null;
  /** Clínica do atendente (exatamente uma). */
  attendantClinicId: string | null;
}

/** Cliente de integração autenticado pelo token de serviço fixo. */
export interface ServiceClient {
  kind: 'service';
  id: string;
  scope: string[];
}

export type AuthUser = SessionUser | ServiceClient;

declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: AuthUser;
  }
}

export const SESSION_COOKIE = 'clinic_session';
export const SERVICE_CLIENT_ID = 'fhir-export-service';
export const SERVICE_SCOPE = 'fhir:read';
export const TOKEN_ISSUER = 'clinica-exames';
export const SESSION_AUDIENCE = 'clinica-web';
export const SERVICE_AUDIENCE = 'fhir-export';

export function isSessionUser(user: AuthUser | null | undefined): user is SessionUser {
  return user?.kind === 'user';
}
