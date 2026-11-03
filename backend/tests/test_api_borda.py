"""Casos de borda: entradas absurdas devem dar resposta clara (nunca erro 500) e nada pode ficar pela metade."""
from __future__ import annotations

import threading

import pytest

from tests.conftest import by_type

JSON = {"Content-Type": "application/json"}


def sem_500(r):
    assert r.status_code < 500, r.text
    return r


@pytest.mark.parametrize("corpo", ['{"name":"x","tariff":Infinity}', '{"name":"x","tariff":NaN}', '{"name":"x","tariff":-Infinity}', '{"name":"x","ambient":NaN}'])
def test_nan_e_infinity_sao_recusados_com_422_legivel(client, auth, corpo):
    r = client.post("/factories", content=corpo, headers={**auth, **JSON})
    assert r.status_code == 422
    erro = r.json()["detail"][0]
    assert set(erro) == {"loc", "msg", "type"} and erro["loc"][0] == "body"          # sem devolver o valor recusado


def test_ritmo_nan_e_infinity(client, auth, factory):
    m = by_type(factory, "enchedora")
    for v in ("NaN", "Infinity", "-Infinity"):
        r = client.patch(f"/factories/{factory['id']}/machines/{m['id']}", content='{"value":' + v + "}", headers={**auth, **JSON})
        assert r.status_code == 422, v
    r = client.put(f"/factories/{factory['id']}/layout", content='{"machines":[{"ref":"a","type":"enchedora","value":NaN}]}', headers={**auth, **JSON})
    assert r.status_code == 422


@pytest.mark.parametrize("caminho", ["/factories/99999999999999999999", "/factories/2147483648", "/factories/0", "/factories/-1", "/factories/abc"])
def test_ids_fora_do_intervalo(client, auth, caminho):
    r = client.get(caminho, headers=auth)
    assert r.status_code in (404, 422), r.text


def test_ids_enormes_nos_outros_lugares(client, auth, factory):
    fid, big = factory["id"], 2**63
    assert client.get(f"/factories/{fid}/plans/{big}", headers=auth).status_code == 422
    assert client.delete(f"/factories/{fid}/machines/{big}", headers=auth).status_code == 422
    assert client.get(f"/factories/{fid}/scenarios/compare", params={"a": big, "b": 1}, headers=auth).status_code == 422
    assert client.get(f"/factories/{fid}/connections/check", params={"from_id": big, "to_id": 1}, headers=auth).status_code == 422
    assert client.post(f"/factories/{fid}/connections", json={"from_id": big, "to_id": 1}, headers=auth).status_code == 422
    assert client.post(f"/factories/{fid}/apply-changes", json={"changes": [{"machine_id": big, "value": 1, "units_in_parallel": 1}]}, headers=auth).status_code == 422
    assert client.get(f"/catalog/imports/{big}", headers=auth).status_code == 422
    assert client.get(f"/factories/{fid}/simulations/{big}", headers=auth).status_code == 422


def test_posicoes_e_valores_com_teto(client, auth, factory):
    fid, m = factory["id"], by_type(factory, "enchedora")
    assert client.patch(f"/factories/{fid}/machines/{m['id']}", json={"x": 2**40}, headers=auth).status_code == 422
    assert client.patch(f"/factories/{fid}/machines/{m['id']}", json={"x": 100000, "y": 0}, headers=auth).status_code == 200
    assert client.post("/factories", json={"name": "caro", "tariff": 1e30}, headers=auth).status_code == 422
    assert client.put("/catalog/machines/esteira/price", json={"min": 1, "max": 1e30}, headers=auth).status_code == 422
    assert client.patch(f"/factories/{fid}/machines/{m['id']}", json={"value": 1e30}, headers=auth).status_code == 422


def test_entradas_estranhas_nunca_dao_500(client, auth, factory):
    fid = factory["id"]
    estranhos = [
        client.post("/auth/login", json={"username": "victor.dias", "password": "x" * 100000}),
        client.post("/auth/login", json={"username": "' OR 1=1 --", "password": "x"}),
        client.get("/factories", headers={"Authorization": "Bearer a.b.c"}),
        client.get("/factories", headers={"Authorization": "Basic abc"}),
        client.post("/factories", content="isto nao e json", headers={**auth, **JSON}),
        client.post("/factories", json={"name": "<script>alert(1)</script>"}, headers=auth),
        client.post("/factories", json={"name": "Fábrica 🏭 日本"}, headers=auth),
        client.get("/catalog/machines", params={"q": "%_';--"}),
        client.get("/glossary", params={"q": "%"}),
        client.put(f"/factories/{fid}/layout", json={}, headers=auth),
        client.put(f"/factories/{fid}/layout", json={"machines": [{"ref": "", "type": "esteira"}]}, headers=auth),
        client.post(f"/factories/{fid}/play", json={"speed": "rapido"}, headers=auth),
        client.post("/catalog/imports", headers=auth),
        client.post("/catalog/imports", files={"file": ("a.pdf", b"\x00\x01\x02\xff" * 500, "application/pdf")}, headers=auth),
        client.post("/catalog/imports", files={"file": ("../../x.txt", ("Tetra Pak Foo Bar capacity up to 12,000 bph electricity 5 kW " * 10).encode(), "text/plain")}, headers=auth),
        client.post("/catalog/imports", files={"file": ("n.txt", b"Capacity 5,000 bph\x00\x00 Tetra Pak Gama Delta " * 10, "text/plain")}, headers=auth),
    ]
    for r in estranhos:
        sem_500(r)
    # o nome com <script> fica guardado como texto, sem executar nada
    nomes = [f["name"] for f in client.get("/factories", headers=auth).json()]
    assert "<script>alert(1)</script>" in nomes and "Fábrica 🏭 日本" in nomes


