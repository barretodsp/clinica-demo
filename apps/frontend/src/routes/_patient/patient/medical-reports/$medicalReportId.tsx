import { Button, Group, Stack } from '@mantine/core';
import { IconArrowLeft, IconPhotoScan } from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ErrorState } from '../../../../components/ErrorState';
import { PublishedReport } from '../../../../components/ReportView';
import { patientReportQuery } from '../../../../lib/queries';

export const Route = createFileRoute('/_patient/patient/medical-reports/$medicalReportId')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(patientReportQuery(params.medicalReportId)),
  errorComponent: ({ error }) => <ErrorState error={error} />,
  component: PatientReport,
});

function PatientReport() {
  const { medicalReportId } = Route.useParams();
  const { data } = useSuspenseQuery(patientReportQuery(medicalReportId));
  return (
    <Stack maw={860} mx="auto">
      <Group justify="space-between">
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} component={Link} to="/patient/appointments">
          Meus agendamentos
        </Button>
        {/* extra de demonstração: abre o Stone Web Viewer do PACS (nova aba) */}
        {data.imageViewerUrl && (
          <Button component="a" href={data.imageViewerUrl} target="_blank" rel="noopener noreferrer" variant="light" leftSection={<IconPhotoScan size={16} />}>
            Visualizar imagens
          </Button>
        )}
      </Group>
      <PublishedReport report={data} />
    </Stack>
  );
}
