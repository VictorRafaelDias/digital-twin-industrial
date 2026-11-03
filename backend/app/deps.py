"""Dependências das rotas: quem é o usuário logado e a fábrica que ele pode acessar."""
from __future__ import annotations

from typing import Annotated, Optional

from fastapi import Depends, HTTPException, Path, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import Connection, select

from .db import get_conn
from .factories import get_factory
from .schema import T
from .security import ler_token

bearer = HTTPBearer(auto_error=False, description="Token recebido em /auth/login")


def user_from_token(conn: Connection, token: Optional[str], settings):
    dados = ler_token(token, settings.secret_key) if token else None
    if not dados:
        return None
    u = conn.execute(select(T["usuarios"]).where(T["usuarios"].c.id == dados["sub"])).first()
    return u if u is not None and u.ativo else None


def current_user(request: Request, cred: Optional[HTTPAuthorizationCredentials] = Depends(bearer), conn: Connection = Depends(get_conn)):
    user = user_from_token(conn, cred.credentials if cred else None, request.app.state.settings)
    if user is None:
        raise HTTPException(401, "Entre com seu usuário e senha (POST /auth/login).", headers={"WWW-Authenticate": "Bearer"})
    return user


def owned_factory(fid: Annotated[int, Path(ge=1, le=2_147_483_647)], user=Depends(current_user), conn: Connection = Depends(get_conn)):
    return get_factory(conn, fid, user.id)


def catalog_editor(request: Request, user=Depends(current_user)):
    if not request.app.state.settings.allow_catalog_edit:
        raise HTTPException(403, "Neste servidor o catálogo é somente leitura.")
    return user
