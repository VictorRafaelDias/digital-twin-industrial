/* Valor estimado, voltar a uma versão e o gerador de PDF (a página HTML que vai para a impressão). */
import { beforeEach, describe, expect, it } from 'vitest';
import { buildReportHtml, esc, type ExportKind } from '../export/reportHtml';
import { bottleneckReport } from '../engine/bottleneck';
import { costOf } from '../engine/cost';
import { computeChartData } from './reportData';
import { useStore } from './useStore';
import { ECON_DEFAULTS, effectivePrice, gainReais, moneyBig, moneyDelta, operatingDays, paybackText, scheduleHours, scheduleOf, scheduleText, valueCompare, versionProfit, versionValue } from './value';
import { pickCompare } from './versions';

const st = () => useStore.getState();
const find = (type: string) => st().nodes.find((n) => n.type === type)!;

beforeEach(() => {
  useStore.setState({ server: null, serverFactoryId: null, nodes: [], edges: [], undoStack: [], redoStack: [], events: [], ambient: 25, estop: false, goalPlan: null, resTab: 'relatorio', cmp: { a: null, b: null } });
  st().loadTemplate('bebidas');
});

describe('valor estimado dos equipamentos', () => {
  it('uma unidade a mais custa o preço da máquina (faixa), e o total sobe na mesma medida', () => {
    st().saveVersion();
    const ro = find('rotuladora');
    st().applyChange({ id: ro.id, value: ro.value, qty: 2, off: false });
    st().saveVersion();
    const [v1, v2] = st().versions;
    const preco = costOf(st().catalog.rotuladora, 1)!;
    expect(preco.max).toBeGreaterThan(0);
    const c = valueCompare(v1, v2, st().catalog);
    expect(c.delta).toEqual(preco);
    expect(c.totalB.min - c.totalA.min).toBe(preco.min);
    expect(c.rows.find((r) => r.name === 'Rotuladora')!.delta).toEqual(preco);
    expect(versionValue(v2, st().catalog)).toEqual(c.totalB);
    expect(moneyDelta(c.delta)).toMatch(/^\+R\$ .* a \+R\$ /);
  });

  it('mudar só o ritmo não custa equipamento; máquinas sem preço ficam de fora e são listadas', () => {
    st().saveVersion();
    const e = find('enchedora');
    st().commitValue(e.id, e.value + 10);
    st().saveVersion();
    const [v1, v2] = st().versions;
    const c = valueCompare(v1, v2, st().catalog);
    expect(moneyDelta(c.delta)).toBe('sem mudança');
    expect(c.perThousand).toBeNull();
    const semPreco = Object.values(st().catalog).filter((t) => !t.cost || t.cost.max === 0).map((t) => t.name);
    c.unpriced.forEach((nome) => expect(semPreco).toContain(nome));
  });

  it('ganho de produção com gasto vira "R$ por 1.000 garrafas/h"', () => {
    const v1 = { ...(() => { st().saveVersion(); return st().versions[0]; })() };
    const ro = find('rotuladora');
    st().applyChange({ id: ro.id, value: ro.value, qty: 2, off: false });
    const en = find('enchedora');
    st().applyChange({ id: en.id, value: en.value, qty: 2, off: false });
    st().saveVersion();
    const v2 = st().versions[st().versions.length - 1];
    const c = valueCompare(v1, v2, st().catalog);
    expect(c.gainPerHour).toBeGreaterThan(0);
    expect(c.perThousand).toBeGreaterThan(0);
  });

  it('moneyDelta formata faixas com sinal', () => {
    expect(moneyDelta({ min: 40000, max: 140000 })).toBe('+R$ 40 mil a +R$ 140 mil');
    expect(moneyDelta({ min: -10000, max: 0 })).toBe('−R$ 10 mil a R$ 0');
    expect(moneyDelta(null)).toBe('—');
  });
});

