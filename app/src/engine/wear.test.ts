/* Idade e manutenção: o cálculo (igual ao do back-end), as ações da tela, as versões e o fato de a simulação não gastar a máquina. */
import { beforeEach, describe, expect, it } from 'vitest';
import { buildCatalog } from '../data/catalog';
import { computeChartData } from '../store/reportData';
import { useStore } from '../store/useStore';
import { cfgOf, describeChanges, sameConfig } from '../store/versions';
import { brDate, daysSince, HORAS_USO_ANO, hoursFromInputs, lifeYears, sinceText, todayISO, wearEffects, wearOf, withWear } from './wear';
import { machineTemp } from './thermal';
import { simulate } from './simulate';

const st = () => useStore.getState();
const find = (type: string) => st().nodes.find((n) => n.type === type)!;
const prod = () => { const s = st(); return simulate(s.nodes, s.edges, { ...s.simCtx(), run: undefined }).production; };
const catalog = buildCatalog();
/** A data (AAAA-MM-DD) de n dias atrás, no mesmo formato que a tela usa. */
const diasAtras = (n: number) => todayISO(new Date(Date.now() - n * 86400000));

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

  it('idade e dias viram horas, e os dias não passam da idade', () => {
    expect(hoursFromInputs(0, 0)).toEqual([0, 0]);
    expect(hoursFromInputs(2.5, 0)).toEqual([10000, 10000]);
    expect(hoursFromInputs(2.5, 91.3125)).toEqual([10000, 9000]);       // 91,3 dias = 3 meses = 1.000 h sem manutenção
    expect(hoursFromInputs(1, 5000)).toEqual([4000, 0]);
    expect(hoursFromInputs(-3, -3)).toEqual([0, 0]);
  });

  it('dias desde a data: sem data, data inválida ou no futuro contam 0', () => {
    const hoje = new Date(2026, 10, 3);                                  // 3 de novembro de 2026
    expect(daysSince(undefined, hoje)).toBe(0);
    expect(daysSince('', hoje)).toBe(0);
    expect(daysSince('lixo', hoje)).toBe(0);
    expect(daysSince('2026-11-03', hoje)).toBe(0);
    expect(daysSince('2026-10-24', hoje)).toBe(10);
    expect(daysSince('2025-11-03', hoje)).toBe(365);
    expect(daysSince('2027-01-01', hoje)).toBe(0);
    expect(todayISO(hoje)).toBe('2026-11-03');
    expect(brDate('2026-03-09')).toBe('09/03/2026');
  });

  it('texto do tempo sem manutenção', () => {
    expect([sinceText(0), sinceText(1), sinceText(12), sinceText(91), sinceText(365), sinceText(800)]).toEqual(['hoje', '1 dia', '12 dias', '3 meses', '12 meses', '2 anos e 2 meses']);
  });

  it('intervalos por categoria: 3 meses (envase, térmico, pós-envase) ou 6 meses (insumos, preparo, frio)', () => {
    const meses = Object.fromEntries(['tanque_agua', 'misturador', 'pasteurizador', 'enchedora', 'rotuladora', 'camara_fria'].map((k) => [k, Math.round((catalog[k].maintH ?? 0) / HORAS_USO_ANO * 12)]));
    expect(meses).toEqual({ tanque_agua: 6, misturador: 6, pasteurizador: 3, enchedora: 3, rotuladora: 3, camara_fria: 6 });
  });

  it('vida útil por categoria vem do catálogo (iguais às do banco)', () => {
    expect(lifeYears(catalog.enchedora)).toBeCloseTo(25000 / HORAS_USO_ANO);
    expect(lifeYears(catalog.rotuladora)).toBeCloseTo(30000 / HORAS_USO_ANO);
    expect(wearEffects(catalog.rotuladora, 3.75, 365).cap).toBeCloseTo(0.85);   // metade da vida + última manutenção há 1 ano (muito atrasada)
  });

  it('withWear deixa a máquina nova sem campos e preenche os efeitos da velha', () => {
    const nova = withWear({ id: 'a', type: 'enchedora', x: 0, y: 0, value: 200, qty: 1, off: false, wearCap: 0.5 }, catalog.enchedora);
    expect(nova.wearCap).toBeUndefined();
    const velha = withWear({ id: 'a', type: 'enchedora', x: 0, y: 0, value: 200, qty: 1, off: false, ageYears: 6.25 }, catalog.enchedora);
    expect(velha.wearCap).toBeCloseTo(0.8); expect(velha.wearRisk).toBeCloseTo(0.08); expect(velha.wearTemp).toBeCloseTo(8);
  });
});

