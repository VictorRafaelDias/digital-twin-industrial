/* Temperatura estimada e desgaste no motor (mesmos números dos testes do back-end em Python). */
import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../data/catalog';
import { buildFromTemplate } from './factory';
import { simulate } from './simulate';
import { machineTemp } from './thermal';
import type { FNode, SimContext } from '../types';

const catalog = buildCatalog();
const ctx = (ambient = 25): SimContext => ({ catalog, ambient, estop: false });
const node = (type: string, id = 'a', over: Partial<FNode> = {}): FNode => ({ id, type, x: 0, y: 0, value: catalog[type].opt, qty: 1, off: false, ...over });
const temp = (n: FNode, ambient = 25) => machineTemp(catalog[n.type], n, simulate([n], [], ctx(ambient)).res[n.id], ambient);

describe('temperatura estimada da máquina (hipótese didática)', () => {
  it('ambiente mais o aquecimento pela carga; câmara fria perto de 4 °C', () => {
    expect(temp(node('tanque_agua'))).toBe(37);
    expect(temp(node('enchedora'))).toBe(65);
    expect(temp(node('camara_fria'))).toBe(16.5);
    expect(temp(node('enchedora'), 35)).toBe(74);        // +10 °C no ambiente; o motor perde 2,5% de capacidade no calor e trabalha a 97,5% da carga
  });

  it('desligada fica no ambiente; acima do ótimo esquenta mais; em falha superaquece', () => {
    expect(temp(node('enchedora', 'a', { off: true }))).toBe(25);
    expect(temp(node('enchedora', 'a', { value: 235 }))).toBeGreaterThan(65);
    expect(temp(node('enchedora', 'a', { value: 250 }))).toBe(25 + 40 * 1.5);
  });
});

describe('desgaste na simulação (modo servidor)', () => {
  it('sem desgaste nada muda; com desgaste a capacidade cai e o risco sobe', () => {
    const f = buildFromTemplate('bebidas', catalog, 1);
    const base = simulate(f.nodes, f.edges, ctx());
    expect(Math.round(base.production)).toBe(11400);
    const gasta = f.nodes.map((n) => (n.type === 'rotuladora' ? { ...n, wearCap: 0.85, wearRisk: 0.06 } : n));
    const r = simulate(gasta, f.edges, ctx());
    const rot = gasta.find((n) => n.type === 'rotuladora')!;
    expect(r.res[rot.id].cap).toBeCloseTo(base.res[rot.id].cap * 0.85, 6);
    expect(r.res[rot.id].risk).toBeCloseTo(0.08, 12);
    expect(Math.round(r.production)).toBe(Math.round(11400 * 0.85));
  });

  it('em falha o risco continua 100% (o desgaste não passa disso)', () => {
    const n = node('enchedora', 'a', { value: 250, wearRisk: 0.08 });
    expect(simulate([n], [], ctx()).res.a.risk).toBe(1);
  });
});
