import { Badge } from '@mantine/core';
import type { ReportSummary } from '../lib/types';

export function AppointmentStatusBadge({ status }: { status: 'SCHEDULED' | 'CANCELLED' }) {
  return status === 'SCHEDULED' ? <Badge color="blue" variant="light">Agendado</Badge> : <Badge color="gray" variant="light">Cancelado</Badge>;
}

export function ReportStatusBadge({ report }: { report: ReportSummary | null }) {
  if (!report) return <Badge color="gray" variant="outline">Sem laudo</Badge>;
  if (report.status === 'PUBLISHED') return <Badge color="teal">Laudo publicado</Badge>;
  return (
    <Badge color="yellow" variant="light" title={`Em elaboração por ${report.doctorName}`}>
      {report.isMine ? 'Meu rascunho' : `Em elaboração — ${report.doctorName}`}
    </Badge>
  );
}
