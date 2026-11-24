import { Policy } from '@nestjs/authorization';
import type { AuthUser } from './auth-user.js';

/** Políticas por papel (deny-by-default: rota sem @Can é negada). */
@Policy()
export class RolePolicy {
  attendant(user: AuthUser | null): boolean {
    return user?.kind === 'user' && user.role === 'ATTENDANT';
  }

  doctor(user: AuthUser | null): boolean {
    return user?.kind === 'user' && user.role === 'DOCTOR';
  }

  /** Equipe da clínica: atendente ou médico. */
  staff(user: AuthUser | null): boolean {
    return user?.kind === 'user' && (user.role === 'ATTENDANT' || user.role === 'DOCTOR');
  }

  patient(user: AuthUser | null): boolean {
    return user?.kind === 'user' && user.role === 'PATIENT' && !!user.patientId;
  }

  anyUser(user: AuthUser | null): boolean {
    return user?.kind === 'user';
  }

  service(user: AuthUser | null): boolean {
    return user?.kind === 'service';
  }
}
