"""Análises que ficam salvas no banco: planos de objetivo, cenários (antes × depois), simulações com tempo (Play),
registro de eventos e conversa com o assistente."""
from __future__ import annotations

from typing import Iterator, Optional

from fastapi import HTTPException
from sqlalchemy import Connection, desc, func, insert, select, update

from . import chat as chat_mod
from . import maintenance
from .catalog_repo import load_catalog
from .engine.bottleneck import bottleneck_report, run_what_if
from .engine.format import fmt, fv
from .engine.goal import plan_goal
from .engine.run import start_run, step_run
from .engine.simulate import best_production, simulate
from .engine.thermal import machine_temperature
from .engine.types import GoalInput, Node, NodeChange, Plan, PlanStep, RunState
from .factories import invalid, load_graph, log_event, not_found, sim_context, touch
from .schema import T
from .views import plan_dict, report_dict, simulation_dict, what_if_dict

VELOCIDADES = (1, 5, 20, 60)


# ------------------------------------------------------------------------------------------------------------
# gargalo e "e se..."
# ------------------------------------------------------------------------------------------------------------
def bottleneck(conn: Connection, row) -> dict:
    catalog = load_catalog(conn)
    nodes, edges = load_graph(conn, row.id, catalog)
    return {"report": report_dict(bottleneck_report(nodes, edges, sim_context(row, catalog)))}


def what_if(conn: Connection, row, extra: int) -> dict:
    catalog = load_catalog(conn)
    nodes, edges = load_graph(conn, row.id, catalog)
    return {"result": what_if_dict(run_what_if(extra, nodes, edges, sim_context(row, catalog)))}


# ------------------------------------------------------------------------------------------------------------
# planos de objetivo ("quero +10%")
# ------------------------------------------------------------------------------------------------------------
def create_plan(conn: Connection, row, uid: int, goal: GoalInput, save: bool = True) -> dict:
    catalog = load_catalog(conn)
    nodes, edges = load_graph(conn, row.id, catalog)
    plan = plan_goal(goal, nodes, edges, sim_context(row, catalog))
    plan_id = None
    if save:
        plan_id = conn.execute(insert(T["planos_objetivo"]).values(
            fabrica_id=row.id, usuario_id=uid, tipo_objetivo=goal.type, valor_meta=None if goal.type == "risk" else goal.value,
            aceita_zona_atencao=goal.over, aceita_paralelo=goal.more,
            producao_antes=plan.before["prod"], producao_depois=plan.after["prod"],
            risco_antes=plan.before["risk"], risco_depois=plan.after["risk"],
            investimento_min=plan.invest["min"], investimento_max=plan.invest["max"],
            atingiu_meta=plan.ok, aplicado=False)).inserted_primary_key[0]
        by_id = {n.id: n for n in nodes}
        for i, s in enumerate(plan.steps, start=1):
            t = catalog[by_id[s.node_id].type]
            conn.execute(insert(T["plano_passos"]).values(
                plano_id=plan_id, ordem=i, acao=s.action, fabrica_maquina_id=s.node_id, maquina_id=t.db_id,
                ritmo_antes=s.before if s.action == "ritmo" else None, ritmo_depois=s.after if s.action == "ritmo" else None,
                unidades_antes=int(s.before) if s.action == "paralelo" else None,
                unidades_depois=int(s.after) if s.action == "paralelo" else None,
                motivo=s.why, custo_min=s.cost["min"] if s.cost else None, custo_max=s.cost["max"] if s.cost else None))
    return plan_dict(plan, plan_id)


def _step_what(acao: str, t, antes, depois, unidades_hoje=None) -> str:
    """Texto do passo, igual ao do motor (o banco guarda os números, não o texto)."""
    if acao == "ligar":
        return f"<b>{t.name}</b>: ligar a máquina."
    if acao == "paralelo":
        return f"<b>{t.name}</b>: usar <b>{depois} unidades em paralelo</b> (hoje {antes})."
    return f"<b>{t.name}</b>: {t.param.lower()} de <b>{fv(antes)}</b> para <b>{fv(depois)}</b> {t.unit}"


