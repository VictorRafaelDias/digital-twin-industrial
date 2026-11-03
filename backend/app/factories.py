"""Fábricas: criar, montar (máquinas e conexões), registrar o que o usuário faz. Tudo grava no banco de 21 tabelas.

Cada função recebe a conexão do pedido e o dono (usuário) e confere se a fábrica é dele.
"""
from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import Connection, delete, func, insert, select, update

from .catalog_repo import f, load_catalog
from .engine.connect import can_connect
from .engine.format import fmt
from .engine.simulate import simulate
from .engine.types import Catalog, Edge, Node, SimContext
from .engine.wear import Wear, wear_of
from .schema import T

# exemplos prontos (mesmas máquinas e posições do front-end): cada uma ligada à seguinte
TEMPLATES: dict[str, dict] = {
    "bebidas": {"name": "Bebidas em geral", "nodes": [
        ("tanque_agua", 40, 60), ("tanque_xarope", 270, 60), ("misturador", 500, 60), ("pasteurizador", 730, 60),
        ("carbonatador", 730, 250), ("enchedora", 500, 250), ("esteira", 270, 250), ("rotuladora", 40, 250)]},
    "suco": {"name": "Suco de laranja natural", "nodes": [
        ("recepcao_fruta", 40, 60), ("lavadora_frutas", 270, 60), ("extratora", 500, 60),
        ("filtro_despolpadeira", 500, 250), ("envasadora_suco", 270, 250), ("camara_fria", 40, 250)]},
}

KIND_DB = {"": "info", "ok": "ok", "warn": "warn", "bad": "bad", "info": "info"}


def not_found(msg: str) -> HTTPException:
    return HTTPException(404, msg)


def invalid(msg: str, **extra) -> HTTPException:
    return HTTPException(422, {"message": msg, **extra})


# ------------------------------------------------------------------------------------------------------------
# leitura
# ------------------------------------------------------------------------------------------------------------
def get_factory(conn: Connection, fid: int, uid: int):
    row = conn.execute(select(T["fabricas"]).where(T["fabricas"].c.id == fid, T["fabricas"].c.usuario_id == uid)).first()
    if row is None:
        raise not_found("Fábrica não encontrada.")  # (também vale para fábrica de outro usuário: não vazamos que existe)
    return row


def load_graph(conn: Connection, fid: int, catalog: Catalog, with_wear: bool = False):
    """Máquinas e conexões da fábrica. O desgaste de cada máquina já entra na capacidade e no risco (Node.wear_cap / wear_risk).

    Com `with_wear=True` devolve também o detalhe do desgaste de cada máquina: (nodes, edges, {id: Wear})."""
    fm, mc, co = T["fabrica_maquinas"], T["maquinas_catalogo"], T["conexoes"]
    nodes: list[Node] = []
    wears: dict[int, Wear] = {}
    for r in conn.execute(select(fm, mc.c.codigo).join(mc, mc.c.id == fm.c.maquina_id).where(fm.c.fabrica_id == fid).order_by(fm.c.id)).all():
        t = catalog[r.codigo]
        w = wear_of(float(r.horas_desgaste), float(r.manutencao_em_h), float(r.horas_operacao), t.life_h, t.maintenance_interval_h)
        wears[r.id] = w
        nodes.append(Node(r.id, r.codigo, r.pos_x, r.pos_y, float(r.ritmo), int(r.unidades_paralelo), bool(r.desligada), w.capacity_factor, w.risk_add))
    edges = [Edge(r.id, r.origem_id, r.destino_id) for r in conn.execute(select(co).where(co.c.fabrica_id == fid).order_by(co.c.id)).all()]
    return (nodes, edges, wears) if with_wear else (nodes, edges)


def sim_context(row, catalog: Catalog, run=None) -> SimContext:
    return SimContext(catalog, float(row.temperatura_ambiente), bool(row.parada_emergencia), run)


def factory_dict(row) -> dict:
    return {
        "id": row.id, "name": row.nome, "example": row.exemplo_origem, "ambient": int(row.temperatura_ambiente),
        "tariff": float(row.tarifa_energia), "emergency_stop": bool(row.parada_emergencia),
        "created_at": row.criada_em, "updated_at": row.atualizada_em,
    }


def list_factories(conn: Connection, uid: int) -> list[dict]:
    fa, fm = T["fabricas"], T["fabrica_maquinas"]
    qtd = dict(conn.execute(select(fm.c.fabrica_id, func.count()).group_by(fm.c.fabrica_id)).all())
    return [{**factory_dict(r), "machine_count": qtd.get(r.id, 0)}
            for r in conn.execute(select(fa).where(fa.c.usuario_id == uid).order_by(fa.c.atualizada_em.desc(), fa.c.id.desc())).all()]


