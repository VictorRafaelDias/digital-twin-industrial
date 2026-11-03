"""Catálogo de máquinas, manuais, fontes, glossário e efeitos da temperatura: consulta e ajustes das Configurações."""
from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import Connection, delete, func, insert, select, update
from sqlalchemy.exc import IntegrityError

from .catalog_repo import load_catalog
from .engine.simulate import heat_factor
from .engine.water import FONTE_AGUA, beta_at, water_expansion_l
from .factories import invalid, not_found
from .schema import T
from .views import machine_type_dict

HEAT_LABEL = {"tank": "Tanque: o líquido dilata", "motor": "Motor: esquenta", "cold": "Frio: o compressor trabalha mais",
              "visc": "Xarope: fica grosso no frio", "none": "Sem efeito da temperatura"}
HEAT_RULE = {"tank": "perde cerca de 0,4% de capacidade por °C acima de 25 °C", "motor": "perde cerca de 0,5% de capacidade por °C acima de 30 °C",
             "cold": "perde cerca de 1,5% de capacidade por °C acima de 25 °C", "visc": "perde cerca de 0,5% de capacidade por °C abaixo de 15 °C",
             "none": "não muda com o ambiente"}


def _machine_row(conn: Connection, code: str):
    r = conn.execute(select(T["maquinas_catalogo"]).where(T["maquinas_catalogo"].c.codigo == code)).first()
    if r is None:
        raise not_found(f"Máquina '{code}' não existe no catálogo.")
    return r


def list_machines(conn: Connection, category: Optional[str] = None, flow: Optional[str] = None, q: Optional[str] = None,
                  include_inactive: bool = False) -> list[dict]:
    cat = load_catalog(conn, only_active=not include_inactive)
    act = {r.codigo: bool(r.ativa) for r in conn.execute(select(T["maquinas_catalogo"].c.codigo, T["maquinas_catalogo"].c.ativa)).all()}
    out = []
    for t in cat.values():
        if category and t.cat != category:
            continue
        if flow and t.flow != flow:
            continue
        if q and q.lower() not in f"{t.name} {t.desc} {t.code}".lower():
            continue
        out.append({**machine_type_dict(t, detail=False), "active": act.get(t.code, True),
                    "price": {"min": t.cost.min, "max": t.cost.max, "edited_by_user": t.cost.edited} if t.cost else None})
    return out


def get_machine(conn: Connection, code: str) -> dict:
    row = _machine_row(conn, code)
    t = load_catalog(conn)[code]
    mm, rm, fo = T["manuais_maquina"], T["modelos_reais"], T["fontes"]
    man = conn.execute(select(mm).where(mm.c.maquina_id == row.id)).first()
    models = conn.execute(select(rm, fo.c.titulo.label("fonte_titulo"), fo.c.url.label("fonte_url"), fo.c.confianca)
                          .join(fo, fo.c.id == rm.c.fonte_id).where(rm.c.maquina_id == row.id).order_by(rm.c.id)).all()
    return {
        **machine_type_dict(t), "active": bool(row.ativa),
        "manual": ({"what_it_does": man.o_que_faz, "how_the_pace_works": man.como_funciona_ritmo, "tips": man.dicas} if man else None),
        "real_models": [{"maker": m.fabricante, "model": m.modelo, "application": m.aplicacao,
                         "capacity_min": float(m.capacidade_min) if m.capacidade_min is not None else None,
                         "capacity_max": float(m.capacidade_max), "capacity_unit": m.unidade_capacidade, "note": m.observacao,
                         "source": {"title": m.fonte_titulo, "url": m.fonte_url, "confidence": m.confianca}} for m in models],
    }


