"""Ajudantes compartilhados dos testes da API (cada teste usa um banco SQLite novo e limpo)."""
from __future__ import annotations

import os
import warnings

import pytest

warnings.filterwarnings("ignore", message=".*httpx.*")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402


@pytest.fixture()
def app(tmp_path):
    """Banco novo e limpo a cada teste. Por padrão SQLite; com DT_TEST_DATABASE_URL (um PostgreSQL de teste) roda os mesmos testes nele."""
    url = os.getenv("DT_TEST_DATABASE_URL")
    if url:
        from app.config import Settings
        from app.db import init_db, make_engine
        from app.schema import metadata
        from sqlalchemy import text
        eng = make_engine(url)
        with eng.begin() as c:          # limpa tudo, inclusive as views (o PostgreSQL de teste é só para isto)
            c.execute(text("DROP SCHEMA public CASCADE"))
            c.execute(text("CREATE SCHEMA public"))
        eng.dispose()
        return create_app(url)
    return create_app(f"sqlite:///{(tmp_path / 'teste.db').as_posix()}")


@pytest.fixture()
def client(app):
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def auth(client):
    """Cabeçalho de login do usuário de demonstração (victor.dias, que já tem 2 fábricas de exemplo)."""
    r = client.post("/auth/login", json={"username": "victor.dias", "password": "senha1234"})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["access_token"]}


@pytest.fixture()
def other_auth(client):
    r = client.post("/auth/register", json={"username": "outra.pessoa", "password": "segredo123"})
    assert r.status_code == 201, r.text
    return {"Authorization": "Bearer " + r.json()["access_token"]}


@pytest.fixture()
def factory(client, auth):
    """Uma fábrica nova do exemplo 'bebidas' (8 máquinas em cadeia)."""
    r = client.post("/factories", json={"name": "Teste", "template": "bebidas"}, headers=auth)
    assert r.status_code == 201, r.text
    return r.json()


def by_type(factory_json: dict, code: str) -> dict:
    return next(m for m in factory_json["machines"] if m["type"] == code)
