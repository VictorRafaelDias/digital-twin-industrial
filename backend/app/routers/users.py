"""Usuários do servidor. Sem perfis (decisão do projeto): quem está dentro pode ver a lista, cadastrar gente nova e ativar/desativar contas."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy import Connection, func, insert, select, update

from ..db import get_conn
from ..deps import current_user
from ..schema import T
from ..schemas import RegisterIn, UserActiveIn
from ..security import hash_senha

router = APIRouter(prefix="/users", tags=["Usuários"])


def _row(u, fabricas: int, eu: int) -> dict:
    return {"id": u.id, "username": u.nome_usuario, "display_name": u.nome_exibicao, "active": bool(u.ativo), "created_at": u.criado_em,
            "last_login_at": u.ultimo_acesso_em, "factories": fabricas, "is_me": u.id == eu}


def _one(conn: Connection, uid: int, eu: int) -> dict:
    t = T["usuarios"]
    u = conn.execute(select(t).where(t.c.id == uid)).first()
    if u is None:
        raise HTTPException(404, "Usuário não encontrado.")
    n = conn.execute(select(func.count()).select_from(T["fabricas"]).where(T["fabricas"].c.usuario_id == uid)).scalar() or 0
    return _row(u, n, eu)


@router.get("", summary="Quem está cadastrado no servidor")
def list_users(user=Depends(current_user), conn: Connection = Depends(get_conn)):
    t, f = T["usuarios"], T["fabricas"]
    contagem = dict(conn.execute(select(f.c.usuario_id, func.count()).group_by(f.c.usuario_id)).all())
    return [_row(u, contagem.get(u.id, 0), user.id) for u in conn.execute(select(t).order_by(t.c.nome_exibicao, t.c.id)).all()]


@router.post("", status_code=201, summary="Cadastrar um usuário novo (quem está dentro pode)")
def create_user(body: RegisterIn, user=Depends(current_user), conn: Connection = Depends(get_conn)):
    t = T["usuarios"]
    if conn.execute(select(t.c.id).where(func.lower(t.c.nome_usuario) == body.username.lower())).first():
        raise HTTPException(409, {"message": "Esse nome de usuário já existe."})
    uid = conn.execute(insert(t).values(nome_usuario=body.username, nome_exibicao=(body.display_name or body.username).strip(),
                                        senha_hash=hash_senha(body.password), ativo=True)).inserted_primary_key[0]
    return _one(conn, uid, user.id)


@router.patch("/{uid}", summary="Ativar ou desativar uma conta")
def set_active(uid: Annotated[int, Path(ge=1, le=2_147_483_647)], body: UserActiveIn, user=Depends(current_user), conn: Connection = Depends(get_conn)):
    t = T["usuarios"]
    alvo = _one(conn, uid, user.id)
    if alvo["active"] == body.active:
        return alvo
    if not body.active:
        if uid == user.id:
            raise HTTPException(409, {"message": "Você não pode desativar a própria conta."})
        if (conn.execute(select(func.count()).select_from(t).where(t.c.ativo.is_(True))).scalar() or 0) <= 1:
            raise HTTPException(409, {"message": "Precisa sobrar pelo menos um usuário ativo."})
    conn.execute(update(t).where(t.c.id == uid).values(ativo=body.active))
    return _one(conn, uid, user.id)
