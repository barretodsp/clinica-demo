import { Alert, Badge, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { formatDateTime } from '../lib/time';
import type { MedicalReport, ReportDocument } from '../lib/types';
import { reportExtensions } from './editor-extensions';

/** Corpo do laudo em modo somente leitura (mesmas extensões do editor). */
export function ReportBody({ body }: { body: ReportDocument }) {
  const editor = useEditor({ extensions: reportExtensions(), content: body, editable: false, immediatelyRender: true }, [JSON.stringify(body)]);
  return (
    <div className="report-content">
      <EditorContent editor={editor} />
    </div>
  );
}

interface SignatureProps {
  name: string;
  registration: string | null;
  publishedAt: string | null;
  timezone: string;
  timezoneLabel: string;
  preview?: boolean;
}

/** Assinatura: rodapé fixo, fora do texto editável. */
export function SignatureFooter({ name, registration, publishedAt, timezone, timezoneLabel, preview }: SignatureProps) {
  return (
    <Stack gap={2} mt="md">
      <Divider label={preview ? 'Assinatura (pré-visualização)' : 'Assinatura'} labelPosition="left" />
      <Text fw={600}>{name}</Text>
      {registration ? (
        <Text size="sm">{registration}</Text>
      ) : (
        <Alert color="orange" p="xs" title="Sem registro na UF da clínica">
          Você não possui CRM na UF desta clínica: o laudo não poderá ser publicado.
        </Alert>
      )}
      {publishedAt && (
        <Text size="sm" c="dimmed">
          Publicado em {formatDateTime(publishedAt, timezone)} ({timezoneLabel})
        </Text>
      )}
    </Stack>
  );
}

/** Laudo publicado completo (paciente, equipe e visualização final). */
export function PublishedReport({ report }: { report: MedicalReport }) {
  const signature = report.signature ?? {
    professionalName: report.signaturePreview?.professionalName ?? report.doctor.name,
    professionalRegistration: report.signaturePreview?.professionalRegistration ?? null,
  };
  return (
    <Paper withBorder p="xl" radius="md">
      <Group justify="space-between" align="flex-start" mb="xs">
        <div>
          <Title order={3}>{report.title}</Title>
          <Text size="sm" c="dimmed">
            {report.clinic.name} · exame em {formatDateTime(report.startsAt, report.clinic.timezone)} ({report.clinic.timezoneLabel})
          </Text>
          <Text size="sm" c="dimmed">Paciente: {report.patient.name}</Text>
        </div>
        <Badge color={report.status === 'PUBLISHED' ? 'teal' : 'yellow'}>
          {report.status === 'PUBLISHED' ? 'Publicado' : 'Rascunho'}
        </Badge>
      </Group>
      <Divider my="md" />
      <ReportBody body={report.body} />
      <SignatureFooter
        name={signature.professionalName}
        registration={signature.professionalRegistration}
        publishedAt={report.publishedAt}
        timezone={report.clinic.timezone}
        timezoneLabel={report.clinic.timezoneLabel}
        preview={report.status !== 'PUBLISHED'}
      />
    </Paper>
  );
}