def patch_limits(conn: Connection, code: str, patch: dict) -> dict:
    row = _machine_row(conn, code)
    v = {"valor_otimo": patch.get("optimal"), "valor_atencao": patch.get("warning"), "valor_falha": patch.get("failure")}
    novo = {k: (float(getattr(row, k)) if x is None else x) for k, x in v.items()}
    lo, hi = float(row.valor_min), float(row.valor_max)
    if not (lo <= novo["valor_otimo"] <= novo["valor_atencao"] <= novo["valor_falha"] <= hi):
        raise invalid(f"Os limites precisam seguir: mínimo ({lo:g}) ≤ ótimo ≤ atenção ≤ falha ≤ máximo ({hi:g}).",
                      min=lo, max=hi, optimal=novo["valor_otimo"], warning=novo["valor_atencao"], failure=novo["valor_falha"])
    if novo["valor_otimo"] <= 0:
        raise invalid("O ritmo ótimo precisa ser maior que zero.")
    conn.execute(update(T["maquinas_catalogo"]).where(T["maquinas_catalogo"].c.id == row.id).values(**novo))
    return get_machine(conn, code)


def patch_price(conn: Connection, code: str, pmin: float, pmax: float, note: Optional[str]) -> dict:
    """Guarda uma NOVA faixa de preço (o histórico fica no banco; vale a mais recente)."""
    row = _machine_row(conn, code)
    p = T["precos_maquina"]
    ultima = conn.execute(select(p).where(p.c.maquina_id == row.id).order_by(p.c.vigente_desde.desc(), p.c.id.desc())).first()
    conn.execute(insert(p).values(maquina_id=row.id, preco_min=pmin, preco_max=pmax, moeda="BRL",
                                  observacao=note if note is not None else (ultima.observacao if ultima else None), editado_pelo_usuario=True))
    return get_machine(conn, code)


def patch_machine(conn: Connection, code: str, patch: dict) -> dict:
    row = _machine_row(conn, code)
    values: dict = {}
    if patch.get("category") is not None:
        c = conn.execute(select(T["categorias"].c.id).where(T["categorias"].c.codigo == patch["category"])).first()
        if c is None:
            raise not_found(f"Categoria '{patch['category']}' não existe.")
        values["categoria_id"] = c.id
    if patch.get("active") is not None:
        values["ativa"] = patch["active"]
    if patch.get("name") is not None:
        values["nome"] = patch["name"].strip()
    if values:
        conn.execute(update(T["maquinas_catalogo"]).where(T["maquinas_catalogo"].c.id == row.id).values(**values))
    return get_machine(conn, code)


# --- categorias (os "tipos de máquina" das Configurações) ---------------------------------------------------
def _cat_dict(r, count: int) -> dict:
    return {"code": r.codigo, "name": r.nome, "description": r.descricao, "icon": r.icone, "active": bool(r.ativa), "order": r.ordem, "machine_count": count}


def list_categories(conn: Connection) -> list[dict]:
    c, m = T["categorias"], T["maquinas_catalogo"]
    qtd = dict(conn.execute(select(m.c.categoria_id, func.count()).group_by(m.c.categoria_id)).all())
    return [_cat_dict(r, qtd.get(r.id, 0)) for r in conn.execute(select(c).order_by(c.c.ordem, c.c.id)).all()]


def create_category(conn: Connection, code: str, name: str, description: str, icon: Optional[str]) -> dict:
    c = T["categorias"]
    if conn.execute(select(c.c.id).where(c.c.codigo == code)).first():
        raise HTTPException(409, {"message": f"Já existe uma categoria com o código '{code}'."})
    nxt = (conn.execute(select(func.max(c.c.ordem))).scalar() or 0) + 1
    conn.execute(insert(c).values(codigo=code, nome=name.strip(), descricao=description, icone=icon, ativa=True, ordem=nxt))
    return next(x for x in list_categories(conn) if x["code"] == code)


def patch_category(conn: Connection, code: str, patch: dict) -> dict:
    c = T["categorias"]
    row = conn.execute(select(c).where(c.c.codigo == code)).first()
    if row is None:
        raise not_found(f"Categoria '{code}' não existe.")
    values = {k: v for k, v in (("nome", patch.get("name")), ("descricao", patch.get("description")), ("ativa", patch.get("active"))) if v is not None}
    if values:
        conn.execute(update(c).where(c.c.id == row.id).values(**values))
    return next(x for x in list_categories(conn) if x["code"] == code)


def delete_category(conn: Connection, code: str) -> None:
    c = T["categorias"]
    row = conn.execute(select(c).where(c.c.codigo == code)).first()
    if row is None:
        raise not_found(f"Categoria '{code}' não existe.")
    try:
        with conn.begin_nested():
            conn.execute(delete(c).where(c.c.id == row.id))
    except IntegrityError:
        raise HTTPException(409, {"message": "Esta categoria tem máquinas no catálogo. Desative-a em vez de apagar."})


