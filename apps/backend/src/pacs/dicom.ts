import { createHash } from 'node:crypto';
import { localParts } from '../common/clinic-time.js';

/**
 * UID DICOM derivado de UUID (PS3.5 B.2: raiz "2.25." + o UUID como inteiro decimal).
 * Determinístico: o mesmo agendamento gera sempre o mesmo estudo, então a URL gravada sobrevive
 * à recriação do Orthanc (efêmero).
 */
export function uidFromUuid(uuid: string): string {
  const hex = uuid.replaceAll('-', '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error(`UUID inválido: ${uuid}`);
  return `2.25.${BigInt(`0x${hex}`).toString(10)}`;
}

/** UID determinístico para os níveis abaixo do estudo (série, instância): hash de 128 bits da semente. */
export function derivedUid(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32);
  return `2.25.${BigInt(`0x${hex}`).toString(10)}`;
}

/** "João Pereira" → "Pereira^João" (Person Name: Sobrenome^Nome). */
export function dicomPersonName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const family = parts.pop()!;
  return `${family}^${parts.join(' ')}`;
}

export interface StudySource {
  appointmentId: string;
  startsAt: Date;
  patientId: string;
  patientName: string;
  patientBirthDate: string; // YYYY-MM-DD
  clinicName: string;
  clinicTimezone: string;
  examTypeName: string;
}

/** Tags trocadas no modelo para cada agendamento. Sem CPF: o PatientID é o ID interno do paciente. */
export function studyTags(s: StudySource): Record<string, string> {
  const local = localParts(s.startsAt, s.clinicTimezone);
  const date = local.date.replaceAll('-', '');
  const time = `${String(Math.floor(local.minutes / 60)).padStart(2, '0')}${String(local.minutes % 60).padStart(2, '0')}00`;
  return {
    PatientName: dicomPersonName(s.patientName),
    PatientID: s.patientId,
    PatientBirthDate: s.patientBirthDate.replaceAll('-', ''),
    StudyInstanceUID: uidFromUuid(s.appointmentId),
    SeriesInstanceUID: derivedUid(`${s.appointmentId}:series`),
    SOPInstanceUID: derivedUid(`${s.appointmentId}:instance`),
    AccessionNumber: s.appointmentId.replaceAll('-', '').slice(-16).toUpperCase(),
    StudyID: s.appointmentId.slice(-8),
    StudyDate: date,
    SeriesDate: date,
    ContentDate: date,
    StudyTime: time,
    SeriesTime: time,
    ContentTime: time,
    StudyDescription: s.examTypeName,
    InstitutionName: s.clinicName,
  };
}

/** URL do Stone Web Viewer para o estudo. */
export function viewerUrl(publicBase: string, studyInstanceUid: string): string {
  return `${publicBase.replace(/\/+$/, '')}/stone-webviewer/index.html?study=${studyInstanceUid}`;
}
