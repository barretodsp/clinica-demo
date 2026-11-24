import { Alert, Badge, Button, Card, Grid, Group, Loader, Stack, Text, TextInput, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconArrowLeft, IconDeviceFloppy, IconFileCheck, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useBlocker } from '@tanstack/react-router';
import { useState } from 'react';
import { ErrorState } from '../../../../../components/ErrorState';
import { ExamImageButton } from '../../../../../components/ExamImage';
import { ReportEditor } from '../../../../../components/ReportEditor';
import { PublishedReport, SignatureFooter } from '../../../../../components/ReportView';
import { AppointmentStatusBadge, ReportStatusBadge } from '../../../../../components/StatusBadges';
import { api, isApiError } from '../../../../../lib/api';
import { notifyError, notifySuccess } from '../../../../../lib/errors';
import { appointmentQuery, meQuery, staffReportQuery } from '../../../../../lib/queries';
import { formatDateTime } from '../../../../../lib/time';
import type { Me, MedicalReport, ReportDocument, StaffAppointment } from '../../../../../lib/types';

export const Route = createFileRoute('/_staff/clinics/$clinicId/appointments/$appointmentId')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(appointmentQuery(params.clinicId, params.appointmentId)),
  errorComponent: ({ error }) => <ErrorState error={error} />,
  component: AppointmentDetail,
});

function AppointmentDetail() {
  const { clinicId, appointmentId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data: appt } = useSuspenseQuery(appointmentQuery(clinicId, appointmentId));
  const clinic = me?.clinics.find((c) => c.id === clinicId);
  const tz = clinic?.timezone ?? 'America/Sao_Paulo';

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['clinics', clinicId] });

  const cancel = useMutation({
    mutationFn: () => api<StaffAppointment>(`/clinics/${clinicId}/appointments/${appointmentId}/cancel`, { method: 'POST' }),
    onSuccess: async () => {
      notifySuccess('Agendamento cancelado. O horário foi liberado.');
      await refresh();
    },
    onError: notifyError,
  });

  const canCancel = me?.role === 'ATTENDANT' && appt.status === 'SCHEDULED' && !appt.medicalReport;

  return (
    <Stack maw={980}>
      <Group>
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} renderRoot={(props) => <Link {...props} to="/clinics/$clinicId/appointments" params={{ clinicId }} />}>
          Agendamentos
        </Button>
      </Group>
      <Card withBorder>
        <Grid>
          <Grid.Col span={{ base: 12, sm: 8 }}>
            <Title order={3}>{appt.examType.name}</Title>
            <Text>{formatDateTime(appt.startsAt, tz)} <Text span c="dimmed" size="sm">({clinic?.timezoneLabel})</Text></Text>
            <Text size="sm" mt={4}>Paciente: <b>{appt.patient.name}</b> · CPF {appt.patient.documentMasked}</Text>
            {appt.cancelledAt && <Text size="sm" c="dimmed">Cancelado em {formatDateTime(appt.cancelledAt, tz)}</Text>}
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Stack align="flex-end" gap={6}>
              <AppointmentStatusBadge status={appt.status} />
              <ReportStatusBadge report={appt.medicalReport} />
              <ExamImageButton url={appt.imageViewerUrl} />
              {me?.role === 'ATTENDANT' && appt.status === 'SCHEDULED' && (
                <Button
                  color="red"
                  variant="light"
                  size="xs"
                  disabled={!canCancel}
                  loading={cancel.isPending}
                  title={appt.medicalReport ? 'Agendamentos com laudo (rascunho ou publicado) não podem ser cancelados' : undefined}
                  onClick={() =>
                    modals.openConfirmModal({
                      title: 'Cancelar agendamento?',
                      children: <Text size="sm">O horário ficará livre para outro agendamento. Esta ação não pode ser desfeita.</Text>,
                      labels: { confirm: 'Cancelar agendamento', cancel: 'Voltar' },
                      confirmProps: { color: 'red' },
                      onConfirm: () => cancel.mutate(),
                    })
                  }
                >
                  Cancelar agendamento
                </Button>
              )}
            </Stack>
          </Grid.Col>
        </Grid>
        {me?.role === 'ATTENDANT' && appt.status === 'SCHEDULED' && appt.medicalReport && (
          <Text size="xs" c="dimmed" ta="right" mt="xs">Agendamentos com laudo não podem ser cancelados.</Text>
        )}
      </Card>

      {me && <ReportSection me={me} appt={appt} clinicId={clinicId} onChange={refresh} />}
    </Stack>
  );
}

function ReportSection({ me, appt, clinicId, onChange }: { me: Me; appt: StaffAppointment; clinicId: string; onChange: () => Promise<void> }) {
  const report = appt.medicalReport;

  const start = useMutation({
    mutationFn: () => api<MedicalReport>(`/clinics/${clinicId}/appointments/${appt.id}/medical-report`, { method: 'POST' }),
    onSuccess: async () => {
      notifySuccess('Laudo iniciado. Você é o responsável por este atendimento.');
      await onChange();
    },
    onError: async (e) => {
      notifyError(e);
      if (isApiError(e, 409)) await onChange();
    },
  });

  if (!report) {
    if (appt.status === 'CANCELLED') return <Alert color="gray">Agendamentos cancelados não recebem laudos.</Alert>;
    if (me.role !== 'DOCTOR') return <Alert color="gray">Ainda não há laudo para este exame.</Alert>;
    return (
      <Card withBorder>
        <Group justify="space-between">
          <div>
            <Text fw={600}>Laudo</Text>
            <Text size="sm" c="dimmed">Ao iniciar, você se torna o responsável: nenhum outro médico poderá laudar este atendimento.</Text>
          </div>
          <Button leftSection={<IconFileCheck size={18} />} loading={start.isPending} onClick={() => start.mutate()}>Iniciar laudo</Button>
        </Group>
      </Card>
    );
  }

  if (report.status === 'DRAFT' && !report.isMine) {
    return <Alert color="yellow" title="Laudo em elaboração">Em elaboração por {report.doctorName}. O rascunho é visível apenas para o responsável.</Alert>;
  }

  return <ReportLoader clinicId={clinicId} reportId={report.id} onChange={onChange} />;
}

