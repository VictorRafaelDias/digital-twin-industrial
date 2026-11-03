"""Um banco da versão 1 (21 tabelas) é atualizado sozinho para a versão 2, sem perder nada."""
from __future__ import annotations

import sqlite3
import subprocess
from pathlib import Path

import pytest
from sqlalchemy import inspect, text

from app.config import Settings
from app.db import init_db, make_engine, migrate

RAIZ = Path(__file__).resolve().parents[2]


def banco_v1(destino: Path) -> Path:
    """Reconstrói um banco da versão 1 a partir dos SQL de antes da migração (guardados no git, no commit da entrega do Sprint 1)."""
    try:
        base = subprocess.run(["git", "-C", str(RAIZ), "show", "adddd41:banco-de-dados/digital_twin.db"], capture_output=True, check=True).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        pytest.skip("o commit da versão 1 do banco não está disponível neste clone")
    destino.write_bytes(base)
    return destino


def test_banco_antigo_ganha_as_colunas_novas_e_continua_funcionando(tmp_path):
    arquivo = banco_v1(tmp_path / "antigo.db")
    con = sqlite3.connect(arquivo)
    antes_linhas = {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for (t,) in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert len(antes_linhas) == 21 and "documentos_maquina" not in antes_linhas
    con.close()

    engine = make_engine(f"sqlite:///{arquivo.as_posix()}")
    init_db(engine, Settings())
    insp = inspect(engine)
    assert len(insp.get_table_names()) == 25
    cols = {c["name"] for c in insp.get_columns("maquinas_catalogo")}
    assert {"fabricante", "modelo", "ano_modelo", "versao", "grupo_codigo", "origem", "vida_util_h", "intervalo_manutencao_h"} <= cols
    assert {"horas_operacao", "horas_desgaste", "manutencao_em_h", "instalada_em"} <= {c["name"] for c in insp.get_columns("fabrica_maquinas")}
    with engine.connect() as c:
        for tabela, n in antes_linhas.items():                                           # nenhuma linha se perdeu
            assert c.execute(text(f"SELECT COUNT(*) FROM {tabela}")).scalar() == n, tabela
        # as máquinas antigas ficam com os valores padrão das colunas novas
        assert c.execute(text("SELECT DISTINCT versao, origem, vida_util_h FROM maquinas_catalogo")).all() == [(1, "embutida", 30000)]
        assert c.execute(text("SELECT DISTINCT horas_operacao, horas_desgaste FROM fabrica_maquinas")).all() == [(0, 0)]
        assert c.execute(text("SELECT COUNT(*) FROM fabrica_maquinas WHERE instalada_em IS NULL")).scalar() == 0
    assert migrate(engine) == []                                                         # rodar de novo não faz nada


def test_a_api_sobe_num_banco_antigo_e_funciona(tmp_path):
    import warnings
    warnings.filterwarnings("ignore")
    from fastapi.testclient import TestClient
    from app.main import create_app
    arquivo = banco_v1(tmp_path / "antigo2.db")
    with TestClient(create_app(f"sqlite:///{arquivo.as_posix()}")) as c:
        h = {"Authorization": "Bearer " + c.post("/auth/login", json={"username": "victor.dias", "password": "senha1234"}).json()["access_token"]}
        assert c.get("/health").json()["tables"] == 25
        fid = c.post("/factories", json={"name": "Num banco migrado", "template": "bebidas"}, headers=h).json()["id"]
        assert c.get(f"/factories/{fid}/simulate", headers=h).json()["production_per_hour"] == 11400
        r = c.post(f"/factories/{fid}/play", json={"speed": 60, "duration_min": 60}, headers=h).json()
        assert r["id"] and r["wear_added"] == []
        assert all(m["age_years"] == 0 and m["capacity_factor"] == 1 for m in c.get(f"/factories/{fid}/wear", headers=h).json()["machines"])
        assert c.get("/catalog/machines/enchedora").json()["life_hours"] == 30000
