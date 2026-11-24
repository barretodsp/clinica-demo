import { Appointment } from './appointment.entity.js';
import { Attendant } from './attendant.entity.js';
import { AuditEvent } from './audit-event.entity.js';
import { ExamType, Holiday } from './catalog.entity.js';
import { Clinic } from './clinic.entity.js';
import { Doctor, DoctorClinic, DoctorRegistration, ProfessionalCouncil } from './doctor.entity.js';
import { MedicalReport } from './medical-report.entity.js';
import { Patient } from './patient.entity.js';
import { User } from './user.entity.js';

export {
  Appointment, Attendant, AuditEvent, Clinic, Doctor, DoctorClinic, DoctorRegistration, ExamType, Holiday,
  MedicalReport, Patient, ProfessionalCouncil, User,
};

export const ENTITIES = [
  Appointment, Attendant, AuditEvent, Clinic, Doctor, DoctorClinic, DoctorRegistration, ExamType, Holiday,
  MedicalReport, Patient, ProfessionalCouncil, User,
];
