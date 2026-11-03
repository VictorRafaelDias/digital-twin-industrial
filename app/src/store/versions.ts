/* Versões do relatório (V1, V2...): uma "foto" da fábrica com os números que a simulação dá, para comparar antes × depois.
   Tudo aqui é cálculo puro (sem tela e sem servidor), por isso dá para testar sozinho. */
import { fmt, fv } from '../engine/format';
import { bnName, simulate } from '../engine/simulate';
import type { Catalog, FEdge, FNode, SimContext } from '../types';

export interface VersionMachine {
  id: string; type: string; name: string; value: number; qty: number; off: boolean;
  ageYears?: number; maintMonths?: number;   // idade e meses desde a manutenção (versões vindas do servidor não trazem)
  cap: number;   // o que a máquina consegue entregar (capacidade)
  eff: number;   // o que realmente passa por ela com a fábrica funcionando (fluxo real, limitado pelas máquinas à frente)
}
export interface ReportVersion {
  n: number;                                 // o número que aparece: V1, V2...
  label: string;                             // o que é esta versão ("Antes das mudanças", "Resultado do Play...")
  kind: 'auto' | 'manual' | 'play' | 'servidor';
  at: string;                                // data e hora em que foi guardada
  prod: number; risk: number; energy: number; // produção/h, risco máximo (0 a 1), energia em kW
  costPerBottle: number | null;              // R$ de energia por garrafa
  bottleneck: string | null;
  machines: VersionMachine[];
  played?: { produced: number; durMin: number }; // se um Play terminou com esta configuração
}

/** Fluxo real que passa por cada máquina quando a fábrica anda no ritmo que as máquinas à frente aguentam (o excesso fica parado na fila e
 *  não "roda" de verdade). Anda de trás para frente: a última máquina entrega o que sai dela; cada anterior entrega o menor valor entre
 *  o que ela consegue e o que as seguintes absorvem. Quando duas máquinas alimentam a mesma, dividimos em proporção ao que cada uma entrega. */
export function realFlow(ids: string[], out: Record<string, number>, edges: { from: string; to: string }[]): Record<string, number> {
  const known = new Set(ids);
  const next: Record<string, string[]> = {}, prev: Record<string, string[]> = {};
  edges.filter((e) => known.has(e.from) && known.has(e.to)).forEach((e) => { (next[e.from] ||= []).push(e.to); (prev[e.to] ||= []).push(e.from); });
  const flow: Record<string, number> = {}, state: Record<string, 1 | 2> = {};
  const visit = (id: string): number => {
    if (id in flow) return flow[id];
    if (state[id] === 1) return out[id] ?? 0;               // ciclo (não deveria existir): usa o que sai
    state[id] = 1;
    const mine = out[id] ?? 0;
    const succ = next[id] || [];
    let absorbed = mine;
    if (succ.length) {
      absorbed = succ.reduce((sum, s) => {
        const total = (prev[s] || []).reduce((a, p) => a + (out[p] ?? 0), 0) || 1;
        return sum + visit(s) * (mine / total);
      }, 0);
    }
    state[id] = 2;
    return (flow[id] = Math.min(mine, absorbed));
  };
  ids.forEach(visit);
  return flow;
}

/** Quanto da capacidade da máquina está sendo usada (0 a 1). Máquina desligada ou sem capacidade: 0. */
export const utilization = (cap: number, eff: number): number => (cap > 0 ? Math.max(0, Math.min(1, eff / cap)) : 0);
export type UtilLevel = 'ociosa' | 'folga' | 'bem' | 'limite';
/** Faixas didáticas: abaixo de 50% sobra muita capacidade; de 50 a 85% tem folga; de 85 a 98% está bem aproveitada; acima disso está no limite (provável gargalo). */
export const utilLevel = (u: number): UtilLevel => (u < 0.5 ? 'ociosa' : u < 0.85 ? 'folga' : u < 0.98 ? 'bem' : 'limite');
export const UTIL_TEXT: Record<UtilLevel, string> = { ociosa: 'sobra muita capacidade', folga: 'tem folga', bem: 'bem aproveitada', limite: 'no limite' };

/** Nomes das máquinas do desenho: repete o número quando há mais de uma do mesmo tipo (ex.: "Esteira 1", "Esteira 2"). */
export function machineNames(nodes: FNode[], catalog: Catalog): Record<string, string> {
  const count: Record<string, number> = {}, seen: Record<string, number> = {}, out: Record<string, string> = {};
  nodes.forEach((n) => { count[n.type] = (count[n.type] || 0) + 1; });
  nodes.forEach((n) => { seen[n.type] = (seen[n.type] || 0) + 1; out[n.id] = (catalog[n.type]?.name ?? n.type) + (count[n.type] > 1 ? ` ${seen[n.type]}` : ''); });
  return out;
}

