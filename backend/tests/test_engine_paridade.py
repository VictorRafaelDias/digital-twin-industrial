"""O motor em Python tem de dar EXATAMENTE os mesmos resultados do motor do front-end (TypeScript).

Os casos de referência (tests/golden/engine_cases.json) são gerados pelo próprio código do front-end:
    cd app && npx vite-node ../backend/scripts/gerar_golden.ts
"""
from __future__ import annotations

import math

import pytest

from app.engine.bottleneck import bottleneck_report, run_what_if
from app.engine.connect import can_connect, edge_kind
from app.engine.format import fmt, fv
from app.engine.goal import plan_goal
from app.engine.run import compute_arrivals, start_run, step_run
from app.engine.simulate import best_production, bn_name, explain_now, simulate, trouble_maps
from app.engine.types import GoalInput, SimContext
from app.engine.water import beta_at, water_expansion_l
from tests.helpers import catalog_from_front, ctx_of, edges_of, load_cases, nodes_of

DATA = load_cases()
CATALOG = catalog_from_front()
CASES = DATA["cases"]
GOALS = [GoalInput("pct", 10, True, True), GoalInput("pct", 25, False, False), GoalInput("pct", 60, True, False),
         GoalInput("abs", 15000, True, True), GoalInput("risk", 0, False, False)]
TOL = 1e-6


def close(a, b, tol=TOL):
    if a is None or b is None:
        return a is b or a == b
    return math.isclose(a, b, rel_tol=tol, abs_tol=tol)


def ids(case):
    return f"{case['key']}-{CASES.index(case)}"


@pytest.mark.parametrize("case", CASES, ids=ids)
def test_simulacao(case):
    nodes, edges, ctx = nodes_of(case["nodes"]), edges_of(case["edges"]), ctx_of(case, CATALOG)
    sim = simulate(nodes, edges, ctx)
    ref = case["sim"]
    assert sim.bn == ref["bn"]
    assert close(sim.production, ref["production"])
    assert close(sim.energy, ref["energy"])
    assert close(sim.max_risk, ref["maxRisk"])
    for nid, r in ref["res"].items():
        got = sim.res[nid]
        assert close(got.cap, r["cap"]) and close(got.eff, r["eff"]) and close(got.inflow, r["inflow"])
        assert close(got.queue, r["queue"]) and close(got.risk, r["risk"]) and close(got.energy, r["energy"])
        assert got.state == r["state"]
        assert got.waiting == bool(r.get("waiting"))
    assert bn_name(sim, nodes, CATALOG) == case["bnName"]
    assert close(best_production(nodes, edges, ctx), case["best"])


@pytest.mark.parametrize("case", CASES, ids=ids)
def test_cascata_e_explicacoes(case):
    nodes, edges, ctx = nodes_of(case["nodes"]), edges_of(case["edges"]), ctx_of(case, CATALOG)
    sim = simulate(nodes, edges, ctx)
    affected, sev = trouble_maps(sim, nodes, edges)
    assert sorted(affected) == case["affected"]
    assert set(sev) == set(case["sev"])
    for eid, s in case["sev"].items():
        assert close(sev[eid]["level"], s["level"]) and sev[eid]["kind"] == s["kind"]
    for n in nodes:
        assert explain_now(n, sim, n.id in affected, CATALOG[n.type]) == case["explain"][n.id]
    assert compute_arrivals(nodes, edges) == case["arrivals"]
    for e in edges:
        assert edge_kind(e, edges) == case["kinds"][e.id]


@pytest.mark.parametrize("case", CASES, ids=ids)
def test_regras_de_conexao(case):
    nodes, edges = nodes_of(case["nodes"]), edges_of(case["edges"])
    for key, ref in case["connect"].items():
        a, b = key.split(">")
        got = can_connect(a, b, nodes, edges, CATALOG)
        assert (got.ok, got.level, got.msg) == (ref["ok"], ref["level"], ref["msg"]), key


def plan_dict(p):
    return {
        "ok": p.ok, "target": p.target, "invest": p.invest, "note": p.note,
        "before": p.before, "after": p.after,
        "steps": [{"what": s.what, "why": s.why, "cost": s.cost, "risk": s.risk, "opt": s.opt} for s in p.steps],
        "changes": {k: {"id": c.id, "value": c.value, "qty": c.qty, "off": c.off} for k, c in p.changes.items()},
    }


def same_plan(got, ref):
    g = plan_dict(got)
    assert g["ok"] == ref["ok"] and g["note"] == ref["note"]
    assert close(g["target"], ref["target"])
    for k in ("min", "max"):
        assert close(g["invest"][k], ref["invest"][k])
    for side in ("before", "after"):
        for k in ("prod", "risk", "energy"):
            assert close(g[side][k], ref[side][k])
    assert len(g["steps"]) == len(ref["steps"])
    for a, b in zip(g["steps"], ref["steps"]):
        assert a["what"] == b["what"] and a["why"] == b["why"]
        assert close(a["risk"], b.get("risk")) and a["opt"] == b.get("opt")
        assert (a["cost"] is None) == (b.get("cost") is None)
        if a["cost"]:
            assert close(a["cost"]["min"], b["cost"]["min"]) and close(a["cost"]["max"], b["cost"]["max"])
    assert set(g["changes"]) == set(ref["changes"])
    for k, c in ref["changes"].items():
        assert close(g["changes"][k]["value"], c["value"]) and g["changes"][k]["qty"] == c["qty"] and g["changes"][k]["off"] == c["off"]


