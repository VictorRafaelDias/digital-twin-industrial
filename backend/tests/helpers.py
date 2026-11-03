"""Ajudantes dos testes: lê os casos de referência gerados pelo código do front-end."""
from __future__ import annotations

import json
from pathlib import Path

from app.engine.types import Catalog, Cost, Edge, MachineType, Node, Ref, RunInfo, SimContext

GOLDEN = Path(__file__).resolve().parent / "golden"


def _refs(lista) -> tuple[Ref, ...]:
    return tuple(Ref(r["t"], r["u"], r.get("k")) for r in lista or [])


def catalog_from_front() -> Catalog:
    """Catálogo do front-end (data/catalog.ts) convertido para o motor em Python."""
    raw = json.loads((GOLDEN / "front_catalog.json").read_text(encoding="utf-8"))
    cat: Catalog = {}
    for code, m in raw.items():
        c = m.get("cost")
        cat[code] = MachineType(
            code=code, name=m["name"], stage=m["stage"], cat=m["cat"], icon=m["icon"], param=m["param"], unit=m["unit"],
            min=m["min"], max=m["max"], opt=m["opt"], warn=m["warn"], crit=m["crit"], cap=m["cap"], sb=m["sb"], vr=m["vr"],
            desc=m["desc"], flow=m.get("flow") or "geral", rank=m["rank"], heat=m["heat"], multi_in=bool(m.get("multiIn")),
            end=bool(m.get("end")), basis=m["basis"], risk=m["risk"], refs=_refs(m.get("refs")),
            cost=Cost(c["min"], c["max"], c.get("note", ""), _refs(c.get("refs")), bool(c.get("edited"))) if c else None,
        )
    return cat


def nodes_of(raw) -> list[Node]:
    return [Node(n["id"], n["type"], n["x"], n["y"], n["value"], n["qty"], n["off"], n.get("wearCap", 1.0), n.get("wearRisk", 0.0)) for n in raw]


def edges_of(raw) -> list[Edge]:
    return [Edge(e["id"], e["from"], e["to"]) for e in raw]


def ctx_of(case, catalog: Catalog) -> SimContext:
    run = case.get("run")
    return SimContext(catalog, case["ambient"], case["estop"],
                      RunInfo(True, run["t"], run["arrivals"]) if run else None)


def load_cases():
    return json.loads((GOLDEN / "engine_cases.json").read_text(encoding="utf-8"))
