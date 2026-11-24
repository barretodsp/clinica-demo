import type { JSONContent } from '@tiptap/react';

export type Role = 'ATTENDANT' | 'DOCTOR' | 'PATIENT';

export interface Clinic {
  id: string;
  name: string;
  city: string;
  state: string;
  timezone: string;
  timezoneLabel: string;
}

export interface Me {
  id: string;
  name: string;
  email: string;
  role: Role;
  patientId: string | null;
  doctorId: string | null;
  clinics: Clinic[];
}

export interface ReportSummary {
  id: string;
  status: 'DRAFT' | 'PUBLISHED';
  doctorId: string;
  doctorName: string;
  isMine: boolean;
  publishedAt: string | null;
}

export interface StaffAppointment {
  id: string;
  clinicId: string;
  startsAt: string;
  status: 'SCHEDULED' | 'CANCELLED';
  cancelledAt: string | null;
  createdAt: string;
  /** Stone Web Viewer do PACS de demonstração; null = sem imagem. */
  imageViewerUrl: string | null;
  examType: { id: string; name: string };
  patient: { id: string; name: string; documentMasked: string };
  medicalReport: ReportSummary | null;
}

export interface Slot {
  startsAt: string;
  localTime: string;
  available: boolean;
  reason: string | null;
}

export interface SlotsResponse {
  date: string;
  timezone: string;
  businessDay: boolean;
  slots: Slot[];
}

export interface PatientOption {
  id: string;
  name: string;
  documentMasked: string;
}

/** JSON do Tiptap (formato salvo no banco). */
export interface ReportDocument extends JSONContent {
  type: 'doc';
  content: JSONContent[];
}

export interface MedicalReport {
  id: string;
  appointmentId: string;
  status: 'DRAFT' | 'PUBLISHED';
  title: string;
  titleComplement: string | null;
  body: ReportDocument;
  publishedAt: string | null;
  updatedAt: string;
  examType: { id: string; name: string };
  startsAt: string;
  clinic: { id: string; name: string; timezone: string; timezoneLabel: string };
  patient: { id: string; name: string };
  doctor: { id: string; name: string };
  signature: { professionalName: string; professionalRegistration: string } | null;
  signaturePreview?: { professionalName: string; professionalRegistration: string | null; canPublish: boolean };
  isMine?: boolean;
}

export interface PatientAppointment {
  id: string;
  startsAt: string;
  status: 'SCHEDULED' | 'CANCELLED';
  examType: { name: string };
  clinic: { id: string; name: string; city: string; timezone: string; timezoneLabel: string };
  hasPublishedMedicalReport: boolean;
  medicalReportId: string | null;
  publishedAt: string | null;
}
