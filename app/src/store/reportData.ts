/* Os números e as linhas dos gráficos da fábrica (usados no Dash, no Relatório e no PDF). Cálculo puro, sem tela. */
import { COLORS, riskColor, sliceColor, stateColor, type BarRow, type Slice } from '../components/Charts';
import { bestProduction, simulate } from '../engine/simulate';
import { machineTemp } from '../engine/thermal';
import type { Catalog, FEdge, FNode, SimContext, SimResult, WearInfo } from '../types';
import { machineNames, realFlow } from './versions';

export const WEAR_COLOR = { ok: COLORS.ok, atencao: COLORS.warn, manutencao_atrasada: COLORS.bad, fim_de_vida: COLORS.bad } as const;

export interface ChartData {
  names: Record<string, string>; sim: SimResult; flow: Record<string, number>; best: number;
  capRows: BarRow[]; queueRows: BarRow[]; riskRows: BarRow[]; tempRows: BarRow[]; wearRows: BarRow[]; slices: Slice[];
  hasWear: boolean; temps: Record<string, number>;
}

export function computeChartData(p: { nodes: FNode[]; edges: FEdge[]; catalog: Catalog; ambient: number; wear: Record<string, WearInfo>; server: boolean; ctx: SimContext }): ChartData {
  const { nodes, edges, catalog, ambient, wear, server, ctx } = p;
  const sim = simulate(nodes, edges, ctx);
  const names = machineNames(nodes, catalog);
  const flow = realFlow(nodes.map((n) => n.id), Object.fromEntries(nodes.map((n) => [n.id, sim.res[n.id].eff])), edges);
  const best = bestProduction(nodes, edges, { ...ctx, run: undefined });
  const temps: Record<string, number> = {};
  nodes.forEach((n) => { temps[n.id] = machineTemp(catalog[n.type], n, sim.res[n.id], ambient); });
  const hasWear = server && nodes.some((n) => wear[n.id]);
  return {
    names, sim, flow, best, temps, hasWear,
    capRows: nodes.map((n) => ({ label: names[n.id], a: sim.res[n.id].cap, b: sim.res[n.id].eff, color: stateColor(sim.res[n.id].state) })),
    queueRows: nodes.map((n) => ({ label: names[n.id], a: sim.res[n.id].queue, color: COLORS.warn })),
    riskRows: nodes.map((n) => ({ label: names[n.id], a: sim.res[n.id].risk * 100, color: riskColor(sim.res[n.id].risk), note: sim.res[n.id].state === 'normal' ? '' : sim.res[n.id].state })),
    tempRows: nodes.map((n) => ({ label: names[n.id], a: temps[n.id], color: temps[n.id] - ambient > 45 || sim.res[n.id].state === 'falha' ? COLORS.bad : temps[n.id] - ambient > 25 ? COLORS.warn : COLORS.teal })),
    wearRows: nodes.filter((n) => wear[n.id]).map((n) => ({
      label: names[n.id], a: Math.min(100, wear[n.id].life_used_pct), color: WEAR_COLOR[wear[n.id].status], note: wear[n.id].status === 'ok' ? '' : wear[n.id].status_text.split(':')[0],
    })),
    slices: nodes.map((n, i) => ({ label: names[n.id], value: sim.res[n.id].energy, color: sliceColor(i) })).sort((a, b) => b.value - a.value),
  };
}
