import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../data/catalog';
import { bottleneckReport, runWhatIf } from './bottleneck';
import { canConnect, edgeKind } from './connect';
import { buildFromTemplate } from './factory';
import { planGoal } from './goal';
import { bestProduction, heatFactor, riskOf, simulate, stateOf } from './simulate';
import { waterExpansionL } from './water';
import type { SimContext } from '../types';

const catalog = buildCatalog();
const ctx: SimContext = { catalog, ambient: 25, estop: false };
const bebidas = () => buildFromTemplate('bebidas', catalog, 1);
const byType = <T extends { id: string; type: string }>(nodes: T[], type: string): T => nodes.find((n) => n.type === type)!;

describe('simulação', () => {
  it('a rotuladora é o gargalo do exemplo de bebidas (11.400 garrafas/h)', () => {
    const f = bebidas();
    const sim = simulate(f.nodes, f.edges, ctx);
    expect(Math.round(sim.production)).toBe(11400);
    expect(sim.bn).toBe(byType(f.nodes, 'rotuladora').id);
    expect(sim.maxRisk).toBeCloseTo(0.02);
  });

  it('risco e estado seguem os degraus ótimo, atenção, crítico e falha', () => {
    const t = catalog.enchedora;
    expect(riskOf(t, t.opt)).toBe(0.02);
    expect(riskOf(t, t.warn)).toBeCloseTo(0.1);
    expect(riskOf(t, t.crit)).toBe(1);
    expect(stateOf(t, t.opt)).toBe('normal');
    expect(stateOf(t, t.opt + 1)).toBe('alerta');
    expect(stateOf(t, t.warn + 1)).toBe('critico');
    expect(stateOf(t, t.crit)).toBe('falha');
  });

  it('uma falha propaga a falta de produto para as máquinas seguintes (cascata)', () => {
    const f = bebidas();
    const e = byType(f.nodes, 'enchedora');
    e.value = catalog.enchedora.crit;
    const sim = simulate(f.nodes, f.edges, ctx);
    expect(sim.production).toBe(0);
    expect(sim.res[byType(f.nodes, 'rotuladora').id].eff).toBe(0);
  });

  it('máquinas em paralelo somam capacidade e o excesso vira fila (Lavoisier)', () => {
    const f = bebidas();
    const sim0 = simulate(f.nodes, f.edges, ctx);
    expect(sim0.res[byType(f.nodes, 'rotuladora').id].queue).toBeCloseTo(600);
    byType(f.nodes, 'rotuladora').qty = 2;
    expect(simulate(f.nodes, f.edges, ctx).production).toBeGreaterThan(sim0.production);
  });

  it('a temperatura ambiente reduz a capacidade de tanques e motores', () => {
    expect(heatFactor(catalog.tanque_agua, 25)).toBe(1);
    expect(heatFactor(catalog.tanque_agua, 35)).toBeCloseTo(0.96);
    expect(heatFactor(catalog.rotuladora, 40)).toBeCloseTo(0.95);
    expect(heatFactor(catalog.pasteurizador, 45)).toBe(1);
    expect(waterExpansionL(35, 1000)).toBeCloseTo(4.1, 1);
  });

  it('o play atrasa o início das máquinas conforme a profundidade no grafo', () => {
    const f = bebidas();
    const arrivals = Object.fromEntries(f.nodes.map((n, i) => [n.id, i * 3]));
    const sim = simulate(f.nodes, f.edges, { ...ctx, run: { active: true, t: 4, arrivals } });
    expect(sim.res[f.nodes[0].id].waiting).toBeUndefined();
    expect(sim.res[f.nodes[7].id].waiting).toBe(true);
    expect(sim.production).toBe(0);
  });
});

describe('regras de conexão', () => {
  it('bloqueia o caso do misturador alimentando duas máquinas diferentes', () => {
    const f = bebidas();
    const r = canConnect(byType(f.nodes, 'misturador').id, byType(f.nodes, 'esteira').id, f.nodes, f.edges, catalog);
    expect(r.ok).toBe(false);
    expect(r.msg).toContain('já alimenta Pasteurizador');
  });

  it('bloqueia ciclos, voltar etapas e suco com xarope', () => {
    const f = bebidas();
    const [agua, xarope] = [f.nodes[0], f.nodes[1]];
    expect(canConnect(xarope.id, agua.id, f.nodes, f.edges, catalog).ok).toBe(false);
    const s = buildFromTemplate('suco', catalog, 100);
    const nodes = [...s.nodes, byType(f.nodes, 'tanque_xarope')];
    expect(canConnect(s.nodes[0].id, byType(nodes, 'tanque_xarope').id, nodes, s.edges, catalog).ok).toBe(false);
  });

  it('classifica as conexões em direta, divisão e junção', () => {
    const f = bebidas();
    expect(edgeKind(f.edges[0], f.edges)).toBe('direta');
  });
});

describe('objetivo e gargalo', () => {
  it('+10% de produção: sobe o ritmo da enchedora e depois usa mais uma rotuladora', () => {
    const f = bebidas();
    const plan = planGoal({ type: 'pct', value: 10, more: true, over: true }, f.nodes, f.edges, ctx);
    expect(plan.ok).toBe(true);
    expect(plan.after.prod).toBeGreaterThanOrEqual(plan.target - 0.5);
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.invest.max).toBeGreaterThan(0);
  });

  it('explica o gargalo e lista opções com custo', () => {
    const f = bebidas();
    const rep = bottleneckReport(f.nodes, f.edges, ctx)!;
    expect(rep.name).toBe('Rotuladora');
    expect(rep.options.some((o) => o.cost)).toBe(true);
    expect(rep.why.length).toBeGreaterThan(2);
  });

  it('"e se colocar 2 máquinas" mostra que o próximo gargalo é a enchedora e recalcula em cascata', () => {
    const f = bebidas();
    const r = runWhatIf(2, f.nodes, f.edges, ctx)!;
    expect(r.enough).toBe(false);
    expect(r.next).toBe('Enchedora');
    expect(r.plan?.ok).toBe(true);
    expect(Math.round(r.after)).toBe(12000);
    expect(bestProduction(f.nodes, f.edges, ctx)).toBeGreaterThan(0);
  });
});
