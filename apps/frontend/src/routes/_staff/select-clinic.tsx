import { Card, Center, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { meQuery } from '../../lib/queries';

/** Médico vinculado a mais de uma clínica escolhe em qual trabalhar. */
export const Route = createFileRoute('/_staff/select-clinic')({
  component: SelectClinic,
});

function SelectClinic() {
  const { data: me } = useQuery(meQuery);
  return (
    <Center py="xl">
      <Stack w="100%" maw={800}>
        <Title order={3}>Escolha a clínica</Title>
        <Text c="dimmed">Você tem vínculo com {me?.clinics.length} clínicas. Os horários são exibidos no fuso de cada clínica.</Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {me?.clinics.map((c) => (
            <Card key={c.id} withBorder renderRoot={(props) => <Link {...props} to="/clinics/$clinicId/appointments" params={{ clinicId: c.id }} />}>
              <Text fw={600}>{c.name}</Text>
              <Text size="sm" c="dimmed">{c.city}/{c.state} · {c.timezoneLabel}</Text>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>
    </Center>
  );
}