def _plan_from_db(conn: Connection, p, catalog) -> dict:
    mc = T["maquinas_catalogo"]
    codes = {r.id: r.codigo for r in conn.execute(select(mc.c.id, mc.c.codigo)).all()}
    ps = T["plano_passos"]
    steps = []
    for s in conn.execute(select(ps).where(ps.c.plano_id == p.id).order_by(ps.c.ordem)).all():
        t = catalog[codes[s.maquina_id]]
        antes = float(s.ritmo_antes) if s.acao == "ritmo" else s.unidades_antes
        depois = float(s.ritmo_depois) if s.acao == "ritmo" else s.unidades_depois
        steps.append({
            "action": s.acao, "machine_id": s.fabrica_maquina_id, "what": _step_what(s.acao, t, antes, depois), "why": s.motivo,
            "cost": {"min": float(s.custo_min), "max": float(s.custo_max)} if s.custo_min is not None else None,
            "from": antes, "to": depois,
        })
    return {
        "id": p.id, "created_at": p.criado_em, "applied": bool(p.aplicado), "reached_goal": bool(p.atingiu_meta),
        "goal": {"type": p.tipo_objetivo, "value": float(p.valor_meta) if p.valor_meta is not None else None,
                 "allow_parallel": bool(p.aceita_paralelo), "allow_warning_zone": bool(p.aceita_zona_atencao)},
        "before": {"production": float(p.producao_antes), "risk": float(p.risco_antes)},
        "after": {"production": float(p.producao_depois), "risk": float(p.risco_depois)},
        "investment": {"min": float(p.investimento_min), "max": float(p.investimento_max)}, "steps": steps,
    }


def list_plans(conn: Connection, row) -> list[dict]:
    catalog = load_catalog(conn)
    po = T["planos_objetivo"]
    return [_plan_from_db(conn, p, catalog) for p in conn.execute(select(po).where(po.c.fabrica_id == row.id).order_by(desc(po.c.id))).all()]


def get_plan(conn: Connection, row, plan_id: int) -> dict:
    po = T["planos_objetivo"]
    p = conn.execute(select(po).where(po.c.id == plan_id, po.c.fabrica_id == row.id)).first()
    if p is None:
        raise not_found("Plano não encontrado nesta fábrica.")
    return _plan_from_db(conn, p, load_catalog(conn))


def apply_plan(conn: Connection, row, uid: int, plan_id: int) -> dict:
    """Aplica na fábrica os passos de um plano salvo e marca o plano como aplicado."""
    po, ps, fm = T["planos_objetivo"], T["plano_passos"], T["fabrica_maquinas"]
    p = conn.execute(select(po).where(po.c.id == plan_id, po.c.fabrica_id == row.id)).first()
    if p is None:
        raise not_found("Plano não encontrado nesta fábrica.")
    if p.aplicado:
        raise HTTPException(409, {"message": "Este plano já foi aplicado."})
    for s in conn.execute(select(ps).where(ps.c.plano_id == plan_id).order_by(ps.c.ordem)).all():
        if s.fabrica_maquina_id is None:
            continue  # a máquina foi removida depois de o plano ser calculado
        valores = ({"desligada": False} if s.acao == "ligar" else
                   {"unidades_paralelo": s.unidades_depois} if s.acao == "paralelo" else {"ritmo": s.ritmo_depois})
        conn.execute(update(fm).where(fm.c.id == s.fabrica_maquina_id, fm.c.fabrica_id == row.id).values(**valores))
    conn.execute(update(po).where(po.c.id == plan_id).values(aplicado=True))
    log_event(conn, row.id, uid, f"Aplicou o plano: produção {fmt(float(p.producao_antes))} → {fmt(float(p.producao_depois))} garrafas/h", "ok")
    touch(conn, row.id)
    return get_plan(conn, row, plan_id)


