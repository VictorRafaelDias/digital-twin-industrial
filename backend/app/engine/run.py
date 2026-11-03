"""Simulação com tempo (Play): 1 s real em x1 = 1 minuto simulado; o produto leva 3 minutos por etapa para chegar.

`step_run` é o relógio do play (no front-end é o `tickRun` da store, chamado a cada 250 ms). Aqui ele é uma função pura:
recebe o estado e devolve o novo estado e os eventos do passo, então serve tanto para o WebSocket (tempo real)
quanto para rodar a simulação inteira de uma vez.
"""
from __future__ import annotations

import math
from dataclasses import replace
from typing import Optional

from .format import clock, fmt
from .simulate import bn_name, simulate
from .types import Edge, Node, NodeId, RunInfo, RunState, SimContext

STAGE_MIN = 3
TICK_MS = 250
SUBSTEP_MIN = 0.25   # tamanho máximo (minutos simulados) de cada pedaço em que um passo do relógio é dividido (= o passo da velocidade x1)


def new_run(speed: int = 1, dur: int = 60) -> RunState:
    return RunState(speed=speed, dur=dur)


def compute_arrivals(nodes: list[Node], edges: list[Edge]) -> dict[NodeId, float]:
    """Minuto simulado em que o produto chega a cada máquina (profundidade no grafo x 3 min)."""
    ins: dict[NodeId, list[NodeId]] = {}
    for e in edges:
        ins.setdefault(e.dst, []).append(e.src)
    depth: dict[NodeId, int] = {}

    def get(i: NodeId, seen: Optional[set] = None) -> int:
        seen = set() if seen is None else seen
        if i in depth:
            return depth[i]
        if i in seen:
            return 0
        seen.add(i)
        up = ins.get(i, [])
        depth[i] = 1 + max(get(x, seen) for x in up) if up else 0
        return depth[i]

    for n in nodes:
        get(n.id)
    return {n.id: depth[n.id] * STAGE_MIN for n in nodes}


def start_run(nodes: list[Node], edges: list[Edge], speed: int, dur: int) -> RunState:
    r = new_run(speed, dur)
    r.active = True
    r.on = True
    r.arrivals = compute_arrivals(nodes, edges)
    return r


def step_run(r: RunState, nodes: list[Node], edges: list[Edge], ctx: SimContext) -> tuple[RunState, list[dict]]:
    """Um passo do relógio (0,25 s reais = 0,25 x velocidade minutos simulados). Devolve (novo estado, eventos).

    A produção é somada em pedaços de no máximo 0,25 minuto simulado, calculados no meio de cada pedaço: assim, mesmo em velocidade alta
    (passo de 15 min), o produto que chega à última máquina no meio do passo é contado a partir do minuto certo. É o mesmo cálculo do
    `advanceRun` do front-end (engine/run.ts).
    """
    if not r.on:
        return r, []
    catalog = ctx.catalog
    t = min(float(r.dur), r.t + 0.25 * r.speed)
    span = t - r.t
    n_sub = max(1, math.ceil(span / SUBSTEP_MIN - 1e-9))
    sub = span / n_sub
    produced, kwh = r.produced, r.kwh
    queue = dict(r.queue)
    announced = dict(r.announced)
    for i in range(n_sub):
        s = simulate(nodes, edges, SimContext(catalog, ctx.ambient, ctx.estop, RunInfo(True, r.t + (i + 0.5) * sub, r.arrivals)))
        produced += (s.production / 60) * sub
        kwh += (s.energy * sub) / 60
        for n in nodes:
            q = s.res[n.id].queue or 0
            if q > 0:
                queue[n.id] = queue.get(n.id, 0) + (q / 60) * sub
    sim = simulate(nodes, edges, SimContext(catalog, ctx.ambient, ctx.estop, RunInfo(True, t, r.arrivals)))   # como a fábrica está no fim do passo
    events: list[dict] = []
    for n in nodes:
        if not announced.get(n.id) and t >= r.arrivals.get(n.id, 0):
            announced[n.id] = True
            events.append({"kind": "", "text": f"{catalog[n.type].name} começou a trabalhar", "t": t})
    step_min = 10 if r.dur <= 60 else 60
    k = math.floor(t / step_min)
    last_k = r.last_k
    if k > last_k and t < r.dur:
        last_k = k
        events.append({
            "kind": "",
            "text": f"{clock(t)} — {fmt(produced)} garrafas produzidas · gargalo: {bn_name(sim, nodes, catalog)} · risco máx. {fmt(sim.max_risk * 100, 1)}%",
            "t": t,
        })
    finished = t >= r.dur
    if finished:
        events.append({"kind": "ok", "text": "Simulação terminada", "t": t})
    novo = replace(r, t=t, produced=produced, kwh=kwh, queue=queue, announced=announced, last_k=last_k,
                   on=not finished, finished=finished or r.finished)
    return novo, events
