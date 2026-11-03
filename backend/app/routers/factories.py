"""Fábricas do usuário: montar, simular, melhorar, salvar cenários, rodar o Play e conversar com o assistente."""
from __future__ import annotations

import asyncio
import json
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Path, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import Connection

from .. import analysis as an
from .. import factories as fa
from .. import maintenance as mt
from ..catalog_repo import load_catalog
from ..chat import SUGGESTIONS
from ..db import get_conn
from ..deps import current_user, owned_factory, user_from_token
from ..engine.types import GoalInput
from ..schemas import (AgeIn, ApplyChangesIn, AskIn, MaintenanceIn, ConnectionIn, FactoryIn, FactoryPatch, GoalIn, LayoutIn, MachineIn, MachinePatch, PlayIn,
                       ScenarioIn, WhatIfIn)
from ..views import graph_dict, simulation_dict

router = APIRouter(tags=["Fábricas"])


def _full(conn: Connection, row) -> dict:
    catalog = load_catalog(conn)
    nodes, edges = fa.load_graph(conn, row.id, catalog)
    return {**fa.factory_dict(row), **graph_dict(nodes, edges, catalog)}


# ---------------------------------------------------------------- exemplos e fábricas
@router.get("/templates", summary="Exemplos prontos para carregar")
def templates():
    return [{"key": k, "name": v["name"], "machines": [c for c, _, _ in v["nodes"]]} for k, v in fa.TEMPLATES.items()]


@router.get("/factories", summary="Minhas fábricas")
def list_factories(user=Depends(current_user), conn: Connection = Depends(get_conn)):
    return fa.list_factories(conn, user.id)


@router.post("/factories", status_code=201, summary="Criar uma fábrica (em branco ou a partir de um exemplo)")
def create_factory(body: FactoryIn, user=Depends(current_user), conn: Connection = Depends(get_conn)):
    fid = fa.create_factory(conn, user.id, body.name, body.ambient, body.tariff, body.template)
    return _full(conn, fa.get_factory(conn, fid, user.id))


@router.get("/factories/{fid}", summary="Uma fábrica com as máquinas e as conexões")
def get_factory(row=Depends(owned_factory), conn: Connection = Depends(get_conn)):
    return _full(conn, row)


@router.patch("/factories/{fid}", summary="Nome, temperatura ambiente, tarifa de energia e parada de emergência")
def patch_factory(body: FactoryPatch, row=Depends(owned_factory), user=Depends(current_user), conn: Connection = Depends(get_conn)):
    fa.update_factory(conn, row, user.id, body.model_dump())
    return _full(conn, fa.get_factory(conn, row.id, user.id))


@router.delete("/factories/{fid}", status_code=204, summary="Apagar a fábrica (e tudo que é dela)")
def delete_factory(row=Depends(owned_factory), conn: Connection = Depends(get_conn)):
    fa.delete_factory(conn, row.id)


@router.put("/factories/{fid}/layout", summary="Salvar o desenho inteiro de uma vez (substitui máquinas e conexões)")
def put_layout(body: LayoutIn, row=Depends(owned_factory), user=Depends(current_user), conn: Connection = Depends(get_conn)):
    machines = [{"ref": m.ref, "id": m.id, "type": m.type, "x": m.x, "y": m.y, "value": m.value, "qty": m.units_in_parallel, "off": m.off} for m in body.machines]
    result = fa.replace_layout(conn, row, user.id, machines, [c.model_dump() for c in body.connections])
    return {**_full(conn, fa.get_factory(conn, row.id, user.id)), "ids_by_ref": result["machines"]}


# ---------------------------------------------------------------- máquinas
@router.post("/factories/{fid}/machines", status_code=201, summary="Colocar uma máquina do catálogo na fábrica")
def add_machine(body: MachineIn, row=Depends(owned_factory), user=Depends(current_user), conn: Connection = Depends(get_conn)):
    mid = fa.add_machine(conn, row, user.id, body.type, body.x, body.y, body.value, body.units_in_parallel, body.off)
    catalog = load_catalog(conn)
    from ..views import node_dict
    n = fa.get_node(conn, row.id, mid, catalog)
    return node_dict(n, catalog[n.type])


@router.patch("/factories/{fid}/machines/{mid}", summary="Mudar ritmo, unidades em paralelo, ligar/desligar ou posição")
def patch_machine(mid: Annotated[int, Path(ge=1, le=2_147_483_647)], body: MachinePatch, row=Depends(owned_factory), user=Depends(current_user), conn: Connection = Depends(get_conn)):
    fa.update_machine(conn, row, user.id, mid, {"value": body.value, "qty": body.units_in_parallel, "off": body.off, "x": body.x, "y": body.y})
    catalog = load_catalog(conn)
    nodes, edges = fa.load_graph(conn, row.id, catalog)
    fresh = fa.get_factory(conn, row.id, user.id)
    sim = simulation_dict(nodes, edges, fa.sim_context(fresh, catalog), float(fresh.tarifa_energia))
    from ..views import node_dict
    n = next(x for x in nodes if x.id == mid)
    return {"machine": node_dict(n, catalog[n.type]), "simulation": sim}


