import { TZDate } from '@date-fns/tz';
import {
  BUSINESS_END_MINUTES,
  BUSINESS_START_MINUTES,
  SLOT_MINUTES,
  type ClinicTimezone,
} from './domain.js';

/**
 * Conversões entre instantes UTC e o horário local da clínica.
 * O banco guarda UTC (timestamptz); expediente, feriados e "dia" são avaliados no fuso da clínica.
 */

export interface LocalParts {
  /** Data civil local (YYYY-MM-DD). */
  date: string;
  /** 0 = domingo ... 6 = sábado. */
  weekday: number;
  /** Minutos desde 00:00 local. */
  minutes: number;
  seconds: number;
  milliseconds: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    });
    formatters.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(instant: Date, tz: ClinicTimezone | string): LocalParts {
  const parts = Object.fromEntries(formatter(tz).formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS[parts.weekday],
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    seconds: Number(parts.second),
    milliseconds: instant.getUTCMilliseconds(),
  };
}

/** Instante UTC de uma data civil + minutos locais no fuso da clínica. */
export function localToUtc(date: string, minutes: number, tz: ClinicTimezone | string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const local = new TZDate(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0, tz);
  return new Date(local.getTime());
}

/** Intervalo UTC [start, end) que corresponde ao dia civil local da clínica. */
export function localDayRange(date: string, tz: ClinicTimezone | string): { start: Date; end: Date } {
  return { start: localToUtc(date, 0, tz), end: localToUtc(addDays(date, 1), 0, tz) };
}

/** Soma dias a uma data civil (YYYY-MM-DD), sem fuso. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Dia da semana de uma data civil (0 = domingo). */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Todos os slots (UTC) de um dia de expediente: 08:00 ... 18:30 locais. */
export function businessSlots(date: string, tz: ClinicTimezone | string): Date[] {
  const slots: Date[] = [];
  for (let min = BUSINESS_START_MINUTES; min + SLOT_MINUTES <= BUSINESS_END_MINUTES; min += SLOT_MINUTES) {
    slots.push(localToUtc(date, min, tz));
  }
  return slots;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
