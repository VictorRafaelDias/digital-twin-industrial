/* Motor de simulação (porte do backend/app/graph_simulation.py): capacidade, risco, estado, gargalo,
   propagação em grafo (cascata), fila e energia. Funções puras: nada aqui lê estado global. */
import type { FEdge, FNode, MachineState, MachineType, NodeResult, SimContext, SimResult } from '../types';
import { fmt, fv } from './format';

/** Fator de capacidade pela temperatura ambiente (hipótese didática, a validar com o professor de física). */
export function heatFactor(t: MachineType, ambient: number): number {
  const T = ambient;
  let f = 1;
  if (t.heat === 'tank' && T > 25) f = 1 - 0.004 * (T - 25);
  else if (t.heat === 'motor' && T > 30) f = 1 - 0.005 * (T - 30);
  else if (t.heat === 'cold' && T > 25) f = 1 - 0.015 * (T - 25);
  else if (t.heat === 'visc' && T < 15) f = 1 - 0.005 * (15 - T);
  return Math.max(0.5, f);
}

/** Capacidade (garrafas/h) de UMA unidade no ritmo `v`: linear até o ótimo, metade do ganho acima, zero na falha. */
export function capacity(t: MachineType, v: number, ambient: number): number {
  if (v >= t.crit) return 0;
  const base = v <= t.opt ? (t.cap * v) / t.opt : t.cap * (1 + 0.5 * (v / t.opt - 1));
  return base * heatFactor(t, ambient);
}

/** Risco de falha: 2% no ótimo, até 10% na atenção, até 40% na zona crítica, 100% na falha. */
export function riskOf(t: MachineType, v: number): number {
  if (v >= t.crit) return 1;
  if (v <= t.opt) return 0.02;
  if (v <= t.warn) return 0.02 + ((v - t.opt) / (t.warn - t.opt)) * 0.08;
  return 0.1 + ((v - t.warn) / (t.crit - t.warn)) * 0.3;
}

export function stateOf(t: MachineType, v: number): MachineState {
  if (v >= t.crit) return 'falha';
  if (v > t.warn) return 'critico';
  if (v > t.opt) return 'alerta';
  return 'normal';
}

export function simulate(nodes: FNode[], edges: FEdge[], ctx: SimContext): SimResult {
  const { catalog, ambient, estop, run } = ctx;
  const byId: Record<string, { n: FNode; t: MachineType; ups: string[]; outs: number }> = {};
  nodes.forEach((n) => { byId[n.id] = { n, t: catalog[n.type], ups: [], outs: 0 }; });
  edges.forEach((e) => {
    if (byId[e.from] && byId[e.to]) { byId[e.to].ups.push(e.from); byId[e.from].outs++; }
  });

  // ordem topológica (quem não está no grafo acíclico vai no fim)
  const indeg: Record<string, number> = {};
  Object.keys(byId).forEach((k) => { indeg[k] = byId[k].ups.length; });
  const order: string[] = [];
  const queue = Object.keys(byId).filter((k) => indeg[k] === 0);
  while (queue.length) {
    const k = queue.shift() as string;
    order.push(k);
    edges.forEach((e) => {
      if (e.from === k && byId[e.to]) { indeg[e.to]--; if (indeg[e.to] === 0) queue.push(e.to); }
    });
  }
  Object.keys(byId).forEach((k) => { if (!order.includes(k)) order.push(k); });

  const res: Record<string, NodeResult> = {};
  order.forEach((k) => {
    const { n, t, ups } = byId[k];
    const cap = (n.off ? 0 : capacity(t, n.value, ambient)) * (n.qty || 1);
    // o que chega: saída das anteriores, dividida entre as saídas de cada uma (divisão de fluxo)
    const inflow = ups.reduce((s, u) => s + (res[u]?.eff || 0) / Math.max(1, byId[u].outs), 0);
    let eff = cap;
    if (ups.length) eff = Math.min(cap, inflow);
    if (estop) eff = 0;
    res[k] = {
      cap, eff, inflow,
      queue: ups.length ? Math.max(0, inflow - eff) : 0, // Lavoisier: o que sobra fica parado na fila
      risk: riskOf(t, n.value),
      state: n.off ? 'desligada' : stateOf(t, n.value),
      energy: t.sb * (n.qty || 1) + (n.off ? 0 : (t.vr * eff) / t.cap),
    };
  });

  // durante o play, a máquina só começa a trabalhar quando o produto chega até ela
  if (run?.active) {
    nodes.forEach((n) => {
      if (run.t < (run.arrivals[n.id] || 0)) {
        const r = res[n.id];
        r.eff = 0; r.queue = 0; r.waiting = true; r.energy = catalog[n.type].sb * (n.qty || 1);
      }
    });
  }

  const sinks = nodes.filter((n) => byId[n.id].outs === 0);
  const production = sinks.reduce((s, n) => s + (res[n.id]?.eff || 0), 0);
  let bn: string | null = null;
  nodes.forEach((n) => { if (!bn || res[n.id].cap < res[bn].cap) bn = n.id; });
  return {
    res, production, bn,
    energy: nodes.reduce((s, n) => s + res[n.id].energy, 0),
    maxRisk: nodes.reduce((m, n) => Math.max(m, res[n.id].risk), 0),
  };
}

