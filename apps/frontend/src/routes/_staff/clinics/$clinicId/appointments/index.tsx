import { Button, Card, Group, Stack, Table, Text, Title } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconCalendarPlus, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { ExamImageLink } from '../../../../../components/ExamImage';
import { PatientPicker } from '../../../../../components/PatientPicker';
import { AppointmentStatusBadge, ReportStatusBadge } from '../../../../../components/StatusBadges';
import { appointmentsQuery, meQuery } from '../../../../../lib/queries';
import { addDays, formatCivilDate, formatDateTime, formatTime, todayIn, weekdayLabel } from '../../../../../lib/time';

const searchSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  patientId: z.string().uuid().optional(),
  patientLabel: z.string().max(120).optional(),
});

/** Lista de agendamentos da clínica — filtros na URL (validados com Zod). */
export const Route = createFileRoute('/_staff/clinics/$clinicId/appointments/')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ date: search.date, patientId: search.patientId }),
  loader: ({ context, params, deps }) => context.queryClient.ensureQueryData(appointmentsQuery(params.clinicId, deps)),
  component: AppointmentsPage,
});

function AppointmentsPage() {
  const { clinicId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: me } = useQuery(meQuery);
  const clinic = me?.clinics.find((c) => c.id === clinicId);
  const tz = clinic?.timezone ?? 'America/Sao_Paulo';
  const { data: appointments } = useSuspenseQuery(appointmentsQuery(clinicId, { date: search.date, patientId: search.patientId }));

  const setSearch = (patch: Partial<z.infer<typeof searchSchema>>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={3}>Agendamentos</Title>
          <Text size="sm" c="dimmed">
            {clinic?.name} · horários em {clinic?.timezoneLabel}
          </Text>
        </div>
        {me?.role === 'ATTENDANT' && (
          <Button renderRoot={(props) => <Link {...props} to="/clinics/$clinicId/appointments/new" params={{ clinicId }} />} leftSection={<IconCalendarPlus size={18} />}>
            Novo agendamento
          </Button>
        )}
      </Group>

      <Card withBorder>
        <Group align="flex-end" wrap="wrap">
          <Group gap={4} align="flex-end">
            <Button variant="default" px={8} disabled={!search.date} onClick={() => setSearch({ date: addDays(search.date!, -1) })} aria-label="Dia anterior">
              <IconChevronLeft size={16} />
            </Button>
            <DatePickerInput
              label="Data"
              placeholder="Todas as datas"
              clearable
              valueFormat="DD/MM/YYYY"
              value={search.date ?? null}
              onChange={(v) => setSearch({ date: v ?? undefined })}
              w={170}
            />
            <Button variant="default" px={8} disabled={!search.date} onClick={() => setSearch({ date: addDays(search.date!, 1) })} aria-label="Próximo dia">
              <IconChevronRight size={16} />
            </Button>
            <Button variant="subtle" onClick={() => setSearch({ date: todayIn(tz) })}>Hoje</Button>
          </Group>
          <PatientPicker
            label="Paciente"
            clearable
            w={340}
            value={search.patientId ?? null}
            initialOption={search.patientId && search.patientLabel ? { id: search.patientId, name: search.patientLabel, documentMasked: '' } : null}
            onChange={(id, opt) => setSearch({ patientId: id ?? undefined, patientLabel: opt?.name })}
          />
          {(search.date || search.patientId) && (
            <Button variant="subtle" color="gray" onClick={() => navigate({ search: {}, replace: true })}>Limpar filtros</Button>
          )}
        </Group>
      </Card>

      <Card withBorder p={0}>
        {appointments.length === 0 ? (
          <Text p="lg" c="dimmed" ta="center">
            Nenhum agendamento {search.date ? `em ${formatCivilDate(search.date)}` : ''} {search.patientId ? 'para este paciente' : ''}.
          </Text>
        ) : (
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Data e hora</Table.Th>
                <Table.Th>Paciente</Table.Th>
                <Table.Th>Exame</Table.Th>
                <Table.Th>Situação</Table.Th>
                <Table.Th>Laudo</Table.Th>
                <Table.Th>Imagem</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {appointments.map((a) => (
                <Table.Tr
                  key={a.id}
                  style={{ cursor: 'pointer', opacity: a.status === 'CANCELLED' ? 0.6 : 1 }}
                  onClick={() => navigate({ to: '/clinics/$clinicId/appointments/$appointmentId', params: { clinicId, appointmentId: a.id } })}
                >
                  <Table.Td>
                    <Text size="sm" fw={500}>{search.date ? formatTime(a.startsAt, tz) : formatDateTime(a.startsAt, tz)}</Text>
                    <Text size="xs" c="dimmed">{weekdayLabel(a.startsAt, tz)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{a.patient.name}</Text>
                    <Text size="xs" c="dimmed">CPF {a.patient.documentMasked}</Text>
                  </Table.Td>
                  <Table.Td>{a.examType.name}</Table.Td>
                  <Table.Td><AppointmentStatusBadge status={a.status} /></Table.Td>
                  <Table.Td><ReportStatusBadge report={a.medicalReport} /></Table.Td>
                  <Table.Td><ExamImageLink url={a.imageViewerUrl} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>
    </Stack>
  );
}