# ------------------------------------------------------------------------------------------------------------
# registro (log)
# ------------------------------------------------------------------------------------------------------------
def log_event(conn: Connection, fid: Optional[int], uid: Optional[int], text: str, kind: str = "", sim_id: Optional[int] = None) -> None:
    conn.execute(insert(T["eventos_registro"]).values(fabrica_id=fid, usuario_id=uid, simulacao_id=sim_id,
                                                      tipo=KIND_DB.get(kind, "info"), mensagem=text))


def touch(conn: Connection, fid: int) -> None:
    conn.execute(update(T["fabricas"]).where(T["fabricas"].c.id == fid).values(atualizada_em=func.current_timestamp()))


# ------------------------------------------------------------------------------------------------------------
# fábricas
# ------------------------------------------------------------------------------------------------------------
def _check_name(conn: Connection, uid: int, name: str, ignore: Optional[int] = None) -> str:
    name = name.strip()
    if not name:
        raise invalid("Dê um nome para a fábrica.")
    q = select(T["fabricas"].c.id).where(T["fabricas"].c.usuario_id == uid, T["fabricas"].c.nome == name)
    if ignore is not None:
        q = q.where(T["fabricas"].c.id != ignore)
    if conn.execute(q).first():
        raise HTTPException(409, {"message": "Você já tem uma fábrica com esse nome."})
    return name


def create_factory(conn: Connection, uid: int, name: str, ambient: int = 25, tariff: float = 0.85, template: Optional[str] = None) -> int:
    if template is not None and template not in TEMPLATES:
        raise not_found(f"Exemplo '{template}' não existe. Use: {', '.join(TEMPLATES)}.")
    name = _check_name(conn, uid, name)
    fid = conn.execute(insert(T["fabricas"]).values(
        usuario_id=uid, nome=name, exemplo_origem=template, temperatura_ambiente=ambient, tarifa_energia=tariff,
        parada_emergencia=False)).inserted_primary_key[0]
    if template:
        catalog = load_catalog(conn)
        previous = None
        for code, x, y in TEMPLATES[template]["nodes"]:
            mid = _insert_machine(conn, fid, catalog[code], x, y, None, 1, False)
            if previous is not None:
                conn.execute(insert(T["conexoes"]).values(fabrica_id=fid, origem_id=previous, destino_id=mid))
            previous = mid
        log_event(conn, fid, uid, f"Exemplo carregado: {TEMPLATES[template]['name']}", "ok")
    else:
        log_event(conn, fid, uid, "Fábrica nova, em branco")
    return fid


def update_factory(conn: Connection, row, uid: int, patch: dict) -> None:
    values: dict = {}
    if patch.get("name") is not None:
        values["nome"] = _check_name(conn, uid, patch["name"], ignore=row.id)
    if patch.get("ambient") is not None:
        values["temperatura_ambiente"] = patch["ambient"]
        log_event(conn, row.id, uid, f"Temperatura ambiente: {patch['ambient']} °C")
    if patch.get("tariff") is not None:
        values["tarifa_energia"] = patch["tariff"]
    if patch.get("emergency_stop") is not None and patch["emergency_stop"] != bool(row.parada_emergencia):
        values["parada_emergencia"] = patch["emergency_stop"]
        if patch["emergency_stop"]:
            log_event(conn, row.id, uid, "PARADA DE EMERGÊNCIA acionada", "bad")
        else:
            log_event(conn, row.id, uid, "Emergência liberada — fábrica religada", "ok")
    if values:
        conn.execute(update(T["fabricas"]).where(T["fabricas"].c.id == row.id).values(**values, atualizada_em=func.current_timestamp()))


def delete_factory(conn: Connection, fid: int) -> None:
    # simulações guardam o histórico de quem rodou e têm RESTRICT no usuário, mas não na fábrica: apagar a fábrica apaga tudo dela
    conn.execute(delete(T["fabricas"]).where(T["fabricas"].c.id == fid))


# ------------------------------------------------------------------------------------------------------------
# máquinas
# ------------------------------------------------------------------------------------------------------------
def _insert_machine(conn: Connection, fid: int, t, x: int, y: int, value: Optional[float], qty: int, off: bool) -> int:
    return conn.execute(insert(T["fabrica_maquinas"]).values(
        fabrica_id=fid, maquina_id=t.db_id, pos_x=max(0, int(x)), pos_y=max(0, int(y)),
        ritmo=t.opt if value is None else value, unidades_paralelo=qty, desligada=off)).inserted_primary_key[0]


def _check_value(t, value: float) -> None:
    if not (t.min <= value <= t.max):
        raise invalid(f"O ritmo da {t.name} vai de {t.min:g} a {t.max:g} {t.unit}.", min=t.min, max=t.max)