function ReportLoader({ clinicId, reportId, onChange }: { clinicId: string; reportId: string; onChange: () => Promise<void> }) {
  const { data, error, isLoading } = useQuery(staffReportQuery(clinicId, reportId));
  if (isLoading) return <Loader />;
  if (error || !data) return <ErrorState error={error} />;
  if (data.status === 'PUBLISHED') return <PublishedReport report={data} />;
  return <DraftEditor key={data.id} clinicId={clinicId} report={data} onChange={onChange} />;
}

function DraftEditor({ clinicId, report, onChange }: { clinicId: string; report: MedicalReport; onChange: () => Promise<void> }) {
  const queryClient = useQueryClient();
  const [complement, setComplement] = useState(report.titleComplement ?? '');
  const [body, setBody] = useState<ReportDocument>(report.body);
  const [dirty, setDirty] = useState(false);
  const base = `/clinics/${clinicId}/medical-reports/${report.id}`;
  const title = complement.trim() ? `${report.examType.name} — ${complement.trim()}` : report.examType.name;

  // aviso ao sair com alterações não salvas
  useBlocker({
    shouldBlockFn: () => dirty && !window.confirm('Há alterações não salvas no laudo. Sair mesmo assim?'),
    enableBeforeUnload: () => dirty,
  });

  // onChange invalida tudo da clínica (inclui o laudo): uma única recarga
  const reload = () => onChange();

  const save = useMutation({
    mutationFn: () => api<MedicalReport>(base, { method: 'PUT', json: { titleComplement: complement || null, body } }),
    onSuccess: (saved) => {
      setDirty(false);
      queryClient.setQueryData(['clinics', clinicId, 'report', report.id], saved);
    },
    onError: notifyError,
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (dirty) await save.mutateAsync();
      return api<MedicalReport>(`${base}/publish`, { method: 'POST' });
    },
    onSuccess: async () => {
      setDirty(false);
      notifySuccess('Laudo publicado. Ele já está disponível para o paciente.');
      await reload();
    },
    onError: notifyError,
  });

  const discard = useMutation({
    mutationFn: () => api<void>(base, { method: 'DELETE' }),
    onSuccess: async () => {
      setDirty(false);
      notifySuccess('Rascunho descartado. O atendimento está livre para outro médico.');
      queryClient.removeQueries({ queryKey: ['clinics', clinicId, 'report', report.id] });
      await onChange();
    },
    onError: notifyError,
  });

  const preview = report.signaturePreview;

  function confirmPublish() {
    modals.openConfirmModal({
      title: 'Publicar laudo?',
      size: 'xl',
      children: (
        <Stack>
          <Alert color="orange" p="xs">Após publicado, o laudo <b>não poderá ser editado</b> e ficará disponível para o paciente.</Alert>
          <PublishedReport report={{ ...report, title, body }} />
        </Stack>
      ),
      labels: { confirm: 'Publicar', cancel: 'Voltar' },
      onConfirm: () => publish.mutate(),
    });
  }

  return (
    <Card withBorder>
      <Stack>
        <Group justify="space-between">
          <Text fw={600}>Laudo — rascunho</Text>
          <Badge color={dirty ? 'orange' : 'gray'} variant="light">{dirty ? 'Alterações não salvas' : 'Salvo'}</Badge>
        </Group>
        <Group align="flex-end" gap="xs" wrap="nowrap">
          <TextInput label="Título" value={report.examType.name} readOnly w={220} description="Tipo do exame (fixo)" />
          <TextInput
            label=" "
            description="Complemento (opcional)"
            placeholder="Ex.: Joelho direito"
            maxLength={200}
            style={{ flex: 1 }}
            value={complement}
            onChange={(e) => {
              setComplement(e.currentTarget.value);
              setDirty(true);
            }}
          />
        </Group>
        <ReportEditor
          initialContent={report.body}
          onChange={(doc) => {
            setBody(doc);
            setDirty(true);
          }}
        />
        {preview && (
          <SignatureFooter
            name={preview.professionalName}
            registration={preview.professionalRegistration}
            publishedAt={null}
            timezone={report.clinic.timezone}
            timezoneLabel={report.clinic.timezoneLabel}
            preview
          />
        )}
        <Group justify="space-between">
          <Button
            color="red"
            variant="subtle"
            leftSection={<IconTrash size={16} />}
            loading={discard.isPending}
            onClick={() =>
              modals.openConfirmModal({
                title: 'Descartar rascunho?',
                children: <Text size="sm">O rascunho será apagado e o atendimento ficará livre para outro médico.</Text>,
                labels: { confirm: 'Descartar', cancel: 'Voltar' },
                confirmProps: { color: 'red' },
                onConfirm: () => discard.mutate(),
              })
            }
          >
            Descartar rascunho
          </Button>
          <Group>
            <Button variant="default" leftSection={<IconDeviceFloppy size={16} />} loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
              Salvar rascunho
            </Button>
            <Button leftSection={<IconFileCheck size={16} />} loading={publish.isPending} disabled={preview ? !preview.canPublish : false} onClick={confirmPublish}>
              Publicar…
            </Button>
          </Group>
        </Group>
      </Stack>
    </Card>
  );
}
