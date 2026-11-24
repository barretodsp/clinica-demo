import { indexStructureDefinitionBundle, validateResource } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import type { Bundle, DiagnosticReport, Practitioner } from '@medplum/fhirtypes';
import type { ReportRow } from '../medical-reports/report-view.js';
import { buildFhirBundle } from './fhir.mapper.js';

const row: ReportRow = {
  id: '01a20bed-0b6e-7c18-953d-7a201d4e7389',
  appointment_id: '01a20bed-0b18-795a-bad7-cee5e882584f',
  doctor_id: '01a20bec-2f10-7000-8000-000000000001',
  title: 'Ressonância Magnética — Joelho direito',
  title_complement: 'Joelho direito',
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sem alterações.' }] }] },
  body_text: 'Sem alterações.',
  status: 'PUBLISHED',
  published_at: new Date('2026-11-20T15:00:00Z'),
  registration_id: '01a20bec-2f10-7000-8000-000000000002',
  professional_name: 'Dr. Bruno Lima',
  professional_registration: 'CRM/AM 112233',
  created_at: new Date('2026-11-20T14:00:00Z'),
  updated_at: new Date('2026-11-20T15:00:00Z'),
  doctor_name: 'Dr. Bruno Lima',
  doctor_user_id: '01a20bec-2f10-7000-8000-000000000003',
  appointment_status: 'SCHEDULED',
  starts_at: new Date('2026-11-19T14:00:00Z'),
  clinic_id: '01a20bec-2f10-7000-8000-000000000004',
  clinic_name: 'Clínica Demo Manaus',
  clinic_city: 'Manaus',
  clinic_state: 'AM',
  clinic_timezone: 'America/Manaus',
  patient_id: '01a20bec-2f10-7000-8000-000000000005',
  patient_name: 'João Pereira',
  patient_birth_date: '1985-03-12',
  patient_document: '10000000019',
  exam_type_id: '01a20bec-2f10-7000-8000-000000000006',
  exam_type_name: 'Ressonância Magnética',
  exam_loinc_code: '25056-3',
  exam_loinc_display: 'MR Unspecified body region',
};

const options = { cpfSystem: 'https://saude.gov.br/fhir/sid/cpf', crmSystem: 'https://clinica.localhost/fhir/sid/crm' };

beforeAll(() => {
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
});

describe('mapeamento FHIR R4', () => {
  const bundle = buildFhirBundle(row, options);
  const report = bundle.entry![0].resource as DiagnosticReport;

  it('gera um Bundle collection com DiagnosticReport, Patient, Practitioner e Organization', () => {
    expect(bundle.type).toBe('collection');
    expect(bundle.entry!.map((e) => e.resource!.resourceType)).toEqual([
      'DiagnosticReport', 'Patient', 'Practitioner', 'Organization',
    ]);
    for (const entry of bundle.entry!) expect(entry.fullUrl).toBe(`urn:uuid:${entry.resource!.id}`);
  });

  it('mapeia os campos do DiagnosticReport', () => {
    expect(report.status).toBe('final');
    expect(report.category![0].coding![0].code).toBe('RAD');
    expect(report.code.coding![0]).toMatchObject({ system: 'http://loinc.org', code: '25056-3' });
    expect(report.code.text).toBe('Ressonância Magnética');
    expect(report.issued).toBe('2026-11-20T15:00:00.000Z');
    // horário do exame com o offset do fuso da clínica (Manaus, UTC-4)
    expect(report.effectiveDateTime).toBe('2026-11-19T10:00:00-04:00');
    expect(report.conclusion).toBe('Sem alterações.');
    expect(report.subject!.reference).toBe(`urn:uuid:${row.patient_id}`);
  });

  it('usa o CRM da UF da clínica (o registro gravado na publicação)', () => {
    const practitioner = bundle.entry![2].resource as Practitioner;
    expect(practitioner.identifier![0]).toEqual({ system: `${options.crmSystem}/AM`, value: '112233' });
  });

  it('inclui o laudo em HTML (base64) com título, corpo escapado e assinatura', () => {
    const html = Buffer.from(report.presentedForm![0].data!, 'base64').toString('utf8');
    expect(report.presentedForm![0].contentType).toBe('text/html');
    expect(html).toContain('<h1>Ressonância Magnética — Joelho direito</h1>');
    expect(html).toContain('Dr. Bruno Lima');
    expect(html).toContain('CRM/AM 112233');
    expect(html).not.toMatch(/<script|<img|<a /);
  });

  it('sem LOINC confirmado, o code vai só com o texto', () => {
    const noLoinc = buildFhirBundle({ ...row, exam_loinc_code: null, exam_loinc_display: null }, options);
    expect((noLoinc.entry![0].resource as DiagnosticReport).code).toEqual({ text: 'Ressonância Magnética' });
  });

  it('produz recursos válidos segundo o FHIR R4 (validador do Medplum)', () => {
    for (const entry of bundle.entry!) {
      const issues = validateResource(entry.resource!);
      // referências urn:uuid (válidas dentro do Bundle) geram só um aviso do validador: o tipo vem em `type`
      const relevant = issues.filter((i) => !(i.severity === 'warning' && i.details?.text?.includes('urn:uuid:')));
      expect(relevant).toEqual([]);
    }
  });

  it('recusa laudo não publicado', () => {
    expect(() => buildFhirBundle({ ...row, status: 'DRAFT', published_at: null }, options)).toThrow();
  });
});
