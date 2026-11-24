import { Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { IconFileText } from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AppointmentStatusBadge } from '../../../components/StatusBadges';
import { patientAppointmentsQuery } from '../../../lib/queries';
import { formatDateTime } from '../../../lib/time';

export const Route = createFileRoute('/_patient/patient/appointments')({
  loader: ({ context }) => context.queryClient.ensureQueryData(patientAppointmentsQuery),
  component: PatientAppointments,
});

function PatientAppointments() {
  const { data } = useSuspenseQuery(patientAppointmentsQuery);
  return (
    <Stack maw={860} mx="auto">
      <div>
        <Title order={3}>Meus agendamentos</Title>
        <Text size="sm" c="dimmed">Horários exibidos no fuso de cada clínica.</Text>
      </div>
      {data.length === 0 && <Text c="dimmed">Você ainda não tem exames agendados.</Text>}
      {data.map((a) => (
        <Card key={a.id} withBorder>
          <Group justify="space-between" align="flex-start">
            <div>
              <Text fw={600}>{a.examType.name}</Text>
              <Text size="sm">
                {formatDateTime(a.startsAt, a.clinic.timezone)} <Text span c="dimmed">({a.clinic.timezoneLabel})</Text>
              </Text>
              <Text size="sm" c="dimmed">{a.clinic.name} · {a.clinic.city}</Text>
            </div>
            <Stack gap={6} align="flex-end">
              <AppointmentStatusBadge status={a.status} />
              {a.hasPublishedMedicalReport ? (
                <>
                  <Badge color="teal">Laudo disponível</Badge>
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconFileText size={14} />}
                    renderRoot={(props) => <Link {...props} to="/patient/medical-reports/$medicalReportId" params={{ medicalReportId: a.medicalReportId! }} />}
                  >
                    Ver laudo
                  </Button>
                </>
              ) : (
                a.status === 'SCHEDULED' && <Badge color="gray" variant="outline">Laudo ainda não disponível</Badge>
              )}
            </Stack>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}