@pytest.mark.parametrize("case", CASES, ids=ids)
def test_planejador(case):
    nodes, edges, ctx = nodes_of(case["nodes"]), edges_of(case["edges"]), ctx_of(case, CATALOG)
    for g, ref in zip(GOALS, case["plans"]):
        same_plan(plan_goal(g, nodes, edges, ctx), ref)


@pytest.mark.parametrize("case", CASES, ids=ids)
def test_gargalo_e_e_se(case):
    nodes, edges, ctx = nodes_of(case["nodes"]), edges_of(case["edges"]), ctx_of(case, CATALOG)
    rep, ref = bottleneck_report(nodes, edges, ctx), case["report"]
    assert (rep is None) == (ref is None)
    if rep:
        assert rep.id == ref["id"] and rep.name == ref["name"] and close(rep.prod, ref["prod"])
        assert rep.why == ref["why"] and rep.has_cost == ref["hasCost"]
        assert len(rep.options) == len(ref["options"])
        for o, r in zip(rep.options, ref["options"]):
            assert (o.key, o.title, o.detail, o.next) == (r["key"], r["title"], r["detail"], r["next"])
            assert close(o.prod, r["prod"]) and close(o.gain, r["gain"]) and close(o.risk, r["risk"])
            assert (o.cost is None) == (r["cost"] is None)
            assert o.change["label"] == r["change"]["label"] and o.change["qty"] == r["change"]["qty"]
            assert close(o.change["value"], r["change"]["value"]) and o.change["off"] == r["change"]["off"]
    for extra, key in ((1, "whatIf1"), (2, "whatIf2")):
        w, r = run_what_if(extra, nodes, edges, ctx), case[key]
        assert (w is None) == (r is None)
        if w:
            assert w.id == r["id"] and w.name == r["name"] and w.n == r["n"] and w.enough == r["enough"] and w.next == r["next"]
            assert close(w.before, r["before"]) and close(w.after, r["after"]) and close(w.risk, r["risk"]) and close(w.cap_new, r["capNew"])
            assert (w.plan is None) == (r["plan"] is None)
            if w.plan:
                same_plan(w.plan, r["plan"])


@pytest.mark.parametrize("ref", DATA["runs"], ids=lambda r: f"{r['key']}-x{r['speed']}-{r['dur']}min")
def test_play_completo(ref):
    nodes, edges = nodes_of(ref["nodes"]), edges_of(ref["edges"])
    ctx = SimContext(CATALOG, ref["ambient"], False, None)
    r = start_run(nodes, edges, ref["speed"], ref["dur"])
    eventos, passos = [], 0
    while r.on and passos < 100000:
        passos += 1
        r, ev = step_run(r, nodes, edges, ctx)
        eventos += [(e["text"], e["kind"]) for e in ev]
    assert passos == ref["ticks"]
    f = ref["final"]
    assert close(r.produced, f["produced"]) and close(r.kwh, f["kwh"]) and close(r.t, f["t"])
    assert r.finished == f["finished"] and r.last_k == f["lastK"]
    assert set(r.queue) == set(f["queue"])
    for k, v in f["queue"].items():
        assert close(r.queue[k], v)
    assert eventos == [(e["text"], e["kind"]) for e in ref["events"]]


def test_formatacao_pt_br():
    for f in DATA["formats"]:
        assert fmt(f["v"], 0) == f["d0"] and fmt(f["v"], 1) == f["d1"] and fmt(f["v"], 2) == f["d2"] and fv(f["v"]) == f["fv"], f


def test_dilatacao_da_agua():
    for w in DATA["water"]:
        assert close(beta_at(w["T"]), w["beta"]) and close(water_expansion_l(w["T"]), w["l"])


# ------------------------------------------------------------------------------------- idade e manutenção
def test_idade_e_manutencao_dao_os_mesmos_numeros_do_front():
    from app.engine.wear import HORAS_USO_ANO, hours_from_inputs, wear_of
    assert HORAS_USO_ANO == DATA["wearConsts"]["horasUsoAno"] and len(DATA["wear"]) >= 600
    for c in DATA["wear"]:
        wear_h, maint_at = hours_from_inputs(c["age"], c["days"])
        assert close(wear_h, c["wearH"]) and close(maint_at, c["maintAtH"]), c
        w = wear_of(wear_h, maint_at, wear_h, c["lifeH"], c["maintH"])
        assert close(w.capacity_factor, c["cap"]) and close(w.risk_add, c["risk"]) and close(w.temp_add, c["temp"]), c
        assert w.status == c["status"] and close(w.life_used, c["lifeUsed"]) and close(w.maintenance_overdue, c["overdue"]), c
        assert close(w.hours_to_maintenance, c["hoursToMaint"]) and close(w.hours_of_life_left, c["hoursLeft"]) and close(w.residual_fraction, c["residual"]), c


def test_vida_util_e_intervalo_por_categoria_sao_os_mesmos_do_banco_e_do_front():
    import importlib.util
    import sys
    from pathlib import Path
    pasta = Path(__file__).resolve().parents[2] / "banco-de-dados" / "scripts"
    sys.path.insert(0, str(pasta))                      # o gerar_banco importa o "modelo" que está ao lado dele
    try:
        spec = importlib.util.spec_from_file_location("gerar_banco_ref", pasta / "gerar_banco.py")
        gb = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(gb)
    finally:
        sys.path.remove(str(pasta))
    assert DATA["wearConsts"]["lifeByCat"] == gb.VIDA_UTIL_H and DATA["wearConsts"]["maintByCat"] == gb.INTERVALO_MANUTENCAO_H
