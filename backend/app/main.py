"""API do Digital Twin Industrial (FastAPI).

Subir:   uvicorn app.main:app --reload        (documentação interativa em http://127.0.0.1:8000/docs)
"""
from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from .config import Settings
from .db import init_db, make_engine, ping
from .routers import auth, catalog, factories, system, users

DESCRICAO = """
Back-end do **Digital Twin Industrial**: simulador de fábrica de bebidas no estilo Cisco Packet Tracer.

* **Banco de dados:** as 21 tabelas da pasta `banco-de-dados/` (SQLite por padrão; PostgreSQL com `DATABASE_URL`).
* **Motor de simulação:** o mesmo do front-end (capacidade, risco, gargalo, efeito cascata, fila e energia), portado para Python
  e conferido contra o código do front por testes automáticos.
* **Como testar aqui:** clique em **Authorize**, entre com `victor.dias` / `senha1234` (usuário de demonstração) e use as rotas.
  Ou crie sua conta em `POST /auth/register`.

Os números das máquinas são **hipóteses didáticas** ou vêm de fontes com link (veja `/catalog/sources`). Preços são **estimativas**.
"""

TAGS = [
    {"name": "Sistema", "description": "Saúde do servidor e informações."},
    {"name": "Acesso (login)", "description": "Criar conta, entrar e ver o perfil."},
    {"name": "Catálogo e conhecimento", "description": "Máquinas, manuais, fontes, glossário e efeitos da temperatura."},
    {"name": "Dados reais (ficha técnica)", "description": "Anexar a ficha técnica de uma máquina: o sistema lê (por regras, sem IA e sem custo), você confere, e ele evita máquinas duplicadas."},
    {"name": "Fábricas", "description": "Montar a fábrica, simular, melhorar, cenários, Play ao vivo, registro e conversa."},
]


def create_app(database_url: Optional[str] = None, settings: Optional[Settings] = None) -> FastAPI:
    settings = settings or Settings()
    if database_url:
        settings.database_url = database_url
    engine = make_engine(settings.database_url)
    init_db(engine, settings)

    app = FastAPI(title="Digital Twin Industrial: API", version="1.0.0", description=DESCRICAO, openapi_tags=TAGS)
    app.state.engine = engine
    app.state.settings = settings
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"])

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        # só o local e a mensagem: devolver o valor recusado (ex.: NaN ou Infinity) quebraria a resposta JSON
        erros = [{"loc": list(e.get("loc", [])), "msg": str(e.get("msg", "valor inválido")), "type": e.get("type", "")} for e in exc.errors()]
        return JSONResponse(status_code=422, content={"detail": erros})

    @app.exception_handler(IntegrityError)
    async def integrity_error(_: Request, exc: IntegrityError):
        # última barreira: o próprio banco recusou (chave, único ou regra entre colunas)
        return JSONResponse(status_code=409, content={"detail": {"message": "O banco de dados recusou essa operação (dado repetido, ligação inválida ou fora da regra).",
                                                                  "technical": str(exc.orig)[:300]}})

    for r in (system.router, auth.router, users.router, catalog.router, factories.router):
        app.include_router(r)
    return app


app = create_app()
