/* Exporta os dados do front-end (catálogo, textos, exemplos e cálculos) para um JSON que alimenta o banco.
   Assim o banco e o front usam exatamente os mesmos números (uma única fonte da verdade).

   Como rodar (dentro da pasta app/):   npx vite-node ../banco-de-dados/scripts/exportar_dados_do_front.ts */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LINK, buildCatalog } from '../../app/src/data/catalog';
import { KB, MANUAL, TEMPLATES, TYPE_INFO_INITIAL, ZONES } from '../../app/src/data/content';
import { GLOSS } from '../../app/src/data/glossary';
import { buildFromTemplate } from '../../app/src/engine/factory';
import { planGoal } from '../../app/src/engine/goal';
import { computeArrivals } from '../../app/src/engine/run';
import { simulate } from '../../app/src/engine/simulate';
import type { FNode, SimContext } from '../../app/src/types';

const catalog = buildCatalog();
const ctx: SimContext = { catalog, ambient: 25, estop: false };
const calor = { tank: 'tanque', motor: 'motor', cold: 'frio', visc: 'viscosidade', none: 'nenhuma' } as const;
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/* ---------- catálogo ---------- */
const etapas = [...new Set(Object.values(catalog).map((t) => t.stage))].map((nome) => ({
  nome, zona: (ZONES.find((z) => z.stages.includes(nome)) ?? ZONES[0]).name,
}));
const categorias = Object.entries(TYPE_INFO_INITIAL).map(([codigo, t], i) => ({ codigo, nome: t.name, descricao: t.desc, icone: t.icon, ordem: i + 1 }));
const maquinas = Object.entries(catalog).map(([codigo, t]) => ({
  codigo, nome: t.name, categoria: t.cat, etapa: t.stage, fluxo: t.flow === 'suco' ? 'suco' : 'geral', icone: t.icon,
  parametro: t.param, unidade: t.unit, valor_min: t.min, valor_max: t.max, valor_otimo: t.opt, valor_atencao: t.warn, valor_falha: t.crit,
  capacidade_otima: t.cap, consumo_parado_kw: t.sb, consumo_variavel_kw: t.vr, ordem_processo: t.rank,
  sensibilidade_termica: calor[t.heat], aceita_varias_entradas: !!t.multiIn, etapa_final: !!t.end,
  descricao: t.desc, risco_fisico: t.risk, base_dos_numeros: t.basis,
  manual: { o_que_faz: MANUAL[codigo].long, como_funciona_ritmo: MANUAL[codigo].how, dicas: MANUAL[codigo].tips },
  fontes_numeros: t.refs.map((r) => ({ titulo: r.t, url: r.u, confianca: r.k === 'real' ? 'real' : 'estimado' })),
  preco: { min: t.cost.min, max: t.cost.max, observacao: t.cost.note, fontes: t.cost.refs.map((r) => ({ titulo: r.t, url: r.u, confianca: 'estimado' })) },
}));
const baseConhecimento = KB.map(([titulo, tipo, confianca]) => ({ titulo, tipo, confianca }));
const urlsBase = [LINK.tpPast, LINK.tpBlender, LINK.kronesVFJ, LINK.kronesContiroll, LINK.osterroth].map((l) => l.u);
const glossario = GLOSS.map((g) => ({ grupo: g.g, termo: g.t, definicao: g.d, palavras: g.k }));

/* ---------- fábricas de exemplo (as mesmas dos exemplos do front) ---------- */
function resumo(nodes: FNode[], edges: { id: string; from: string; to: string }[], ambient = 25) {
  const c = { ...ctx, ambient };
  const sim = simulate(nodes, edges, c);
  return {
    producao_h: round(sim.production), risco_max: round(sim.maxRisk, 4), energia_kw: round(sim.energy, 3), temperatura_ambiente: ambient,
    gargalo_indice: nodes.findIndex((n) => n.id === sim.bn),
    maquinas: nodes.map((n) => {
      const r = sim.res[n.id];
      return { indice: nodes.indexOf(n), ritmo: n.value, unidades_paralelo: n.qty, desligada: n.off, capacidade_h: round(r.cap), saida_h: round(r.eff), risco: round(r.risk, 4), estado: r.state, energia_kw: round(r.energy, 3), fila_h: round(r.queue) };
    }),
  };
}

