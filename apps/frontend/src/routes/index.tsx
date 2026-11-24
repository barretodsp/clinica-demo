import { createFileRoute, redirect } from '@tanstack/react-router';
import { isApiError } from '../lib/api';
import { meQuery } from '../lib/queries';
import { homeFor } from '../lib/session';

/** Início: leva cada perfil para a sua área. */
export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    try {
      const me = await context.queryClient.ensureQueryData(meQuery);
      throw redirect(homeFor(me));
    } catch (error) {
      if (isApiError(error, 401)) throw redirect({ to: '/login' });
      throw error;
    }
  },
});
