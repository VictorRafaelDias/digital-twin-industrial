"""Leitura do catálogo de máquinas no banco e conversão para o tipo usado pelo motor de simulação."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import Connection, select

from .engine.types import Catalog, Cost, MachineType, Ref
from .schema import T

HEAT = {"tanque": "tank", "motor": "motor", "frio": "cold", "viscosidade": "visc", "nenhuma": "none"}
HEAT_BACK = {v: k for k, v in HEAT.items()}


def f(x) -> Optional[float]:
    return None if x is None else float(x)


def _refs(linhas) -> tuple[Ref, ...]:
    """Só fontes com link (real ou estimado) ou fichas técnicas anexadas. Hipótese não é fonte: ela aparece como nota em `basis`."""
    return tuple(Ref(r.titulo, r.url or "", r.confianca) for r in linhas
                 if (r.url or r.tipo == "ficha técnica anexada") and r.confianca in ("real", "estimado"))


def load_catalog(conn: Connection, only_active: bool = False) -> Catalog:
    """Todas as máquinas do catálogo, com categoria, etapa, preço mais recente e fontes."""
    m, c, e = T["maquinas_catalogo"], T["categorias"], T["etapas"]
    q = (select(m, c.c.codigo.label("cat_codigo"), e.c.nome.label("etapa_nome"))
         .join(c, c.c.id == m.c.categoria_id).join(e, e.c.id == m.c.etapa_id).order_by(m.c.id))
    if only_active:
        q = q.where(m.c.ativa.is_(True))
    linhas = conn.execute(q).all()

    # preço mais recente de cada máquina
    precos: dict[int, object] = {}
    p = T["precos_maquina"]
    for r in conn.execute(select(p).order_by(p.c.vigente_desde, p.c.id)).all():
        precos[r.maquina_id] = r

    fontes: dict[tuple[int, str], list] = {}
    mf, fo = T["maquina_fontes"], T["fontes"]
    for r in conn.execute(select(mf.c.maquina_id, mf.c.finalidade, fo.c.titulo, fo.c.url, fo.c.confianca, fo.c.tipo)
                          .join(fo, fo.c.id == mf.c.fonte_id).order_by(fo.c.id)).all():
        fontes.setdefault((r.maquina_id, r.finalidade), []).append(r)

    cat: Catalog = {}
    for r in linhas:
        pr = precos.get(r.id)
        cost = Cost(float(pr.preco_min), float(pr.preco_max), pr.observacao or "", _refs(fontes.get((r.id, "preco"), [])),
                    bool(pr.editado_pelo_usuario)) if pr else None
        cat[r.codigo] = MachineType(
            code=r.codigo, name=r.nome, stage=r.etapa_nome, cat=r.cat_codigo, icon=r.icone or "factory",
            param=r.parametro, unit=r.unidade, min=float(r.valor_min), max=float(r.valor_max), opt=float(r.valor_otimo),
            warn=float(r.valor_atencao), crit=float(r.valor_falha), cap=float(r.capacidade_otima),
            sb=float(r.consumo_parado_kw), vr=float(r.consumo_variavel_kw), desc=r.descricao, flow=r.fluxo,
            rank=r.ordem_processo, heat=HEAT.get(r.sensibilidade_termica, "none"), multi_in=bool(r.aceita_varias_entradas),
            end=bool(r.etapa_final), basis=r.base_dos_numeros, risk=r.risco_fisico, cost=cost,
            refs=_refs(fontes.get((r.id, "numeros"), [])), db_id=r.id,
            life_h=float(r.vida_util_h), maintenance_interval_h=float(r.intervalo_manutencao_h), maker=r.fabricante, model=r.modelo,
            year=r.ano_modelo, version=int(r.versao), group=r.grupo_codigo or r.codigo, origin=r.origem,
        )
    return cat