@router.delete("/factories/{fid}/machines/{mid}", status_code=204, summary="Tirar uma máquina (as conexões dela saem junto)")
def delete_machine(mid: Annotated[int, Path(ge=1, le=2_147_483_647)], row=Depends(owned_factory), user=Depends(current_user), conn: Connection = Depends(get_conn)):
    fa.remove_machine(conn, row, user.id, mid)


@router.delete("/factories/{fid}/machines", status_code=204, summary="Limpar tudo (todas as máquinas e conexões)")
def clear_machines(row=Depends(owned_factory), user=Depends(current_user), conn: Connection = Depends(get_conn)):
    fa.clear_machines(conn, row, user.id)


# ---------------------------------------------------------------- conexões
@router.get("/factories/{fid}/connections/check", summary="Posso ligar A em B? (não grava nada; explica o motivo se não puder)")
def check_connection(from_id: Annotated[int, Query(ge=1, le=2_147_483_647)], to_id: Annotated[int, Query(ge=1, le=2_147_483_647)], row=Depends(owned_factory), conn: Connection = Depends(get_conn)):
    return fa.check_connection(conn, row.id, from_id, to_id)


@router.post("/factories/{fid}/connections", status_code=201, summary="Ligar a saída de uma máquina à entrada de outra")
def add_connection(body: ConnectionIn, row=Depends(owned_factory), user=Depends(current_user), conn: Connection = Depends(get_conn)):
    cid, verdict = fa.add_connection(conn, row, user.id, body.from_id, body.to_id)
    return {"id": cid, "from": body.from_id, "to": body.to_id, "warning": verdict["message"] if verdict["level"] == "warn" else None}


@router.delete("/factories/{fid}/connections/{cid}", status_code=204, summary="Desligar duas máquinas")
def delete_connection(cid: Annotated[int, Path(ge=1, le=2_147_483_647)], row=Depends(owned_factory), user=Depends(current_user), conn: Connection = Depends(get_conn)):
    fa.remove_connection(conn, row, user.id, cid)


# ---------------------------------------------------------------- simulação e melhoria
@router.get("/factories/{fid}/simulate", summary="Simula a fábrica agora: produção, gargalo, risco, fila, energia e efeito cascata")
def simulate(row=Depends(owned_factory), conn: Connection = Depends(get_conn)):
    catalog = load_catalog(conn)
    nodes, edges = fa.load_graph(conn, row.id, catalog)
    return simulation_dict(nodes, edges, fa.sim_context(row, catalog), float(row.tarifa_energia))


@router.get("/factories/{fid}/bottleneck", summary="Por que existe o gargalo e como melhorar (com preço estimado)")
def bottleneck(row=Depends(owned_factory), conn: Connection = Depends(get_conn)):
    return an.bottleneck(conn, row)


@router.post("/factories/{fid}/what-if", summary="E se eu colocar mais máquinas no gargalo? (recalcula em cascata)")
def what_if(body: WhatIfIn, row=Depends(owned_factory), conn: Connection = Depends(get_conn)):
    return an.what_if(conn, row, body.extra_units)


@router.post("/factories/{fid}/apply-changes", summary="Aplicar mudanças (uma opção do gargalo ou o resultado de 'e se...')")
def apply_changes(body: ApplyChangesIn, row=Depends(owned_factory), user=Depends(current_user), conn: Connection = Depends(get_conn)):
    an.apply_changes(conn, row, user.id, [c.model_dump() for c in body.changes], body.label)
    return _full(conn, fa.get_factory(conn, row.id, user.id))


@router.post("/factories/{fid}/plans", status_code=201, summary="Planejar um objetivo (\"quero +10%\"): passos, porquês, risco e custo")
def create_plan(body: GoalIn, row=Depends(owned_factory), user=Depends(current_user), conn: Connection = Depends(get_conn)):
    goal = GoalInput(body.type, body.value, body.allow_parallel, body.allow_warning_zone)
    return an.create_plan(conn, row, user.id, goal, body.save)


@router.get("/factories/{fid}/plans", summary="Planos já calculados desta fábrica")
def list_plans(row=Depends(owned_factory), conn: Connection = Depends(get_conn)):
    return an.list_plans(conn, row)


@router.get("/factories/{fid}/plans/{plan_id}", summary="Um plano")
def get_plan(plan_id: Annotated[int, Path(ge=1, le=2_147_483_647)], row=Depends(owned_factory), conn: Connection = Depends(get_conn)):
    return an.get_plan(conn, row, plan_id)


