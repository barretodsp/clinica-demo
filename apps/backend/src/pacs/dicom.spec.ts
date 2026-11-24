import { derivedUid, dicomPersonName, studyTags, uidFromUuid, viewerUrl } from './dicom.js';

const UID_RE = /^(0|[1-9]\d*)(\.(0|[1-9]\d*))*$/; // PS3.5 9.1: dígitos e pontos, sem zero à esquerda

describe('UIDs DICOM do PACS de demonstração', () => {
  const apptId = '019abf3e-5f2a-7c11-8d4e-0123456789ab';

  it('estudo = 2.25.<UUID como inteiro>, válido e determinístico', () => {
    const uid = uidFromUuid(apptId);
    expect(uid).toBe(`2.25.${BigInt('0x019abf3e5f2a7c118d4e0123456789ab').toString()}`);
    expect(uid).toMatch(UID_RE);
    expect(uid.length).toBeLessThanOrEqual(64);
    expect(uidFromUuid(apptId)).toBe(uid);
  });

  it('série e instância: válidos, determinísticos e distintos entre si', () => {
    const series = derivedUid(`${apptId}:series`);
    const instance = derivedUid(`${apptId}:instance`);
    for (const uid of [series, instance]) {
      expect(uid).toMatch(UID_RE);
      expect(uid.length).toBeLessThanOrEqual(64);
    }
    expect(series).not.toBe(instance);
    expect(derivedUid(`${apptId}:series`)).toBe(series);
  });

  it('rejeita UUID inválido', () => {
    expect(() => uidFromUuid('nao-e-uuid')).toThrow();
  });

  it('nome no formato Sobrenome^Nome', () => {
    expect(dicomPersonName('João Pereira')).toBe('Pereira^João');
    expect(dicomPersonName('Ana Maria  Souza')).toBe('Souza^Ana Maria');
    expect(dicomPersonName('Madonna')).toBe('Madonna');
  });

  it('tags: data/hora no fuso da clínica, ID interno do paciente (sem CPF)', () => {
    const tags = studyTags({
      appointmentId: apptId,
      startsAt: new Date('2026-11-25T12:30:00Z'), // 08:30 em Manaus (UTC−4)
      patientId: '019abf3e-0000-7000-8000-00000000000a',
      patientName: 'José Santos',
      patientBirthDate: '1980-02-29',
      clinicName: 'Clínica Demo Manaus',
      clinicTimezone: 'America/Manaus',
      examTypeName: 'Ressonância Magnética',
    });
    expect(tags).toMatchObject({
      PatientName: 'Santos^José',
      PatientID: '019abf3e-0000-7000-8000-00000000000a',
      PatientBirthDate: '19800229',
      StudyDate: '20261125',
      StudyTime: '083000',
      SeriesDate: '20261125',
      StudyDescription: 'Ressonância Magnética',
      InstitutionName: 'Clínica Demo Manaus',
      StudyInstanceUID: uidFromUuid(apptId),
    });
    expect(tags.AccessionNumber.length).toBeLessThanOrEqual(16);
  });

  it('URL do Stone Web Viewer', () => {
    expect(viewerUrl('http://pacs.clinica.localhost/', '2.25.1')).toBe('http://pacs.clinica.localhost/stone-webviewer/index.html?study=2.25.1');
  });
});
