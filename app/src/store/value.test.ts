/* Valor estimado, voltar a uma versão e o gerador de PDF (a página HTML que vai para a impressão). */
import { beforeEach, describe, expect, it } from 'vitest';
import { buildReportHtml, esc, type ExportKind } from '../export/reportHtml';
import { bottleneckReport } from '../engine/bottleneck';
import { costOf } from '../engine/cost';
import { computeChartData } from './reportData';
import { useStore } from './useStore';
import { moneyDelta, valueCompare, versionValue } from './value';
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
