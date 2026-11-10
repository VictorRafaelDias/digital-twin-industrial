/* Valor estimado dos equipamentos de cada versão e a diferença entre duas versões.
   Os preços são faixas tiradas de anúncios de fornecedores (nunca cotação) e as máquinas sem preço ficam de fora da soma. */
import { costOf, money, sumRanges, type Range } from '../engine/cost';
import { fmt } from '../engine/format';
import type { Catalog } from '../types';
import type { ReportVersion } from './versions';

export interface ValueRow {
  id: string; name: string; qtyA: number | null; qtyB: number | null;
  a: Range | null; b: Range | null;     // valor da máquina em cada versão (null = não existe ou sem preço)
  priced: boolean;                       // a máquina tem preço no catálogo?
  delta: Range | null;                   // B − A (só das máquinas com preço)
}
export interface ValueCompare {
  rows: ValueRow[]; totalA: Range; totalB: Range; delta: Range;
  unpriced: string[];                    // nomes das máquinas sem preço (não entram na soma)
  /** custo adicional (ponto médio) por 1.000 garrafas/h de ganho; null se não houve ganho ou não houve gasto a mais */
  perThousand: number | null;
  gainPerHour: number;
}

const zero: Range = { min: 0, max: 0 };
const sub = (x: Range, y: Range): Range => ({ min: x.min - y.min, max: x.max - y.max });

/** Valor estimado (faixa) de uma versão: soma das unidades × preço de cada máquina que tem preço. */
export function versionValue(v: ReportVersion, catalog: Catalog): Range {
  return sumRanges(v.machines.map((m) => (catalog[m.type] ? costOf(catalog[m.type], m.qty) : null)));
}

export function valueCompare(a: ReportVersion, b: ReportVersion, catalog: Catalog): ValueCompare {
  const ids = [...new Set([...b.machines.map((m) => m.id), ...a.machines.map((m) => m.id)])];
  const rows: ValueRow[] = ids.map((id) => {
    const ma = a.machines.find((m) => m.id === id), mb = b.machines.find((m) => m.id === id);
    const t = catalog[(mb ?? ma)!.type];
    const priced = !!t?.cost && t.cost.max > 0;
    const va = ma && priced ? costOf(t, ma.qty) : null, vb = mb && priced ? costOf(t, mb.qty) : null;
    return { id, name: (mb ?? ma)!.name, qtyA: ma ? ma.qty : null, qtyB: mb ? mb.qty : null, a: va, b: vb, priced, delta: priced ? sub(vb ?? zero, va ?? zero) : null };
  });
  const totalA = sumRanges(rows.map((r) => r.a)), totalB = sumRanges(rows.map((r) => r.b));
  const delta = sub(totalB, totalA);
  const gainPerHour = b.prod - a.prod;
  const mid = (delta.min + delta.max) / 2;
  return {
    rows, totalA, totalB, delta, unpriced: rows.filter((r) => !r.priced).map((r) => r.name), gainPerHour,
    perThousand: gainPerHour > 0 && mid > 0 ? mid / (gainPerHour / 1000) : null,
  };
}

/** "+R$ 40 mil a +R$ 140 mil", "−R$ 10 mil a R$ 0", "sem mudança". */
export function moneyDelta(r: Range | null): string {
  if (!r) return '—';
  if (r.min === 0 && r.max === 0) return 'sem mudança';
  const f = (v: number) => (v === 0 ? 'R$ 0' : (v > 0 ? '+' : '−') + money(Math.abs(v)));
  return `${f(r.min)} a ${f(r.max)}`;
}

// ---------------------------------------------------------------------------------------------------------
// Perspectiva de receita: quanto cada versão rende e quanto a melhoria de produção vale em dinheiro (estimativa didática, nunca previsão)
// ---------------------------------------------------------------------------------------------------------

/** Dados que a pessoa pode ajustar: preço por garrafa, horas de operação por ano e % de lucro sobre o preço. */
export interface Econ { price: number | null; hoursYear: number; margin: number }

export interface GainReais {
  gainPerHour: number;          // garrafas/h a mais (negativo = perdeu)
  bottlesYear: number;          // garrafas a mais por ano
  revenueYear: number;          // R$ por ano, no preço informado (preço de prateleira: é um teto do que a fábrica recebe)
  profitYear: number;           // R$ por ano, se sobrar `margin`% desse preço (teto)
  invest: number | null;        // investimento adicional (ponto médio da faixa do catálogo)
  paybackMonths: number | null; // meses para recuperar o investimento do catálogo
  investRef: number | null;     // investimento com o custo real de referência da empresa (quando existe)
  paybackRefMonths: number | null;
}

/** Quanto a diferença de produção entre duas versões vale por ano. `refPerThousand` = custo real publicado por 1.000 garrafas/h (opcional). */
export function gainReais(a: ReportVersion, b: ReportVersion, delta: Range, e: Econ, refPerThousand?: number | null): GainReais | null {
  if (e.price == null || !(e.price > 0) || !(e.hoursYear > 0)) return null;
  const gainPerHour = b.prod - a.prod;
  const bottlesYear = gainPerHour * e.hoursYear;
  const revenueYear = bottlesYear * e.price;
  const profitYear = revenueYear * (Math.max(0, e.margin) / 100);
  const mid = (delta.min + delta.max) / 2;
  const invest = mid > 0 ? mid : null;
  const investRef = refPerThousand && gainPerHour > 0 ? (refPerThousand * gainPerHour) / 1000 : null;
  const months = (cost: number | null) => (cost != null && profitYear > 0 ? cost / (profitYear / 12) : null);
  return { gainPerHour, bottlesYear, revenueYear, profitYear, invest, paybackMonths: months(invest), investRef, paybackRefMonths: months(investRef) };
}

