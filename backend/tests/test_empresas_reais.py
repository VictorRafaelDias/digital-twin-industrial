"""Exemplos de empresas reais na API: os mesmos mapas do front-end (conferidos contra a referência gerada pelo código do front)
e cada um produz a velocidade de linha publicada."""
from __future__ import annotations

import pytest

from app.factories import TEMPLATES
from tests.helpers import load_cases

DATA = load_cases()
REAIS = DATA["realRated"]
GARGALO = DATA["realBottleneck"]


def test_os_exemplos_da_api_sao_iguais_aos_do_front():
    assert set(TEMPLATES) == set(DATA["templates"])
    for k, v in DATA["templates"].items():
        assert TEMPLATES[k]["name"] == v["name"], k
        assert [list(n) for n in TEMPLATES[k]["nodes"]] == v["nodes"], k


@pytest.mark.parametrize("chave", list(REAIS))
def test_empresa_real_produz_a_velocidade_publicada(client, auth, chave):
    f = client.post("/factories", json={"name": "Real " + chave, "template": chave}, headers=auth)
    assert f.status_code == 201, f.text
    fab = f.json()
    assert fab["example"] is None                                         # só "bebidas" e "suco" ficam registrados como exemplo de origem
    assert len(fab["connections"]) == len(fab["machines"]) - 1
    assert all(1 <= m["units_in_parallel"] <= 6 for m in fab["machines"])
    s = client.get(f"/factories/{fab['id']}/simulate", headers=auth).json()
    assert abs(s["production_per_hour"] - REAIS[chave]) / REAIS[chave] < 0.01
    assert s["bottleneck"]["type"] == GARGALO[chave] and s["max_risk"] == pytest.approx(0.02)
    ench = next(m for m in fab["machines"] if m["type"] == "enchedora")
    minimo = 2 if GARGALO[chave] == "enchedora" else 1                # quando a enchedora limita a linha, ela tem 2 ou mais unidades
    assert ench["units_in_parallel"] >= minimo and ench["value"] <= 200   # unidades e ritmo vêm do exemplo


def test_exemplos_antigos_continuam_iguais(client, auth):
    b = client.post("/factories", json={"name": "B", "template": "bebidas"}, headers=auth).json()
    assert all(m["units_in_parallel"] == 1 for m in b["machines"]) and b["example"] == "bebidas"
    assert client.get(f"/factories/{b['id']}/simulate", headers=auth).json()["production_per_hour"] == 11400
