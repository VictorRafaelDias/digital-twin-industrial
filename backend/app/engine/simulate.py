"""Simulação: capacidade, risco, estado, gargalo, propagação em grafo (cascata), fila e energia.

Porte de app/src/engine/simulate.ts. Funções puras: nada aqui lê banco ou estado global.
"""
from __future__ import annotations

from typing import Optional

from .format import fmt, fv
from .types import Edge, MachineType, Node, NodeId, NodeResult, SimContext, SimResult


def heat_factor(t: MachineType, ambient: float) -> float:
    """Fator de capacidade pela temperatura ambiente (hipótese didática, a validar com o professor de física)."""
    T = ambient
    f = 1.0
    if t.heat == "tank" and T > 25:
        f = 1 - 0.004 * (T - 25)
    elif t.heat == "motor" and T > 30:
        f = 1 - 0.005 * (T - 30)
    elif t.heat == "cold" and T > 25:
        f = 1 - 0.015 * (T - 25)
    elif t.heat == "visc" and T < 15:
        f = 1 - 0.005 * (15 - T)
    return max(0.5, f)


def capacity(t: MachineType, v: float, ambient: float) -> float:
    """Capacidade (garrafas/h) de UMA unidade no ritmo `v`: linear até o ótimo, metade do ganho acima, zero na falha."""
    if v >= t.crit:
        return 0.0
    base = (t.cap * v) / t.opt if v <= t.opt else t.cap * (1 + 0.5 * (v / t.opt - 1))
    return base * heat_factor(t, ambient)


def risk_of(t: MachineType, v: float) -> float:
    """Risco de falha: 2% no ótimo, até 10% na atenção, até 40% na zona crítica, 100% na falha."""
    if v >= t.crit:
        return 1.0
    if v <= t.opt:
        return 0.02
    if v <= t.warn:
        return 0.02 + ((v - t.opt) / (t.warn - t.opt)) * 0.08
    return 0.1 + ((v - t.warn) / (t.crit - t.warn)) * 0.3


def state_of(t: MachineType, v: float) -> str:
    if v >= t.crit:
        return "falha"
    if v > t.warn:
        return "critico"
    if v > t.opt:
        return "alerta"
    return "normal"


def simulate(nodes: list[Node], edges: list[Edge], ctx: SimContext) -> SimResult:
    catalog, ambient, estop, run = ctx.catalog, ctx.ambient, ctx.estop, ctx.run
    by_id: dict[NodeId, dict] = {}
    for n in nodes:
        by_id[n.id] = {"n": n, "t": catalog[n.type], "ups": [], "outs": 0}
    for e in edges:
        if e.src in by_id and e.dst in by_id:
            by_id[e.dst]["ups"].append(e.src)
            by_id[e.src]["outs"] += 1

    # ordem topológica (quem não está no grafo acíclico vai no fim)
    indeg = {k: len(v["ups"]) for k, v in by_id.items()}
    order: list[NodeId] = []
    fila = [k for k in by_id if indeg[k] == 0]
    while fila:
        k = fila.pop(0)
        order.append(k)
        for e in edges:
            if e.src == k and e.dst in by_id:
                indeg[e.dst] -= 1
                if indeg[e.dst] == 0:
                    fila.append(e.dst)
    for k in by_id:
        if k not in order:
            order.append(k)

    res: dict[NodeId, NodeResult] = {}
    for k in order:
        n, t, ups = by_id[k]["n"], by_id[k]["t"], by_id[k]["ups"]
        qty = n.qty or 1
        cap = (0.0 if n.off else capacity(t, n.value, ambient) * n.wear_cap) * qty
        # o que chega: saída das anteriores, dividida entre as saídas de cada uma (divisão de fluxo)
        inflow = 0.0
        for u in ups:
            inflow += (res[u].eff if u in res else 0.0) / max(1, by_id[u]["outs"])
        eff = cap
        if ups:
            eff = min(cap, inflow)
        if estop:
            eff = 0.0
        res[k] = NodeResult(
            cap=cap, eff=eff, inflow=inflow,
            queue=max(0.0, inflow - eff) if ups else 0.0,  # Lavoisier: o que sobra fica parado na fila
            risk=min(1.0, risk_of(t, n.value) + n.wear_risk) if n.value < t.crit else risk_of(t, n.value),
            state="desligada" if n.off else state_of(t, n.value),
            energy=t.sb * qty + (0.0 if n.off else (t.vr * eff) / t.cap),
        )

    # durante o play, a máquina só começa a trabalhar quando o produto chega até ela
    if run is not None and run.active:
        for n in nodes:
            if run.t < run.arrivals.get(n.id, 0):
                r = res[n.id]
                r.eff = 0.0
                r.queue = 0.0
                r.waiting = True
                r.energy = catalog[n.type].sb * (n.qty or 1)

    sinks = [n for n in nodes if by_id[n.id]["outs"] == 0]
    production = sum(res[n.id].eff for n in sinks)
    bn: Optional[NodeId] = None
    for n in nodes:
        if bn is None or res[n.id].cap < res[bn].cap:
            bn = n.id
    return SimResult(
        res=res, production=production, bn=bn,
        energy=sum(res[n.id].energy for n in nodes),
        max_risk=max((res[n.id].risk for n in nodes), default=0.0),
    )


