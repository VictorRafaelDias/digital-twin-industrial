/* Dinheiro: faixas de preço estimadas (nunca cotação) para o custo de uma melhoria. */
import type { MachineType } from '../types';
import { fmt } from './format';

export type Range = { min: number; max: number };

export const money = (v: number): string =>
  v >= 1e6 ? 'R$ ' + fmt(v / 1e6, 1) + ' mi' : 'R$ ' + fmt(Math.round(v / 1000)) + ' mil';

export const moneyRange = (c: Range | null | undefined): string =>
  c && c.max ? `${money(c.min)} a ${money(c.max)}` : 'consultar o fabricante';

/** Faixa de preço de `q` unidades da máquina. */
export const costOf = (t: MachineType, q = 1): Range | null =>
  t.cost ? { min: t.cost.min * q, max: t.cost.max * q } : null;

export const sumRanges = (list: (Range | null | undefined)[]): Range =>
  list.reduce<Range>((acc, c) => (c ? { min: acc.min + c.min, max: acc.max + c.max } : acc), { min: 0, max: 0 });
