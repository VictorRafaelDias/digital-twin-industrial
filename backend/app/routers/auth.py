"""Login simples (usuário e senha, sem perfis: decisão do projeto). A senha nunca é guardada em texto (hash PBKDF2)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import Connection, func, insert, select, update

from ..db import get_conn
from ..deps import current_user
from ..schema import T
from ..schemas import LoginIn, ProfileIn, RegisterIn
from ..security import confere_senha, criar_token, hash_senha

router = APIRouter(prefix="/auth", tags=["Acesso (login)"])


def _user(u) -> dict:
    return {"id": u.id, "username": u.nome_usuario, "display_name": u.nome_exibicao, "created_at": u.criado_em, "last_login_at": u.ultimo_acesso_em}


def _token(request: Request, u) -> dict:
    s = request.app.state.settings
    return {"access_token": criar_token(u.id, u.nome_usuario, s.secret_key, s.token_minutes), "token_type": "bearer",
            "expires_in_minutes": s.token_minutes, "user": _user(u)}


@router.post("/register", status_code=201, summary="Criar uma conta")
def register(body: RegisterIn, request: Request, conn: Connection = Depends(get_conn)):
    if not request.app.state.settings.allow_public_register:
        raise HTTPException(403, "Neste servidor o cadastro público está fechado: peça a alguém que já está dentro para cadastrar você (Configurações > Usuários).")
    t = T["usuarios"]
    if conn.execute(select(t.c.id).where(func.lower(t.c.nome_usuario) == body.username.lower())).first():
        raise HTTPException(409, {"message": "Esse nome de usuário já existe."})
    uid = conn.execute(insert(t).values(nome_usuario=body.username, nome_exibicao=body.display_name or body.username,
                                        senha_hash=hash_senha(body.password), ativo=True)).inserted_primary_key[0]
    return _token(request, conn.execute(select(t).where(t.c.id == uid)).one())


@router.post("/login", summary="Entrar (devolve o token)")
def login(body: LoginIn, request: Request, conn: Connection = Depends(get_conn)):
    t = T["usuarios"]
    u = conn.execute(select(t).where(func.lower(t.c.nome_usuario) == body.username.lower())).first()
    if u is None or not u.ativo or not confere_senha(body.password, u.senha_hash):
        raise HTTPException(401, "Usuário ou senha incorretos.")
    conn.execute(update(t).where(t.c.id == u.id).values(ultimo_acesso_em=func.current_timestamp()))
    return _token(request, conn.execute(select(t).where(t.c.id == u.id)).one())


@router.get("/me", summary="Quem sou eu")
def me(user=Depends(current_user)):
    return _user(user)


@router.patch("/me", summary="Mudar o nome mostrado ou a senha")
def update_me(body: ProfileIn, user=Depends(current_user), conn: Connection = Depends(get_conn)):
    t = T["usuarios"]
    values: dict = {}
    if body.display_name:
        values["nome_exibicao"] = body.display_name.strip()
    if body.new_password:
        if not body.current_password or not confere_senha(body.current_password, user.senha_hash):
            raise HTTPException(403, "Para trocar a senha, informe a senha atual corretamente.")
        values["senha_hash"] = hash_senha(body.new_password)
    if values:
        conn.execute(update(t).where(t.c.id == user.id).values(**values))
    return _user(conn.execute(select(t).where(t.c.id == user.id)).one())
