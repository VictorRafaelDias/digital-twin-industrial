/* Exemplos de empresas reais: cada mapa tem de reproduzir a velocidade de linha publicada e estar completo (fontes, hipóteses, histórico). */
import { beforeEach, describe, expect, it } from 'vitest';
import { buildCatalog } from '../data/catalog';
import { REAL_BY_KEY, REAL_CASES } from '../data/realCases';
import { TEMPLATES } from '../data/content';
import { useStore } from '../store/useStore';
import { canConnect } from './connect';
import { buildFromTemplate } from './factory';
import { simulate } from './simulate';
import type { FEdge, FNode } from '../types';

const catalog = buildCatalog();
const st = () => useStore.getState();

function build(key: string) {
  const f = buildFromTemplate(key, catalog, 1);
  const sim = simulate(f.nodes, f.edges, { catalog, ambient: 25, estop: false });
  return { ...f, sim };
}

describe('empresas reais: o mapa reproduz a velocidade publicada', () => {
  it('são oito empresas (dez mapas: Quilmes e Tial têm antes e depois) e entram nos exemplos', () => {
    expect(REAL_CASES).toHaveLength(10);
    expect(new Set(REAL_CASES.map((c) => c.company)).size).toBe(8);
    REAL_CASES.forEach((c) => expect(TEMPLATES[c.key].nodes).toBe(c.nodes));
    expect(new Set(REAL_CASES.map((c) => c.key)).size).toBe(10);
    expect(new Set(REAL_CASES.map((c) => c.name)).size).toBe(10);
  });

  it.each(REAL_CASES.map((c) => [c.key, c.ratedBph, c.bottleneck ?? 'enchedora'] as const))('%s produz ~%i garrafas/h, o gargalo é %s e nada sai do normal', (key, rated, gargalo) => {
    const { nodes, sim } = build(key);
    expect(Math.abs(sim.production - rated) / rated).toBeLessThan(0.01);                 // dentro de 1% do número publicado
    expect(nodes.find((n) => n.id === sim.bn)!.type).toBe(gargalo);
    expect(sim.maxRisk).toBeCloseTo(0.02);                                                // tudo no ritmo ótimo ou abaixo: risco base
    expect(nodes.every((n) => sim.res[n.id].state === 'normal')).toBe(true);
    nodes.filter((n) => n.type !== gargalo).forEach((n) => expect(sim.res[n.id].cap).toBeGreaterThanOrEqual(rated));   // as outras etapas sustentam a velocidade
  });

  it.each(REAL_CASES.map((c) => c.key))('%s: unidades de 1 a 6 e ritmos dentro dos limites da máquina; conexões válidas', (key) => {
    const { nodes, edges } = build(key);
    nodes.forEach((n) => {
      const t = catalog[n.type];
      expect(n.qty).toBeGreaterThanOrEqual(1); expect(n.qty).toBeLessThanOrEqual(6);
      expect(n.value).toBeGreaterThanOrEqual(t.min); expect(n.value).toBeLessThanOrEqual(t.opt);
    });
    const so: FEdge[] = [];
    edges.forEach((e) => { const r = canConnect(e.from, e.to, nodes as FNode[], so, catalog); expect(r.ok, `${e.from}→${e.to}: ${r.msg}`).toBe(true); so.push(e); });
    expect(edges).toHaveLength(nodes.length - 1);
  });

  it('a água mineral não leva xarope, mistura, pasteurização nem gás; o hot-fill não leva carbonatador', () => {
    const tipos = (k: string) => build(k).nodes.map((n) => n.type);
    expect(tipos('tannourine')).toEqual(['tanque_agua', 'enchedora', 'esteira', 'rotuladora']);
    for (const k of ['coca_cola_canners', 'quilmes_gatorade', 'quilmes_gatorade_antes', 'tial', 'tial_antes']) expect(tipos(k)).not.toContain('carbonatador');
    for (const k of ['cocacola_jundiai', 'slmg_chhata', 'refres_now_manaos', 'refriko_sjp']) expect(tipos(k)).toContain('carbonatador');
  });

  it('a ampliação real da Quilmes (22 mil → 45 mil/h) é aproximadamente dobrar as unidades', () => {
    const antes = build('quilmes_gatorade_antes').sim.production, depois = build('quilmes_gatorade').sim.production;
    expect(depois / antes).toBeGreaterThan(1.95); expect(depois / antes).toBeLessThan(2.15);
  });

  it('a melhoria real da Tial (11 mil → 37 mil L/h) é a nova linha de pasteurização: o pasteurizador limita e a produção mais que triplica', () => {
    const antes = build('tial_antes'), depois = build('tial');
    expect(antes.nodes.find((n) => n.id === antes.sim.bn)!.type).toBe('pasteurizador');
    expect(depois.nodes.find((n) => n.id === depois.sim.bn)!.type).toBe('pasteurizador');
    expect(depois.sim.production / antes.sim.production).toBeGreaterThan(3.2);
    expect(depois.sim.production / antes.sim.production).toBeLessThan(3.5);          // 37.000 ÷ 11.000 = 3,36
  });

  it('o preço de referência de cada caso é uma faixa com fonte (só a Tannourine não tem preço público)', () => {
    REAL_CASES.forEach((c) => {
      if (c.key === 'tannourine') { expect(c.price).toBeUndefined(); return; }
      expect(c.price, c.key).toBeDefined();
      expect(c.price!.min).toBeGreaterThan(1); expect(c.price!.max).toBeGreaterThanOrEqual(c.price!.min); expect(c.price!.max).toBeLessThan(15);
      expect(c.price!.basis.length).toBeGreaterThan(40);
      c.price!.sources.forEach((r) => expect(r.u).toMatch(/^https:\/\//));
    });
    expect(REAL_BY_KEY.cocacola_jundiai.investRef!.perThousand).toBe(3_820_000);   // R$ 191 mi ÷ 50 mil garrafas/h, por 1.000 garrafas/h
  });

  it('a conferência com a realidade: a receita publicada da Tial (R$ 350 mi) tem a mesma ordem de grandeza das vendas simuladas no preço de prateleira', () => {
    const c = REAL_BY_KEY.tial_antes, preco = (c.price!.min + c.price!.max) / 2;
    const simulado = build('tial_antes').sim.production * 4000 * preco;           // 11.000 garrafas/h × 4.000 h × preço
    expect(simulado / c.revenueRef!.brl).toBeGreaterThan(1);                       // prateleira > o que a fábrica recebe
    expect(simulado / c.revenueRef!.brl).toBeLessThan(2);                          // e não está fora da ordem de grandeza
  });

  it('cada caso traz fatos com fonte, hipóteses, histórico e links https', () => {
    REAL_CASES.forEach((c) => {
      expect(c.facts.length).toBeGreaterThanOrEqual(2);
      expect(c.assumptions.length).toBeGreaterThanOrEqual(1);
      expect(c.history.length).toBeGreaterThanOrEqual(1);
      expect(c.sources.length).toBeGreaterThanOrEqual(1);
      c.sources.forEach((r) => { expect(r.u).toMatch(/^https:\/\//); expect(r.t.length).toBeGreaterThan(5); });
      expect(c.ratedBph).toBeGreaterThan(10000);
      expect(c.facts.join(' ').length).toBeGreaterThan(80);
    });
  });
});

describe('carregar uma empresa real', () => {
  beforeEach(() => { useStore.setState({ nodes: [], edges: [], undoStack: [], redoStack: [], events: [], modal: null, caseKey: null, versions: [], versionSeq: 0 }); });

  it('carrega o desenho, guarda a empresa e abre a janela "Sobre a fábrica"', () => {
    st().loadTemplate('slmg_chhata');
    expect(st().nodes).toHaveLength(8);
    expect(st().plantName).toBe(REAL_BY_KEY.slmg_chhata.name);
    expect(st().caseKey).toBe('slmg_chhata');
    expect(st().modal).toBe('realcase');
    const ench = st().nodes.find((n) => n.type === 'enchedora')!;
    expect([ench.qty, ench.value]).toEqual([4, 200]);
  });

  it('os exemplos antigos e a fábrica nova não ficam com o nome da empresa', () => {
    st().loadTemplate('refres_now_manaos');
    expect(st().caseKey).toBe('refres_now_manaos');
    st().loadTemplate('bebidas');
    expect(st().caseKey).toBeNull();
    st().loadTemplate('tannourine');
    st().newFactory();
    expect(st().caseKey).toBeNull();
    st().loadTemplate('suco');
    expect(st().modal).toBeNull() ;
  });

  it('o exemplo "Bebidas em geral" continua igual (8 máquinas, 1 unidade cada, 11.400 garrafas/h)', () => {
    const { nodes, sim } = build('bebidas');
    expect(nodes.every((n) => n.qty === 1)).toBe(true);
    expect(sim.production).toBe(11400);
  });
});