describe('voltar a uma versão', () => {
  it('devolve ritmo, unidades e liga/desliga da versão, guardando antes o que havia', () => {
    st().saveVersion();                                   // V1 = como está
    const en = find('enchedora'), ro = find('rotuladora');
    st().commitValue(en.id, en.value + 15);
    st().applyChange({ id: ro.id, value: ro.value, qty: 3, off: false });
    const antes = st().versions.length;
    st().restoreVersion(1);
    expect(find('enchedora').value).toBe(en.value);
    expect(find('rotuladora').qty).toBe(1);
    expect(st().view).toBe('logic');
    expect(st().versions.length).toBeGreaterThanOrEqual(antes);   // nada se perdeu
    expect(st().toast).toContain('Voltou para a configuração da V1');
    st().undo();                                          // e dá para desfazer
    expect(find('rotuladora').qty).toBe(3);
  });

  it('máquina que não existe mais não é recriada, e o aviso diz quantas', () => {
    st().saveVersion();
    st().removeNode(find('esteira').id);
    st().restoreVersion(1);
    expect(st().nodes.some((n) => n.type === 'esteira')).toBe(false);
    expect(st().toast).toContain('1 máquina(s) dela não existem mais');
  });

  it('versão que não existe não faz nada', () => {
    const antes = JSON.stringify(st().nodes);
    st().restoreVersion(99);
    expect(JSON.stringify(st().nodes)).toBe(antes);
  });
});

describe('escolha das versões comparadas', () => {
  it('sem escolha usa as duas mais recentes; com escolha usa as escolhidas; se a escolhida sumiu, volta ao padrão', () => {
    st().saveVersion();
    const e = find('enchedora'); st().commitValue(e.id, e.value + 5); st().saveVersion();
    st().commitValue(e.id, e.value + 10); st().saveVersion();
    const vs = st().versions;
    expect(pickCompare(vs, { a: null, b: null })).toEqual({ a: vs[1], b: vs[2] });
    expect(pickCompare(vs, { a: 1, b: 3 })).toEqual({ a: vs[0], b: vs[2] });
    expect(pickCompare(vs, { a: 99, b: null }).a).toBe(vs[1]);
    expect(pickCompare([], { a: null, b: null })).toEqual({ a: undefined, b: undefined });
  });
});

