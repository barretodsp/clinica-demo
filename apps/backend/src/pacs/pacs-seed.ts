import type { DataSource } from 'typeorm';
import { studyTags, uidFromUuid, viewerUrl } from './dicom.js';
import type { OrthancClient } from './orthanc-client.js';

interface Row {
  appointment_id: string;
  starts_at: Date;
  patient_id: string;
  patient_name: string;
  patient_birth_date: string;
  clinic_name: string;
  clinic_timezone: string;
  exam_type_name: string;
}

export interface PacsSeedResult {
  appointments: number;
  created: number;
  alreadyInPacs: number;
}

/**
 * Gera um estudo por agendamento ativo a partir do mesmo Raio-X modelo e grava a URL do viewer.
 * Idempotente: estudos já presentes no Orthanc não são regerados; a URL só é escrita se mudou.
 */
export async function seedPacsImages(
  ds: DataSource,
  orthanc: OrthancClient,
  template: Uint8Array<ArrayBuffer>,
  publicBase: string,
): Promise<PacsSeedResult> {
  const rows: Row[] = await ds.query(`
    SELECT a.id AS appointment_id, a.starts_at, p.id AS patient_id, p.name AS patient_name,
           to_char(p.birth_date, 'YYYY-MM-DD') AS patient_birth_date,
           c.name AS clinic_name, c.timezone AS clinic_timezone, e.name AS exam_type_name
    FROM appointment a
    JOIN patient p ON p.id = a.patient_id
    JOIN clinic c ON c.id = a.clinic_id
    JOIN exam_type e ON e.id = a.exam_type_id
    WHERE a.status = 'SCHEDULED'
    ORDER BY a.starts_at`);

  const existing = await orthanc.studyInstanceUids();
  const pending = rows.filter((r) => !existing.has(uidFromUuid(r.appointment_id)));

  if (pending.length) {
    const templateId = await orthanc.upload(template);
    try {
      for (const r of pending) {
        const file = await orthanc.modifyInstance(
          templateId,
          studyTags({
            appointmentId: r.appointment_id,
            startsAt: r.starts_at,
            patientId: r.patient_id,
            patientName: r.patient_name,
            patientBirthDate: r.patient_birth_date,
            clinicName: r.clinic_name,
            clinicTimezone: r.clinic_timezone,
            examTypeName: r.exam_type_name,
          }),
        );
        await orthanc.upload(file);
      }
    } finally {
      // o modelo não fica no PACS
      await orthanc.deleteInstance(templateId);
    }
  }

  for (const r of rows) {
    await ds.query(
      `UPDATE appointment SET image_viewer_url = $2 WHERE id = $1 AND image_viewer_url IS DISTINCT FROM $2`,
      [r.appointment_id, viewerUrl(publicBase, uidFromUuid(r.appointment_id))],
    );
  }

  return { appointments: rows.length, created: pending.length, alreadyInPacs: rows.length - pending.length };
}
