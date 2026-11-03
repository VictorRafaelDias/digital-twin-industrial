"""Usuários: listar, cadastrar (quem está dentro pode), ativar/desativar e cadastro público fechado."""
from __future__ import annotations

from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient


def _login(client, user, senha):
    return client.post("/auth/login", json={"username": user, "password": senha})


def test_lista_exige_login_e_mostra_quem_sou_eu(client, auth):
    assert client.get("/users").status_code == 401
    us = client.get("/users", headers=auth).json()
    eu = [u for u in us if u["is_me"]]
    assert len(eu) == 1 and eu[0]["username"] == "victor.dias" and eu[0]["active"] is True and eu[0]["factories"] >= 2
    assert "senha_hash" not in str(us) and "password" not in str(us)


def test_quem_esta_dentro_cadastra_e_o_novo_consegue_entrar(client, auth):
    r = client.post("/users", json={"username": "maria.souza", "display_name": "Maria", "password": "maria1234"}, headers=auth)
    assert r.status_code == 201 and r.json()["username"] == "maria.souza" and r.json()["factories"] == 0 and r.json()["last_login_at"] is None
    assert _login(client, "MARIA.souza", "maria1234").status_code == 200           # login não diferencia maiúsculas
    assert client.post("/users", json={"username": "Maria.Souza", "password": "outra123"}, headers=auth).status_code == 409
    assert client.post("/users", json={"username": "x", "password": "abc"}, headers=auth).status_code == 422
    assert client.post("/users", json={"username": "sem.login", "password": "abc123"}).status_code == 401


def test_desativar_bloqueia_o_login_e_reativar_libera(client, auth):
    novo = client.post("/users", json={"username": "visita", "password": "visita123"}, headers=auth).json()
    antes = _login(client, "visita", "visita123").json()["access_token"]
    assert client.patch(f"/users/{novo['id']}", json={"active": False}, headers=auth).json()["active"] is False
    assert _login(client, "visita", "visita123").status_code == 401
    assert client.get("/users", headers={"Authorization": "Bearer " + antes}).status_code == 401      # o token que ela já tinha também deixa de valer
    assert client.patch(f"/users/{novo['id']}", json={"active": True}, headers=auth).json()["active"] is True
    assert _login(client, "visita", "visita123").status_code == 200


def test_nao_deixa_desativar_a_si_mesmo_nem_o_ultimo_ativo(client, auth):
    eu = next(u for u in client.get("/users", headers=auth).json() if u["is_me"])
    assert client.patch(f"/users/{eu['id']}", json={"active": False}, headers=auth).status_code == 409
    assert client.patch("/users/999999", json={"active": False}, headers=auth).status_code == 404
    assert client.patch(f"/users/{2**40}", json={"active": False}, headers=auth).status_code == 422
    novo = client.post("/users", json={"username": "outra", "password": "outra123"}, headers=auth).json()
    tok = {"Authorization": "Bearer " + _login(client, "outra", "outra123").json()["access_token"]}
    client.patch(f"/users/{eu['id']}", json={"active": False}, headers=tok)           # a "outra" desativa o victor: permitido
    assert client.patch(f"/users/{novo['id']}", json={"active": False}, headers=tok).status_code == 409   # mas ela é a última ativa


def test_cadastro_publico_pode_ser_fechado(tmp_path):
    s = Settings()
    s.allow_public_register = False
    app = create_app(f"sqlite:///{(tmp_path / 'f.db').as_posix()}", s)
    with TestClient(app) as c:
        r = c.post("/auth/register", json={"username": "intruso", "password": "intruso123"})
        assert r.status_code == 403 and "Usuários" in r.json()["detail"]
        tok = {"Authorization": "Bearer " + _login(c, "victor.dias", "senha1234").json()["access_token"]}
        assert c.post("/users", json={"username": "convidado", "password": "convite123"}, headers=tok).status_code == 201
