import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/tiptap/styles.css';
import './styles.css';

import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isApiError, setUnauthorizedHandler } from './lib/api';
import { routeTree } from './routeTree.gen';
import { theme } from './theme';

dayjs.locale('pt-br');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // não insiste em 401/403/404: são respostas definitivas
      retry: (count, error) => !(isApiError(error) && error.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
  queryCache: new QueryCache(),
  mutationCache: new MutationCache(),
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
});

// 401 em qualquer chamada: limpa o estado do usuário e volta ao login, guardando a página atual
setUnauthorizedHandler(() => {
  const current = router.state.location.href;
  queryClient.clear();
  if (!router.state.location.pathname.startsWith('/login')) {
    void router.navigate({ to: '/login', search: { redirect: current } });
  }
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <DatesProvider settings={{ locale: 'pt-br', firstDayOfWeek: 0 }}>
        <ModalsProvider labels={{ confirm: 'Confirmar', cancel: 'Voltar' }}>
          <Notifications position="top-right" />
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  </StrictMode>,
);
