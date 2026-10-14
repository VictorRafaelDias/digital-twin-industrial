/* Planejador de objetivo: dado "quero +X%" (ou uma meta, ou menos risco), sobe o gargalo passo a passo
   (ótimo → zona de atenção, se permitido → mais uma unidade em paralelo) e explica o porquê de cada passo. */
import type { FEdge, FNode, GoalInput, NodeChange, Plan, PlanStep, SimContext } from '../types';
import { costOf, sumRanges } from './cost';
import { fmt, fv } from './format';
import { bestProduction, bnName, riskOf, simulate } from './simulate';

/**
 * @param base ponto de partida diferente do desenho atual (usado em "e se eu colocar mais máquinas?").
 *             As mudanças do plano são sempre comparadas com o desenho atual (`nodes`).
 */
export function planGoal(g: GoalInput, nodes: FNode[], edges: FEdge[], ctx: SimContext, base?: FNode[]): Plan {
  const calc: SimContext = { ...ctx, run: undefined }; // o planejamento ignora o relógio do play
  const orig = nodes.map((n) => ({ ...n }));
  const work = (base || nodes).map((n) => ({ ...n }));
  const before = simulate(nodes, edges, calc);
  const cur = before.production || bestProduction(nodes, edges, calc);
  const target = g.type === 'pct' ? cur * (1 + g.value / 100) : g.type === 'abs' ? g.value : 0;

  if (g.type === 'risk') {
    work.forEach((n) => { if (n.value > ctx.catalog[n.type].opt) n.value = ctx.catalog[n.type].opt; });
  } else {
    for (let i = 0; i < 300; i++) {
      const s = simulate(work, edges, calc);
      if (s.production >= target - 0.5) break;
      const b = work.find((n) => n.id === s.bn);
      if (!b) break;
      const t = ctx.catalog[b.type];
      if (b.off) { b.off = false; continue; }
      if (b.value < t.opt - 1e-9) { b.value = t.opt; continue; }
      const limit = g.over ? t.warn : t.opt;
      if (b.value < limit - 1e-9) { b.value = Math.min(limit, b.value + Math.max((t.warn - t.opt) * 0.2, 1e-6)); continue; }
      if (g.more && b.qty < 5) { b.qty++; b.value = t.opt; continue; }
      break;
    }
  }

  const after = simulate(work, edges, calc);
  const steps: PlanStep[] = [];
  const changes: Record<string, NodeChange> = {};
  work.forEach((w, i) => {
    const o = orig[i], t = ctx.catalog[w.type];
    if (o.off && !w.off) steps.push({ what: `<b>${t.name}</b>: ligar a máquina.`, why: 'Estava desligada e segurava a fábrica inteira.' });
    if (w.qty !== o.qty) {
      steps.push({
        what: `<b>${t.name}</b>: usar <b>${w.qty} unidades em paralelo</b> (hoje ${o.qty}).`,
        cost: costOf(t, w.qty - o.qty),
        why: 'Mesmo no limite seguro dela, continuava sendo o gargalo. Uma unidade a mais soma capacidade a essa etapa. Alternativa: um modelo de maior capacidade.',
      });
    }
    if (Math.abs(w.value - o.value) > 1e-6) {
      const rk = riskOf(t, w.value), inOpt = w.value <= t.opt + 1e-9;
      steps.push({
        what: `<b>${t.name}</b>: ${t.param.toLowerCase()} de <b>${fv(o.value)}</b> para <b>${fv(w.value)}</b> ${t.unit}`,
        why: g.type === 'risk'
          ? 'Estava acima do ótimo; voltar ao ótimo reduz o desgaste e o risco de parada.'
          : (inOpt
            ? 'Era o gargalo e estava abaixo do ótimo: dentro do ótimo ela rende mais sem aumentar o risco.'
            : `Era o gargalo. Acima do ótimo ela rende mais, mas o risco sobe para ${fmt(rk * 100, 1)}%.`),
        risk: rk, opt: inOpt,
      });
    }
    if (w.off !== o.off || w.qty !== o.qty || Math.abs(w.value - o.value) > 1e-6) {
      changes[w.id] = { id: w.id, value: w.value, qty: w.qty, off: w.off };
    }
  });

  const ok = g.type === 'risk' ? true : after.production >= target - 0.5;
  let note = '';
  if (g.type === 'risk' && !steps.length) note = 'Tudo já está dentro do ótimo. Nada a reduzir.';
  if (!ok) {
    const need = (target / Math.max(after.production, 1) - 1) * 100;
    note = `Mesmo no limite do que sugeri, a fábrica chega a <b>${fmt(after.production)}</b> garrafas/h. O gargalo continua sendo <b>${bnName(after, work, ctx.catalog)}</b>. Para ir além seria preciso um modelo com cerca de <b>${fmt(need)}% mais capacidade</b> nessa etapa, ou uma segunda linha.`
      + (!g.more ? ' Marque “Usar mais máquinas em paralelo” em “O que posso sugerir?” para ver até onde dá.' : '');
  }
  return {
    ok, target, invest: sumRanges(steps.map((s) => s.cost)), g: { ...g },
    before: { prod: before.production, risk: before.maxRisk, energy: before.energy },
    after: { prod: after.production, risk: after.maxRisk, energy: after.energy },
    steps, changes, note,
  };
}