def apply_changes(conn: Connection, row, uid: int, changes: list[dict], label: Optional[str] = None) -> None:
    """Aplica mudanças soltas (ex.: uma opção do gargalo ou o resultado de 'e se...')."""
    catalog = load_catalog(conn)
    nodes, _ = load_graph(conn, row.id, catalog)
    by_id = {n.id: n for n in nodes}
    fm = T["fabrica_maquinas"]
    for c in changes:
        n = by_id.get(c["machine_id"])
        if n is None:
            raise not_found(f"Máquina {c['machine_id']} não encontrada nesta fábrica.")
        t = catalog[n.type]
        if not (t.min <= c["value"] <= t.max):
            raise invalid(f"O ritmo da {t.name} vai de {t.min:g} a {t.max:g} {t.unit}.")
        conn.execute(update(fm).where(fm.c.id == n.id).values(ritmo=c["value"], unidades_paralelo=c["units_in_parallel"], desligada=c["off"]))
    log_event(conn, row.id, uid, "Aplicou: " + (label or "melhoria"), "ok")
    touch(conn, row.id)


# ------------------------------------------------------------------------------------------------------------
# cenários (fotos para comparar antes e depois)
# ------------------------------------------------------------------------------------------------------------
def create_scenario(conn: Connection, row, uid: int, name: str) -> dict:
    catalog = load_catalog(conn)
    nodes, edges = load_graph(conn, row.id, catalog)
    ctx = sim_context(row, catalog)
    sim = simulate(nodes, edges, ctx)
    sid = conn.execute(insert(T["cenarios"]).values(
        fabrica_id=row.id, nome=name.strip(), temperatura_ambiente=int(row.temperatura_ambiente), producao_h=sim.production,
        risco_max=sim.max_risk, energia_kw=sim.energy, gargalo_id=sim.bn)).inserted_primary_key[0]
    for n in nodes:
        r = sim.res[n.id]
        conn.execute(insert(T["cenario_maquinas"]).values(
            cenario_id=sid, maquina_id=catalog[n.type].db_id, fabrica_maquina_id=n.id, ritmo=n.value, unidades_paralelo=n.qty,
            desligada=n.off, capacidade_h=r.cap, saida_h=r.eff, fila_h=r.queue, risco=r.risk, estado=r.state, energia_kw=r.energy))
    log_event(conn, row.id, uid, f"Cenário salvo: {name.strip()}", "ok")
    return get_scenario(conn, row, sid)


def _scenario_dict(conn: Connection, s, with_machines: bool) -> dict:
    d = {"id": s.id, "name": s.nome, "created_at": s.criado_em, "ambient": int(s.temperatura_ambiente),
         "production_per_hour": float(s.producao_h), "max_risk": float(s.risco_max), "energy_kw": float(s.energia_kw),
         "bottleneck_machine_id": s.gargalo_id}
    if with_machines:
        cm, mc = T["cenario_maquinas"], T["maquinas_catalogo"]
        d["machines"] = [{
            "machine_id": r.fabrica_maquina_id, "type": r.codigo, "name": r.nome, "value": float(r.ritmo),
            "units_in_parallel": r.unidades_paralelo, "off": bool(r.desligada), "capacity": float(r.capacidade_h),
            "output": float(r.saida_h), "queue": float(r.fila_h), "risk": float(r.risco), "state": r.estado, "energy_kw": float(r.energia_kw),
        } for r in conn.execute(select(cm, mc.c.codigo, mc.c.nome).join(mc, mc.c.id == cm.c.maquina_id)
                                .where(cm.c.cenario_id == s.id).order_by(cm.c.id)).all()]
    return d


def get_scenario(conn: Connection, row, sid: int) -> dict:
    ce = T["cenarios"]
    s = conn.execute(select(ce).where(ce.c.id == sid, ce.c.fabrica_id == row.id)).first()
    if s is None:
        raise not_found("Cenário não encontrado nesta fábrica.")
    return _scenario_dict(conn, s, True)


