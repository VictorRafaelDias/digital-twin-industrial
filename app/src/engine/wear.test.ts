/* Idade e manutenção: o cálculo (igual ao do back-end), as ações da tela, as versões e o fato de a simulação não gastar a máquina. */
import { beforeEach, describe, expect, it } from 'vitest';
import { buildCatalog } from '../data/catalog';
import { computeChartData } from '../store/reportData';
import { useStore } from '../store/useStore';
import { cfgOf, describeChanges, sameConfig } from '../store/versions';
import { HORAS_USO_ANO, hoursFromInputs, lifeYears, wearEffects, wearOf, withWear } from './wear';
import { machineTemp } from './thermal';
import { simulate } from './simulate';

const st = () => useStore.getState();
const find = (type: string) => st().nodes.find((n) => n.type === type)!;
const prod = () => { const s = st(); return simulate(s.nodes, s.edges, { ...s.simCtx(), run: undefined }).production; };
const catalog = buildCatalog();

beforeEach(() => {
  useStore.setState({ server: null, serverFactoryId: null, nodes: [], edges: [], undoStack: [], redoStack: [], events: [], ambient: 25, estop: false, goalPlan: null, resTab: 'relatorio' });
  st().loadTemplate('bebidas');
});

describe('o cálculo (os mesmos números do back-end)', () => {
  it('máquina nova e em dia não muda nada', () => {
    const w = wearOf(0, 0, 25000, 800);
    expect([w.cap, w.risk, w.temp, w.status, w.residual]).toEqual([1, 0, 0, 'ok', 1]);
  });

  it('curva da idade e da manutenção atrasada', () => {
    const meio = wearOf(12500, 12500, 25000, 800);
    expect(meio.cap).toBeCloseTo(0.9); expect(meio.risk).toBeCloseTo(0.02); expect(meio.temp).toBeCloseTo(2); expect(meio.status).toBe('ok');
    const fim = wearOf(25000, 25000, 25000, 800);
    expect(fim.cap).toBeCloseTo(0.8); expect(fim.risk).toBeCloseTo(0.08); expect(fim.temp).toBeCloseTo(8); expect(fim.status).toBe('fim_de_vida');
    expect(fim.residual).toBeCloseTo(0.1); expect(fim.hoursOfLifeLeft).toBe(0);
    expect(wearOf(1700, 0, 25000, 800).status).toBe('manutencao_atrasada');
    expect(wearOf(700, 0, 25000, 800).status).toBe('atencao');
    const ruim = wearOf(1e9, 0, 25000, 800);
    expect(ruim.cap).toBe(0.75); expect(ruim.temp).toBeCloseTo(12);              // perda máxima: 20% pela idade + 5% pelo atraso
  });

  it('idade e meses viram horas, e os meses não passam da idade', () => {
    expect(hoursFromInputs(0, 0)).toEqual([0, 0]);
    expect(hoursFromInputs(2.5, 0)).toEqual([10000, 10000]);
    expect(hoursFromInputs(2.5, 6)).toEqual([10000, 8000]);
    expect(hoursFromInputs(1, 100)).toEqual([4000, 0]);
    expect(hoursFromInputs(-3, -3)).toEqual([0, 0]);
  });

  it('vida útil por categoria vem do catálogo (iguais às do banco)', () => {
    expect(lifeYears(catalog.enchedora)).toBeCloseTo(25000 / HORAS_USO_ANO);
    expect(lifeYears(catalog.rotuladora)).toBeCloseTo(30000 / HORAS_USO_ANO);
    expect(wearEffects(catalog.rotuladora, 3.75, 12).cap).toBeCloseTo(0.85);   // metade da vida + manutenção muito atrasada
  });

  it('withWear deixa a máquina nova sem campos e preenche os efeitos da velha', () => {
    const nova = withWear({ id: 'a', type: 'enchedora', x: 0, y: 0, value: 200, qty: 1, off: false, wearCap: 0.5 }, catalog.enchedora);
    expect(nova.wearCap).toBeUndefined();
    const velha = withWear({ id: 'a', type: 'enchedora', x: 0, y: 0, value: 200, qty: 1, off: false, ageYears: 6.25 }, catalog.enchedora);
    expect(velha.wearCap).toBeCloseTo(0.8); expect(velha.wearRisk).toBeCloseTo(0.08); expect(velha.wearTemp).toBeCloseTo(8);
  });
});

