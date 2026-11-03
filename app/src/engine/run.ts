/* Simulação com tempo (Play): 1 s real em ×1 = 1 minuto simulado; o produto leva 3 minutos por etapa para chegar. */
import type { FEdge, FNode, RunState, SimContext, SimResult } from '../types';
import { clock, fmt } from './format';
import { bnName, simulate } from './simulate';

export const STAGE_MIN = 3;
export const TICK_MS = 250;
/** Tamanho máximo, em minutos simulados, de cada pedaço em que um passo do relógio é dividido para somar a produção (0,25 = o passo da velocidade ×1). */
export const SUBSTEP_MIN = 0.25;

export const newRun = (speed = 1, dur = 60): RunState => ({
  on: false, active: false, speed, dur, t: 0, produced: 0, kwh: 0,
  queue: {}, arrivals: {}, announced: {}, finished: false, lastK: 0, series: [], mseries: {},
});

/** Minuto simulado em que o produto chega a cada máquina (profundidade no grafo × 3 min). */
export function computeArrivals(nodes: FNode[], edges: FEdge[]): Record<string, number> {
  const ins: Record<string, string[]> = {};
  edges.forEach((e) => { (ins[e.to] ||= []).push(e.from); });
  const depth: Record<string, number> = {};
  const get = (id: string, seen = new Set<string>()): number => {
    if (depth[id] != null) return depth[id];
    if (seen.has(id)) return 0;
    seen.add(id);
    const u = ins[id] || [];
    depth[id] = u.length ? 1 + Math.max(...u.map((x) => get(x, seen))) : 0;
    return depth[id];
  };
  nodes.forEach((n) => get(n.id));
  return Object.fromEntries(nodes.map((n) => [n.id, depth[n.id] * STAGE_MIN]));
}

export interface RunStep {
  t: number; produced: number; kwh: number; queue: Record<string, number>; announced: Record<string, boolean>; lastK: number; finished: boolean;
  /** como a fábrica está no fim do passo (para o painel e a linha do tempo) */
  sim: SimResult;
  events: { text: string; kind: '' | 'ok' | 'warn' | 'bad' }[];
}

/** Um passo do relógio do Play (0,25 s reais = 0,25 × velocidade minutos simulados). `base` é o contexto SEM o relógio.
 *  A produção é somada em pedaços de no máximo 0,25 minuto simulado, calculados no meio de cada pedaço: assim, mesmo em velocidade alta
 *  (passo de 15 min), o produto que chega à última máquina no meio do passo é contado a partir do minuto certo, em vez de o passo
 *  inteiro usar a situação do início (que podia dar 0 garrafas num Play curto e rápido). */
export function advanceRun(r: RunState, nodes: FNode[], edges: FEdge[], base: SimContext): RunStep {
  const catalog = base.catalog;
  const t = Math.min(r.dur, r.t + 0.25 * r.speed);
  const span = t - r.t;
  const n = Math.max(1, Math.ceil(span / SUBSTEP_MIN - 1e-9));
  const sub = span / n;
  let produced = r.produced, kwh = r.kwh;
  const queue = { ...r.queue }, announced = { ...r.announced };
  for (let i = 0; i < n; i++) {
    const s = simulate(nodes, edges, { ...base, run: { active: true, t: r.t + (i + 0.5) * sub, arrivals: r.arrivals } });
    produced += (s.production / 60) * sub;
    kwh += (s.energy * sub) / 60;
    nodes.forEach((nd) => { const q = s.res[nd.id].queue || 0; if (q > 0) queue[nd.id] = (queue[nd.id] || 0) + (q / 60) * sub; });
  }
  const sim = simulate(nodes, edges, { ...base, run: { active: true, t, arrivals: r.arrivals } });
  const events: RunStep['events'] = [];
  nodes.forEach((nd) => {
    if (!announced[nd.id] && t >= (r.arrivals[nd.id] || 0)) { announced[nd.id] = true; events.push({ text: `${catalog[nd.type].name} começou a trabalhar`, kind: '' }); }
  });
  const stepMin = r.dur <= 60 ? 10 : 60, k = Math.floor(t / stepMin);
  let lastK = r.lastK;
  if (k > lastK && t < r.dur) { lastK = k; events.push({ text: `${clock(t)} — ${fmt(produced)} garrafas produzidas · gargalo: ${bnName(sim, nodes, catalog)} · risco máx. ${fmt(sim.maxRisk * 100, 1)}%`, kind: '' }); }
  const finished = t >= r.dur;
  if (finished) events.push({ text: 'Simulação terminada', kind: 'ok' });
  return { t, produced, kwh, queue, announced, lastK, finished, sim, events };
}