/** "R$ 850", "R$ 40 mil", "R$ 3,2 mi", "R$ 1,4 bi" (com sinal − quando negativo). */
export function moneyBig(v: number): string {
  const x = Math.abs(v), sign = v < 0 ? '−' : '';
  if (x >= 1e9) return `${sign}R$ ${fmt(x / 1e9, 1)} bi`;
  if (x >= 1e6) return `${sign}R$ ${fmt(x / 1e6, 1)} mi`;
  if (x >= 1e3) return `${sign}R$ ${fmt(Math.round(x / 1e3))} mil`;
  return `${sign}R$ ${fmt(Math.round(x))}`;
}

/** "menos de 1 mês", "5,3 meses", "2,1 anos". */
export function paybackText(months: number | null): string {
  if (months == null) return '—';
  if (months < 1) return 'menos de 1 mês';
  if (months >= 24) return `${fmt(months / 12, 1)} anos`;
  return `${fmt(months, 1)} meses`;
}

/** Valores padrão: 4.000 h/ano (o mesmo do desgaste) e 15% (margem operacional pública da Coca-Cola FEMSA: 14,3% no 3T25 e 16,1% no 4T25 sem ganhos extraordinários). */
export const ECON_DEFAULTS = {
  hoursYear: 4000, margin: 15,
  /** calendário padrão: 2 turnos de 8 h (16 h por dia), de segunda a sexta, o ano todo ≈ 4.170 h por ano */
  mode: 'calendario' as 'calendario' | 'horas', hoursDay: 16,
  days: [true, true, true, true, true, false, false],                                   // segunda a domingo
  months: [true, true, true, true, true, true, true, true, true, true, true, true],    // janeiro a dezembro
};

export const DAY_NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
export const DAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
export const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
/** dias de cada mês (fevereiro com 28,25: média de 4 anos), para o ano médio ter 365,25 dias */
const DAYS_IN_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Como a pessoa informa o funcionamento da fábrica: por calendário (horas por dia + dias da semana + meses) ou direto em horas por ano. */
export interface Schedule { mode: 'calendario' | 'horas'; hoursYear: number; hoursDay: number; days: boolean[]; months: boolean[] }

/** Dias de funcionamento por ano: cada mês marcado × a fração de dias da semana marcados (n/7). Ex.: segunda a sexta, o ano todo = 365,25 × 5/7 ≈ 261 dias. */
export function operatingDays(days: boolean[], months: boolean[]): number {
  const frac = days.filter(Boolean).length / 7;
  return months.reduce((s, on, i) => (on ? s + DAYS_IN_MONTH[i] * frac : s), 0);
}

/** Horas de operação por ano: horas por dia × dias de funcionamento, ou o valor digitado direto. */
export function scheduleHours(sc: Schedule): number {
  return sc.mode === 'horas' ? sc.hoursYear : sc.hoursDay * operatingDays(sc.days, sc.months);
}

/** "16 h por dia, segunda a sexta, 12 meses (261 dias → 4.174 h por ano)", ou "4.000 h por ano (digitado)". */
export function scheduleText(sc: Schedule): string {
  if (sc.mode === 'horas') return `${fmt(sc.hoursYear)} h por ano (digitado direto)`;
  const nd = sc.days.filter(Boolean).length, nm = sc.months.filter(Boolean).length;
  const dias = nd === 7 ? 'todos os dias' : nd === 0 ? 'nenhum dia' : sc.days.map((on, i) => (on ? DAY_SHORT[i] : '')).filter(Boolean).join(', ');
  const seq = sc.days.slice(0, nd).every(Boolean) && nd > 1 && nd < 7 ? `${DAY_SHORT[0]} a ${DAY_SHORT[nd - 1]}` : dias;
  return `${fmt(sc.hoursDay, 1).replace(/,0$/, '')} h por dia, ${seq}, ${nm} ${nm === 1 ? 'mês' : 'meses'} (${fmt(operatingDays(sc.days, sc.months))} dias → ${fmt(scheduleHours(sc))} h por ano)`;
}

/** O calendário guardado na loja, pronto para calcular. */
export function scheduleOf(s: { econMode: 'calendario' | 'horas'; econHours: number; econHoursDay: number; econDays: boolean[]; econMonths: boolean[] }): Schedule {
  return { mode: s.econMode, hoursYear: s.econHours, hoursDay: s.econHoursDay, days: s.econDays, months: s.econMonths };
}

/** Preço por garrafa que vale agora: o digitado ou, se não houver, o ponto médio da faixa publicada do exemplo real carregado. */
export function effectivePrice(econPrice: number | null, ref?: { min: number; max: number } | null): number | null {
  if (econPrice != null && econPrice > 0) return econPrice;
  return ref ? Math.round(((ref.min + ref.max) / 2) * 100) / 100 : null;
}

/** O que UMA versão rende por ano com os números informados (produção/h × horas × preço × lucro %). */
export interface VersionProfit { bph: number; bottlesYear: number; revenueYear: number; profitYear: number; equipment: number }

export function versionProfit(v: ReportVersion, e: Econ, catalog: Catalog): VersionProfit | null {
  if (e.price == null || !(e.price > 0) || !(e.hoursYear > 0)) return null;
  const bottlesYear = v.prod * e.hoursYear, revenueYear = bottlesYear * e.price;
  const val = versionValue(v, catalog);
  return { bph: v.prod, bottlesYear, revenueYear, profitYear: revenueYear * (Math.max(0, e.margin) / 100), equipment: (val.min + val.max) / 2 };
}
