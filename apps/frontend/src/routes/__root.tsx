import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { ErrorState } from '../components/ErrorState';

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
  errorComponent: ({ error }) => <ErrorState error={error} />,
  notFoundComponent: () => <ErrorState error={new Error('Página não encontrada')} />,
});
