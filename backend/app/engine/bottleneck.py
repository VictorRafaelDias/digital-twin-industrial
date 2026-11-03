"""Gargalo: por que existe, como melhorar (com custo estimado) e "e se eu colocar mais máquinas?" com recálculo em
cascata quando outra máquina passa a limitar a fábrica. Porte de app/src/engine/bottleneck.ts."""
from __future__ import annotations

from typing import Callable, Optional

from .cost import cost_of
from .format import fmt, fv
from .goal import plan_goal
from .simulate import bn_name, heat_factor, simulate
from .types import BnOption, BnReport, Edge, GoalInput, Node, SimContext, WhatIfResult


def bottleneck_report(nodes: list[Node], edges: list[Edge], ctx: SimContext) -> Optional[BnReport]:
    catalog = ctx.catalog
    calc = ctx.without_run()
    sim = simulate(nodes, edges, calc)
    n = next((x for x in nodes if x.id == sim.bn), None)
    if n is None:
        return None
    t, r, hf, q = catalog[n.type], sim.res[n.id], heat_factor(catalog[n.type], ctx.ambient), n.qty or 1
    caps = sorted(sim.res[x.id].cap for x in nodes if x.id != n.id)
    nxt = caps[0] if caps else None

    why = [
        f"Entre todas as máquinas, a <b>{t.name}</b> é a que entrega menos: <b>{fmt(r.cap)}</b> garrafas/h"
        f"{'. A segunda mais lenta entrega ' + fmt(nxt) + '/h' if nxt is not None else ''}. A fábrica inteira anda no passo da mais lenta.",
    ]
    if n.off:
        why.append("Ela está <b>desligada</b>, por isso nada passa por ela.")
    elif r.state == "falha":
        why.append(f"O ritmo passou do limite ({fv(n.value)} {t.unit}; falha a partir de {fv(t.crit)}): a máquina <b>parou</b>.")
    elif n.value < t.opt - 1e-9:
        why.append(f"O ritmo está <b>abaixo do ótimo</b> ({fv(n.value)} {t.unit}; o ótimo é {fv(t.opt)}). Dá para subir sem aumentar o risco.")
    elif n.value <= t.opt + 1e-9:
        why.append(f"O ritmo já está no <b>ótimo</b> ({fv(t.opt)} {t.unit}). Subir mais rende só um pouco e o risco aumenta.")
    else:
        why.append(f"O ritmo está acima do ótimo ({fv(n.value)} {t.unit}), com risco de {fmt(r.risk * 100, 1)}%. Já está perto do limite prudente.")
    if hf < 0.999:
        why.append(f"O ambiente a {fv(ctx.ambient)} °C tira cerca de <b>{fmt((1 - hf) * 100, 1)}%</b> da capacidade dela.")
    why.append("Ela é <b>uma única unidade</b>: não há outra máquina igual dividindo o trabalho." if q == 1
               else f"Já há {q} unidades em paralelo nesta etapa.")
    if r.queue >= 1:
        why.append(f"Chegam <b>{fmt(r.inflow)}</b>/h nela, mas só passam {fmt(r.eff)}/h: <b>{fmt(r.queue)}</b>/h ficam esperando na fila.")

    options: list[BnOption] = []

    def mk(title: str, detail: str, mut: Callable[[Node], None], cost: Optional[dict[str, float]]) -> None:
        work = [x.copy() for x in nodes]
        w = next(x for x in work if x.id == n.id)
        mut(w)
        s = simulate(work, edges, calc)
        if s.production <= sim.production + 0.5:
            return
        options.append(BnOption(
            key=f"{n.id}-{len(options)}", title=title, detail=detail, prod=s.production,
            gain=((s.production - sim.production) / max(1, sim.production)) * 100,
            risk=s.max_risk, next=bn_name(s, work, catalog), cost=cost,
            change={"id": n.id, "value": w.value, "qty": w.qty, "off": w.off, "label": f"{t.name}: {title.lower()}"},
        ))

    def ligar(w: Node) -> None:
        w.off = False

    def ao_otimo(w: Node) -> None:
        w.value = t.opt

    def ate_atencao(w: Node) -> None:
        w.value = t.warn

    def mais_uma(w: Node) -> None:
        w.qty = q + 1
        w.value = t.opt
        w.off = False

    if n.off:
        mk("Ligar a máquina", "Estava desligada.", ligar, None)
    if not n.off and n.value < t.opt - 1e-9:
        mk("Voltar ao ritmo ótimo", f"{t.param} de {fv(n.value)} para {fv(t.opt)} {t.unit}. Sem custo e sem risco extra.", ao_otimo, None)
    if not n.off and n.value < t.warn - 1e-9:
        mk("Subir até a zona de atenção", f"{t.param} até {fv(t.warn)} {t.unit}. Sem custo, mas o risco chega a 10%.", ate_atencao, None)
    if q < 6:
        mk("Colocar mais 1 máquina igual (em paralelo)", f"Passa a {q + 1} unidades trabalhando no ótimo. Compra de equipamento e instalação.", mais_uma, cost_of(t, 1))

    return BnReport(id=n.id, name=t.name, prod=sim.production, why=why, options=options, has_cost=any(o.cost for o in options))


def run_what_if(extra: int, nodes: list[Node], edges: list[Edge], ctx: SimContext) -> Optional[WhatIfResult]:
    """"E se eu colocar `extra` máquinas a mais no gargalo?" Se outra máquina passar a limitar, calcula o plano em cascata."""
    catalog = ctx.catalog
    calc = ctx.without_run()
    sim = simulate(nodes, edges, calc)
    n = next((x for x in nodes if x.id == sim.bn), None)
    if n is None:
        return None
    t = catalog[n.type]
    work = []
    for x in nodes:
        w = x.copy()
        if x.id == n.id:
            w.qty = (x.qty or 1) + extra
            w.value = t.opt
            w.off = False
        work.append(w)
    s = simulate(work, edges, calc)
    cap_new = s.res[n.id].cap
    enough = s.production >= cap_new - 0.5
    return WhatIfResult(
        id=n.id, name=t.name, n=extra, before=sim.production, after=s.production, risk=s.max_risk,
        cost=cost_of(t, extra), cap_new=cap_new, next=bn_name(s, work, catalog), enough=enough,
        plan=None if enough else plan_goal(GoalInput("abs", cap_new, True, False), nodes, edges, ctx, work),
    )
