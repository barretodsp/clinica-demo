import { redirect } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { isApiError } from './api';
import { meQuery } from './queries';
import type { Me, Role } from './types';

/** Destino inicial de cada perfil. */
export function homeFor(me: Me) {
  if (me.role === 'PATIENT') return { to: '/patient/appointments' as const };
  if (me.clinics.length === 1) {
    return { to: '/clinics/$clinicId/appointments' as const, params: { clinicId: me.clinics[0].id } };
  }
  return { to: '/select-clinic' as const };
}

/**
 * Guarda de rota: exige sessão (401 → login com ?redirect=) e um dos papéis.
 * É só usabilidade: quem garante o acesso é o backend.
 */
export async function requireRole(queryClient: QueryClient, roles: Role[], href: string): Promise<Me> {
  let me: Me;
  try {
    me = await queryClient.ensureQueryData(meQuery);
  } catch (error) {
    if (isApiError(error, 401)) throw redirect({ to: '/login', search: { redirect: href } });
    throw error;
  }
  if (!roles.includes(me.role)) throw redirect(homeFor(me));
  return me;
}