@router.post("/factories/{fid}/plans/{plan_id}/apply", summary="Aplicar o plano na fábrica")
def apply_plan(plan_id: Annotated[int, Path(ge=1, le=2_147_483_647)], row=Depends(owned_factory), user=Depends(current_user), conn: Connection = Depends(get_conn)):
    plan = an.apply_plan(conn, row, user.id, plan_id)
    return {"plan": plan, "factory": _full(conn, fa.get_factory(conn, row.id, user.id))}


# ---------------------------------------------------------------- cenários (antes × depois)
@router.post("/factories/{fid}/scenarios", status_code=201, summary="Tirar uma 'foto' da fábrica agora (para comparar depois)")
def create_scenario(body: ScenarioIn, row=Depends(owned_factory), user=Depends(current_user), conn: Connection = Depends(get_conn)):
    return an.create_scenario(conn, row, user.id, body.name)


@router.get("/factories/{fid}/scenarios", summary="Cenários salvos")
def list_scenarios(row=Depends(owned_factory), conn: Connection = Depends(get_conn)):
    return an.list_scenarios(conn, row)


@router.get("/factories/{fid}/scenarios/compare", summary="Antes × depois: compara dois cenários")
def compare(a: Annotated[int, Query(ge=1, le=2_147_483_647)], b: Annotated[int, Query(ge=1, le=2_147_483_647)], row=Depends(owned_factory), conn: Connection = Depends(get_conn)):
    return an.compare_scenarios(conn, row, a, b)


@router.get("/factories/{fid}/scenarios/{sid}", summary="Um cenário, máquina por máquina")
def get_scenario(sid: Annotated[int, Path(ge=1, le=2_147_483_647)], row=Depends(owned_factory), conn: Connection = Depends(get_conn)):
    return an.get_scenario(conn, row, sid)


@router.delete("/factories/{fid}/scenarios/{sid}", status_code=204, summary="Apagar um cenário")
def delete_scenario(sid: Annotated[int, Path(ge=1, le=2_147_483_647)], row=Depends(owned_factory), conn: Connection = Depends(get_conn)):
    an.delete_scenario(conn, row, sid)


# ---------------------------------------------------------------- Play (simulação com tempo)
@router.post("/factories/{fid}/play", summary="Roda a simulação inteira de uma vez e devolve o resultado final e a linha do tempo")
def play(body: PlayIn, row=Depends(owned_factory), user=Depends(current_user), conn: Connection = Depends(get_conn)):
    return an.run_play(conn, row, user.id, body.speed, body.duration_min, body.save, body.apply_wear)


@router.get("/factories/{fid}/simulations", summary="Histórico dos resultados finais de simulação")
def list_simulations(row=Depends(owned_factory), conn: Connection = Depends(get_conn)):
    return an.list_simulations(conn, row)


@router.get("/factories/{fid}/simulations/{sid}", summary="Uma simulação guardada, com a linha do tempo da fábrica e de cada máquina")
def get_simulation(sid: Annotated[int, Path(ge=1, le=2_147_483_647)], row=Depends(owned_factory), conn: Connection = Depends(get_conn)):
    return an.get_simulation(conn, row, sid)


# ---------------------------------------------------------------- dashboard
@router.get("/factories/{fid}/dashboard", summary="Dados para os gráficos: a fábrica agora, cada máquina, energia, desgaste e a última simulação")
def dashboard(row=Depends(owned_factory), conn: Connection = Depends(get_conn)):
    return an.dashboard(conn, row)


# ---------------------------------------------------------------- desgaste e manutenção
@router.get("/factories/{fid}/wear", summary="Desgaste, depreciação e previsão de manutenção de cada máquina")
def wear(row=Depends(owned_factory), conn: Connection = Depends(get_conn)):
    return mt.wear_report(conn, row)


@router.post("/factories/{fid}/machines/{mid}/age", summary="Acrescentar horas de uso a uma máquina (para demonstrar o desgaste)")
def age_machine(mid: Annotated[int, Path(ge=1, le=2_147_483_647)], body: AgeIn, row=Depends(owned_factory), user=Depends(current_user), conn: Connection = Depends(get_conn)):
    return mt.age_machine(conn, row, user.id, mid, body.hours)


@router.post("/factories/{fid}/machines/{mid}/maintenance", status_code=201, summary="Registrar uma manutenção (recupera parte do desgaste)")
def do_maintenance(mid: Annotated[int, Path(ge=1, le=2_147_483_647)], body: MaintenanceIn, row=Depends(owned_factory), user=Depends(current_user), conn: Connection = Depends(get_conn)):
    return mt.do_maintenance(conn, row, user.id, mid, body.kind, body.note)


