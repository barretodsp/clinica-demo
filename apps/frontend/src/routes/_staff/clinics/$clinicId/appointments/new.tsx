import { Alert, Button, Card, Chip, Group, Loader, Select, Stack, Text, Title } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { PatientPicker } from '../../../../../components/PatientPicker';
import { api, isApiError } from '../../../../../lib/api';
import { notifyError, notifySuccess } from '../../../../../lib/errors';
import { examTypesQuery, holidaysQuery, meQuery, slotsQuery } from '../../../../../lib/queries';
import { addDays, formatCivilDate, todayIn, weekdayOf } from '../../../../../lib/time';
import type { StaffAppointment } from '../../../../../lib/types';

/** Novo agendamento (somente atendente). */
export const Route = createFileRoute('/_staff/clinics/$clinicId/appointments/new')({
  beforeLoad: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me.role !== 'ATTENDANT') throw redirect({ to: '/clinics/$clinicId/appointments', params });
  },
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(examTypesQuery), context.queryClient.ensureQueryData(holidaysQuery)]),
  component: NewAppointment,
});

function NewAppointment() {
  const { clinicId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data: examTypes = [] } = useQuery(examTypesQuery);
  const { data: holidays } = useQuery(holidaysQuery);
  const clinic = me?.clinics.find((c) => c.id === clinicId);
  const tz = clinic?.timezone ?? 'America/Sao_Paulo';
  const holidaySet = new Set(holidays?.holidays.map((h) => h.date));

  const form = useForm<{ patientId: string | null; examTypeId: string | null; date: string | null; startsAt: string | null }>({
    initialValues: { patientId: null, examTypeId: null, date: null, startsAt: null },
    validate: {
      patientId: (v) => (!v ? 'Selecione o paciente' : null),
      examTypeId: (v) => (!v ? 'Selecione o tipo de exame' : null),
      date: (v) => (!v ? 'Escolha a data' : null),
      startsAt: (v) => (!v ? 'Escolha o horário' : null),
    },
  });

  const date = form.values.date;
  const slots = useQuery({ ...slotsQuery(clinicId, date ?? ''), enabled: !!date });

  const create = useMutation({
    mutationFn: (v: { patientId: string; examTypeId: string; startsAt: string }) =>
      api<StaffAppointment>(`/clinics/${clinicId}/appointments`, { method: 'POST', json: v }),
    onSuccess: async (appt) => {
      notifySuccess('Agendamento criado.');
      await queryClient.invalidateQueries({ queryKey: ['clinics', clinicId] });
      await navigate({ to: '/clinics/$clinicId/appointments/$appointmentId', params: { clinicId, appointmentId: appt.id } });
    },
    onError: async (e) => {
      notifyError(e);
      // horário ocupado nesse meio tempo: recarrega os slots
      if (isApiError(e, 409)) {
        form.setFieldValue('startsAt', null);
        await queryClient.invalidateQueries({ queryKey: ['clinics', clinicId, 'slots'] });
      }
    },
  });

  const minDate = addDays(todayIn(tz), 0);
  const maxDate = holidays?.bookingWindowEnd ?? '2028-12-31';
  const excludeDate = (d: string) => {
    const iso = d.slice(0, 10);
    const wd = weekdayOf(iso);
    return wd === 0 || wd === 6 || holidaySet.has(iso);
  };

  const availableSlots = slots.data?.slots.filter((s) => s.available) ?? [];

  return (
    <Stack maw={720}>
      <div>
        <Title order={3}>Novo agendamento</Title>
        <Text size="sm" c="dimmed">
          {clinic?.name} · sala única, horários de 30 min · seg–sex, 08:00–19:00 ({clinic?.timezoneLabel})
        </Text>
      </div>
      <Card withBorder component="form" onSubmit={form.onSubmit((v) => create.mutate({ patientId: v.patientId!, examTypeId: v.examTypeId!, startsAt: v.startsAt! }))}>
        <Stack>
          <PatientPicker value={form.values.patientId} onChange={(id) => form.setFieldValue('patientId', id)} error={form.errors.patientId as string | undefined} />
          <Select label="Tipo de exame" placeholder="Selecione" data={examTypes.map((e) => ({ value: e.id, label: e.name }))} {...form.getInputProps('examTypeId')} />
          <DatePickerInput
            label="Data"
            placeholder="Escolha um dia útil"
            valueFormat="DD/MM/YYYY"
            minDate={minDate}
            maxDate={maxDate}
            excludeDate={excludeDate}
            value={form.values.date}
            error={form.errors.date}
            onChange={(v) => {
              form.setFieldValue('date', v);
              form.setFieldValue('startsAt', null);
            }}
          />
          {date && (
            <div>
              <Text size="sm" fw={500} mb={6}>Horário ({clinic?.timezoneLabel})</Text>
              {slots.isLoading ? (
                <Loader size="sm" />
              ) : availableSlots.length === 0 ? (
                <Alert color="yellow" p="xs">Nenhum horário livre em {formatCivilDate(date)}.</Alert>
              ) : (
                <Chip.Group value={form.values.startsAt} onChange={(v) => form.setFieldValue('startsAt', v as string)}>
                  <Group gap={6}>
                    {slots.data!.slots.map((s) => (
                      <Chip key={s.startsAt} value={s.startsAt} disabled={!s.available} size="sm" variant="outline">
                        {s.localTime}
                      </Chip>
                    ))}
                  </Group>
                </Chip.Group>
              )}
              {form.errors.startsAt && <Text c="red" size="xs" mt={4}>{form.errors.startsAt}</Text>}
            </div>
          )}
          <Group justify="flex-end">
            <Button variant="default" renderRoot={(props) => <Link {...props} to="/clinics/$clinicId/appointments" params={{ clinicId }} />}>Voltar</Button>
            <Button type="submit" loading={create.isPending}>Agendar</Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
