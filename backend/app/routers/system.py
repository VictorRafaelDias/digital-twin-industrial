"""Saúde do servidor e resumo do que o back-end oferece."""
from __future__ import annotations

from fastapi import APIRouter, Request
from sqlalchemy import func, select

from ..db import ping
from ..schema import MODULOS, T

router = APIRouter(tags=["Sistema"])


@router.get("/", summary="Resumo e links úteis", include_in_schema=False)
def root():
    return {"name": "Digital Twin Industrial: API", "docs": "/docs", "health": "/health"}


@router.get("/health", summary="O servidor e o banco estão de pé?")
def health(request: Request):
    engine = request.app.state.engine
    ok = ping(engine)
    with engine.connect() as conn:
        counts = {nome: conn.execute(select(func.count()).select_from(T[nome])).scalar_one() for modulo in MODULOS.values() for nome in modulo}
    return {"status": "ok" if ok else "erro", "database": engine.dialect.name, "tables": len(counts), "rows": sum(counts.values()), "rows_by_table": counts}
