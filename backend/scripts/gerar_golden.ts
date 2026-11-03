/* Gera os casos de referência (tests/golden/engine_cases.json) usando o PRÓPRIO motor do front-end.
   Os testes do back-end (Python) conferem que o motor portado dá exatamente os mesmos resultados.

   Rodar (na pasta app/):  npx vite-node ../backend/scripts/gerar_golden.ts
*/
import { writeFileSync } from 'node:fs';
import { buildCatalog } from '../../app/src/data/catalog';
import { bottleneckReport, runWhatIf } from '../../app/src/engine/bottleneck';
import { canConnect, edgeKind } from '../../app/src/engine/connect';
import { buildFromTemplate } from '../../app/src/engine/factory';
import { planGoal } from '../../app/src/engine/goal';
import { clock, fmt, fv } from '../../app/src/engine/format';
import { advanceRun, computeArrivals, newRun } from '../../app/src/engine/run';
import { bestProduction, bnName, explainNow, simulate, troubleMaps } from '../../app/src/engine/simulate';
import { betaAt, waterExpansionL } from '../../app/src/engine/water';
import { HORAS_USO_ANO, hoursFromInputs, LIFE_H_BY_CAT, lifeHOf, MAINT_H_BY_CAT, maintHOf, wearEffects } from '../../app/src/engine/wear';
import type { FEdge, FNode, GoalInput, LogEvent, RunState, SimContext } from '../../app/src/types';

const catalog = buildCatalog();

// gerador de números pseudo-aleatórios com semente (os casos são sempre os mesmos)
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261028);
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];

function buildCase(i: number) {
  const key = i % 2 === 0 ? 'bebidas' : 'suco';
  const f = buildFromTemplate(key, catalog, 1);
  let seq = f.seq;
  const nodes: FNode[] = f.nodes.map((n) => ({ ...n }));
  const edges: FEdge[] = f.edges.map((e) => ({ ...e }));
  // metade dos casos ganha uma linha em paralelo (divisão e junção de fluxo)
  if (i % 3 === 0 && nodes.length > 3) {
    const idx = 1 + Math.floor(rnd() * (nodes.length - 2));
    const src = nodes[idx];
    const copy: FNode = { ...src, id: 'n' + seq++, y: src.y + 120 };
    nodes.push(copy);
    edges.filter((e) => e.to === src.id).forEach((e) => edges.push({ id: 'e' + seq++, from: e.from, to: copy.id }));
    edges.filter((e) => e.from === src.id).forEach((e) => edges.push({ id: 'e' + seq++, from: copy.id, to: e.to }));
  }
  // alguns casos ficam só com as máquinas soltas e algumas ligações (para testar as regras de conexão)
  if (i % 5 === 4) edges.splice(Math.floor(edges.length / 2));
  if (i % 7 === 6) edges.length = 0;
  // mexe nas máquinas
  if (i > 1) {
    nodes.forEach((n) => {
      const t = catalog[n.type];
      const r = rnd();
      if (r < 0.5) n.value = +(t.min + rnd() * (t.max - t.min)).toFixed(2);
      else if (r < 0.65) n.value = t.crit + 0.1;
      if (rnd() < 0.3) n.qty = 1 + Math.floor(rnd() * 4);
      if (rnd() < 0.1) n.off = true;
      if (rnd() < 0.25) { n.wearCap = +(0.75 + rnd() * 0.25).toFixed(3); n.wearRisk = +(rnd() * 0.12).toFixed(3); }
    });
  }
  const ambient = i < 2 ? 25 : Math.floor(rnd() * 46);
  const estop = i > 4 && rnd() < 0.1;
  const arrivals = computeArrivals(nodes, edges);
  const runActive = i % 4 === 1;
  const run = runActive ? { active: true, t: +(rnd() * 12).toFixed(2), arrivals } : undefined;
  return { key, nodes, edges, ambient, estop, run, arrivals };
}

const goals: GoalInput[] = [
  { type: 'pct', value: 10, more: true, over: true },
  { type: 'pct', value: 25, more: false, over: false },
  { type: 'pct', value: 60, more: true, over: false },
  { type: 'abs', value: 15000, more: true, over: true },
  { type: 'risk', value: 0, more: false, over: false },
];

