/* Os números e as linhas dos gráficos da fábrica (usados no Dash, no Relatório e no PDF). Cálculo puro, sem tela. */
import { COLORS, riskColor, sliceColor, stateColor, type BarRow, type Slice } from '../components/Charts';
import { bestProduction, simulate } from '../engine/simulate';
import { machineTemp } from '../engine/thermal';
import { daysSince, STATUS_SHORT, wearEffects } from '../engine/wear';
import type { Catalog, FEdge, FNode, SimContext, SimResult } from '../types';
import { machineNames, realFlow } from './versions';

export const WEAR_COLOR = { ok: COLORS.ok, atencao: COLORS.warn, manutencao_atrasada: COLORS.bad, fim_de_vida: COLORS.bad } as const;

export interface ChartData {
  names: Record<string, string>; sim: SimResult; flow: Record<string, number>; best: number;
  capRows: BarRow[]; queueRows: BarRow[]; riskRows: BarRow[]; tempRows: BarRow[]; wearRows: BarRow[]; slices: Slice[];
  hasWear: boolean; temps: Record<string, number>;
}

export function computeChartData(p: { nodes: FNode[]; edges: FEdge[]; catalog: Catalog; ambient: number; ctx: SimContext }): ChartData {
  const { nodes, edges, catalog, ambient, ctx } = p;
  const sim = simulate(nodes, edges, ctx);
  const names = machineNames(nodes, catalog);
  const flow = realFlow(nodes.map((n) => n.id), Object.fromEntries(nodes.map((n) => [n.id, sim.res[n.id].eff])), edges);
  const best = bestProduction(nodes, edges, { ...ctx, run: undefined });
  const temps: Record<string, number> = {};
  nodes.forEach((n) => { temps[n.id] = machineTemp(catalog[n.type], n, sim.res[n.id], ambient); });
  const hasWear = nodes.some((n) => (n.ageYears ?? 0) > 0);   // alguma máquina não é nova
  return {
    names, sim, flow, best, temps, hasWear,
    capRows: nodes.map((n) => ({ label: names[n.id], a: sim.res[n.id].cap, b: sim.res[n.id].eff, color: stateColor(sim.res[n.id].state) })),
    queueRows: nodes.map((n) => ({ label: names[n.id], a: sim.res[n.id].queue, color: COLORS.warn })),
    riskRows: nodes.map((n) => ({ label: names[n.id], a: sim.res[n.id].risk * 100, color: riskColor(sim.res[n.id].risk), note: sim.res[n.id].state === 'normal' ? '' : sim.res[n.id].state })),
    tempRows: nodes.map((n) => ({ label: names[n.id], a: temps[n.id], color: temps[n.id] - ambient > 45 || sim.res[n.id].state === 'falha' ? COLORS.bad : temps[n.id] - ambient > 25 ? COLORS.warn : COLORS.teal })),
    wearRows: nodes.map((n) => {
      const w = wearEffects(catalog[n.type], n.ageYears ?? 0, daysSince(n.maintDate));
      return { label: names[n.id], a: Math.min(100, w.lifeUsed * 100), color: WEAR_COLOR[w.status], note: w.status === 'ok' ? '' : STATUS_SHORT[w.status] };
    }),
    slices: nodes.map((n, i) => ({ label: names[n.id], value: sim.res[n.id].energy, color: sliceColor(i) })).sort((a, b) => b.value - a.value),
  };
}
