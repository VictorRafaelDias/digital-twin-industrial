"""Configurações do back-end (tudo pode ser trocado por variável de ambiente)."""
from __future__ import annotations

import os
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]      # pasta backend/
REPO = RAIZ.parent                              # raiz do repositório (onde está banco-de-dados/)


def _env(nome: str, padrao: str) -> str:
    return os.getenv(nome, padrao)


class Settings:
    """Lidas a cada criação do app (os testes trocam as variáveis de ambiente)."""

    def __init__(self) -> None:
        # SQLite por padrão (abre sem instalar nada); PostgreSQL: postgresql+psycopg2://usuario:senha@host:5432/banco
        self.database_url = _env("DATABASE_URL", f"sqlite:///{(RAIZ / 'data' / 'digital_twin.db').as_posix()}")
        # o esquema das tabelas e os dados iniciais vêm da pasta do banco de dados (única fonte da verdade)
        self.modelo_path = Path(_env("DT_MODELO_PATH", str(REPO / "banco-de-dados" / "scripts" / "modelo.py")))
        self.sql_dir = Path(_env("DT_SQL_DIR", str(REPO / "banco-de-dados" / "sql")))
        self.seed_on_start = _env("DT_SEED", "1") == "1"
        # troque em produção: assina os tokens de login
        self.secret_key = _env("SECRET_KEY", "dev-troque-esta-chave-em-producao")
        self.token_minutes = int(_env("TOKEN_MINUTES", "480"))
        self.cors_origins = [o.strip() for o in _env("CORS_ORIGINS", "*").split(",") if o.strip()]
        # sem perfis (decisão do projeto): todo usuário logado pode ajustar o catálogo, como na tela Configurações
        # 1 = qualquer pessoa pode criar conta em /auth/register; 0 = só quem já está dentro cadastra gente nova (POST /users)
        self.allow_public_register = _env("ALLOW_PUBLIC_REGISTER", "1") == "1"
        self.allow_catalog_edit = _env("ALLOW_CATALOG_EDIT", "1") == "1"
