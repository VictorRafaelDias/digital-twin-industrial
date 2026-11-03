"""O total produzido num Play não pode depender da velocidade (antes, 30 min em x60 fechava em 0 garrafas)."""
from __future__ import annotations

import pytest

PLAY = "/factories/{fid}/play"


def _produzido(client, auth, fid, speed, minutos):
    r = client.post(PLAY.format(fid=fid), json={"speed": speed, "duration_min": minutos, "save": False}, headers=auth)
    assert r.status_code == 200, r.text
    return r.json()["produced"]


def test_30_minutos_nao_depende_da_velocidade(client, auth, factory):
    lento = _produzido(client, auth, factory["id"], 1, 30)
    medio = _produzido(client, auth, factory["id"], 5, 30)
    rapido = _produzido(client, auth, factory["id"], 60, 30)
    assert 1500 < lento < 1900                         # o produto chega à última máquina no minuto 21: sobram 9 min a 11.400/h
    assert rapido == pytest.approx(lento, rel=0.01)
    assert medio == pytest.approx(lento, rel=0.01)


def test_8_horas_rapido_bate_com_a_conta(client, auth, factory):
    sim = client.get(f"/factories/{factory['id']}/simulate", headers=auth).json()
    esperado = sim["production_per_hour"] * (480 - 21) / 60
    assert _produzido(client, auth, factory["id"], 60, 480) == pytest.approx(esperado, rel=0.02)


def test_quadros_do_websocket_terminam_no_mesmo_total(client, auth, factory):
    token = auth["Authorization"].split()[1]
    with client.websocket_connect(f"/factories/{factory['id']}/play/ws?token={token}&speed=60&duration_min=30&realtime=false&save=false") as ws:
        msgs = []
        while True:
            m = ws.receive_json()
            msgs.append(m)
            if m["type"] in ("result", "error"):
                break
    ticks = [m for m in msgs if m["type"] == "tick"]
    assert [t["t"] for t in ticks] == [15, 30]
    assert ticks[0]["produced"] == 0 and ticks[1]["produced"] > 1000                 # antes dava 0 também no segundo quadro
    assert msgs[-1]["type"] == "result" and msgs[-1]["produced"] == pytest.approx(ticks[-1]["produced"])