describe('ações da tela', () => {
  it('a idade baixa o rendimento, sobe o risco e esquenta mais; nova de novo volta ao normal', () => {
    const antes = prod();
    const ro = find('rotuladora');
    const t0 = machineTemp(st().catalog.rotuladora, ro, simulate(st().nodes, st().edges, { ...st().simCtx(), run: undefined }).res[ro.id], 25);
    st().setAge(ro.id, 3.75);
    st().setMaintMonths(ro.id, 12);
    const r = find('rotuladora');
    expect(r.ageYears).toBe(3.75); expect(r.maintMonths).toBe(12);
    expect(prod()).toBeCloseTo(antes * 0.85);
    const sim = simulate(st().nodes, st().edges, { ...st().simCtx(), run: undefined });
    expect(sim.res[r.id].risk).toBeCloseTo(0.02 + 0.02 + 0.04);
    expect(machineTemp(st().catalog.rotuladora, r, sim.res[r.id], 25)).toBeGreaterThan(t0 + 5);
    st().agePreset([r.id], 0);
    expect(find('rotuladora').wearCap).toBeUndefined();
    expect(find('rotuladora').maintMonths).toBeUndefined();     // sem idade não há meses
    expect(prod()).toBeCloseTo(antes);
  });

  it('valores absurdos são ajustados: idade 0 a 60 anos, e os meses não passam da idade', () => {
    const en = find('enchedora');
    st().setAge(en.id, -5); expect(find('enchedora').ageYears).toBeUndefined();
    st().setAge(en.id, 500); expect(find('enchedora').ageYears).toBe(60);
    st().setMaintMonths(en.id, 5000); expect(find('enchedora').maintMonths).toBe(720);
    st().setAge(en.id, 2); expect(find('enchedora').maintMonths).toBe(24);          // a idade diminuiu: os meses acompanham
    st().setAge(en.id, NaN); expect(find('enchedora').ageYears).toBe(2);
    st().setMaintMonths(en.id, Infinity); expect(find('enchedora').maintMonths).toBe(24);
  });

  it('presets usam a vida útil de cada máquina; "Fim de vida" = 100%', () => {
    const todas = st().nodes.map((n) => n.id);
    st().agePreset(todas, 1);
    st().nodes.forEach((n) => expect(n.ageYears).toBeCloseTo(Math.round(lifeYears(st().catalog[n.type]) * 10) / 10));
    expect(st().nodes.every((n) => n.wearCap !== undefined && n.wearCap <= 0.8 + 1e-9)).toBe(true);
    st().agePreset(todas, 0);
    expect(st().nodes.every((n) => n.ageYears === undefined && n.wearCap === undefined)).toBe(true);
  });

  it('"Fiz a manutenção" zera os meses e a idade continua; dá para desfazer', () => {
    const en = find('enchedora');
    st().setAge(en.id, 6.25); st().setMaintMonths(en.id, 24);
    const lento = prod();
    st().doMaintenance(en.id);
    expect(find('enchedora').maintMonths).toBeUndefined();
    expect(find('enchedora').ageYears).toBe(6.25);
    expect(find('enchedora').wearCap).toBeCloseTo(0.8);                    // fim de vida: só a perda da idade (sem o atraso)
    expect(prod()).toBeGreaterThanOrEqual(lento);
    st().undo();
    expect(find('enchedora').maintMonths).toBe(24);
  });

  it('máquina nova no quadro entra nova; trocar de fábrica não leva a idade junto', () => {
    st().setAge(find('enchedora').id, 5);
    st().loadTemplate('suco');
    expect(st().nodes.every((n) => n.ageYears === undefined && n.wearCap === undefined)).toBe(true);
  });
});

