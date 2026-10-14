/* Gargalo: por que existe, como melhorar (com custo estimado) e "e se eu colocar mais máquinas?"
   com recálculo em cascata quando outra máquina passa a limitar a fábrica. */
import type { BnOption, BnReport, FEdge, FNode, SimContext, WhatIfResult } from '../types';
import { costOf } from './cost';
import { fmt, fv } from './format';
import { planGoal } from './goal';
import { bnName, heatFactor, simulate } from './simulate';

export function bottleneckReport(nodes: FNode[], edges: FEdge[], ctx: SimContext): BnReport | null {
  const calc: SimContext = { ...ctx, run: undefined };
  const sim = simulate(nodes, edges, calc);
  const n = nodes.find((x) => x.id === sim.bn);
  if (!n) return null;
  const t = ctx.catalog[n.type], r = sim.res[n.id], hf = heatFactor(t, ctx.ambient), q = n.qty || 1;
  const caps = nodes.filter((x) => x.id !== n.id).map((x) => sim.res[x.id].cap).sort((a, b) => a - b);
  const next = caps[0];

  const why: string[] = [
    `Entre todas as máquinas, a <b>${t.name}</b> é a que entrega menos: <b>${fmt(r.cap)}</b> garrafas/h${next != null ? `. A segunda mais lenta entrega ${fmt(next)}/h` : ''}. A fábrica inteira anda no passo da mais lenta.`,
  ];
  if (n.off) why.push('Ela está <b>desligada</b>, por isso nada passa por ela.');
  else if (r.state === 'falha') why.push(`O ritmo passou do limite (${fv(n.value)} ${t.unit}; falha a partir de ${fv(t.crit)}): a máquina <b>parou</b>.`);
  else if (n.value < t.opt - 1e-9) why.push(`O ritmo está <b>abaixo do ótimo</b> (${fv(n.value)} ${t.unit}; o ótimo é ${fv(t.opt)}). Dá para subir sem aumentar o risco.`);
  else if (n.value <= t.opt + 1e-9) why.push(`O ritmo já está no <b>ótimo</b> (${fv(t.opt)} ${t.unit}). Subir mais rende só um pouco e o risco aumenta.`);
  else why.push(`O ritmo está acima do ótimo (${fv(n.value)} ${t.unit}), com risco de ${fmt(r.risk * 100, 1)}%. Já está perto do limite prudente.`);
  if (hf < 0.999) why.push(`O ambiente a ${ctx.ambient} °C tira cerca de <b>${fmt((1 - hf) * 100, 1)}%</b> da capacidade dela.`);
  why.push(q === 1 ? 'Ela é <b>uma única unidade</b>: não há outra máquina igual dividindo o trabalho.' : `Já há ${q} unidades em paralelo nesta etapa.`);
  if (r.queue >= 1) why.push(`Chegam <b>${fmt(r.inflow)}</b>/h nela, mas só passam ${fmt(r.eff)}/h: <b>${fmt(r.queue)}</b>/h ficam esperando na fila.`);

  const options: BnOption[] = [];
  const mk = (title: string, detail: string, mut: (w: FNode) => void, cost: BnOption['cost']) => {
    const work = nodes.map((x) => ({ ...x }));
    const w = work.find((x) => x.id === n.id) as FNode;
    mut(w);
    const s = simulate(work, edges, calc);
    if (s.production <= sim.production + 0.5) return;
    options.push({
      key: `${n.id}-${options.length}`, title, detail, prod: s.production,
      gain: ((s.production - sim.production) / Math.max(1, sim.production)) * 100,
      risk: s.maxRisk, next: bnName(s, work, ctx.catalog), cost,
      change: { id: n.id, value: w.value, qty: w.qty, off: w.off, label: `${t.name}: ${title.toLowerCase()}` },
    });
  };
  if (n.off) mk('Ligar a máquina', 'Estava desligada.', (w) => { w.off = false; }, null);
  if (!n.off && n.value < t.opt - 1e-9) mk('Voltar ao ritmo ótimo', `${t.param} de ${fv(n.value)} para ${fv(t.opt)} ${t.unit}. Sem custo e sem risco extra.`, (w) => { w.value = t.opt; }, null);
  if (!n.off && n.value < t.warn - 1e-9) mk('Subir até a zona de atenção', `${t.param} até ${fv(t.warn)} ${t.unit}. Sem custo, mas o risco chega a 10%.`, (w) => { w.value = t.warn; }, null);
  if (q < 6) mk('Colocar mais 1 máquina igual (em paralelo)', `Passa a ${q + 1} unidades trabalhando no ótimo. Compra de equipamento e instalação.`, (w) => { w.qty = q + 1; w.value = t.opt; w.off = false; }, costOf(t, 1));

  return { id: n.id, name: t.name, prod: sim.production, why, options, hasCost: options.some((o) => o.cost) };
}

/** "E se eu colocar `extra` máquinas a mais no gargalo?" Se outra máquina passar a limitar, calcula o plano em cascata. */
export function runWhatIf(extra: number, nodes: FNode[], edges: FEdge[], ctx: SimContext): WhatIfResult | null {
  const calc: SimContext = { ...ctx, run: undefined };
  const sim = simulate(nodes, edges, calc);
  const n = nodes.find((x) => x.id === sim.bn);
  if (!n) return null;
  const t = ctx.catalog[n.type];
  const work = nodes.map((x) => (x.id === n.id ? { ...x, qty: (x.qty || 1) + extra, value: t.opt, off: false } : { ...x }));
  const s = simulate(work, edges, calc);
  const capNew = s.res[n.id].cap;
  const enough = s.production >= capNew - 0.5;
  return {
    id: n.id, name: t.name, n: extra, before: sim.production, after: s.production, risk: s.maxRisk,
    cost: costOf(t, extra), capNew, next: bnName(s, work, ctx.catalog), enough,
    plan: enough ? null : planGoal({ type: 'abs', value: capNew, more: true, over: false }, nodes, edges, ctx, work),
  };
}