def list_scenarios(conn: Connection, row) -> list[dict]:
    ce = T["cenarios"]
    return [_scenario_dict(conn, s, False) for s in conn.execute(select(ce).where(ce.c.fabrica_id == row.id).order_by(desc(ce.c.id))).all()]


def delete_scenario(conn: Connection, row, sid: int) -> None:
    ce = T["cenarios"]
    from sqlalchemy import delete
    if conn.execute(delete(ce).where(ce.c.id == sid, ce.c.fabrica_id == row.id)).rowcount == 0:
        raise not_found("Cenário não encontrado nesta fábrica.")


def compare_scenarios(conn: Connection, row, a: int, b: int) -> dict:
    """Antes × depois: a diferença entre dois cenários (b menos a)."""
    A, B = get_scenario(conn, row, a), get_scenario(conn, row, b)

    def delta(x, y):
        return {"before": x, "after": y, "diff": y - x, "pct": ((y - x) / x * 100) if x else None}

    ma = {m["machine_id"]: m for m in A["machines"]}
    machines = []
    for m in B["machines"]:
        o = ma.get(m["machine_id"])
        if o:
            machines.append({"machine_id": m["machine_id"], "name": m["name"], "output": delta(o["output"], m["output"]),
                             "risk": delta(o["risk"], m["risk"]), "energy_kw": delta(o["energy_kw"], m["energy_kw"]),
                             "state": {"before": o["state"], "after": m["state"]}})
    return {"before": {"id": A["id"], "name": A["name"]}, "after": {"id": B["id"], "name": B["name"]},
            "production_per_hour": delta(A["production_per_hour"], B["production_per_hour"]),
            "max_risk": delta(A["max_risk"], B["max_risk"]), "energy_kw": delta(A["energy_kw"], B["energy_kw"]), "machines": machines}


# ------------------------------------------------------------------------------------------------------------
# Play: simulação com tempo
# ------------------------------------------------------------------------------------------------------------
def check_play_params(speed: int, duration: int) -> None:
    if speed not in VELOCIDADES:
        raise invalid(f"Velocidade inválida. Use uma destas: {', '.join(str(v) for v in VELOCIDADES)}.")
    if not (10 <= duration <= 1440):
        raise invalid("A duração vai de 10 minutos a 24 horas (1440 minutos).")


def play_ticks(nodes: list[Node], edges, ctx, speed: int, duration: int) -> Iterator[tuple[RunState, list[dict], float]]:
    """Gera um passo do relógio por vez: (estado, eventos do passo, produção por hora naquele instante)."""
    r = start_run(nodes, edges, speed, duration)
    guard = 0
    while r.on and guard < 200000:
        guard += 1
        antes, t_antes = r.produced, r.t
        r, events = step_run(r, nodes, edges, ctx)
        dt = r.t - t_antes                       # o último passo pode ser mais curto que 0,25 x velocidade
        yield r, events, ((r.produced - antes) / dt * 60) if dt > 0 else 0.0


def play_frames(nodes: list[Node], edges, ctx, speed: int, duration: int) -> Iterator[tuple[dict, RunState]]:
    """Como `play_ticks`, mas cada passo já vem como quadro pronto para a tela (usado pelo WebSocket)."""
    from .engine.types import RunInfo, SimContext
    catalog = ctx.catalog
    for r, ev, rate in play_ticks(nodes, edges, ctx, speed, duration):
        live = simulate(nodes, edges, SimContext(catalog, ctx.ambient, ctx.estop, RunInfo(True, r.t, r.arrivals)))   # a fábrica no fim do passo (como no front)
        yield {
            "type": "tick", "t": round(r.t, 2), "duration_min": duration, "produced": r.produced, "energy_kwh": r.kwh,
            "production_per_hour": rate, "queue_total": sum(r.queue.values()), "max_risk": live.max_risk,
            "machines": {str(n.id): {"output": live.res[n.id].eff, "queue": live.res[n.id].queue, "state": live.res[n.id].state,
                                     "waiting_for_product": live.res[n.id].waiting, "energy_kw": live.res[n.id].energy,
                                     "risk": live.res[n.id].risk,
                                     "temperature_c": machine_temperature(catalog[n.type], n, live.res[n.id], ctx.ambient)} for n in nodes},
            "events": ev,
        }, r