@router.get("/factories/{fid}/maintenance", summary="Histórico de manutenções da fábrica")
def list_maintenance(machine_id: Optional[int] = None, row=Depends(owned_factory), conn: Connection = Depends(get_conn)):
    return mt.list_maintenance(conn, row, machine_id)


@router.websocket("/factories/{fid}/play/ws")
async def play_ws(ws: WebSocket, fid: Annotated[int, Path(ge=1, le=2_147_483_647)], token: str, speed: int = 20, duration_min: int = 60, realtime: bool = True):
    """Simulação AO VIVO. Abra com `?token=<token do login>&speed=20&duration_min=60`.

    O servidor manda um quadro (`type: "tick"`) a cada 0,25 s (ou o mais rápido possível com `realtime=false`) e, no fim, o
    resultado (`type: "result"`). O cliente pode mandar `{"cmd": "pause"}`, `{"cmd": "resume"}` ou `{"cmd": "stop"}`."""
    app = ws.app
    await ws.accept()
    try:
        with app.state.engine.begin() as conn:
            user = user_from_token(conn, token, app.state.settings)
            if user is None:
                await ws.send_json({"type": "error", "message": "Token inválido ou vencido."})
                await ws.close(code=4401)
                return
            try:
                row = fa.get_factory(conn, fid, user.id)
                an.check_play_params(speed, duration_min)
                catalog = load_catalog(conn)
                nodes, edges = fa.load_graph(conn, fid, catalog)
                if not nodes:
                    raise fa.invalid("Monte a fábrica antes de iniciar a simulação.")
            except Exception as e:  # HTTPException das regras de negócio vira mensagem no WebSocket
                detail = getattr(e, "detail", str(e))
                await ws.send_json({"type": "error", "message": detail["message"] if isinstance(detail, dict) else str(detail)})
                await ws.close(code=4400)
                return
            ctx = fa.sim_context(row, catalog)
            tariff = float(row.tarifa_energia)
            uid = user.id
        control = {"paused": False, "stop": False}

        async def listen():
            try:
                while True:
                    cmd = json.loads(await ws.receive_text()).get("cmd")
                    if cmd == "pause":
                        control["paused"] = True
                    elif cmd == "resume":
                        control["paused"] = False
                    elif cmd == "stop":
                        control["stop"] = True
            except (WebSocketDisconnect, json.JSONDecodeError, RuntimeError):
                control["stop"] = True

        reader = asyncio.create_task(listen())
        await ws.send_json({"type": "start", "speed": speed, "duration_min": duration_min, "machines": [n.id for n in nodes]})
        events: list[dict] = []
        frames: list[dict] = []
        last = None
        for frame, r in an.play_frames(nodes, edges, ctx, speed, duration_min):
            while control["paused"] and not control["stop"]:
                await asyncio.sleep(0.1)
            if control["stop"]:
                break
            events += frame["events"]
            frames.append(frame)
            last = r
            await ws.send_json(frame)
            if realtime:
                await asyncio.sleep(0.25)
        reader.cancel()
        if last is not None:
            with app.state.engine.begin() as conn:
                summary = an.finish_play(conn, row, uid, nodes, edges, ctx, frames, last, events)
            await ws.send_json({"type": "result", **summary})
        await ws.close()
    except WebSocketDisconnect:
        return


# ---------------------------------------------------------------- registro e conversa
@router.get("/factories/{fid}/events", summary="Registro (log) do que aconteceu na fábrica")
def events(limit: int = Query(80, ge=1, le=500), offset: int = Query(0, ge=0), kind: Optional[str] = Query(None, pattern="^(info|ok|warn|bad)$"),
           row=Depends(owned_factory), conn: Connection = Depends(get_conn)):
    return an.list_events(conn, row, limit, offset, kind)


@router.delete("/factories/{fid}/events", summary="Limpar o registro (o das simulações salvas fica)")
def clear_events(row=Depends(owned_factory), user=Depends(current_user), conn: Connection = Depends(get_conn)):
    return {"deleted": an.clear_events(conn, row, user.id)}


@router.get("/factories/{fid}/chat", summary="Conversa com o assistente")
def chat_history(row=Depends(owned_factory), user=Depends(current_user), conn: Connection = Depends(get_conn)):
    return {"messages": an.chat_history(conn, row, user.id), "suggestions": SUGGESTIONS}


@router.post("/factories/{fid}/chat", summary="Perguntar ao assistente (regras, não é uma IA)")
def ask(body: AskIn, row=Depends(owned_factory), user=Depends(current_user), conn: Connection = Depends(get_conn)):
    return an.ask(conn, row, user.id, body.text)


@router.delete("/factories/{fid}/chat", summary="Apagar a conversa desta fábrica")
def clear_chat(row=Depends(owned_factory), user=Depends(current_user), conn: Connection = Depends(get_conn)):
    return {"deleted": an.clear_chat(conn, row, user.id)}
