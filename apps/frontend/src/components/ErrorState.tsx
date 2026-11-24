import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { IconLock, IconMoodEmpty } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { isApiError } from '../lib/api';

/** 403 NÃO encerra a sessão: só mostra "acesso negado". */
export function ErrorState({ error }: { error: unknown }) {
  const forbidden = isApiError(error, 403);
  const notFound = isApiError(error, 404);
  return (
    <Center py={80}>
      <Stack align="center" gap="xs" maw={480}>
        {forbidden ? <IconLock size={48} stroke={1.5} /> : <IconMoodEmpty size={48} stroke={1.5} />}
        <Title order={3}>{forbidden ? 'Acesso negado' : notFound ? 'Não encontrado' : 'Algo deu errado'}</Title>
        <Text c="dimmed" ta="center">
          {isApiError(error) ? error.message : 'Erro inesperado. Tente novamente.'}
        </Text>
        <Button component={Link} to="/" variant="light" mt="sm">
          Voltar ao início
        </Button>
      </Stack>
    </Center>
  );
}
