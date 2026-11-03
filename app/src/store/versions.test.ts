/* Versões do relatório: V1 automático ao aplicar, lista do que mudou, Play gerando a V2, comparação e uso da capacidade. */
import { beforeEach, describe, expect, it } from 'vitest';
import { simulate } from '../engine/simulate';
import { useStore } from './useStore';
import { cfgOf, describeChanges, diffVersions, machineNames, realFlow, sameConfig, utilLevel, utilization } from './versions';

const st = () => useStore.getState();
const find = (type: string) => st().nodes.find((n) => n.type === type)!;
const rodarPlay = () => { st().setRunSpeed(60); st().setRunDur(30); st().startOrToggleRun(); for (let i = 0; i < 4; i++) st().tickRun(); };

beforeEach(() => {
  useStore.setState({ server: null, serverFactoryId: null, nodes: [], edges: [], undoStack: [], redoStack: [], events: [], ambient: 25, estop: false, goalPlan: null, resTab: 'relatorio', dashFull: false });
  st().loadTemplate('bebidas');
});

describe('uso da capacidade', () => {
  it('é o que sai dividido pelo que a máquina consegue entregar, com faixas didáticas', () => {
    expect(utilization(1000, 330)).toBeCloseTo(0.33);
    expect(utilization(0, 0)).toBe(0);
    expect(utilization(100, 250)).toBe(1);                 // nunca passa de 100%
    expect([0.2, 0.6, 0.9, 1].map(utilLevel)).toEqual(['ociosa', 'folga', 'bem', 'limite']);
  });

  it('o fluxo real é limitado pelas máquinas à frente: todas passam o que o gargalo deixa passar', () => {
    const s = st(); const sim = simulate(s.nodes, s.edges, { ...s.simCtx(), run: undefined });
    const flow = realFlow(s.nodes.map((n) => n.id), Object.fromEntries(s.nodes.map((n) => [n.id, sim.res[n.id].eff])), s.edges);
    s.nodes.forEach((n) => expect(flow[n.id]).toBeCloseTo(sim.production));          // linha em série: o mesmo fluxo em todas
    const uso = (t: string) => utilization(sim.res[find(t).id].cap, flow[find(t).id]);
    expect(uso('rotuladora')).toBeCloseTo(1);                                          // o gargalo está no limite
    expect(uso('tanque_agua')).toBeLessThan(0.8);                                      // o começo da linha tem folga (antes aparecia 100%)
  });

  it('divisão e junção: o fluxo se reparte em proporção ao que cada máquina entrega', () => {
    // A e B alimentam C (C absorve só 10); A entrega 6 e B entrega 4, então passam 6 e 4... mas C só absorve 10 no total
    const f = realFlow(['A', 'B', 'C'], { A: 6, B: 4, C: 10 }, [{ from: 'A', to: 'C' }, { from: 'B', to: 'C' }]);
    expect(f).toEqual({ A: 6, B: 4, C: 10 });
    const g = realFlow(['A', 'B', 'C'], { A: 6, B: 4, C: 5 }, [{ from: 'A', to: 'C' }, { from: 'B', to: 'C' }]);   // C só absorve 5
    expect(g.A).toBeCloseTo(3); expect(g.B).toBeCloseTo(2);
    const h = realFlow(['A', 'B', 'C'], { A: 10, B: 3, C: 4 }, [{ from: 'A', to: 'B' }, { from: 'A', to: 'C' }]);  // A divide para B e C
    expect(h.A).toBeCloseTo(7);
    expect(realFlow(['A', 'B'], { A: 5, B: 5 }, [{ from: 'A', to: 'B' }, { from: 'B', to: 'A' }]).A).toBeGreaterThanOrEqual(0);   // ciclo não trava
  });

  it('uma enchedora a mais ficaria ociosa porque a rotuladora continua limitando', () => {
    const e = find('enchedora');
    st().applyChange({ id: e.id, value: e.value, qty: 3, off: false });
    const s = st(); const sim = simulate(s.nodes, s.edges, { ...s.simCtx(), run: undefined });
    const r = sim.res[find('enchedora').id];
    const flow = realFlow(s.nodes.map((n) => n.id), Object.fromEntries(s.nodes.map((n) => [n.id, sim.res[n.id].eff])), s.edges);
    expect(r.cap).toBeGreaterThan(sim.production * 2);
    expect(utilization(r.cap, flow[find('enchedora').id])).toBeLessThan(0.5);
    expect(utilLevel(utilization(r.cap, flow[find('enchedora').id]))).toBe('ociosa');
  });
});

describe('o que mudou, em frases', () => {
  it('descreve quantidade, ritmo e liga/desliga', () => {
    const s = st(); const before = cfgOf(s.nodes, s.catalog);
    const e = find('enchedora'), ro = find('rotuladora');
    const after = before.map((m) => (m.id === e.id ? { ...m, qty: 3 } : m.id === ro.id ? { ...m, value: m.value + 1000, off: true } : m));
    const txt = describeChanges(before, after, s.catalog);
    expect(txt).toContain('+2 Enchedora (1 → 3 em paralelo)');
    expect(txt.some((t) => t.startsWith('Rotuladora:') && t.includes('→'))).toBe(true);
    expect(txt).toContain('Desligou Rotuladora');
    expect(describeChanges(before, before, s.catalog)).toEqual([]);
  });

  it('identifica máquina nova e máquina removida, e numera tipos repetidos', () => {
    const s = st(); const before = cfgOf(s.nodes, s.catalog);
    const sem = before.slice(1); const com = [...before, { ...before[0], id: 'novo', name: 'Tanque de água 2' }];
    expect(describeChanges(before, sem, s.catalog)).toEqual([`Removeu ${before[0].name}`]);
    expect(describeChanges(before, com, s.catalog)).toEqual(['Nova máquina: Tanque de água 2']);
    const dois = [...s.nodes, { ...s.nodes[0], id: 'x9' }];
    const nomes = machineNames(dois, s.catalog);
    expect(nomes['x9']).toBe('Tanque de água 2');
    expect(nomes[s.nodes[0].id]).toBe('Tanque de água 1');
  });
});

