import { Button, Stack } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
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
      <Button variant="subtle" w="fit-content" leftSection={<IconArrowLeft size={16} />} component={Link} to="/patient/appointments">
        Meus agendamentos
      </Button>
      <PublishedReport report={data} />
    </Stack>
  );
}