def play_summary(nodes: list[Node], edges, ctx, tariff: float, r: RunState, events: list[dict]) -> dict:
    """Resultado final (a janela 'Resultado final da simulação' do front-end)."""
    catalog = ctx.catalog
    static = simulate(nodes, edges, ctx.without_run())
    hours = r.dur / 60
    ideal = best_production(nodes, edges, ctx.without_run()) * hours
    bad = [{"machine_id": n.id, "name": catalog[n.type].name, "state": static.res[n.id].state} for n in nodes if static.res[n.id].state != "normal"]
    bn = next((n for n in nodes if n.id == static.bn), None)
    return {
        "speed": r.speed, "duration_min": r.dur, "finished": r.finished,
        "produced": r.produced, "average_per_hour": r.produced / hours, "pct_of_best": (r.produced / ideal * 100) if ideal else 0.0,
        "energy_kwh": r.kwh, "energy_cost": r.kwh * tariff, "queue_total": sum(r.queue.values()),
        "queue_by_machine": {str(k): v for k, v in r.queue.items()},
        "max_risk": static.max_risk,
        "bottleneck": {"machine_id": bn.id, "type": bn.type, "name": catalog[bn.type].name} if bn else None,
        "machines_out_of_optimal": bad, "events": events,
    }


def save_simulation(conn: Connection, row, uid: int, nodes, edges, ctx, summary: dict) -> int:
    catalog = ctx.catalog
    bn = summary["bottleneck"]
    sid = conn.execute(insert(T["simulacoes"]).values(
        fabrica_id=row.id, usuario_id=uid, velocidade=summary["speed"], duracao_min=summary["duration_min"],
        concluida=summary["finished"], garrafas_produzidas=round(summary["produced"]), energia_kwh=summary["energy_kwh"],
        fila_total=round(summary["queue_total"]), pct_do_maximo=min(summary["pct_of_best"], 9999.99), risco_max=summary["max_risk"],
        gargalo_maquina_id=catalog[bn["type"]].db_id if bn else None)).inserted_primary_key[0]
    for e in summary["events"]:
        log_event(conn, row.id, uid, e["text"], e["kind"], sim_id=sid)
    return sid


MAX_PONTOS = 120   # no máximo 120 pontos por simulação (o gráfico não precisa de mais)


def _sample(frames: list[dict]) -> list[dict]:
    if len(frames) <= MAX_PONTOS:
        return frames
    passo = len(frames) / MAX_PONTOS
    escolhidos = [frames[int(i * passo)] for i in range(MAX_PONTOS)]
    if escolhidos[-1] is not frames[-1]:
        escolhidos.append(frames[-1])
    return escolhidos


def _series(frames: list[dict]) -> tuple[list[dict], dict[str, list[dict]]]:
    timeline = [{"t": f["t"], "produced": f["produced"], "production_per_hour": f["production_per_hour"], "energy_kwh": f["energy_kwh"],
                 "queue_total": f["queue_total"], "max_risk": f["max_risk"]} for f in frames]
    machines: dict[str, list[dict]] = {}
    for f in frames:
        for mid, m in f["machines"].items():
            machines.setdefault(mid, []).append({"t": f["t"], "output": m["output"], "queue": m["queue"], "risk": m["risk"], "state": m["state"],
                                                 "energy_kw": m["energy_kw"], "temperature_c": m["temperature_c"]})
    return timeline, machines