def add_machine(conn: Connection, row, uid: int, code: str, x: int = 0, y: int = 0, value: Optional[float] = None, qty: int = 1, off: bool = False) -> int:
    catalog = load_catalog(conn)
    t = catalog.get(code)
    if t is None:
        raise not_found(f"Tipo de máquina '{code}' não existe no catálogo.")
    active = conn.execute(select(T["maquinas_catalogo"].c.ativa).where(T["maquinas_catalogo"].c.id == t.db_id)).scalar_one()
    if not active:
        raise invalid(f"{t.name} está desativada no catálogo.")
    if value is not None:
        _check_value(t, value)
    mid = _insert_machine(conn, row.id, t, x, y, value, qty, off)
    log_event(conn, row.id, uid, f"Adicionou: {t.name}")
    touch(conn, row.id)
    return mid


def get_node(conn: Connection, fid: int, mid: int, catalog: Catalog) -> Node:
    nodes, _ = load_graph(conn, fid, catalog)
    n = next((x for x in nodes if x.id == mid), None)
    if n is None:
        raise not_found("Máquina não encontrada nesta fábrica.")
    return n


def update_machine(conn: Connection, row, uid: int, mid: int, patch: dict) -> None:
    catalog = load_catalog(conn)
    nodes, edges = load_graph(conn, row.id, catalog)
    n = next((x for x in nodes if x.id == mid), None)
    if n is None:
        raise not_found("Máquina não encontrada nesta fábrica.")
    t = catalog[n.type]
    values: dict = {}
    ctx = sim_context(row, catalog)
    if patch.get("value") is not None and abs(patch["value"] - n.value) > 1e-12:
        _check_value(t, patch["value"])
        before = simulate(nodes, edges, ctx).production
        after_nodes = []
        for x in nodes:
            y = x.copy()
            if x.id == mid:
                y.value = patch["value"]
            after_nodes.append(y)
        res = simulate(after_nodes, edges, ctx)
        dp = ((res.production - before) / before) * 100 if before else 0
        state = res.res[mid].state
        values["ritmo"] = patch["value"]
        log_event(conn, row.id, uid,
                  f"{t.name}: {t.param.lower()} {fmt(n.value, 2)} → {fmt(patch['value'], 2)} {t.unit} · produção {'+' if dp >= 0 else ''}{fmt(dp, 1)}%",
                  "ok" if state == "normal" else "bad" if state == "falha" else "warn")
    if patch.get("qty") is not None and patch["qty"] != n.qty:
        values["unidades_paralelo"] = patch["qty"]
        log_event(conn, row.id, uid, f"{t.name}: {patch['qty']} unidade(s) em paralelo")
    if patch.get("off") is not None and patch["off"] != n.off:
        values["desligada"] = patch["off"]
        log_event(conn, row.id, uid, f"{t.name}: {'desligada' if patch['off'] else 'ligada'}", "warn" if patch["off"] else "ok")
    if patch.get("x") is not None:
        values["pos_x"] = max(0, int(patch["x"]))
    if patch.get("y") is not None:
        values["pos_y"] = max(0, int(patch["y"]))
    if values:
        conn.execute(update(T["fabrica_maquinas"]).where(T["fabrica_maquinas"].c.id == mid).values(**values))
        touch(conn, row.id)


def remove_machine(conn: Connection, row, uid: int, mid: int) -> None:
    catalog = load_catalog(conn)
    n = get_node(conn, row.id, mid, catalog)
    conn.execute(delete(T["fabrica_maquinas"]).where(T["fabrica_maquinas"].c.id == mid))  # as conexões dela saem em cascata
    log_event(conn, row.id, uid, f"Removeu: {catalog[n.type].name}")
    touch(conn, row.id)


def clear_machines(conn: Connection, row, uid: int) -> None:
    conn.execute(delete(T["fabrica_maquinas"]).where(T["fabrica_maquinas"].c.fabrica_id == row.id))
    log_event(conn, row.id, uid, "Fábrica limpa")
    touch(conn, row.id)


# ------------------------------------------------------------------------------------------------------------
# conexões
# ------------------------------------------------------------------------------------------------------------
def check_connection(conn: Connection, fid: int, src: int, dst: int) -> dict:
    catalog = load_catalog(conn)
    nodes, edges = load_graph(conn, fid, catalog)
    r = can_connect(src, dst, nodes, edges, catalog)
    return {"ok": r.ok, "level": r.level, "message": r.msg}