const cases: unknown[] = [];
for (let i = 0; i < 60; i++) {
  const c = buildCase(i);
  const ctx: SimContext = { catalog, ambient: c.ambient, estop: c.estop, run: c.run };
  const sim = simulate(c.nodes, c.edges, ctx);
  const { affected, sev } = troubleMaps(sim, c.nodes, c.edges);
  const explain: Record<string, string> = {};
  c.nodes.forEach((n) => { explain[n.id] = explainNow(n, sim, affected.has(n.id), catalog[n.type]); });
  const connect: Record<string, unknown> = {};
  c.nodes.forEach((a) => c.nodes.forEach((b) => { connect[`${a.id}>${b.id}`] = canConnect(a.id, b.id, c.nodes, c.edges, catalog); }));
  cases.push({
    key: c.key, nodes: c.nodes, edges: c.edges, ambient: c.ambient, estop: c.estop, run: c.run || null,
    sim, bnName: bnName(sim, c.nodes, catalog), best: bestProduction(c.nodes, c.edges, ctx),
    affected: [...affected].sort(), sev, explain, connect,
    kinds: Object.fromEntries(c.edges.map((e) => [e.id, edgeKind(e, c.edges)])),
    arrivals: c.arrivals,
    report: bottleneckReport(c.nodes, c.edges, ctx),
    whatIf1: runWhatIf(1, c.nodes, c.edges, ctx),
    whatIf2: runWhatIf(2, c.nodes, c.edges, ctx),
    plans: goals.map((g) => planGoal(g, c.nodes, c.edges, ctx)),
  });
}

/* Play inteiro: usa o mesmo passo do relógio (advanceRun) que a store usa a cada 250 ms, sem o estado de tela. */
function runWhole(key: string, speed: number, dur: number) {
  const f = buildFromTemplate(key, catalog, 1);
  const base = { catalog, ambient: 30, estop: false } as SimContext;
  const nodes = f.nodes, edges = f.edges;
  let r: RunState = { ...newRun(speed, dur), active: true, arrivals: computeArrivals(nodes, edges), on: true };
  const events: LogEvent[] = [];
  let ticks = 0;
  while (r.on && ticks < 100000) {
    ticks++;
    const step = advanceRun(r, nodes, edges, base);
    const { t, produced, kwh, queue, announced, lastK, finished } = step;
    step.events.forEach((e) => events.push({ time: '', ...e }));
    r = { ...r, t, produced, kwh, queue, announced, lastK, on: !finished, finished: finished || r.finished };
  }
  return { key, speed, dur, ambient: base.ambient, nodes, edges, ticks, final: r, events: events.map((e) => ({ text: e.text, kind: e.kind })) };
}
const runs = [runWhole('bebidas', 20, 60), runWhole('bebidas', 60, 480), runWhole('suco', 5, 30), runWhole('bebidas', 1, 30)];

const formats = [0, 1, 1.005, 2.5, 1234.5678, 12345678.9, -3.2, 0.049, 11400, 99.95].map((v) => ({ v, d0: fmt(v, 0), d1: fmt(v, 1), d2: fmt(v, 2), fv: fv(v) }));
const water = [0, 4, 10, 20, 25, 33.3, 45, 60].map((T) => ({ T, beta: betaAt(T), l: waterExpansionL(T) }));

/* Idade e manutenção: cada tipo de máquina x idades x meses desde a manutenção */
const wear: object[] = [];
for (const [code, t] of Object.entries(catalog)) {
  for (const age of [0, 0.5, 1, 3.125, 6.25, 10, 25, 60]) {
    for (const months of [0, 1, 3, 12, 100, 720]) {
      const w = wearEffects(t, age, months), [wearH, maintAtH] = hoursFromInputs(age, months);
      wear.push({ code, cat: t.cat, lifeH: lifeHOf(t), maintH: maintHOf(t), age, months, wearH, maintAtH, cap: w.cap, risk: w.risk, temp: w.temp, status: w.status,
        lifeUsed: w.lifeUsed, overdue: w.overdue, hoursToMaint: w.hoursToMaintenance, hoursLeft: w.hoursOfLifeLeft, residual: w.residual });
    }
  }
}
const wearConsts = { horasUsoAno: HORAS_USO_ANO, lifeByCat: LIFE_H_BY_CAT, maintByCat: MAINT_H_BY_CAT };
writeFileSync(new URL('../tests/golden/engine_cases.json', import.meta.url), JSON.stringify({ cases, runs, formats, water, wear, wearConsts }));
writeFileSync(new URL('../tests/golden/front_catalog.json', import.meta.url), JSON.stringify(catalog));
console.log(`ok: ${cases.length} casos, ${runs.length} execuções do play, ${wear.length} casos de idade`);
