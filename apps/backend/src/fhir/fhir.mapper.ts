import type {
  Bundle,
  DiagnosticReport,
  Organization,
  Patient as FhirPatient,
  Practitioner,
} from '@medplum/fhirtypes';
import { localParts } from '../common/clinic-time.js';
import { TIMEZONE_LABELS } from '../common/domain.js';
import { renderReportDocumentHtml } from '../medical-reports/report-html.js';
import type { ReportRow } from '../medical-reports/report-view.js';

export interface FhirMappingOptions {
  cpfSystem: string;
  crmSystem: string;
}

/** Offset fixo do fuso da clínica (sem horário de verão desde 2019) → dateTime FHIR com offset. */
function toFhirDateTime(instant: Date, timezone: ReportRow['clinic_timezone']): string {
  const p = localParts(instant, timezone);
  const offsetMin = Math.round((Date.parse(`${p.date}T00:00:00Z`) + p.minutes * 60_000 + p.seconds * 1000 - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(p.minutes / 60)).padStart(2, '0');
  const mm = String(p.minutes % 60).padStart(2, '0');
  const ss = String(p.seconds).padStart(2, '0');
  return `${p.date}T${hh}:${mm}:${ss}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function splitName(full: string): { given: string[]; family?: string; text: string } {
  const parts = full.replace(/^(Dra?\.)\s+/, '').trim().split(/\s+/);
  return parts.length > 1 ? { text: full, given: parts.slice(0, -1), family: parts[parts.length - 1] } : { text: full, given: parts };
}

/**
 * Laudo PUBLICADO → Bundle FHIR R4 (collection) com DiagnosticReport, Patient, Practitioner e Organization.
 * Função pura: sem banco, sem HTTP.
 */
export function buildFhirBundle(row: ReportRow, options: FhirMappingOptions): Bundle {
  if (row.status !== 'PUBLISHED' || !row.published_at || !row.professional_registration) {
    throw new Error('Somente laudos publicados podem ser exportados.');
  }
  const ref = (id: string) => `urn:uuid:${id}`;
  const [council, regRest] = row.professional_registration.split('/');
  const [regState, regNumber] = (regRest ?? '').split(' ');

  const patient: FhirPatient = {
    resourceType: 'Patient',
    id: row.patient_id,
    identifier: [{ use: 'official', system: options.cpfSystem, value: row.patient_document }],
    name: [{ use: 'official', ...splitName(row.patient_name) }],
    birthDate: row.patient_birth_date,
  };

  const practitioner: Practitioner = {
    resourceType: 'Practitioner',
    id: row.doctor_id,
    identifier: [{ system: `${options.crmSystem}/${regState}`, value: regNumber }],
    name: [{ use: 'official', ...splitName(row.professional_name ?? row.doctor_name) }],
    qualification: [
      {
        identifier: [{ system: `${options.crmSystem}/${regState}`, value: regNumber }],
        code: { text: `${council}/${regState}` },
        issuer: { display: `Conselho Regional de Medicina — ${regState}` },
      },
    ],
  };

  const organization: Organization = {
    resourceType: 'Organization',
    id: row.clinic_id,
    name: row.clinic_name,
    address: [{ city: row.clinic_city, state: row.clinic_state, country: 'BR' }],
  };

  const publishedLocal = localParts(row.published_at, row.clinic_timezone);
  const publishedAtLabel = `${publishedLocal.date.split('-').reverse().join('/')} ${String(Math.floor(publishedLocal.minutes / 60)).padStart(2, '0')}:${String(publishedLocal.minutes % 60).padStart(2, '0')} (${TIMEZONE_LABELS[row.clinic_timezone]})`;
  const html = renderReportDocumentHtml({
    title: row.title,
    body: row.body,
    professionalName: row.professional_name!,
    professionalRegistration: row.professional_registration,
    publishedAtLabel,
  });

  const report: DiagnosticReport = {
    resourceType: 'DiagnosticReport',
    id: row.id,
    identifier: [{ system: 'urn:ietf:rfc:3986', value: ref(row.id) }],
    status: 'final',
    category: [
      { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'RAD', display: 'Radiology' }] },
    ],
    code: {
      ...(row.exam_loinc_code
        ? { coding: [{ system: 'http://loinc.org', code: row.exam_loinc_code, display: row.exam_loinc_display ?? undefined }] }
        : {}),
      text: row.exam_type_name,
    },
    subject: { reference: ref(row.patient_id), type: 'Patient', display: row.patient_name },
    effectiveDateTime: toFhirDateTime(row.starts_at, row.clinic_timezone),
    issued: row.published_at.toISOString(),
    performer: [{ reference: ref(row.clinic_id), type: 'Organization', display: row.clinic_name }],
    resultsInterpreter: [{ reference: ref(row.doctor_id), type: 'Practitioner', display: row.professional_name ?? undefined }],
    conclusion: row.body_text,
    presentedForm: [
      {
        contentType: 'text/html',
        language: 'pt-BR',
        title: row.title,
        data: Buffer.from(html, 'utf8').toString('base64'),
        creation: row.published_at.toISOString(),
      },
    ],
  };

  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: new Date().toISOString(),
    entry: [report, patient, practitioner, organization].map((resource) => ({
      fullUrl: ref(resource.id!),
      resource,
    })),
  };
}