describe('fluxo: aplicar → quadro → simular → comparar', () => {
  it('aplicar guarda a V1 sozinha, volta ao quadro e lista a mudança; a segunda mudança não cria outra V1', () => {
    const e = find('enchedora');
    useStore.setState({ view: 'results' as never });
    expect(st().versions).toHaveLength(0);
    st().applyChange({ id: e.id, value: e.value, qty: 2, off: false });
    expect(st().view).toBe('logic');
    expect(st().versions).toHaveLength(1);
    expect(st().versions[0]).toMatchObject({ n: 1, kind: 'auto', label: 'Antes das mudanças' });
    expect(st().versions[0].machines.find((m) => m.type === 'enchedora')!.qty).toBe(1);   // a V1 guarda o ANTES
    expect(st().pendingBase).not.toBeNull();
    const ro = find('rotuladora');
    st().applyChange({ id: ro.id, value: ro.value, qty: 2, off: false });
    expect(st().versions).toHaveLength(1);
    const s = st();
    expect(describeChanges(s.pendingBase!, cfgOf(s.nodes, s.catalog), s.catalog)).toEqual(['+1 Enchedora (1 → 2 em paralelo)', '+1 Rotuladora (1 → 2 em paralelo)']);
  });

  it('o Play terminado vira a V2, com os números novos e o que foi mudado, e limpa a faixa de pendências', () => {
    const e = find('enchedora');
    st().applyChange({ id: e.id, value: e.value, qty: 2, off: false });
    rodarPlay();
    const [v1, v2] = st().versions;
    expect(st().versions).toHaveLength(2);
    expect(v2).toMatchObject({ n: 2, kind: 'play' });
    expect(v2.played!.durMin).toBe(30);
    expect(v2.played!.produced).toBeGreaterThan(1000);   // 30 min em ×60: antes fechava em 0
    expect(v2.machines.find((m) => m.type === 'enchedora')!.qty).toBe(2);
    expect(v2.prod).toBeGreaterThanOrEqual(v1.prod);
    expect(diffVersions(v1, v2, st().catalog)).toEqual(['+1 Enchedora (1 → 2 em paralelo)']);
    expect(st().pendingBase).toBeNull();
  });

  it('depois do Play que gera a segunda versão, Resultados abre direto na sub-aba Comparações', () => {
    expect(st().resTab).toBe('relatorio');
    const e = find('enchedora');
    st().applyChange({ id: e.id, value: e.value, qty: 2, off: false });
    expect(st().resTab).toBe('relatorio');
    rodarPlay();
    expect(st().versions).toHaveLength(2);
    expect(st().resTab).toBe('comparacoes');
  });

  it('o Dash pode ser ampliado e reduzido', () => {
    expect(st().dashFull).toBe(false);
    st().setDashFull(true);
    expect(st().dashFull).toBe(true);
    st().setDashFull(false);
    expect(st().dashFull).toBe(false);
  });

  it('Play sem mudanças cria a V1 (resultado do Play); repetir sem mexer só anota o Play na mesma versão', () => {
    rodarPlay();
    expect(st().versions).toHaveLength(1);
    expect(st().versions[0].kind).toBe('play');
    st().stopRun(); rodarPlay();
    expect(st().versions).toHaveLength(1);
  });

  it('"Salvar versão agora" cria versão manual, mas não repete uma configuração igual', () => {
    st().saveVersion();
    expect(st().versions).toHaveLength(1);
    expect(st().versions[0]).toMatchObject({ n: 1, kind: 'manual' });
    st().saveVersion();
    expect(st().versions).toHaveLength(1);
    expect(st().toast).toContain('já guarda esta mesma configuração');
    const e = find('enchedora');
    st().commitValue(e.id, 150);
    st().saveVersion();
    expect(st().versions.map((v) => v.n)).toEqual([1, 2]);
    expect(sameConfig(st().versions[1], st().nodes)).toBe(true);
  });

  it('"Desfazer as mudanças" volta quantidade, ritmo e liga/desliga ao estado da V1', () => {
    const e = find('enchedora');
    st().applyChange({ id: e.id, value: e.value + 10, qty: 3, off: false });
    st().discardPending();
    expect(find('enchedora')).toMatchObject({ qty: 1, value: e.value });
    expect(st().pendingBase).toBeNull();
    expect(sameConfig(st().versions[0], st().nodes)).toBe(true);
  });

  it('trocar de fábrica zera as versões', () => {
    st().saveVersion();
    st().loadTemplate('suco');
    expect(st().versions).toHaveLength(0);
    expect(st().versionSeq).toBe(0);
  });
});