describe('ações da tela', () => {
  it('a idade e a manutenção atrasada baixam o rendimento, sobem o risco e esquentam mais; nova de novo volta ao normal', () => {
    const antes = prod();
    const ro = find('rotuladora');
    const t0 = machineTemp(st().catalog.rotuladora, ro, simulate(st().nodes, st().edges, { ...st().simCtx(), run: undefined }).res[ro.id], 25);
    st().setAge(ro.id, 3.75);
    st().setMaintDate(ro.id, diasAtras(365));
    const r = find('rotuladora');
    expect(r.ageYears).toBe(3.75); expect(r.maintDate).toBe(diasAtras(365));
    expect(prod()).toBeCloseTo(antes * 0.85);
    const sim = simulate(st().nodes, st().edges, { ...st().simCtx(), run: undefined });
    expect(sim.res[r.id].risk).toBeCloseTo(0.02 + 0.02 + 0.04);
    expect(machineTemp(st().catalog.rotuladora, r, sim.res[r.id], 25)).toBeGreaterThan(t0 + 5);
    st().agePreset([r.id], 0);
    expect(find('rotuladora').wearCap).toBeUndefined();
    expect(find('rotuladora').maintDate).toBeUndefined();       // sem idade não há data
    expect(prod()).toBeCloseTo(antes);
  });

  it('o status pela data: em dia, atenção (80% do intervalo) e atrasada (rotuladora: 3 meses)', () => {
    const ro = find('rotuladora');
    st().setAge(ro.id, 5);
    const status = (d: number) => { st().setMaintDate(ro.id, diasAtras(d)); return wearEffects(st().catalog.rotuladora, 5, daysSince(find('rotuladora').maintDate)).status; };
    expect([status(30), status(80), status(95)]).toEqual(['ok', 'atencao', 'manutencao_atrasada']);
  });

  it('sem data informada a máquina conta como em dia, mesmo velha', () => {
    const ro = find('rotuladora');
    st().setAge(ro.id, 3.75);
    expect(find('rotuladora').maintDate).toBeUndefined();
    expect(find('rotuladora').wearCap).toBeCloseTo(0.9);           // só a perda da idade
    st().setMaintDate(ro.id, diasAtras(500));
    expect(find('rotuladora').wearCap).toBeCloseTo(0.85);
    st().setMaintDate(ro.id, null);
    expect(find('rotuladora').maintDate).toBeUndefined();
    expect(find('rotuladora').wearCap).toBeCloseTo(0.9);
  });

  it('valores absurdos: idade de 0 a 60 anos; data no futuro, antes de 1950 ou inválida é recusada', () => {
    const en = find('enchedora');
    st().setAge(en.id, -5); expect(find('enchedora').ageYears).toBeUndefined();
    st().setAge(en.id, 500); expect(find('enchedora').ageYears).toBe(60);
    st().setAge(en.id, NaN); expect(find('enchedora').ageYears).toBe(60);
    const amanha = todayISO(new Date(Date.now() + 86400000 * 2));
    st().setMaintDate(en.id, amanha); expect(find('enchedora').maintDate).toBeUndefined(); expect(st().toast).toContain('futuro');
    st().setMaintDate(en.id, '1949-12-31'); expect(find('enchedora').maintDate).toBeUndefined(); expect(st().toast).toContain('antiga');
    st().setMaintDate(en.id, '12/03/2026'); expect(find('enchedora').maintDate).toBeUndefined(); expect(st().toast).toContain('inválida');
    st().setMaintDate(en.id, diasAtras(10)); expect(find('enchedora').maintDate).toBe(diasAtras(10));
    st().setMaintDate(en.id, todayISO()); expect(find('enchedora').maintDate).toBe(todayISO());      // hoje vale
  });

  it('presets usam a vida útil de cada máquina; "Fim de vida" = 100%', () => {
    const todas = st().nodes.map((n) => n.id);
    st().agePreset(todas, 1);
    st().nodes.forEach((n) => expect(n.ageYears).toBeCloseTo(Math.round(lifeYears(st().catalog[n.type]) * 10) / 10));
    expect(st().nodes.every((n) => n.wearCap !== undefined && n.wearCap <= 0.8 + 1e-9)).toBe(true);
    st().agePreset(todas, 0);
    expect(st().nodes.every((n) => n.ageYears === undefined && n.wearCap === undefined)).toBe(true);
  });

  it('"Fiz a manutenção" põe a data de hoje e a idade continua; dá para desfazer', () => {
    const en = find('enchedora');
    st().setAge(en.id, 6.25); st().setMaintDate(en.id, diasAtras(730));
    const lento = prod();
    st().doMaintenance(en.id);
    expect(find('enchedora').maintDate).toBe(todayISO());
    expect(find('enchedora').ageYears).toBe(6.25);
    expect(find('enchedora').wearCap).toBeCloseTo(0.8);                    // fim de vida: só a perda da idade (sem o atraso)
    expect(prod()).toBeGreaterThanOrEqual(lento);
    st().undo();
    expect(find('enchedora').maintDate).toBe(diasAtras(730));
  });

  it('trocar de fábrica não leva a idade junto', () => {
    st().setAge(find('enchedora').id, 5);
    st().loadTemplate('suco');
    expect(st().nodes.every((n) => n.ageYears === undefined && n.wearCap === undefined)).toBe(true);
  });
});