describe('simular não gasta a fábrica', () => {
  it('rodar o Play várias vezes não muda idade, manutenção nem produção', () => {
    const en = find('enchedora');
    st().setAge(en.id, 3); st().setMaintMonths(en.id, 6);
    const antes = JSON.stringify(st().nodes.map((n) => [n.ageYears, n.maintMonths, n.wearCap]));
    const p0 = prod();
    for (let k = 0; k < 3; k++) {
      st().stopRun(); st().setRunSpeed(60); st().setRunDur(30); st().startOrToggleRun();
      for (let i = 0; i < 4; i++) st().tickRun();
    }
    expect(JSON.stringify(st().nodes.map((n) => [n.ageYears, n.maintMonths, n.wearCap]))).toBe(antes);
    expect(prod()).toBe(p0);
  });
});

describe('gráficos e versões', () => {
  it('o gráfico de desgaste usa a idade informada (sem servidor) e só aparece se alguma máquina não é nova', () => {
    const cd0 = computeChartData({ nodes: st().nodes, edges: st().edges, catalog: st().catalog, ambient: 25, ctx: { ...st().simCtx(), run: undefined } });
    expect(cd0.hasWear).toBe(false);
    st().setAge(find('pasteurizador').id, 3.75);
    const cd = computeChartData({ nodes: st().nodes, edges: st().edges, catalog: st().catalog, ambient: 25, ctx: { ...st().simCtx(), run: undefined } });
    expect(cd.hasWear).toBe(true);
    const past = cd.wearRows.find((r) => r.label === 'Pasteurizador')!;
    expect(past.a).toBeCloseTo((3.75 * HORAS_USO_ANO) / 30000 * 100);       // térmico: 30.000 h de vida
    expect(cd.wearRows.filter((r) => r.a === 0)).toHaveLength(7);
  });

  it('a idade conta na versão: configuração diferente, frases do que mudou e voltar restaura a idade', () => {
    st().saveVersion();
    const en = find('enchedora');
    st().setAge(en.id, 4); st().setMaintMonths(en.id, 10);
    expect(sameConfig(st().versions[0], st().nodes)).toBe(false);
    st().saveVersion();
    expect(st().versions).toHaveLength(2);
    const txt = describeChanges(cfgOf(st().nodes.map((n) => ({ ...n, ageYears: undefined, maintMonths: undefined })), st().catalog), cfgOf(st().nodes, st().catalog), st().catalog);
    expect(txt).toContain('Enchedora: idade 0 → 4 anos');
    expect(txt).toContain('Enchedora: 0 → 10 meses sem manutenção');
    st().restoreVersion(1);
    expect(find('enchedora').ageYears).toBeUndefined();
    expect(find('enchedora').wearCap).toBeUndefined();
    st().restoreVersion(2);
    expect(find('enchedora').ageYears).toBe(4); expect(find('enchedora').maintMonths).toBe(10);
    expect(find('enchedora').wearCap).toBeLessThan(1);
  });

  it('versão vinda do servidor (sem idade) não apaga a idade que está no quadro', () => {
    const en = find('enchedora');
    st().setAge(en.id, 4);
    useStore.setState({ versions: [{ n: 1, label: 'do servidor', kind: 'servidor', at: '', prod: 1, risk: 0, energy: 1, costPerBottle: null, bottleneck: null,
      machines: st().nodes.map((n) => ({ id: n.id, type: n.type, name: n.type, value: n.value, qty: 1, off: false, cap: 1, eff: 1 })) }], versionSeq: 1 });
    st().restoreVersion(1);
    expect(find('enchedora').ageYears).toBe(4);
  });
});