def _save_series(conn: Connection, sim_id: int, frames: list[dict]) -> None:
    sp, spm = T["simulacao_pontos"], T["simulacao_pontos_maquina"]
    for f in frames:
        pid = conn.execute(insert(sp).values(
            simulacao_id=sim_id, minuto=f["t"], garrafas_acumuladas=f["produced"], producao_h=f["production_per_hour"], energia_kwh=f["energy_kwh"],
            fila_total=f["queue_total"], risco_max=f["max_risk"])).inserted_primary_key[0]
        for mid, m in f["machines"].items():
            conn.execute(insert(spm).values(
                ponto_id=pid, fabrica_maquina_id=int(mid), saida_h=m["output"], fila_h=m["queue"], risco=m["risk"], estado=m["state"],
                energia_kw=m["energy_kw"], temperatura_c=m["temperature_c"]))


def finish_play(conn: Connection, row, uid: int, nodes, edges, ctx, frames: list[dict], last: RunState, events: list[dict],
                save: bool = True, apply_wear: bool = True) -> dict:
    """Fecha um Play (completo ou parado): resultado final, linha do tempo e, se `save`, grava tudo e envelhece as máquinas."""
    summary = play_summary(nodes, edges, ctx, float(row.tarifa_energia), last, events)
    sample = _sample(frames)
    summary["timeline"], summary["machine_series"] = _series(sample)
    summary["id"] = None
    summary["wear_added"] = []
    if save:
        summary["id"] = save_simulation(conn, row, uid, nodes, edges, ctx, summary)
        _save_series(conn, summary["id"], sample)
        if apply_wear:
            static = simulate(nodes, edges, ctx.without_run())
            summary["wear_added"] = maintenance.accrue_play_wear(conn, row, uid, nodes, ctx.catalog, {k: r.state for k, r in static.res.items()}, last.t)
    return summary


def run_play(conn: Connection, row, uid: int, speed: int, duration: int, save: bool = True, apply_wear: bool = True) -> dict:
    """Roda a simulação inteira de uma vez (sem esperar o relógio) e devolve o resultado final e a linha do tempo."""
    check_play_params(speed, duration)
    catalog = load_catalog(conn)
    nodes, edges = load_graph(conn, row.id, catalog)
    if not nodes:
        raise invalid("Monte a fábrica antes de iniciar a simulação.")
    ctx = sim_context(row, catalog)
    events: list[dict] = []
    frames: list[dict] = []
    last = None
    for frame, r in play_frames(nodes, edges, ctx, speed, duration):
        events += frame["events"]
        frames.append(frame)
        last = r
    return finish_play(conn, row, uid, nodes, edges, ctx, frames, last, events, save, apply_wear)


def get_simulation(conn: Connection, row, sid: int) -> dict:
    """Uma simulação guardada: resultado final, linha do tempo da fábrica e leitura de cada máquina."""
    si = T["simulacoes"]
    s = next((x for x in list_simulations(conn, row) if x["id"] == sid), None)
    if s is None:
        raise not_found("Simulação não encontrada nesta fábrica.")
    sp, spm = T["simulacao_pontos"], T["simulacao_pontos_maquina"]
    pontos = conn.execute(select(sp).where(sp.c.simulacao_id == sid).order_by(sp.c.minuto)).all()
    timeline = [{"t": float(p.minuto), "produced": float(p.garrafas_acumuladas), "production_per_hour": float(p.producao_h),
                 "energy_kwh": float(p.energia_kwh), "queue_total": float(p.fila_total), "max_risk": float(p.risco_max)} for p in pontos]
    por_ponto = {p.id: float(p.minuto) for p in pontos}
    machines: dict[str, list[dict]] = {}
    if por_ponto:
        for m in conn.execute(select(spm).where(spm.c.ponto_id.in_(list(por_ponto))).order_by(spm.c.ponto_id)).all():
            machines.setdefault(str(m.fabrica_maquina_id), []).append({
                "t": por_ponto[m.ponto_id], "output": float(m.saida_h), "queue": float(m.fila_h), "risk": float(m.risco), "state": m.estado,
                "energy_kw": float(m.energia_kw), "temperature_c": float(m.temperatura_c)})
    return {**s, "timeline": timeline, "machine_series": machines}


