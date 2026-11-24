import { Alert, Button, Center, Group, Paper, PasswordInput, SimpleGrid, Stack, Text, TextInput, Title, UnstyledButton } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconStethoscope } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { api, isApiError } from '../lib/api';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../lib/demo-accounts';
import { meQuery } from '../lib/queries';
import { homeFor } from '../lib/session';
import type { Me } from '../lib/types';

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    initialValues: { email: '', password: '' },
    validate: {
      email: (v) => (v.trim().length < 3 ? 'Informe o e-mail' : null),
      password: (v) => (!v ? 'Informe a senha' : null),
    },
  });

  const login = useMutation({
    mutationFn: (values: { email: string; password: string }) =>
      api<{ user: Me }>('/auth/login', { method: 'POST', json: values, skipAuthRedirect: true }),
    onSuccess: async ({ user }) => {
      queryClient.clear();
      queryClient.setQueryData(meQuery.queryKey, user);
      // só redireciona para caminhos internos
      if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
        await navigate({ href: redirect });
      } else {
        await navigate(homeFor(user));
      }
    },
    onError: (e) => setError(isApiError(e) ? e.message : 'Não foi possível entrar.'),
  });

  return (
    <Center mih="100vh" p="md">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" maw={1200} w="100%">
        <Stack gap="md" justify="center">
          <Stack align="center" gap={4}>
            <IconStethoscope size={40} color="var(--mantine-color-teal-6)" />
            <Title order={2}>Exames e Laudos</Title>
            <Text c="dimmed" size="sm">Agendamento de exames e acesso a laudos</Text>
          </Stack>
          <Paper withBorder p="lg" radius="md" component="form" onSubmit={form.onSubmit((v) => { setError(null); login.mutate(v); })}>
            <Stack>
              {redirect && <Alert color="blue" p="xs">Faça login para continuar.</Alert>}
              {error && <Alert color="red" p="xs">{error}</Alert>}
              <TextInput label="E-mail" autoComplete="username" {...form.getInputProps('email')} />
              <PasswordInput label="Senha" autoComplete="current-password" {...form.getInputProps('password')} />
              <Button type="submit" loading={login.isPending}>Entrar</Button>
            </Stack>
          </Paper>
        </Stack>
        <Paper withBorder p="md" radius="md">
          <Text fw={600}>Contas de demonstração</Text>
          <Text size="xs" c="dimmed" mb="sm">
            Senha de todas: <b>{DEMO_PASSWORD}</b> · clique em uma conta para preencher
          </Text>
          <Stack gap="sm">
            {DEMO_ACCOUNTS.map((group) => (
              <div key={group.role}>
                <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={4}>{group.role}</Text>
                <SimpleGrid cols={{ base: 1, sm: group.accounts.length > 6 ? 2 : 1 }} spacing={2} verticalSpacing={2}>
                  {group.accounts.map((a) => (
                    <UnstyledButton
                      key={a.email}
                      onClick={() => form.setValues({ email: a.email, password: DEMO_PASSWORD })}
                      px="xs"
                      py={4}
                      style={{ borderRadius: 6 }}
                      className="demo-account"
                    >
                      <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
                        <div>
                          <Text size="sm" fw={500}>{a.name}</Text>
                          <Text size="xs" c="dimmed">{a.detail}</Text>
                        </div>
                        {group.accounts.length <= 6 && <Text size="xs" c="teal.7" ff="monospace">{a.email}</Text>}
                      </Group>
                      {group.accounts.length > 6 && <Text size="xs" c="teal.7" ff="monospace">{a.email}</Text>}
                    </UnstyledButton>
                  ))}
                </SimpleGrid>
              </div>
            ))}
          </Stack>
        </Paper>
      </SimpleGrid>
    </Center>
  );
}
