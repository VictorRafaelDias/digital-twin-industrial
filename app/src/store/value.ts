/* Valor estimado dos equipamentos de cada versão e a diferença entre duas versões.
   Os preços são faixas tiradas de anúncios de fornecedores (nunca cotação) e as máquinas sem preço ficam de fora da soma. */
import { costOf, money, sumRanges, type Range } from '../engine/cost';
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
