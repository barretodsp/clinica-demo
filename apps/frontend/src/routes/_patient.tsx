import { AppShell, Button, Group, Text, Title } from '@mantine/core';
import { IconLogout, IconStethoscope } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, useNavigate } from '@tanstack/react-router';
import { api } from '../lib/api';
import { meQuery } from '../lib/queries';
import { requireRole } from '../lib/session';

/** Área do paciente (global: exames de todas as clínicas). */
export const Route = createFileRoute('/_patient')({
  beforeLoad: ({ context, location }) => requireRole(context.queryClient, ['PATIENT'], location.href),
  component: PatientLayout,
});

function PatientLayout() {
  const { data: me } = useQuery(meQuery);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    queryClient.clear();
    await navigate({ to: '/login' });
  }
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header px="md">
        <Group h="100%" justify="space-between">
          <Group gap="sm">
            <IconStethoscope color="var(--mantine-color-teal-6)" />
            <Title order={4}>
              <Link to="/patient/appointments" style={{ color: 'inherit', textDecoration: 'none' }}>Meus exames</Link>
            </Title>
          </Group>
          <Group gap="sm">
            <Text size="sm" visibleFrom="sm">{me?.name}</Text>
            <Button variant="subtle" size="xs" leftSection={<IconLogout size={16} />} onClick={logout}>Sair</Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