def dashboard(conn: Connection, row) -> dict:
    """Tudo que os gráficos do dashboard precisam: a fábrica agora, cada máquina, energia, desgaste e a última simulação."""
    catalog = load_catalog(conn)
    nodes, edges, wears = load_graph(conn, row.id, catalog, with_wear=True)
    ctx = sim_context(row, catalog)
    sim = simulate(nodes, edges, ctx)
    best = best_production(nodes, edges, ctx.without_run())
    total_kw = sim.energy or 0.0
    machines = []
    alerts = []
    for n in nodes:
        t, r, w = catalog[n.type], sim.res[n.id], wears[n.id]
        temp = machine_temperature(t, n, r, ctx.ambient)
        machines.append({
            "id": n.id, "type": n.type, "name": t.name, "units_in_parallel": n.qty, "state": r.state, "capacity": r.cap, "output": r.eff,
            "inflow": r.inflow, "queue": r.queue, "utilization_pct": (r.eff / r.cap * 100) if r.cap else 0.0, "risk": r.risk,
            "energy_kw": r.energy, "energy_share_pct": (r.energy / total_kw * 100) if total_kw else 0.0, "temperature_c": temp,
            "wear_status": w.status, "life_used_pct": w.life_used * 100, "hours_to_maintenance": w.hours_to_maintenance,
        })
        if r.state in ("falha", "critico"):
            alerts.append({"level": "bad" if r.state == "falha" else "warn", "machine_id": n.id, "text": f"{t.name}: {'falhou' if r.state == 'falha' else 'perto do limite de falha'}."})
        if r.queue >= 1:
            alerts.append({"level": "warn", "machine_id": n.id, "text": f"{t.name}: {r.queue:,.0f} garrafas/h esperando na fila.".replace(",", ".")})
        if w.status != "ok":
            alerts.append({"level": "bad" if w.status in ("fim_de_vida", "manutencao_atrasada") else "warn", "machine_id": n.id,
                           "text": f"{t.name}: {maintenance.STATUS_TEXT[w.status].lower()}."})
    bn = next((n for n in nodes if n.id == sim.bn), None)
    sims = list_simulations(conn, row)
    last = get_simulation(conn, row, sims[0]["id"]) if sims else None
    return {
        "factory": {"production_per_hour": sim.production, "best_production_per_hour": best, "pct_of_best": (sim.production / best * 100) if best else 0.0,
                    "max_risk": sim.max_risk, "energy_kw": sim.energy, "energy_cost_per_hour": sim.energy * float(row.tarifa_energia),
                    "ambient": ctx.ambient, "emergency_stop": ctx.estop,
                    "bottleneck": {"machine_id": bn.id, "name": catalog[bn.type].name} if bn else None,
                    "queue_total": sum(r.queue for r in sim.res.values())},
        "machines": machines, "alerts": alerts, "last_simulation": last,
        "chart_guide": [
            {"chart": "Medidor da fábrica", "shows": "produção agora × máximo possível (%)", "field": "factory.pct_of_best"},
            {"chart": "Linha do tempo do Play", "shows": "garrafas acumuladas e produção por hora ao longo da simulação", "field": "last_simulation.timeline"},
            {"chart": "Barras capacidade × saída", "shows": "onde o produto trava (o gargalo aparece sozinho)", "field": "machines[].capacity / output"},
            {"chart": "Mapa de filas", "shows": "quanto está parado esperando em cada máquina", "field": "machines[].queue"},
            {"chart": "Rosca de energia", "shows": "quem gasta mais energia", "field": "machines[].energy_share_pct"},
            {"chart": "Termômetro de risco", "shows": "risco de falha de cada máquina", "field": "machines[].risk"},
            {"chart": "Temperatura da máquina", "shows": "temperatura estimada (hipótese didática)", "field": "machines[].temperature_c / last_simulation.machine_series"},
            {"chart": "Desgaste", "shows": "vida útil gasta e manutenção", "field": "machines[].life_used_pct / wear_status"},
        ],
    }


