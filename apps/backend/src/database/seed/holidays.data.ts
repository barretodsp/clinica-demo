/**
 * Feriados nacionais 2026–2028 (lista estática; sem cálculo de feriados móveis).
 * Carnaval e Corpus Christi são pontos facultativos, mas bloqueiam a agenda por decisão de negócio.
 * Pendência documentada: atualizar a lista anualmente.
 */
const FIXED: [string, string][] = [
  ['01-01', 'Confraternização Universal'],
  ['04-21', 'Tiradentes'],
  ['05-01', 'Dia do Trabalho'],
  ['09-07', 'Independência do Brasil'],
  ['10-12', 'Nossa Senhora Aparecida'],
  ['11-02', 'Finados'],
  ['11-15', 'Proclamação da República'],
  ['11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
  ['12-25', 'Natal'],
];

const MOVABLE: Record<number, [string, string][]> = {
  2026: [['02-16', 'Carnaval'], ['02-17', 'Carnaval'], ['04-03', 'Sexta-feira Santa'], ['06-04', 'Corpus Christi']],
  2027: [['02-08', 'Carnaval'], ['02-09', 'Carnaval'], ['03-26', 'Sexta-feira Santa'], ['05-27', 'Corpus Christi']],
  2028: [['02-28', 'Carnaval'], ['02-29', 'Carnaval'], ['04-14', 'Sexta-feira Santa'], ['06-15', 'Corpus Christi']],
};

export const HOLIDAYS: { date: string; name: string }[] = [2026, 2027, 2028]
  .flatMap((year) => [...FIXED, ...MOVABLE[year]].map(([md, name]) => ({ date: `${year}-${md}`, name })))
  .sort((a, b) => a.date.localeCompare(b.date));
