"""Estado de cada máquina (idade e manutenção informadas por quem monta a fábrica), seu efeito no rendimento e no risco, e a depreciação (hipóteses didáticas: ver engine/wear.py)."""
from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import Connection, desc, insert, select, update

from .catalog_repo import load_catalog
from .engine import wear as W
from .engine.simulate import simulate
from .engine.types import Node
from .factories import invalid, load_graph, log_event, not_found, sim_context, touch
from .schema import T

STATUS_TEXT = {
    "ok": "Em dia", "atencao": "Perto da hora de fazer manutenção ou do fim da vida útil",
    "manutencao_atrasada": "Manutenção atrasada: rende menos e o risco é maior",
    "fim_de_vida": "Passou da vida útil: rende bem menos e o risco de falha é alto",
}


def wear_dict(w: W.Wear, t, qty: int, price_mid: Optional[float]) -> dict:
    new_cost = price_mid * qty if price_mid is not None else None
    return {
        "operating_hours": w.operating_hours, "wear_hours": w.wear_hours, "life_hours": t.life_h,
        "life_used_pct": w.life_used * 100, "life_left_hours": w.hours_of_life_left,
        "maintenance_interval_hours": t.maintenance_interval_h, "hours_since_maintenance": w.hours_since_maintenance,
        "hours_to_maintenance": w.hours_to_maintenance, "maintenance_overdue": w.maintenance_overdue > 0,
        "capacity_factor": w.capacity_factor, "capacity_lost_pct": (1 - w.capacity_factor) * 100, "risk_added": w.risk_add,
        "status": w.status, "status_text": STATUS_TEXT[w.status], "temperature_added_c": w.temp_add,
        "residual_value_fraction": w.residual_fraction,
        "replacement_cost": new_cost, "residual_value": new_cost * w.residual_fraction if new_cost is not None else None,
        "depreciation_per_hour": (new_cost * (1 - W.VALOR_RESIDUAL) / t.life_h) if new_cost is not None else None,
        "predicted_end_of_life_in_hours": w.hours_of_life_left,
    }


def _price_mid(t) -> Optional[float]:
    return (t.cost.min + t.cost.max) / 2 if t.cost and t.cost.max else None


def wear_report(conn: Connection, row) -> dict:
    catalog = load_catalog(conn)
    nodes, edges, wears = load_graph(conn, row.id, catalog, with_wear=True)
    ctx = sim_context(row, catalog)
    sim = simulate(nodes, edges, ctx)
    sem_desgaste = simulate([Node(n.id, n.type, n.x, n.y, n.value, n.qty, n.off) for n in nodes], edges, ctx)
    perda = (1 - sim.production / sem_desgaste.production) * 100 if sem_desgaste.production else 0.0
    machines, alerts = [], []
    for n in nodes:
        t, w = catalog[n.type], wears[n.id]
        d = wear_dict(w, t, n.qty, _price_mid(t))
        machines.append({"id": n.id, "type": n.type, "name": t.name, "units_in_parallel": n.qty,
                         "age_years": n.age_years, "last_maintenance_date": n.maint_date, "days_since_maintenance": int(n.maint_days),
                         "months_since_maintenance": W.months_from_days(n.maint_days), "life_years": round(t.life_h / W.HORAS_USO_ANO, 1),
                         "maintenance_interval_months": W.months_from_days(t.maintenance_interval_h / W.HORAS_USO_ANO * W.DIAS_ANO), **d})
        if w.status != "ok":
            alerts.append({"machine_id": n.id, "name": t.name, "status": w.status, "text": f"{t.name}: {STATUS_TEXT[w.status]}."})
    residual = [m["residual_value"] for m in machines if m["residual_value"] is not None]
    cost = [m["replacement_cost"] for m in machines if m["replacement_cost"] is not None]
    return {
        "machines": machines, "alerts": alerts,
        "totals": {"replacement_cost": sum(cost), "residual_value": sum(residual),
                   "depreciated": sum(cost) - sum(residual) if cost else 0.0,
                   "production_lost_to_wear_pct": perda, "production_per_hour": sim.production,
                   "production_per_hour_without_wear": sem_desgaste.production},
        "basis": "Hipótese didática (a validar): vida útil e intervalos de manutenção por tipo de máquina; perda de rendimento, aumento de risco e "
                 "de temperatura com a idade e com a manutenção atrasada; depreciação linear até 10% do preço de nova. A idade é informada por quem monta "
                 "a fábrica (4.000 h de uso por ano). Preços são estimativas.",
    }


def _machine(conn: Connection, row, mid: int):
    fm = T["fabrica_maquinas"]
    m = conn.execute(select(fm).where(fm.c.id == mid, fm.c.fabrica_id == row.id)).first()
    if m is None:
        raise not_found("Máquina não encontrada nesta fábrica.")
    return m


def do_maintenance(conn: Connection, row, uid: int, mid: int, kind: str, note: Optional[str]) -> dict:
    m = _machine(conn, row, mid)
    catalog = load_catalog(conn)
    code = conn.execute(select(T["maquinas_catalogo"].c.codigo).where(T["maquinas_catalogo"].c.id == m.maquina_id)).scalar_one()
    antes = float(m.horas_desgaste)
    dias_antes = W.days_since(m.ultima_manutencao_em)
    conn.execute(insert(T["manutencoes"]).values(fabrica_maquina_id=mid, usuario_id=uid, tipo=kind, horas_desgaste_antes=antes,
                                                 horas_desgaste_depois=antes, observacao=note))
    conn.execute(update(T["fabrica_maquinas"]).where(T["fabrica_maquinas"].c.id == mid).values(ultima_manutencao_em=W.today()))   # a data volta a ser hoje; a idade continua
    log_event(conn, row.id, uid, f"{catalog[code].name}: manutenção {kind} registrada (a última era de {int(dias_antes)} dia(s) atrás)", "ok")
    touch(conn, row.id)
    return next(x for x in wear_report(conn, row)["machines"] if x["id"] == mid)


def list_maintenance(conn: Connection, row, mid: Optional[int] = None) -> list[dict]:
    mt, fm = T["manutencoes"], T["fabrica_maquinas"]
    q = select(mt).join(fm, fm.c.id == mt.c.fabrica_maquina_id).where(fm.c.fabrica_id == row.id).order_by(desc(mt.c.id))
    if mid is not None:
        q = q.where(mt.c.fabrica_maquina_id == mid)
    return [{"id": r.id, "machine_id": r.fabrica_maquina_id, "at": r.realizada_em, "kind": r.tipo, "wear_before": float(r.horas_desgaste_antes),
             "wear_after": float(r.horas_desgaste_depois), "note": r.observacao} for r in conn.execute(q).all()]