const stamp = () => new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Tira a "foto" da fábrica agora (a conta é a do regime normal, sem o relógio do Play). */
export function makeVersion(n: number, label: string, kind: ReportVersion['kind'], nodes: FNode[], edges: FEdge[], ctx: SimContext, tariff: number): ReportVersion {
  const sim = simulate(nodes, edges, { ...ctx, run: undefined });
  const names = machineNames(nodes, ctx.catalog);
  const flow = realFlow(nodes.map((x) => x.id), Object.fromEntries(nodes.map((x) => [x.id, sim.res[x.id].eff])), edges);
  return {
    n, label, kind, at: stamp(), prod: sim.production, risk: sim.maxRisk, energy: sim.energy,
    costPerBottle: sim.production > 0 ? (sim.energy * tariff) / sim.production : null,
    bottleneck: sim.bn ? bnName(sim, nodes, ctx.catalog) : null,
    machines: nodes.map((x) => ({ id: x.id, type: x.type, name: names[x.id], value: x.value, qty: x.qty || 1, off: !!x.off, cap: sim.res[x.id].cap, eff: flow[x.id], ageYears: x.ageYears ?? 0, maintMonths: x.maintMonths ?? 0 })),
  };
}

/** A configuração (quantidade, ritmo, ligada/desligada) é a mesma da versão? Se sim, não vale criar uma versão repetida. */
export function sameConfig(v: ReportVersion | undefined, nodes: FNode[]): boolean {
  if (!v || v.machines.length !== nodes.length) return false;
  return nodes.every((x) => { const m = v.machines.find((y) => y.id === x.id); return !!m && m.type === x.type && m.value === x.value && m.qty === (x.qty || 1) && m.off === !!x.off
    && (m.ageYears === undefined || m.ageYears === (x.ageYears ?? 0)) && (m.maintMonths === undefined || m.maintMonths === (x.maintMonths ?? 0)); });
}

export type Cfg = { id: string; type: string; name: string; value: number; qty: number; off: boolean; ageYears?: number; maintMonths?: number };
export const cfgOf = (nodes: FNode[], catalog: Catalog): Cfg[] => {
  const names = machineNames(nodes, catalog);
  return nodes.map((x) => ({ id: x.id, type: x.type, name: names[x.id], value: x.value, qty: x.qty || 1, off: !!x.off, ageYears: x.ageYears ?? 0, maintMonths: x.maintMonths ?? 0 }));
};

/** O que mudou de uma configuração para outra, em frases curtas (para a lista com marcadores). */
export function describeChanges(before: Cfg[], after: Cfg[], catalog: Catalog): string[] {
  const out: string[] = [];
  const old = new Map(before.map((m) => [m.id, m]));
  after.forEach((m) => {
    const o = old.get(m.id);
    if (!o) { out.push(`Nova máquina: ${m.name}`); return; }
    if (m.qty !== o.qty) out.push(`${m.qty > o.qty ? '+' : '−'}${Math.abs(m.qty - o.qty)} ${m.name} (${o.qty} → ${m.qty} em paralelo)`);
    if (m.value !== o.value) out.push(`${m.name}: ${catalog[m.type]?.param?.split('(')[0].trim().toLowerCase() || 'ritmo'} ${fv(o.value)} → ${fv(m.value)} ${catalog[m.type]?.unit ?? ''}`.trim());
    if (o.ageYears !== undefined && m.ageYears !== undefined && m.ageYears !== o.ageYears) out.push(`${m.name}: idade ${fv(o.ageYears)} → ${fv(m.ageYears)} anos`);
    if (o.maintMonths !== undefined && m.maintMonths !== undefined && m.maintMonths !== o.maintMonths) out.push(m.maintMonths === 0 ? `${m.name}: manutenção feita (estava há ${fv(o.maintMonths)} meses sem)` : `${m.name}: ${fv(o.maintMonths)} → ${fv(m.maintMonths)} meses sem manutenção`);
    if (m.off !== o.off) out.push(m.off ? `Desligou ${m.name}` : `Religou ${m.name}`);
  });
  const now = new Set(after.map((m) => m.id));
  before.forEach((m) => { if (!now.has(m.id)) out.push(`Removeu ${m.name}`); });
  return out;
}

/** O mesmo, mas entre duas versões guardadas. */
export function diffVersions(a: ReportVersion, b: ReportVersion, catalog: Catalog): string[] {
  const cfg = (v: ReportVersion): Cfg[] => v.machines.map(({ id, type, name, value, qty, off, ageYears, maintMonths }) => ({ id, type, name, value, qty, off, ageYears, maintMonths }));
  return describeChanges(cfg(a), cfg(b), catalog);
}

export const pctDelta = (a: number, b: number): string => (a === 0 ? '—' : `${b >= a ? '+' : ''}${fmt(((b - a) / a) * 100, 1)}%`);

/** As duas versões comparadas: as escolhidas pela pessoa ou, se não escolheu (ou a escolhida sumiu), as duas mais recentes. */
export function pickCompare(versions: ReportVersion[], cmp: { a: number | null; b: number | null }): { a?: ReportVersion; b?: ReportVersion } {
  const last = versions[versions.length - 1], prev = versions[versions.length - 2];
  return { a: versions.find((v) => v.n === cmp.a) ?? prev, b: versions.find((v) => v.n === cmp.b) ?? last };
}