def best_production(nodes: list[Node], edges: list[Edge], ctx: SimContext) -> float:
    """Produção da fábrica com todas as máquinas ligadas no ritmo ótimo."""
    ideal = []
    for n in nodes:
        m = n.copy()
        m.value = ctx.catalog[n.type].opt
        m.off = False
        ideal.append(m)
    return simulate(ideal, edges, ctx).production


def bn_name(sim: SimResult, nodes: list[Node], catalog: dict[str, MachineType]) -> str:
    n = next((x for x in nodes if x.id == sim.bn), None)
    return catalog[n.type].name if n else "—"


def trouble_maps(sim: SimResult, nodes: list[Node], edges: list[Edge]) -> tuple[set, dict]:
    """Quem está 'afetado a montante' e o rastro (gradiente) de cada conexão: o efeito cascata."""
    incoming: dict[NodeId, list[NodeId]] = {}
    outgoing: dict[NodeId, list[Edge]] = {}
    for e in edges:
        incoming.setdefault(e.dst, []).append(e.src)
        outgoing.setdefault(e.src, []).append(e)

    def bad(i: NodeId) -> bool:
        return sim.res[i].state != "normal"

    def has_up(i: NodeId, seen: set) -> bool:
        if i in seen:
            return False
        seen.add(i)
        return any(bad(u) or has_up(u, seen) for u in incoming.get(i, []))

    affected = {n.id for n in nodes if has_up(n.id, set())}

    sev: dict[NodeId, dict] = {}
    for n in nodes:
        if sim.res[n.id].state not in ("falha", "critico", "desligada"):
            continue
        kind = "danger" if sim.res[n.id].state == "falha" else "warn"
        frontier = [(n.id, 1.0 if kind == "danger" else 0.6)]
        seen: set = set()
        while frontier:
            nxt = []
            for i, level in frontier:
                for e in outgoing.get(i, []):
                    if e.id not in sev or sev[e.id]["level"] < level:
                        sev[e.id] = {"level": level, "kind": kind}
                    if e.id not in seen and level > 0.15:
                        seen.add(e.id)
                        nxt.append((e.dst, level * 0.55))
            frontier = nxt
    return affected, sev


def explain_now(n: Node, sim: SimResult, affected: bool, t: MachineType) -> str:
    """Explicação em palavras simples do que está acontecendo com uma máquina (aceita <b> como marcação)."""
    r = sim.res[n.id]
    if n.off:
        return "Esta máquina está <b>desligada</b>: tudo que vem depois dela fica sem produto."
    if r.state == "falha":
        return "A máquina <b>falhou</b>: passou do limite e parou. Tudo que vem depois dela fica sem produto."
    if affected and r.eff < r.cap * 0.5:
        return "Ela está saudável, mas recebe pouco ou nenhum produto da máquina anterior. <b>O problema está antes dela.</b>"
    if r.state == "critico":
        return f"Perto do limite: risco de {fmt(r.risk * 100, 1)}%. Acima de {fv(t.crit)} {t.unit} ela falha."
    if r.state == "alerta":
        return f"Acima do ótimo: produz um pouco mais, mas o risco sobe para {fmt(r.risk * 100, 1)}%."
    if sim.bn == n.id:
        return "Esta é a máquina mais lenta (o <b>gargalo</b>). Melhorar o ritmo dela aumenta a produção de toda a fábrica."
    return "No ponto ótimo. Mexer aqui <b>não muda a produção</b> da fábrica, porque o gargalo está em outra máquina."