describe('simular não gasta a fábrica', () => {
  it('rodar o Play várias vezes não muda idade, manutenção nem produção', () => {
    const en = find('enchedora');
    st().setAge(en.id, 3); st().setMaintDate(en.id, diasAtras(180));
    const antes = JSON.stringify(st().nodes.map((n) => [n.ageYears, n.maintDate, n.wearCap]));
    const p0 = prod();
    for (let k = 0; k < 3; k++) {
      st().stopRun(); st().setRunSpeed(60); st().setRunDur(30); st().startOrToggleRun();
      for (let i = 0; i < 4; i++) st().tickRun();
    }
    expect(JSON.stringify(st().nodes.map((n) => [n.ageYears, n.maintDate, n.wearCap]))).toBe(antes);
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
    st().setAge(en.id, 4); st().setMaintDate(en.id, diasAtras(300));
    expect(sameConfig(st().versions[0], st().nodes)).toBe(false);
    st().saveVersion();
    expect(st().versions).toHaveLength(2);
    const txt = describeChanges(cfgOf(st().nodes.map((n) => ({ ...n, ageYears: undefined, maintDate: undefined })), st().catalog), cfgOf(st().nodes, st().catalog), st().catalog);
    expect(txt).toContain('Enchedora: idade 0 → 4 anos');
    expect(txt).toContain(`Enchedora: última manutenção sem data → ${brDate(diasAtras(300))}`);
    st().restoreVersion(1);
    expect(find('enchedora').ageYears).toBeUndefined();
    expect(find('enchedora').wearCap).toBeUndefined();
    st().restoreVersion(2);
    expect(find('enchedora').ageYears).toBe(4); expect(find('enchedora').maintDate).toBe(diasAtras(300));
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
