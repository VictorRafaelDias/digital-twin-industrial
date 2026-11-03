"""Converte os resultados do motor (dataclasses) nas respostas da API (dicionários prontos para virar JSON)."""
from __future__ import annotations

from dataclasses import asdict
from typing import Optional

from .engine.connect import edge_kind
from .engine.simulate import best_production, simulate, trouble_maps, explain_now
from .engine.thermal import machine_temperature
from .engine.types import (BnReport, Catalog, Edge, MachineType, Node, Plan, SimContext, SimResult, WhatIfResult)


def machine_type_dict(t: MachineType, detail: bool = True) -> dict:
    d = {
        "code": t.code, "name": t.name, "category": t.cat, "stage": t.stage, "icon": t.icon, "flow": t.flow,
        "parameter": t.param, "unit": t.unit,
        "limits": {"min": t.min, "optimal": t.opt, "warning": t.warn, "failure": t.crit, "max": t.max},
        "capacity_at_optimal": t.cap, "standby_kw": t.sb, "variable_kw": t.vr,
        "process_order": t.rank, "thermal_sensitivity": t.heat, "accepts_multiple_inputs": t.multi_in, "is_final_stage": t.end,
        "maker": t.maker, "model": t.model, "year": t.year, "version": t.version, "family": t.group or t.code, "origin": t.origin,
        "life_hours": t.life_h, "maintenance_interval_hours": t.maintenance_interval_h,
    }
    if detail:
        d.update({
            "description": t.desc, "physical_risk": t.risk, "basis_of_numbers": t.basis,
            "sources": [{"title": r.t, "url": r.u, "confidence": r.k} for r in t.refs],
            "price": ({"min": t.cost.min, "max": t.cost.max, "note": t.cost.note, "edited_by_user": t.cost.edited,
                       "sources": [{"title": r.t, "url": r.u, "confidence": r.k} for r in t.cost.refs]} if t.cost else None),
        })
    return d


def node_dict(n: Node, t: MachineType) -> dict:
    return {"id": n.id, "type": n.type, "name": t.name, "x": n.x, "y": n.y, "value": n.value, "units_in_parallel": n.qty, "off": n.off}


def graph_dict(nodes: list[Node], edges: list[Edge], catalog: Catalog) -> dict:
    return {
        "machines": [node_dict(n, catalog[n.type]) for n in nodes],
        "connections": [{"id": e.id, "from": e.src, "to": e.dst, "kind": edge_kind(e, edges)} for e in edges],
    }


def simulation_dict(nodes: list[Node], edges: list[Edge], ctx: SimContext, tariff: float, sim: Optional[SimResult] = None) -> dict:
    """Resultado completo de uma simulação da fábrica (o que as abas Montar, Resultados e Painel mostram)."""
    catalog = ctx.catalog
    sim = sim or simulate(nodes, edges, ctx)
    affected, sev = trouble_maps(sim, nodes, edges)
    best = best_production(nodes, edges, ctx.without_run())
    bn = next((n for n in nodes if n.id == sim.bn), None)
    return {
        "production_per_hour": sim.production,
        "best_production_per_hour": best,
        "pct_of_best": (sim.production / best * 100) if best else 0.0,
        "max_risk": sim.max_risk,
        "energy_kw": sim.energy,
        "energy_cost_per_hour": sim.energy * tariff,
        "bottleneck": ({"machine_id": bn.id, "type": bn.type, "name": catalog[bn.type].name} if bn else None),
        "ambient": ctx.ambient, "emergency_stop": ctx.estop,
        "machines": [{
            "id": n.id, "type": n.type, "name": catalog[n.type].name,
            "capacity": sim.res[n.id].cap, "output": sim.res[n.id].eff, "inflow": sim.res[n.id].inflow,
            "queue": sim.res[n.id].queue, "risk": sim.res[n.id].risk, "state": sim.res[n.id].state,
            "energy_kw": sim.res[n.id].energy, "waiting_for_product": sim.res[n.id].waiting,
            "affected_upstream": n.id in affected,
            "explanation": explain_now(n, sim, n.id in affected, catalog[n.type]),
            "temperature_c": machine_temperature(catalog[n.type], n, sim.res[n.id], ctx.ambient),
            "wear": {"capacity_factor": n.wear_cap, "risk_added": n.wear_risk},
        } for n in nodes],
        "connections": [{
            "id": e.id, "from": e.src, "to": e.dst, "kind": edge_kind(e, edges),
            "trouble": sev.get(e.id),  # rastro vermelho/amarelo do efeito cascata (nível 0 a 1)
        } for e in edges],
    }


def plan_dict(p: Plan, plan_id: Optional[int] = None) -> dict:
    return {
        "id": plan_id, "reached_goal": p.ok, "target_per_hour": p.target,
        "goal": {"type": p.g.type, "value": p.g.value, "allow_parallel": p.g.more, "allow_warning_zone": p.g.over},
        "investment": p.invest, "before": p.before, "after": p.after, "note": p.note,
        "steps": [{
            "action": s.action, "machine_id": s.node_id, "what": s.what, "why": s.why, "cost": s.cost, "risk": s.risk,
            "within_optimal": s.opt, "from": s.before, "to": s.after,
        } for s in p.steps],
        "changes": {str(k): asdict(c) | {"id": c.id} for k, c in p.changes.items()},
    }


def report_dict(r: Optional[BnReport]) -> Optional[dict]:
    if r is None:
        return None
    return {
        "machine_id": r.id, "name": r.name, "production_per_hour": r.prod, "why": r.why, "has_cost": r.has_cost,
        "options": [{
            "key": o.key, "title": o.title, "detail": o.detail, "production_per_hour": o.prod, "gain_pct": o.gain,
            "max_risk": o.risk, "next_bottleneck": o.next, "cost": o.cost, "change": o.change,
        } for o in r.options],
    }


def what_if_dict(w: Optional[WhatIfResult]) -> Optional[dict]:
    if w is None:
        return None
    return {
        "machine_id": w.id, "name": w.name, "extra_units": w.n, "before_per_hour": w.before, "after_per_hour": w.after,
        "max_risk": w.risk, "cost": w.cost, "new_capacity": w.cap_new, "next_bottleneck": w.next,
        "enough": w.enough, "cascade_plan": plan_dict(w.plan) if w.plan else None,
    }