def test_fabrica_grande_60_maquinas_e_layout_de_200(client, auth):
    fid = client.post("/factories", json={"name": "Grande"}, headers=auth).json()["id"]
    tipos = ["tanque_agua", "tanque_xarope", "misturador", "pasteurizador", "carbonatador", "enchedora", "esteira", "rotuladora"]
    r = client.put(f"/factories/{fid}/layout", json={"machines": [{"ref": f"m{i}", "type": tipos[i % 8], "x": i, "y": i} for i in range(200)]}, headers=auth)
    assert r.status_code == 200 and len(r.json()["machines"]) == 200
    assert client.get(f"/factories/{fid}/simulate", headers=auth).status_code == 200
    assert client.post(f"/factories/{fid}/plans", json={"type": "pct", "value": 50, "save": False}, headers=auth).status_code == 201
    assert client.post(f"/factories/{fid}/play", json={"speed": 60, "duration_min": 480}, headers=auth).status_code == 200
    assert client.get(f"/factories/{fid}/dashboard", headers=auth).status_code == 200


def test_desgaste_extremo_nao_quebra_nada(client, auth, factory):
    fid, rot = factory["id"], by_type(factory, "rotuladora")
    for _ in range(6):
        assert client.post(f"/factories/{fid}/machines/{rot['id']}/age", json={"hours": 200000}, headers=auth).status_code == 200
    w = next(m for m in client.get(f"/factories/{fid}/wear", headers=auth).json()["machines"] if m["type"] == "rotuladora")
    assert w["capacity_factor"] == 0.75 and w["status"] == "fim_de_vida" and w["life_left_hours"] == 0   # a perda para em 25%
    s = client.get(f"/factories/{fid}/simulate", headers=auth).json()
    assert s["production_per_hour"] == pytest.approx(11400 * 0.75) and 0.1 <= s["max_risk"] <= 1
    r = client.post(f"/factories/{fid}/machines/{rot['id']}/maintenance", json={"kind": "corretiva"}, headers=auth)
    assert r.status_code == 201 and r.json()["wear_hours"] == pytest.approx(240000, rel=1e-3)
    assert client.post(f"/factories/{fid}/machines/{rot['id']}/age", json={"hours": 0.05}, headers=auth).status_code == 200


def test_varios_usuarios_ao_mesmo_tempo_nao_se_atrapalham(client, auth):
    fid = client.post("/factories", json={"name": "Concorrencia", "template": "bebidas"}, headers=auth).json()["id"]
    erros: list = []

    def trabalhador(k: int) -> None:
        try:
            for j in range(4):
                for r in (client.post(f"/factories/{fid}/play", json={"speed": 60, "duration_min": 30}, headers=auth),
                          client.get(f"/factories/{fid}/dashboard", headers=auth),
                          client.patch(f"/factories/{fid}", json={"ambient": 20 + (k + j) % 10}, headers=auth)):
                    if r.status_code >= 400:
                        erros.append((k, j, r.status_code, r.text[:100]))
        except Exception as e:  # noqa: BLE001
            erros.append((k, repr(e)))

    ths = [threading.Thread(target=trabalhador, args=(k,)) for k in range(5)]
    [t.start() for t in ths]
    [t.join() for t in ths]
    assert erros == []
    rot = next(m for m in client.get(f"/factories/{fid}/wear", headers=auth).json()["machines"] if m["type"] == "rotuladora")
    assert rot["operating_hours"] == pytest.approx(0.5 * 5 * 4)           # 20 plays de 30 min: nenhum se perdeu


def test_ficha_enorme_e_caracteres_estranhos(client, auth):
    grande = ("Tetra Pak Alpha Beta capacity up to 8,000 bph pasteurizer 6 kW\n" * 30000).encode()   # ~1,8 MB de texto
    r = client.post("/catalog/imports", files={"file": ("grande.txt", grande, "text/plain")}, headers=auth)
    assert r.status_code == 201 and r.json()["draft"]["capacity_nominal_per_hour"] == 8000 and len(r.json()["text_preview"]) <= 1200
    latin = "Krones Zeta Mini filler capacity up to 9,000 bph electricity 4 kW ação ção é ".encode("latin-1") * 5
    r2 = client.post("/catalog/imports", files={"file": ("latin.txt", latin, "text/plain")}, headers=auth)
    assert r2.status_code == 201 and r2.json()["draft"]["capacity_nominal_per_hour"] == 9000
