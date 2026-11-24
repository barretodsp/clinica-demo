/** Constantes de domínio compartilhadas (banco, regras e respostas da API). */

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;
export type Uf = (typeof UFS)[number];

/** Fusos suportados (Noronha descartado). Sem horário de verão no Brasil desde 2019. */
export const CLINIC_TIMEZONES = ['America/Sao_Paulo', 'America/Manaus', 'America/Rio_Branco'] as const;
export type ClinicTimezone = (typeof CLINIC_TIMEZONES)[number];

export const TIMEZONE_LABELS: Record<ClinicTimezone, string> = {
  'America/Sao_Paulo': 'horário de Brasília',
  'America/Manaus': 'horário do Amazonas',
  'America/Rio_Branco': 'horário do Acre',
};

export const USER_ROLES = ['ATTENDANT', 'DOCTOR', 'PATIENT'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const APPOINTMENT_STATUSES = ['SCHEDULED', 'CANCELLED'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const REPORT_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Agenda: slots fixos de 30 min, seg–sex, 08:00–19:00 local (último slot 18:30). */
export const SLOT_MINUTES = 30;
export const BUSINESS_START_MINUTES = 8 * 60;
export const BUSINESS_END_MINUTES = 19 * 60;
/** Último dia agendável: último ano com feriados cadastrados. */
export const BOOKING_WINDOW_END = '2028-12-31';
