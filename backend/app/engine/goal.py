"""Planejador de objetivo: dado "quero +X%" (ou uma meta, ou menos risco), sobe o gargalo passo a passo
(ótimo -> zona de atenção, se permitido -> mais uma unidade em paralelo) e explica o porquê de cada passo.

Porte de app/src/engine/goal.ts.
"""
from __future__ import annotations

from typing import Optional

from .cost import cost_of, sum_ranges
from .format import fmt, fv
from .simulate import best_production, bn_name, risk_of, simulate
from .types import Edge, GoalInput, Node, NodeChange, Plan, PlanStep, SimContext


def plan_goal(g: GoalInput, nodes: list[Node], edges: list[Edge], ctx: SimContext, base: Optional[list[Node]] = None) -> Plan:
    """
    `base`: ponto de partida diferente do desenho atual (usado em "e se eu colocar mais máquinas?").
    As mudanças do plano são sempre comparadas com o desenho atual (`nodes`).
    """
    catalog = ctx.catalog
    calc = ctx.without_run()  # o planejamento ignora o relógio do play
    orig = [n.copy() for n in nodes]
    work = [n.copy() for n in (base if base is not None else nodes)]
    before = simulate(nodes, edges, calc)
    cur = before.production or best_production(nodes, edges, calc)
    target = cur * (1 + g.value / 100) if g.type == "pct" else g.value if g.type == "abs" else 0.0

    if g.type == "risk":
        for n in work:
            if n.value > catalog[n.type].opt:
                n.value = catalog[n.type].opt
    else:
        for _ in range(300):
            s = simulate(work, edges, calc)
            if s.production >= target - 0.5:
                break
            b = next((n for n in work if n.id == s.bn), None)
            if b is None:
                break
            t = catalog[b.type]
            if b.off:
                b.off = False
                continue
            if b.value < t.opt - 1e-9:
                b.value = t.opt
                continue
            limit = t.warn if g.over else t.opt
            if b.value < limit - 1e-9:
                b.value = min(limit, b.value + max((t.warn - t.opt) * 0.2, 1e-6))
                continue
            if g.more and b.qty < 5:
                b.qty += 1
                b.value = t.opt
                continue
            break

    after = simulate(work, edges, calc)
    steps: list[PlanStep] = []
    changes: dict = {}
    for i, w in enumerate(work):
        o, t = orig[i], catalog[w.type]
        if o.off and not w.off:
            steps.append(PlanStep(
                what=f"<b>{t.name}</b>: ligar a máquina.", why="Estava desligada e segurava a fábrica inteira.",
                action="ligar", node_id=w.id,
            ))
        if w.qty != o.qty:
            steps.append(PlanStep(
                what=f"<b>{t.name}</b>: usar <b>{w.qty} unidades em paralelo</b> (hoje {o.qty}).",
                cost=cost_of(t, w.qty - o.qty),
                why="Mesmo no limite seguro dela, continuava sendo o gargalo. Uma unidade a mais soma capacidade a essa etapa. Alternativa: um modelo de maior capacidade.",
                action="paralelo", node_id=w.id, before=o.qty, after=w.qty,
            ))
        if abs(w.value - o.value) > 1e-6:
            rk = risk_of(t, w.value)
            in_opt = w.value <= t.opt + 1e-9
            if g.type == "risk":
                why = "Estava acima do ótimo; voltar ao ótimo reduz o desgaste e o risco de parada."
            elif in_opt:
                why = "Era o gargalo e estava abaixo do ótimo: dentro do ótimo ela rende mais sem aumentar o risco."
            else:
                why = f"Era o gargalo. Acima do ótimo ela rende mais, mas o risco sobe para {fmt(rk * 100, 1)}%."
            steps.append(PlanStep(
                what=f"<b>{t.name}</b>: {t.param.lower()} de <b>{fv(o.value)}</b> para <b>{fv(w.value)}</b> {t.unit}",
                why=why, risk=rk, opt=in_opt, action="ritmo", node_id=w.id, before=o.value, after=w.value,
            ))
        if w.off != o.off or w.qty != o.qty or abs(w.value - o.value) > 1e-6:
            changes[w.id] = NodeChange(w.id, w.value, w.qty, w.off)

    ok = True if g.type == "risk" else after.production >= target - 0.5
    note = ""
    if g.type == "risk" and not steps:
        note = "Tudo já está dentro do ótimo. Nada a reduzir."
    if not ok:
        need = (target / max(after.production, 1) - 1) * 100
        note = (f"Mesmo no limite do que sugeri, a fábrica chega a <b>{fmt(after.production)}</b> garrafas/h. O gargalo continua sendo "
                f"<b>{bn_name(after, work, catalog)}</b>. Para ir além seria preciso um modelo com cerca de <b>{fmt(need)}% mais capacidade</b> "
                f"nessa etapa, ou uma segunda linha.")
        if not g.more:
            note += " Marque “Usar mais máquinas em paralelo” em “O que posso sugerir?” para ver até onde dá."
    return Plan(
        ok=ok, target=target, invest=sum_ranges([s.cost for s in steps]),
        g=GoalInput(g.type, g.value, g.more, g.over),
        before={"prod": before.production, "risk": before.max_risk, "energy": before.energy},
        after={"prod": after.production, "risk": after.max_risk, "energy": after.energy},
        steps=steps, changes=changes, note=note,
    )
