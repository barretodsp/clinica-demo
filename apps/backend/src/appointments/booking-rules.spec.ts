import { localDayRange, localToUtc } from '../common/clinic-time.js';
import { HOLIDAYS } from '../database/seed/holidays.data.js';
import { bookableSlotsOfDay, checkBookable } from './booking-rules.js';

const holidays = new Set(HOLIDAYS.map((h) => h.date));
const NOW = new Date('2026-12-01T12:00:00Z'); // terça-feira
const SP = 'America/Sao_Paulo' as const;
const RBR = 'America/Rio_Branco' as const;
const MAO = 'America/Manaus' as const;

const check = (iso: string | Date, timezone: typeof SP | typeof RBR | typeof MAO = SP) =>
  checkBookable({ startsAt: new Date(iso), timezone, now: NOW, holidays });

describe('checkBookable', () => {
  it('aceita um slot válido no futuro, em dia útil, dentro do expediente', () => {
    expect(check(localToUtc('2026-12-02', 9 * 60, SP))).toBeNull();
  });

  it('rejeita agendamento no passado (IN_PAST)', () => {
    expect(check('2026-11-30T13:00:00Z')).toBe('IN_PAST');
    expect(check(NOW)).toBe('IN_PAST');
  });

  it('rejeita horário fora do alinhamento de 30 min (NOT_ALIGNED)', () => {
    expect(check('2026-12-02T13:15:00Z')).toBe('NOT_ALIGNED');
    expect(check('2026-12-02T13:00:30Z')).toBe('NOT_ALIGNED');
  });

  it('rejeita sábado e domingo no fuso da clínica (WEEKEND)', () => {
    expect(check(localToUtc('2026-12-05', 10 * 60, SP))).toBe('WEEKEND');
    expect(check(localToUtc('2026-12-06', 10 * 60, SP))).toBe('WEEKEND');
  });

  it('rejeita feriado nacional, inclusive Carnaval e Corpus Christi (HOLIDAY)', () => {
    expect(check(localToUtc('2026-12-25', 10 * 60, SP))).toBe('HOLIDAY');
    expect(check(localToUtc('2027-02-09', 10 * 60, SP))).toBe('HOLIDAY');
    expect(check(localToUtc('2027-05-27', 10 * 60, SP))).toBe('HOLIDAY');
  });

  it('avalia o expediente no horário LOCAL de cada clínica (bordas 08:00, 18:30 e 19:00)', () => {
    expect(check(localToUtc('2026-12-02', 8 * 60, RBR), RBR)).toBeNull();
    expect(check(localToUtc('2026-12-02', 18 * 60 + 30, RBR), RBR)).toBeNull();
    expect(check(localToUtc('2026-12-02', 19 * 60, RBR), RBR)).toBe('OUTSIDE_BUSINESS_HOURS');
    // 07:30 em Rio Branco = 09:30 em Brasília: rejeitado mesmo assim
    const rioBranco0730 = localToUtc('2026-12-02', 7 * 60 + 30, RBR);
    expect(rioBranco0730.toISOString()).toBe(localToUtc('2026-12-02', 9 * 60 + 30, SP).toISOString());
    expect(check(rioBranco0730, RBR)).toBe('OUTSIDE_BUSINESS_HOURS');
    expect(check(rioBranco0730, SP)).toBeNull();
  });

  it('rejeita datas após 31/12/2028 (BEYOND_BOOKING_WINDOW)', () => {
    expect(check(localToUtc('2029-01-02', 10 * 60, SP))).toBe('BEYOND_BOOKING_WINDOW');
    expect(check(localToUtc('2028-12-29', 10 * 60, SP))).toBeNull();
  });

  it('considera a virada de dia no fuso da clínica (sexta 21:00 em Manaus é sábado em UTC)', () => {
    // sexta 2026-12-04 18:30 em Manaus = 22:30 UTC (ainda sexta) → válido
    expect(check(localToUtc('2026-12-04', 18 * 60 + 30, MAO), MAO)).toBeNull();
  });
});

describe('slots do dia', () => {
  it('gera 22 slots de 30 min (08:00–18:30) em dia útil futuro e nenhum em feriado/fim de semana', () => {
    expect(bookableSlotsOfDay('2026-12-02', SP, NOW, holidays)).toHaveLength(22);
    expect(bookableSlotsOfDay('2026-12-25', SP, NOW, holidays)).toHaveLength(0);
    expect(bookableSlotsOfDay('2026-12-05', SP, NOW, holidays)).toHaveLength(0);
  });

  it('converte o dia local no intervalo UTC correto por fuso', () => {
    expect(localDayRange('2026-12-02', SP).start.toISOString()).toBe('2026-12-02T03:00:00.000Z');
    expect(localDayRange('2026-12-02', MAO).start.toISOString()).toBe('2026-12-02T04:00:00.000Z');
    expect(localDayRange('2026-12-02', RBR).end.toISOString()).toBe('2026-12-03T05:00:00.000Z');
  });
});