/** Roda o play inteiro (minuto a minuto), com a mesma regra do app: o produto leva 3 min por etapa para chegar. */
function simularPlay(nodes: FNode[], edges: { id: string; from: string; to: string }[], duracaoMin: number) {
  const arrivals = computeArrivals(nodes, edges);
  let produced = 0, kwh = 0; const queue: Record<string, number> = {}; let bnFinal: string | null = null, riscoMax = 0;
  for (let t = 1; t <= duracaoMin; t++) {
    const sim = simulate(nodes, edges, { ...ctx, run: { active: true, t, arrivals } });
    produced += sim.production / 60; kwh += sim.energy / 60;
    nodes.forEach((n) => { const q = sim.res[n.id].queue || 0; if (q > 0) queue[n.id] = (queue[n.id] || 0) + q / 60; });
    bnFinal = sim.bn; riscoMax = Math.max(riscoMax, sim.maxRisk);
  }
  const ideal = simulate(nodes.map((n) => ({ ...n, value: catalog[n.type].opt, off: false })), edges, ctx).production * (duracaoMin / 60);
  return {
    duracao_min: duracaoMin, garrafas_produzidas: Math.round(produced), energia_kwh: round(kwh), fila_total: Math.round(Object.values(queue).reduce((a, b) => a + b, 0)),
    pct_do_maximo: round(ideal ? (produced / ideal) * 100 : 0), risco_max: round(riscoMax, 4), gargalo_indice: nodes.findIndex((n) => n.id === bnFinal),
  };
}

const fabricas = [
  { usuario: 'victor.dias', template: 'bebidas', nome: 'Bebidas em geral' },
  { usuario: 'victor.dias', template: 'suco', nome: 'Suco de laranja natural' },
  { usuario: 'enzo.fernandes', template: 'bebidas', nome: 'Linha de bebidas do Enzo' },
].map((f, i) => {
  const b = buildFromTemplate(f.template, catalog, 1);
  const base = {
    usuario: f.usuario, nome: f.nome, exemplo_origem: f.template, temperatura_ambiente: 25, tarifa_energia: 0.85,
    maquinas: b.nodes.map((n) => ({ codigo: n.type, pos_x: Math.round(n.x), pos_y: Math.round(n.y), ritmo: n.value, unidades_paralelo: n.qty, desligada: n.off })),
    conexoes: b.edges.map((e) => ({ origem_indice: b.nodes.findIndex((n) => n.id === e.from), destino_indice: b.nodes.findIndex((n) => n.id === e.to) })),
    cenarios: [] as unknown[], simulacoes: [] as unknown[], planos: [] as unknown[],
  };
  if (i === 0) {
    // cenário 1: situação inicial; cenário 2: depois de aplicar o plano "+10% de produção"
    const plan = planGoal({ type: 'pct', value: 10, more: true, over: true }, b.nodes, b.edges, ctx);
    const depois = b.nodes.map((n) => { const c = plan.changes[n.id]; return c ? { ...n, value: c.value, qty: c.qty, off: c.off } : { ...n }; });
    base.cenarios = [
      { nome: 'Situação inicial (tudo no ótimo)', ...resumo(b.nodes, b.edges) },
      { nome: 'Depois do plano +10% de produção', ...resumo(depois, b.edges) },
    ];
    base.simulacoes = [{ velocidade: 20, ...simularPlay(b.nodes, b.edges, 480) }];
    // passos do plano na mesma ordem em que o planejador os gera (ligar, paralelo, ritmo, por máquina)
    let k = 0; const passos: unknown[] = [];
    b.nodes.forEach((n, idx) => {
      const c = plan.changes[n.id]; if (!c) return;
      if (n.off && !c.off) passos.push({ acao: 'ligar', indice: idx, motivo: plan.steps[k++].why });
      if (c.qty !== n.qty) { const s = plan.steps[k++]; passos.push({ acao: 'paralelo', indice: idx, unidades_antes: n.qty, unidades_depois: c.qty, motivo: s.why, custo_min: s.cost?.min ?? null, custo_max: s.cost?.max ?? null }); }
      if (Math.abs(c.value - n.value) > 1e-6) { const s = plan.steps[k++]; passos.push({ acao: 'ritmo', indice: idx, ritmo_antes: n.value, ritmo_depois: round(c.value, 3), motivo: s.why }); }
    });
    base.planos = [{
      tipo_objetivo: 'pct', valor_meta: 10, aceita_zona_atencao: true, aceita_paralelo: true,
      producao_antes: round(plan.before.prod), producao_depois: round(plan.after.prod), risco_antes: round(plan.before.risk, 4), risco_depois: round(plan.after.risk, 4),
      investimento_min: plan.invest.min, investimento_max: plan.invest.max, atingiu_meta: plan.ok, aplicado: true, passos,
    }];
  }
  return base;
});

const dados = {
  gerado_por: 'banco-de-dados/scripts/exportar_dados_do_front.ts',
  categorias, etapas, maquinas, base_conhecimento: baseConhecimento, urls_base_conhecimento: urlsBase, glossario, fabricas,
  exemplos: Object.keys(TEMPLATES),
};
const destino = fileURLToPath(new URL('../dados/', import.meta.url));
mkdirSync(destino, { recursive: true });
writeFileSync(destino + 'dados_iniciais.json', JSON.stringify(dados, null, 2) + '\n', 'utf-8');
console.log(`ok: ${maquinas.length} máquinas, ${glossario.length} termos, ${fabricas.length} fábricas -> banco-de-dados/dados/dados_iniciais.json`);