def list_simulations(conn: Connection, row) -> list[dict]:
    si, mc = T["simulacoes"], T["maquinas_catalogo"]
    q = select(si, mc.c.codigo, mc.c.nome).select_from(si.outerjoin(mc, mc.c.id == si.c.gargalo_maquina_id)).where(si.c.fabrica_id == row.id).order_by(desc(si.c.id))
    return [{
        "id": s.id, "started_at": s.iniciada_em, "speed": s.velocidade, "duration_min": s.duracao_min, "finished": bool(s.concluida),
        "produced": float(s.garrafas_produzidas), "energy_kwh": float(s.energia_kwh), "queue_total": float(s.fila_total),
        "pct_of_best": float(s.pct_do_maximo), "max_risk": float(s.risco_max),
        "bottleneck": {"type": s.codigo, "name": s.nome} if s.codigo else None,
    } for s in conn.execute(q).all()]


# ------------------------------------------------------------------------------------------------------------
# registro (log) e conversa
# ------------------------------------------------------------------------------------------------------------
def list_events(conn: Connection, row, limit: int = 80, offset: int = 0, kind: Optional[str] = None) -> list[dict]:
    ev = T["eventos_registro"]
    q = select(ev).where(ev.c.fabrica_id == row.id)
    if kind:
        q = q.where(ev.c.tipo == kind)
    return [{"id": e.id, "at": e.ocorrido_em, "kind": e.tipo, "text": e.mensagem, "simulation_id": e.simulacao_id}
            for e in conn.execute(q.order_by(desc(ev.c.id)).limit(limit).offset(offset)).all()]


def clear_events(conn: Connection, row, uid: int) -> int:
    from sqlalchemy import delete
    ev = T["eventos_registro"]
    return conn.execute(delete(ev).where(ev.c.fabrica_id == row.id, ev.c.simulacao_id.is_(None))).rowcount


def _manuals(conn: Connection) -> dict[str, dict]:
    mm, mc = T["manuais_maquina"], T["maquinas_catalogo"]
    return {r.codigo: {"what": r.o_que_faz, "how": r.como_funciona_ritmo, "tips": r.dicas}
            for r in conn.execute(select(mm, mc.c.codigo).join(mc, mc.c.id == mm.c.maquina_id)).all()}


def ask(conn: Connection, row, uid: int, text: str) -> dict:
    catalog = load_catalog(conn)
    nodes, edges = load_graph(conn, row.id, catalog)
    reply = chat_mod.answer(text, nodes, edges, sim_context(row, catalog), float(row.tarifa_energia), _manuals(conn))
    mc = T["mensagens_chat"]
    conn.execute(insert(mc).values(usuario_id=uid, fabrica_id=row.id, autor="usuario", texto=text.strip()))
    conn.execute(insert(mc).values(usuario_id=uid, fabrica_id=row.id, autor="assistente", texto=reply["text"]))
    return reply


def chat_history(conn: Connection, row, uid: int, limit: int = 100) -> list[dict]:
    mc = T["mensagens_chat"]
    rows = conn.execute(select(mc).where(mc.c.usuario_id == uid, mc.c.fabrica_id == row.id).order_by(desc(mc.c.id)).limit(limit)).all()
    return [{"id": m.id, "author": m.autor, "text": m.texto, "at": m.criada_em} for m in reversed(rows)]


def clear_chat(conn: Connection, row, uid: int) -> int:
    from sqlalchemy import delete
    mc = T["mensagens_chat"]
    return conn.execute(delete(mc).where(mc.c.usuario_id == uid, mc.c.fabrica_id == row.id)).rowcount