def add_connection(conn: Connection, row, uid: int, src: int, dst: int) -> tuple[int, dict]:
    catalog = load_catalog(conn)
    nodes, edges = load_graph(conn, row.id, catalog)
    r = can_connect(src, dst, nodes, edges, catalog)
    if not r.ok:
        raise HTTPException(422, {"message": r.msg, "level": r.level})
    cid = conn.execute(insert(T["conexoes"]).values(fabrica_id=row.id, origem_id=src, destino_id=dst)).inserted_primary_key[0]
    names = {n.id: catalog[n.type].name for n in nodes}
    log_event(conn, row.id, uid, f"Conectou {names[src]} → {names[dst]}")
    touch(conn, row.id)
    return cid, {"ok": True, "level": r.level, "message": r.msg}


def remove_connection(conn: Connection, row, uid: int, cid: int) -> None:
    done = conn.execute(delete(T["conexoes"]).where(T["conexoes"].c.id == cid, T["conexoes"].c.fabrica_id == row.id))
    if done.rowcount == 0:
        raise not_found("Conexão não encontrada nesta fábrica.")
    log_event(conn, row.id, uid, "Conexão removida")
    touch(conn, row.id)


# ------------------------------------------------------------------------------------------------------------
# desenho inteiro de uma vez (abrir/salvar a fábrica a partir do quadro)
# ------------------------------------------------------------------------------------------------------------
def replace_layout(conn: Connection, row, uid: int, machines: list[dict], connections: list[dict]) -> dict:
    """Troca todas as máquinas e conexões. Cada máquina traz um `ref` (nome que o cliente dá) usado pelas conexões.

    Se a máquina traz também o `id` de uma máquina que já existe nesta fábrica (e do mesmo tipo), ela é ATUALIZADA no lugar:
    as horas de uso, o desgaste e o histórico de manutenção ficam. As que não aparecem na lista são removidas."""
    catalog = load_catalog(conn)
    refs = [m["ref"] for m in machines]
    if len(set(refs)) != len(refs):
        raise invalid("Há dois `ref` iguais nas máquinas.")
    for m in machines:
        t = catalog.get(m["type"])
        if t is None:
            raise not_found(f"Tipo de máquina '{m['type']}' não existe no catálogo.")
        if m.get("value") is not None:
            _check_value(t, m["value"])
    # valida as ligações num grafo provisório antes de gravar qualquer coisa
    temp = [Node(m["ref"], m["type"], m.get("x", 0), m.get("y", 0), catalog[m["type"]].opt, 1, False) for m in machines]
    temp_edges: list[Edge] = []
    for i, c in enumerate(connections):
        for lado in ("from_ref", "to_ref"):
            if c[lado] not in refs:
                raise invalid(f"A conexão {i + 1} usa um `ref` que não existe: {c[lado]}.")
        r = can_connect(c["from_ref"], c["to_ref"], temp, temp_edges, catalog)
        if not r.ok:
            raise HTTPException(422, {"message": f"Conexão {i + 1}: {r.msg}", "level": r.level})
        temp_edges.append(Edge(i, c["from_ref"], c["to_ref"]))

    fm = T["fabrica_maquinas"]
    existentes = {r.id: r.maquina_id for r in conn.execute(select(fm.c.id, fm.c.maquina_id).where(fm.c.fabrica_id == row.id)).all()}
    for m in machines:
        if m.get("id") is not None and m["id"] not in existentes:
            raise not_found(f"A máquina {m['id']} não pertence a esta fábrica.")
    conn.execute(delete(T["conexoes"]).where(T["conexoes"].c.fabrica_id == row.id))     # as ligações são sempre refeitas
    mantidas = {m["id"] for m in machines if m.get("id") is not None and existentes[m["id"]] == catalog[m["type"]].db_id}
    for mid in set(existentes) - mantidas:
        conn.execute(delete(fm).where(fm.c.id == mid))
    ids: dict[str, int] = {}
    for m in machines:
        t = catalog[m["type"]]
        if m.get("id") in mantidas:
            valores = {"pos_x": max(0, int(m.get("x", 0))), "pos_y": max(0, int(m.get("y", 0))), "unidades_paralelo": m.get("qty", 1), "desligada": m.get("off", False)}
            if m.get("value") is not None:
                valores["ritmo"] = m["value"]
            conn.execute(update(fm).where(fm.c.id == m["id"]).values(**valores))
            ids[m["ref"]] = m["id"]
        else:
            ids[m["ref"]] = _insert_machine(conn, row.id, t, m.get("x", 0), m.get("y", 0), m.get("value"), m.get("qty", 1), m.get("off", False))
    for c in connections:
        conn.execute(insert(T["conexoes"]).values(fabrica_id=row.id, origem_id=ids[c["from_ref"]], destino_id=ids[c["to_ref"]]))
    log_event(conn, row.id, uid, f"Fábrica salva: {len(machines)} máquina(s) e {len(connections)} conexão(ões)", "ok")
    touch(conn, row.id)
    return {"machines": ids}