describe('PDF: a página que vai para a impressão', () => {
  const montar = (kind: ExportKind) => {
    const s = st(); const ctx = { ...s.simCtx(), run: undefined };
    const { a, b } = pickCompare(s.versions, s.cmp);
    return buildReportHtml({
      kind, factory: s.plantName, ambient: s.ambient, tariff: s.tariff, server: false, generatedAt: '03/11/26 10:00',
      cd: computeChartData({ nodes: s.nodes, edges: s.edges, catalog: s.catalog, ambient: s.ambient, ctx }),
      nodes: s.nodes, catalog: s.catalog, bn: bottleneckReport(s.nodes, s.edges, ctx), versions: s.versions, a, b,
    });
  };
  const duasVersoes = () => { st().saveVersion(); const ro = find('rotuladora'); st().applyChange({ id: ro.id, value: ro.value, qty: 2, off: false }); st().saveVersion(); };

  it('só o relatório: números, gargalo, opções, tabela das máquinas e gráficos; sem comparação', () => {
    const h = montar('relatorio');
    expect(h).toContain('Relatório da fábrica');
    expect(h).toContain('Gargalo: Rotuladora');
    expect(h).toContain('11.400');
    expect(h).toContain('Máquina por máquina');
    expect(h).toContain('<svg');                                    // a rosca de energia
    expect(h).toContain('Risco de falha');
    expect(h).toContain('Temperatura das máquinas');
    expect(h).not.toContain('Comparação de versões');
    expect(h).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('só a comparação: versões, o que mudou, uso por versão e valor estimado', () => {
    duasVersoes();
    const h = montar('comparacao');
    expect(h).toContain('Comparação de versões: V1 × V2');
    expect(h).toContain('+1 Rotuladora (1 → 2 em paralelo)');
    expect(h).toContain('Valor estimado dos equipamentos');
    expect(h).toContain('Uso das máquinas: V1 (azul) × V2 (laranja)');
    expect(h).not.toContain('1. Relatório da fábrica');
    expect(h).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('relatório + comparação: as duas partes, numeradas, com quebra de página', () => {
    duasVersoes();
    const h = montar('ambos');
    expect(h).toContain('1. Relatório da fábrica');
    expect(h).toContain('2. Comparação de versões');
    expect(h).toContain('class="pb"');
  });

  it('a comparação respeita as versões escolhidas', () => {
    duasVersoes();
    const e = find('enchedora'); st().commitValue(e.id, e.value + 5); st().saveVersion();
    st().setCmp({ a: 1, b: 3 });
    expect(montar('comparacao')).toContain('V1 × V3');
  });

  it('sem duas versões, a parte de comparação avisa em vez de quebrar', () => {
    expect(montar('ambos')).toContain('Ainda não há duas versões para comparar');
  });

  it('textos são escapados (nome de fábrica com HTML não vira código)', () => {
    st().setPlantName('<img src=x onerror=alert(1)>');
    const h = montar('relatorio');
    expect(h).not.toContain('<img src=x');
    expect(h).toContain('&lt;img src=x');
    expect(esc('a<b>&"')).toBe('a&lt;b&gt;&amp;&quot;');
  });
});


describe('ganho em reais', () => {
  const fakeV = (prod: number) => ({ prod } as never);
  const delta = { min: 80_000, max: 120_000 };

  it('garrafas a mais × horas por ano × preço; lucro = % do preço; retorno = investimento ÷ lucro por mês', () => {
    const g = gainReais(fakeV(10_000), fakeV(11_000), delta, { price: 5, hoursYear: 4000, margin: 15 })!;
    expect(g.gainPerHour).toBe(1000);
    expect(g.bottlesYear).toBe(4_000_000);
    expect(g.revenueYear).toBe(20_000_000);
    expect(g.profitYear).toBe(3_000_000);
    expect(g.invest).toBe(100_000);
    expect(g.paybackMonths).toBeCloseTo(100_000 / (3_000_000 / 12), 6);   // 0,4 mês
    expect(g.investRef).toBeNull();
  });

  it('sem preço, sem horas ou preço zero: não calcula', () => {
    expect(gainReais(fakeV(1), fakeV(2), delta, { price: null, hoursYear: 4000, margin: 15 })).toBeNull();
    expect(gainReais(fakeV(1), fakeV(2), delta, { price: 0, hoursYear: 4000, margin: 15 })).toBeNull();
    expect(gainReais(fakeV(1), fakeV(2), delta, { price: 5, hoursYear: 0, margin: 15 })).toBeNull();
  });

  it('perda de produção dá valor negativo e sem retorno; sem investimento não há retorno (só ajuste de ritmo)', () => {
    const perda = gainReais(fakeV(11_000), fakeV(10_000), delta, { price: 5, hoursYear: 4000, margin: 15 })!;
    expect(perda.revenueYear).toBeLessThan(0); expect(perda.paybackMonths).toBeNull();
    const ritmo = gainReais(fakeV(10_000), fakeV(11_000), { min: 0, max: 0 }, { price: 5, hoursYear: 4000, margin: 15 })!;
    expect(ritmo.invest).toBeNull(); expect(ritmo.paybackMonths).toBeNull(); expect(ritmo.profitYear).toBeGreaterThan(0);
  });

  it('com o custo real da linha (R$ por 1.000 garrafas/h) o retorno é calculado em separado e é mais lento', () => {
    const g = gainReais(fakeV(10_000), fakeV(11_000), delta, { price: 5, hoursYear: 4000, margin: 15 }, 3_820_000)!;
    expect(g.investRef).toBeCloseTo(3_820_000);
    expect(g.paybackRefMonths!).toBeGreaterThan(g.paybackMonths!);
  });

  it('formatação: reais, mil, mi, bi, sinal e prazo', () => {
    expect(moneyBig(850)).toBe('R$ 850'); expect(moneyBig(40_000)).toBe('R$ 40 mil');
    expect(moneyBig(3_200_000)).toBe('R$ 3,2 mi'); expect(moneyBig(1_400_000_000)).toBe('R$ 1,4 bi'); expect(moneyBig(-2_000_000)).toBe('−R$ 2,0 mi');
    expect(paybackText(null)).toBe('—'); expect(paybackText(0.4)).toBe('menos de 1 mês'); expect(paybackText(5.25)).toMatch(/meses$/); expect(paybackText(30)).toMatch(/anos$/);
  });

  it('o preço digitado vale mais que o do exemplo; sem os dois, não há preço', () => {
    expect(effectivePrice(7, { min: 4, max: 6 })).toBe(7);
    expect(effectivePrice(null, { min: 4, max: 6 })).toBe(5);
    expect(effectivePrice(null, null)).toBeNull();
  });

  it('carregar uma empresa real limpa o preço digitado; setEcon valida os limites', () => {
    st().setEcon({ price: 9 });
    expect(st().econPrice).toBe(9);
    st().loadTemplate('quilmes_gatorade_antes');
    expect(st().econPrice).toBeNull(); expect(st().caseKey).toBe('quilmes_gatorade_antes');
    st().setEcon({ hours: -5, margin: 500 });
    expect(st().econHours).toBe(4000); expect(st().econMargin).toBe(100);
    st().setEcon({ hours: 6000, margin: 12 }); expect(st().econHours).toBe(6000); expect(st().econMargin).toBe(12);
    st().setEcon({ hours: 4000, margin: 15 });
  });

  it('cada versão tem o seu próprio resultado por ano (e a diferença entre duas é a conta do ganho)', () => {
    st().loadTemplate('quilmes_gatorade_antes');
    st().saveVersion();
    const ench = find('enchedora');
    st().applyChange({ id: ench.id, value: ench.value, qty: ench.qty + 1, off: false });
    st().saveVersion();
    const [v1, v2] = st().versions;
    const e = { price: 5, hoursYear: 4000, margin: 15 };
    const p1 = versionProfit(v1, e, st().catalog)!, p2 = versionProfit(v2, e, st().catalog)!;
    expect(p1.bph).toBe(v1.prod); expect(p1.bottlesYear).toBe(v1.prod * 4000);
    expect(p1.revenueYear).toBe(v1.prod * 4000 * 5); expect(p1.profitYear).toBeCloseTo(p1.revenueYear * 0.15);
    expect(p2.equipment).toBeGreaterThan(p1.equipment);                          // a V2 tem uma enchedora a mais
    const g = gainReais(v1, v2, valueCompare(v1, v2, st().catalog).delta, e)!;
    expect(g.profitYear).toBeCloseTo(p2.profitYear - p1.profitYear);             // diferença = depois − antes
    expect(g.revenueYear).toBeCloseTo(p2.revenueYear - p1.revenueYear);
    expect(versionProfit(v1, { ...e, price: null }, st().catalog)).toBeNull();   // sem preço, não há conta
  });

  it('trocar antes e depois inverte o sinal (a aba mostra "faz perder" em vez de "rende")', () => {
    const a = { prod: 11_000 } as never, b = { prod: 10_000 } as never;
    const g = gainReais(a, b, { min: 0, max: 0 }, { price: 5, hoursYear: 4000, margin: 15 })!;
    const inv = gainReais(b, a, { min: 0, max: 0 }, { price: 5, hoursYear: 4000, margin: 15 })!;
    expect(g.profitYear).toBeLessThan(0); expect(inv.profitYear).toBeCloseTo(-g.profitYear);
  });

  it('o PDF da comparação traz o bloco de ganho em reais com o preço e o aviso de teto', () => {
    st().loadTemplate('quilmes_gatorade_antes');
    st().saveVersion();
    const ench = find('enchedora');
    st().applyChange({ id: ench.id, value: ench.value, qty: ench.qty + 1, off: false });
    st().saveVersion();
    const [v1, v2] = st().versions;
    const ctx = { ...st().simCtx(), run: undefined };
    const cd = computeChartData({ nodes: st().nodes, edges: st().edges, catalog: st().catalog, ambient: st().ambient, ctx });
    const html = buildReportHtml({ kind: 'comparacao', factory: 'X', ambient: 25, tariff: 0.85, server: false, generatedAt: 'hoje', scheduleText: scheduleText(scheduleOf(st())), cd, nodes: st().nodes, catalog: st().catalog, bn: bottleneckReport(st().nodes, st().edges, ctx), versions: st().versions, a: v1, b: v2, econ: { price: 5.2, hoursYear: 4000, margin: 15 } });
    expect(html).toContain('Perspectiva de receita'); expect(html).toContain('teto'); expect(html).toContain('R$ 5,20');
    expect(html).toContain(`Antes (V${v1.n})`); expect(html).toContain(`Depois (V${v2.n})`);
    expect(html).toContain('Receita por ano'); expect(html).toContain('antes de qualquer custo'); expect(html).toContain('16 h por dia');
  });
});


describe('calendário de funcionamento da fábrica (horas por dia, dias da semana e meses)', () => {
  const todos = Array(12).fill(true) as boolean[];
  const segSex = [true, true, true, true, true, false, false];

  it('o padrão é 2 turnos de 8 h, de segunda a sexta, o ano todo: cerca de 261 dias e 4.170 horas', () => {
    const sc = { mode: ECON_DEFAULTS.mode, hoursYear: ECON_DEFAULTS.hoursYear, hoursDay: ECON_DEFAULTS.hoursDay, days: ECON_DEFAULTS.days, months: ECON_DEFAULTS.months };
    expect(operatingDays(segSex, todos)).toBeCloseTo(365.25 * 5 / 7, 6);          // ≈ 260,9 dias
    expect(scheduleHours(sc)).toBeCloseTo(16 * 365.25 * 5 / 7, 6);                 // ≈ 4.174 h
    expect(scheduleHours(sc)).toBeGreaterThan(4000); expect(scheduleHours(sc)).toBeLessThan(4300);
    expect(scheduleText(sc)).toMatch(/^16 h por dia, Seg a Sex, 12 meses \(261 dias → 4\.174 h por ano\)$/);
  });

  it('fábrica sazonal: só de julho a dezembro, produz cerca de metade dos dias do ano', () => {
    const jul_dez = Array.from({ length: 12 }, (_, i) => i >= 6);
    const anoTodo = operatingDays(segSex, todos), sazonal = operatingDays(segSex, jul_dez);
    expect(sazonal / anoTodo).toBeCloseTo(184 / 365.25, 3);                        // jul a dez = 184 dias
    expect(scheduleHours({ mode: 'calendario', hoursYear: 0, hoursDay: 24, days: [true, true, true, true, true, true, true], months: jul_dez })).toBeCloseTo(24 * 184, 6);
  });

  it('o modo "horas por ano" usa o número digitado e ignora o calendário', () => {
    expect(scheduleHours({ mode: 'horas', hoursYear: 6000, hoursDay: 1, days: [false, false, false, false, false, false, false], months: todos })).toBe(6000);
    expect(scheduleText({ mode: 'horas', hoursYear: 6000, hoursDay: 1, days: segSex, months: todos })).toBe('6.000 h por ano (digitado direto)');
  });

  it('sem nenhum dia ou nenhum mês marcado não há horas (e a receita não é calculada)', () => {
    expect(scheduleHours({ mode: 'calendario', hoursYear: 0, hoursDay: 16, days: [false, false, false, false, false, false, false], months: todos })).toBe(0);
    expect(scheduleHours({ mode: 'calendario', hoursYear: 0, hoursDay: 16, days: segSex, months: Array(12).fill(false) })).toBe(0);
    expect(gainReais({ prod: 1 } as never, { prod: 2 } as never, { min: 0, max: 0 }, { price: 5, hoursYear: 0, margin: 15 })).toBeNull();
  });

  it('a loja guarda o calendário, valida os limites e carregar uma empresa não apaga a escolha do calendário', () => {
    st().setEcon({ mode: 'calendario', hoursDay: 99, days: [true, false, true, false, true, false, true], months: Array.from({ length: 12 }, (_, i) => i === 11) });
    expect(st().econHoursDay).toBe(24);                                              // máximo de 24 h por dia
    expect(st().econDays).toEqual([true, false, true, false, true, false, true]);
    expect(st().econMonths.filter(Boolean)).toHaveLength(1);
    st().setEcon({ days: [true], months: [true] });                                  // listas de tamanho errado são ignoradas
    expect(st().econDays).toHaveLength(7); expect(st().econMonths).toHaveLength(12);
    st().setEcon({ hoursDay: -3 }); expect(st().econHoursDay).toBe(24);
    st().setEcon({ mode: 'horas' }); expect(st().econMode).toBe('horas');
    // volta ao padrão para não afetar os outros testes
    st().setEcon({ mode: ECON_DEFAULTS.mode, hoursDay: ECON_DEFAULTS.hoursDay, days: ECON_DEFAULTS.days, months: ECON_DEFAULTS.months });
    expect(scheduleHours(scheduleOf(st()))).toBeCloseTo(16 * 365.25 * 5 / 7, 6);
  });
});
