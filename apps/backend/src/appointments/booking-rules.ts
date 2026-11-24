import { addDays, businessSlots, localParts, weekdayOf } from '../common/clinic-time.js';
import {
  BOOKING_WINDOW_END,
  BUSINESS_END_MINUTES,
  BUSINESS_START_MINUTES,
  SLOT_MINUTES,
  type ClinicTimezone,
} from '../common/domain.js';

/** Motivos de recusa de um horário (422), na ordem em que são avaliados. */
export type BookingViolation =
  | 'NOT_ALIGNED'
  | 'IN_PAST'
  | 'BEYOND_BOOKING_WINDOW'
  | 'WEEKEND'
  | 'HOLIDAY'
  | 'OUTSIDE_BUSINESS_HOURS';

export const BOOKING_VIOLATION_MESSAGES: Record<BookingViolation, string> = {
  NOT_ALIGNED: 'O horário deve começar em :00 ou :30 (slots de 30 minutos).',
  IN_PAST: 'Não é possível agendar no passado.',
  BEYOND_BOOKING_WINDOW: `Agendamentos são permitidos até ${BOOKING_WINDOW_END.split('-').reverse().join('/')}.`,
  WEEKEND: 'A clínica não atende aos sábados e domingos.',
  HOLIDAY: 'A clínica não atende em feriados.',
  OUTSIDE_BUSINESS_HOURS: 'Fora do expediente (segunda a sexta, 08:00 às 19:00, horário local da clínica).',
};

export interface BookingCheck {
  startsAt: Date;
  timezone: ClinicTimezone;
  now: Date;
  /** Datas civis (YYYY-MM-DD) de feriado. */
  holidays: ReadonlySet<string>;
}

/** Regra pura: retorna o primeiro motivo de recusa, ou null se o horário é agendável. */
export function checkBookable({ startsAt, timezone, now, holidays }: BookingCheck): BookingViolation | null {
  if (Number.isNaN(startsAt.getTime())) return 'NOT_ALIGNED';
  if (startsAt.getTime() % (SLOT_MINUTES * 60 * 1000) !== 0) return 'NOT_ALIGNED';
  if (startsAt.getTime() <= now.getTime()) return 'IN_PAST';
  const local = localParts(startsAt, timezone);
  if (local.date > BOOKING_WINDOW_END) return 'BEYOND_BOOKING_WINDOW';
  if (local.weekday === 0 || local.weekday === 6) return 'WEEKEND';
  if (holidays.has(local.date)) return 'HOLIDAY';
  if (local.minutes < BUSINESS_START_MINUTES || local.minutes + SLOT_MINUTES > BUSINESS_END_MINUTES) {
    return 'OUTSIDE_BUSINESS_HOURS';
  }
  return null;
}

/** O dia (local) é um dia de atendimento? */
export function isBusinessDay(date: string, holidays: ReadonlySet<string>): boolean {
  const wd = weekdayOf(date);
  return wd !== 0 && wd !== 6 && !holidays.has(date) && date <= BOOKING_WINDOW_END;
}

/** Slots futuros de um dia (UTC), já sem os passados; vazio em dia sem atendimento. */
export function bookableSlotsOfDay(
  date: string,
  timezone: ClinicTimezone,
  now: Date,
  holidays: ReadonlySet<string>,
): Date[] {
  if (!isBusinessDay(date, holidays)) return [];
  return businessSlots(date, timezone).filter((s) => checkBookable({ startsAt: s, timezone, now, holidays }) === null);
}

/** Próximos N dias de atendimento a partir de `fromDate` (inclusive). Usado pelo seed. */
export function nextBusinessDays(fromDate: string, count: number, holidays: ReadonlySet<string>): string[] {
  const days: string[] = [];
  let d = fromDate;
  while (days.length < count && d <= BOOKING_WINDOW_END) {
    if (isBusinessDay(d, holidays)) days.push(d);
    d = addDays(d, 1);
  }
  return days;
}
