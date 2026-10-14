/* Simulação com tempo (Play): 1 s real em ×1 = 1 minuto simulado; o produto leva 3 minutos por etapa para chegar. */
import type { FEdge, FNode, RunState } from '../types';

export const STAGE_MIN = 3;
export const TICK_MS = 250;

export const newRun = (speed = 1, dur = 60): RunState => ({
  on: false, active: false, speed, dur, t: 0, produced: 0, kwh: 0,
  queue: {}, arrivals: {}, announced: {}, finished: false, lastK: 0,
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