/** Produção da fábrica com todas as máquinas ligadas no ritmo ótimo. */
export function bestProduction(nodes: FNode[], edges: FEdge[], ctx: SimContext): number {
  return simulate(nodes.map((n) => ({ ...n, value: ctx.catalog[n.type].opt, off: false })), edges, ctx).production;
}

export function bnName(sim: SimResult, nodes: FNode[], catalog: Record<string, MachineType>): string {
  const n = nodes.find((x) => x.id === sim.bn);
  return n ? catalog[n.type].name : '—';
}

/** Quem está "afetado a montante" e o rastro (gradiente) de cada conexão: o efeito cascata. */
export function troubleMaps(sim: SimResult, nodes: FNode[], edges: FEdge[]) {
  const incoming: Record<string, string[]> = {};
  const outgoing: Record<string, FEdge[]> = {};
  edges.forEach((e) => { (incoming[e.to] ||= []).push(e.from); (outgoing[e.from] ||= []).push(e); });
  const bad = (id: string) => sim.res[id].state !== 'normal';
  const affected = new Set<string>();
  const hasUp = (id: string, seen: Set<string>): boolean => {
    if (seen.has(id)) return false;
    seen.add(id);
    return (incoming[id] || []).some((u) => bad(u) || hasUp(u, seen));
  };
  nodes.forEach((n) => { if (hasUp(n.id, new Set())) affected.add(n.id); });

  const sev: Record<string, { level: number; kind: 'danger' | 'warn' }> = {};
  nodes
    .filter((n) => ['falha', 'critico', 'desligada'].includes(sim.res[n.id].state))
    .forEach((n) => {
      const kind = sim.res[n.id].state === 'falha' ? 'danger' : 'warn';
      let frontier = [{ id: n.id, level: kind === 'danger' ? 1 : 0.6 }];
      const seen = new Set<string>();
      while (frontier.length) {
        const next: { id: string; level: number }[] = [];
        frontier.forEach(({ id, level }) => (outgoing[id] || []).forEach((e) => {
          if (!sev[e.id] || sev[e.id].level < level) sev[e.id] = { level, kind };
          if (!seen.has(e.id) && level > 0.15) { seen.add(e.id); next.push({ id: e.to, level: level * 0.55 }); }
        }));
        frontier = next;
      }
    });
  return { affected, sev };
}

/** Explicação em palavras simples do que está acontecendo com uma máquina (aceita <b> como marcação). */
export function explainNow(n: FNode, sim: SimResult, affected: boolean, t: MachineType): string {
  const r = sim.res[n.id];
  if (n.off) return 'Esta máquina está <b>desligada</b>: tudo que vem depois dela fica sem produto.';
  if (r.state === 'falha') return 'A máquina <b>falhou</b>: passou do limite e parou. Tudo que vem depois dela fica sem produto.';
  if (affected && r.eff < r.cap * 0.5) return 'Ela está saudável, mas recebe pouco ou nenhum produto da máquina anterior. <b>O problema está antes dela.</b>';
  if (r.state === 'critico') return `Perto do limite: risco de ${fmt(r.risk * 100, 1)}%. Acima de ${fv(t.crit)} ${t.unit} ela falha.`;
  if (r.state === 'alerta') return `Acima do ótimo: produz um pouco mais, mas o risco sobe para ${fmt(r.risk * 100, 1)}%.`;
  if (sim.bn === n.id) return 'Esta é a máquina mais lenta (o <b>gargalo</b>). Melhorar o ritmo dela aumenta a produção de toda a fábrica.';
  return 'No ponto ótimo. Mexer aqui <b>não muda a produção</b> da fábrica, porque o gargalo está em outra máquina.';
}