# --- consultas ---------------------------------------------------------------------------------------------
def list_stages(conn: Connection) -> list[dict]:
    e = T["etapas"]
    return [{"id": r.id, "name": r.nome, "zone": r.zona} for r in conn.execute(select(e).order_by(e.c.id)).all()]


def list_sources(conn: Connection, confidence: Optional[str] = None, knowledge_base: Optional[bool] = None) -> list[dict]:
    f = T["fontes"]
    q = select(f).order_by(f.c.id)
    if confidence:
        q = q.where(f.c.confianca == confidence)
    if knowledge_base is not None:
        q = q.where(f.c.na_base_conhecimento.is_(knowledge_base))
    return [{"id": r.id, "title": r.titulo, "url": r.url, "type": r.tipo, "confidence": r.confianca, "in_knowledge_base": bool(r.na_base_conhecimento)}
            for r in conn.execute(q).all()]


def list_real_models(conn: Connection, machine: Optional[str] = None) -> list[dict]:
    rm, mc, fo = T["modelos_reais"], T["maquinas_catalogo"], T["fontes"]
    q = (select(rm, mc.c.codigo, fo.c.titulo.label("ft"), fo.c.url.label("fu"), fo.c.confianca).join(mc, mc.c.id == rm.c.maquina_id)
         .join(fo, fo.c.id == rm.c.fonte_id).order_by(rm.c.id))
    if machine:
        q = q.where(mc.c.codigo == machine)
    return [{"machine": r.codigo, "maker": r.fabricante, "model": r.modelo, "application": r.aplicacao,
             "capacity_min": float(r.capacidade_min) if r.capacidade_min is not None else None, "capacity_max": float(r.capacidade_max),
             "capacity_unit": r.unidade_capacidade, "note": r.observacao,
             "source": {"title": r.ft, "url": r.fu, "confidence": r.confianca}} for r in conn.execute(q).all()]


def list_glossary(conn: Connection, q: Optional[str] = None, group: Optional[str] = None) -> list[dict]:
    g, p = T["glossario_termos"], T["glossario_palavras"]
    words: dict[int, list[str]] = {}
    for r in conn.execute(select(p).order_by(p.c.id)).all():
        words.setdefault(r.termo_id, []).append(r.palavra)
    out = []
    for r in conn.execute(select(g).order_by(g.c.id)).all():
        if group and r.grupo != group:
            continue
        if q and q.lower() not in f"{r.termo} {r.definicao}".lower() and not any(q.lower() in w.lower() for w in words.get(r.id, [])):
            continue
        out.append({"id": r.id, "group": r.grupo, "term": r.termo, "definition": r.definicao, "keywords": words.get(r.id, [])})
    return out


def ambient_effects(conn: Connection, temperature: float) -> dict:
    """Janela 'Efeitos' da temperatura: efeito em cada máquina, regras, dilatação da água e em que o modelo se baseia."""
    catalog = load_catalog(conn, only_active=True)
    return {
        "temperature": temperature,
        "machines": [{"type": t.code, "name": t.name, "sensitivity": t.heat, "label": HEAT_LABEL[t.heat],
                      "capacity_factor": heat_factor(t, temperature), "capacity_lost_pct": (1 - heat_factor(t, temperature)) * 100}
                     for t in catalog.values()],
        "rules": [{"sensitivity": k, "label": HEAT_LABEL[k], "rule": HEAT_RULE[k]} for k in HEAT_LABEL],
        "water": {"liters": 1000, "extra_liters_vs_20c": water_expansion_l(temperature), "beta_per_c": beta_at(temperature)},
        "basis": [
            {"confidence": "real", "text": "A dilatação da água vem de tabela de física (EngineeringToolbox).", "url": FONTE_AGUA},
            {"confidence": "hipotese", "text": "Quanto cada máquina perde por grau foi escolhido para o simulador mostrar o efeito. Não vem de ficha de fabricante. A validar com o professor de física.", "url": None},
        ],
    }
