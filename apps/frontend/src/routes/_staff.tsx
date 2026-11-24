import { AppShell, Badge, Button, Group, Select, Text, Title } from '@mantine/core';
import { IconLogout, IconStethoscope } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, useNavigate, useParams } from '@tanstack/react-router';
import { api } from '../lib/api';
import { meQuery } from '../lib/queries';
import { requireRole } from '../lib/session';

/** Área da equipe (atendente e médico). */
export const Route = createFileRoute('/_staff')({
  beforeLoad: ({ context, location }) => requireRole(context.queryClient, ['ATTENDANT', 'DOCTOR'], location.href),
  component: StaffLayout,
});

function StaffLayout() {
  const { data: me } = useQuery(meQuery);
  const params = useParams({ strict: false }) as { clinicId?: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clinic = me?.clinics.find((c) => c.id === params.clinicId);

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    queryClient.clear();
    await navigate({ to: '/login' });
  }

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header px="md">
        <Group h="100%" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <IconStethoscope color="var(--mantine-color-teal-6)" />
            <Title order={4} visibleFrom="sm">
              <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>Exames e Laudos</Link>
            </Title>
            {me && me.clinics.length > 1 ? (
              <Select
                size="xs"
                w={260}
                placeholder="Escolha a clínica"
                data={me.clinics.map((c) => ({ value: c.id, label: c.name }))}
                value={clinic?.id ?? null}
                allowDeselect={false}
                onChange={(id) => id && navigate({ to: '/clinics/$clinicId/appointments', params: { clinicId: id } })}
              />
            ) : (
              clinic && <Text fw={500}>{clinic.name}</Text>
            )}
            {clinic && <Badge variant="light" color="gray" visibleFrom="md">{clinic.timezoneLabel}</Badge>}
          </Group>
          <Group gap="sm" wrap="nowrap">
            <Text size="sm" visibleFrom="sm">{me?.name}</Text>
            <Badge variant="outline">{me?.role === 'DOCTOR' ? 'Médico(a)' : 'Atendente'}</Badge>
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
