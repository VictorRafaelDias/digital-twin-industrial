"""Conexão com o banco (SQLite ou PostgreSQL), criação das tabelas e dados iniciais."""
from __future__ import annotations

from pathlib import Path
from typing import Iterator

from fastapi import Request
from sqlalchemy import Connection, Engine, create_engine, event, func, inspect, select, text
from sqlalchemy.schema import CreateColumn

from .config import Settings
from .schema import T, metadata


def make_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        if ":memory:" not in url and url != "sqlite://":
            Path(url.replace("sqlite:///", "", 1)).parent.mkdir(parents=True, exist_ok=True)
        engine = create_engine(url, connect_args={"check_same_thread": False})

        @event.listens_for(engine, "connect")
        def _fk_on(dbapi_conn, _):  # o SQLite só respeita chaves estrangeiras se pedirmos a cada conexão
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

        return engine
    return create_engine(url, pool_pre_ping=True)


def _ler(sql_dir: Path, nome: str) -> str:
    return (sql_dir / nome).read_text(encoding="utf-8")


def migrate(engine: Engine) -> list[str]:
    """Migração que SÓ ACRESCENTA: coloca num banco antigo as colunas novas do modelo (as tabelas novas o create_all já cria).

    Nunca apaga nem muda uma coluna que já existe. Devolve o que foi acrescentado (para o log).
    No SQLite uma coluna nova não pode ter valor padrão calculado (como a hora atual): ela entra opcional e as linhas
    antigas recebem a hora de agora."""
    feitos: list[str] = []
    insp = inspect(engine)
    with engine.begin() as conn:
        for tabela in metadata.sorted_tables:
            if not insp.has_table(tabela.name):
                continue
            existentes = {c["name"] for c in insp.get_columns(tabela.name)}
            for col in tabela.columns:
                if col.name in existentes:
                    continue
                ddl = str(CreateColumn(col).compile(dialect=engine.dialect))
                calculado = col.server_default is not None and "CURRENT_TIMESTAMP" in str(col.server_default.arg).upper()
                if engine.dialect.name == "sqlite" and calculado:
                    ddl = f"{col.name} {col.type.compile(engine.dialect)}"
                conn.exec_driver_sql(f"ALTER TABLE {tabela.name} ADD COLUMN {ddl}")
                if engine.dialect.name == "sqlite" and calculado:
                    conn.exec_driver_sql(f"UPDATE {tabela.name} SET {col.name} = CURRENT_TIMESTAMP")
                feitos.append(f"{tabela.name}.{col.name}")
    return feitos


def init_db(engine: Engine, settings: Settings) -> None:
    """Cria as tabelas que faltam, acrescenta as colunas novas e, se o catálogo estiver vazio, carrega os dados iniciais e as views."""
    metadata.create_all(engine)
    migrate(engine)
    if not settings.seed_on_start:
        return
    with engine.connect() as conn:
        vazio = conn.execute(select(func.count()).select_from(T["maquinas_catalogo"])).scalar_one() == 0
    if not vazio:
        return
    dados = _ler(settings.sql_dir, "02_dados_iniciais.sql")
    views = _ler(settings.sql_dir, "03_views.sql")
    if engine.dialect.name == "sqlite":
        raw = engine.raw_connection()
        try:
            raw.executescript(dados)
            raw.executescript(views)
            raw.commit()
        finally:
            raw.close()
    else:
        # conexão direta do driver, sem parâmetros: os textos têm "%" (ex.: "20%") e o driver do PostgreSQL
        # trataria isso como parâmetro se passássemos pelo SQLAlchemy
        raw = engine.raw_connection()
        try:
            cur = raw.cursor()
            for script in (dados, _ler(settings.sql_dir, "02b_ajustar_sequencias_postgres.sql"), views):
                cur.execute(script)
            raw.commit()
        except Exception:
            raw.rollback()
            raise
        finally:
            raw.close()


def get_conn(request: Request) -> Iterator[Connection]:
    """Uma conexão por pedido, dentro de uma transação: se algo der erro, nada fica pela metade."""
    with request.app.state.engine.begin() as conn:
        yield conn


def ping(engine: Engine) -> bool:
    with engine.connect() as conn:
        return conn.execute(text("SELECT 1")).scalar_one() == 1
