import { queryOptions } from '@tanstack/react-query';
import { api } from './api';
import type {
  Clinic, Me, MedicalReport, PatientAppointment, PatientMedicalReport, PatientOption, SlotsResponse, StaffAppointment,
} from './types';

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: () => api<Me>('/auth/me', { skipAuthRedirect: true }),
  staleTime: 60_000,
  retry: false,
});

export const examTypesQuery = queryOptions({
  queryKey: ['exam-types'],
  queryFn: () => api<{ id: string; name: string }[]>('/exam-types'),
  staleTime: Infinity,
});

export const holidaysQuery = queryOptions({
  queryKey: ['holidays'],
  queryFn: () => api<{ bookingWindowEnd: string; holidays: { date: string; name: string }[] }>('/holidays'),
  staleTime: Infinity,
});

export const myClinicsQuery = queryOptions({
  queryKey: ['me', 'clinics'],
  queryFn: () => api<Clinic[]>('/me/clinics'),
});

export interface AppointmentFilters {
  date?: string;
  patientId?: string;
}

export const appointmentsQuery = (clinicId: string, filters: AppointmentFilters) =>
  queryOptions({
    queryKey: ['clinics', clinicId, 'appointments', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.date) params.set('date', filters.date);
      if (filters.patientId) params.set('patientId', filters.patientId);
      const qs = params.toString();
      return api<StaffAppointment[]>(`/clinics/${clinicId}/appointments${qs ? `?${qs}` : ''}`);
    },
  });

export const appointmentQuery = (clinicId: string, id: string) =>
  queryOptions({
    queryKey: ['clinics', clinicId, 'appointment', id],
    queryFn: () => api<StaffAppointment>(`/clinics/${clinicId}/appointments/${id}`),
  });

export const slotsQuery = (clinicId: string, date: string) =>
  queryOptions({
    queryKey: ['clinics', clinicId, 'slots', date],
    queryFn: () => api<SlotsResponse>(`/clinics/${clinicId}/appointments/available-slots?date=${date}`),
  });

export const patientSearchQuery = (search: string) =>
  queryOptions({
    queryKey: ['patients', search],
    queryFn: () => api<PatientOption[]>(`/patients?search=${encodeURIComponent(search)}`),
    enabled: search.trim().length >= 3,
    staleTime: 30_000,
  });

export const staffReportQuery = (clinicId: string, id: string) =>
  queryOptions({
    queryKey: ['clinics', clinicId, 'report', id],
    queryFn: () => api<MedicalReport>(`/clinics/${clinicId}/medical-reports/${id}`),
    retry: false,
  });

export const patientAppointmentsQuery = queryOptions({
  queryKey: ['patient', 'appointments'],
  queryFn: () => api<PatientAppointment[]>('/me/appointments'),
  // o paciente vê um laudo recém-publicado ao voltar para a aba
  refetchOnWindowFocus: true,
});

export const patientReportQuery = (id: string) =>
  queryOptions({
    queryKey: ['patient', 'report', id],
    queryFn: () => api<PatientMedicalReport>(`/me/medical-reports/${id}`),
    retry: false,
  });
