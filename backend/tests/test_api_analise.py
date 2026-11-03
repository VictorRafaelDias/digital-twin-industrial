"""Simulação, gargalo, planos de objetivo, cenários, Play (inclusive ao vivo), registro e conversa."""
from __future__ import annotations

import json

from tests.conftest import by_type


def sim(client, auth, fid):
    return client.get(f"/factories/{fid}/simulate", headers=auth).json()


def machine(s, code):
    return next(m for m in s["machines"] if m["type"] == code)


# ------------------------------------------------------------------------------------- simulação
def test_numero_de_referencia_do_exemplo_de_bebidas(client, auth, factory):
    """É o mesmo número do front-end: 11.400 garrafas/h, gargalo na rotuladora."""
    s = sim(client, auth, factory["id"])
    assert s["production_per_hour"] == 11400 and s["bottleneck"]["type"] == "rotuladora"
    assert abs(s["pct_of_best"] - 100) < 1e-9 and abs(s["energy_cost_per_hour"] - s["energy_kw"] * 0.85) < 1e-9
    assert all(m["state"] == "normal" for m in s["machines"]) and s["max_risk"] == 0.02
    rot = machine(s, "rotuladora")
    # chegam 12.000/h (enchedora) mas só passam 11.400/h: os 600 que sobram ficam na fila (Lavoisier: nada some)
    assert rot["capacity"] == 11400 and rot["inflow"] == 12000 and rot["output"] == 11400 and rot["queue"] == 600


def test_ritmo_acima_do_otimo_rende_mais_mas_arrisca(client, auth, factory):
    fid, rot = factory["id"], by_type(factory, "rotuladora")
    r = client.patch(f"/factories/{fid}/machines/{rot['id']}", json={"value": 225}, headers=auth).json()["simulation"]
    assert r["production_per_hour"] > 11400 and machine(r, "rotuladora")["state"] == "alerta" and r["max_risk"] > 0.02
    assert machine(r, "rotuladora")["explanation"].startswith("Acima do ótimo")


def test_falha_para_tudo_que_vem_depois_efeito_cascata(client, auth, factory):
    fid, ench = factory["id"], by_type(factory, "enchedora")
    r = client.patch(f"/factories/{fid}/machines/{ench['id']}", json={"value": 250}, headers=auth).json()["simulation"]
    assert machine(r, "enchedora")["state"] == "falha" and machine(r, "enchedora")["risk"] == 1
    assert r["production_per_hour"] == 0
    assert machine(r, "rotuladora")["affected_upstream"] and "O problema está antes dela" in machine(r, "rotuladora")["explanation"]
    # rastro vermelho nas conexões que saem da enchedora e vai enfraquecendo
    rastros = [c["trouble"] for c in r["connections"] if c["trouble"]]
    assert rastros and all(t["kind"] == "danger" for t in rastros) and max(t["level"] for t in rastros) == 1
    assert min(t["level"] for t in rastros) < 1


def test_desligar_unidades_em_paralelo_e_temperatura(client, auth, factory):
    fid, rot = factory["id"], by_type(factory, "rotuladora")
    client.patch(f"/factories/{fid}/machines/{rot['id']}", json={"units_in_parallel": 2}, headers=auth)
    assert sim(client, auth, fid)["production_per_hour"] == 12000      # agora a enchedora (12.000) é o gargalo
    assert sim(client, auth, fid)["bottleneck"]["type"] == "enchedora"
    base = sim(client, auth, fid)["production_per_hour"]
    client.patch(f"/factories/{fid}", json={"ambient": 40}, headers=auth)
    assert sim(client, auth, fid)["production_per_hour"] < base         # calor tira capacidade (hipótese didática)
    client.patch(f"/factories/{fid}", json={"ambient": 25}, headers=auth)
    pas = by_type(factory, "pasteurizador")
    client.patch(f"/factories/{fid}/machines/{pas['id']}", json={"off": True}, headers=auth)
    s = sim(client, auth, fid)
    assert s["production_per_hour"] == 0 and machine(s, "pasteurizador")["state"] == "desligada"
    assert "desligada" in machine(s, "pasteurizador")["explanation"]


# ------------------------------------------------------------------------------------- gargalo
def test_gargalo_explica_e_oferece_opcoes_com_custo(client, auth, factory):
    r = client.get(f"/factories/{factory['id']}/bottleneck", headers=auth).json()["report"]
    assert r["name"] == "Rotuladora" and r["production_per_hour"] == 11400 and r["why"]
    assert any("uma única unidade" in w for w in r["why"])
    mais_uma = next(o for o in r["options"] if "mais 1 máquina" in o["title"])
    assert mais_uma["cost"]["min"] > 0 and mais_uma["gain_pct"] > 0 and mais_uma["next_bottleneck"] == "Enchedora"
    assert r["has_cost"] is True
    # aplicar a opção
    aplicado = client.post(f"/factories/{factory['id']}/apply-changes", headers=auth,
                           json={"changes": [{"machine_id": mais_uma["change"]["id"], "value": mais_uma["change"]["value"],
                                              "units_in_parallel": mais_uma["change"]["qty"], "off": False}], "label": mais_uma["change"]["label"]})
    assert aplicado.status_code == 200 and sim(client, auth, factory["id"])["production_per_hour"] == 12000
    assert any(e["text"].startswith("Aplicou:") for e in client.get(f"/factories/{factory['id']}/events", headers=auth).json())


def test_gargalo_de_fabrica_vazia(client, auth):
    fid = client.post("/factories", json={"name": "Vazia"}, headers=auth).json()["id"]
    assert client.get(f"/factories/{fid}/bottleneck", headers=auth).json() == {"report": None}
    assert client.post(f"/factories/{fid}/what-if", json={}, headers=auth).json() == {"result": None}
    s = sim(client, auth, fid)
    assert s["production_per_hour"] == 0 and s["bottleneck"] is None and s["machines"] == []


def test_e_se_eu_colocar_mais_maquinas_recalcula_em_cascata(client, auth, factory):
    r = client.post(f"/factories/{factory['id']}/what-if", json={"extra_units": 2}, headers=auth).json()["result"]
    assert r["name"] == "Rotuladora" and r["before_per_hour"] == 11400 and r["extra_units"] == 2
    assert r["after_per_hour"] == 12000 and r["next_bottleneck"] == "Enchedora" and r["enough"] is False
    plano = r["cascade_plan"]
    assert plano and plano["steps"] and plano["investment"]["max"] > 0     # a enchedora vira o gargalo e o plano mostra o resto
    assert client.post(f"/factories/{factory['id']}/what-if", json={"extra_units": 9}, headers=auth).status_code == 422


def test_aplicar_mudancas_valida_o_ritmo(client, auth, factory):
    rot = by_type(factory, "rotuladora")
    ruim = {"changes": [{"machine_id": rot["id"], "value": 9999, "units_in_parallel": 1, "off": False}]}
    assert client.post(f"/factories/{factory['id']}/apply-changes", json=ruim, headers=auth).status_code == 422
    estranho = {"changes": [{"machine_id": 424242, "value": 190, "units_in_parallel": 1, "off": False}]}
    assert client.post(f"/factories/{factory['id']}/apply-changes", json=estranho, headers=auth).status_code == 404


# ------------------------------------------------------------------------------------- planos
def test_plano_de_mais_10_por_cento(client, auth, factory):
    fid = factory["id"]
    p = client.post(f"/factories/{fid}/plans", json={"type": "pct", "value": 10}, headers=auth)
    assert p.status_code == 201
    p = p.json()
    assert p["id"] and p["reached_goal"] is True and abs(p["target_per_hour"] - 12540) < 1e-6
    assert p["after"]["prod"] >= p["target_per_hour"] - 0.5 and p["before"]["prod"] == 11400
    assert p["steps"] and all(s["why"] and s["what"] for s in p["steps"]) and p["after"]["risk"] >= p["before"]["risk"]
    guardado = client.get(f"/factories/{fid}/plans/{p['id']}", headers=auth).json()
    assert guardado["applied"] is False and len(guardado["steps"]) == len(p["steps"])
    assert [s["what"] for s in guardado["steps"]] == [s["what"] for s in p["steps"]]      # o texto é refeito do banco
    assert guardado["investment"]["max"] == p["investment"]["max"]
    assert len(client.get(f"/factories/{fid}/plans", headers=auth).json()) == 1


def test_aplicar_plano_muda_a_fabrica_e_marca_aplicado(client, auth, factory):
    fid = factory["id"]
    p = client.post(f"/factories/{fid}/plans", json={"type": "pct", "value": 10}, headers=auth).json()
    r = client.post(f"/factories/{fid}/plans/{p['id']}/apply", headers=auth)
    assert r.status_code == 200 and r.json()["plan"]["applied"] is True
    assert abs(sim(client, auth, fid)["production_per_hour"] - p["after"]["prod"]) < 1e-6
    assert client.post(f"/factories/{fid}/plans/{p['id']}/apply", headers=auth).status_code == 409   # só uma vez
    assert any("Aplicou o plano" in e["text"] for e in client.get(f"/factories/{fid}/events", headers=auth).json())


def test_plano_sem_salvar_e_outros_objetivos(client, auth, factory):
    fid = factory["id"]
    nao = client.post(f"/factories/{fid}/plans", json={"type": "pct", "value": 10, "save": False}, headers=auth).json()
    assert nao["id"] is None and client.get(f"/factories/{fid}/plans", headers=auth).json() == []
    sem_paralelo = client.post(f"/factories/{fid}/plans", json={"type": "pct", "value": 60, "allow_parallel": False,
                                                              "allow_warning_zone": False, "save": False}, headers=auth).json()
    assert sem_paralelo["reached_goal"] is False and "Usar mais máquinas em paralelo" in sem_paralelo["note"]
    meta = client.post(f"/factories/{fid}/plans", json={"type": "abs", "value": 12000, "save": False}, headers=auth).json()
    assert meta["reached_goal"] is True and meta["after"]["prod"] >= 12000 - 0.5
    # reduzir o risco: com tudo no ótimo não há o que fazer
    risco = client.post(f"/factories/{fid}/plans", json={"type": "risk", "save": False}, headers=auth).json()
    assert risco["steps"] == [] and "Nada a reduzir" in risco["note"]
    rot = by_type(factory, "rotuladora")
    client.patch(f"/factories/{fid}/machines/{rot['id']}", json={"value": 240}, headers=auth)
    risco2 = client.post(f"/factories/{fid}/plans", json={"type": "risk", "save": False}, headers=auth).json()
    assert risco2["steps"] and risco2["after"]["risk"] < risco2["before"]["risk"]


def test_plano_de_outra_fabrica_nao_e_acessivel(client, auth, other_auth, factory):
    p = client.post(f"/factories/{factory['id']}/plans", json={"type": "pct", "value": 5}, headers=auth).json()
    assert client.get(f"/factories/{factory['id']}/plans/{p['id']}", headers=other_auth).status_code == 404
    outra = client.post("/factories", json={"name": "Minha"}, headers=other_auth).json()["id"]
    assert client.get(f"/factories/{outra}/plans/{p['id']}", headers=other_auth).status_code == 404


# ------------------------------------------------------------------------------------- cenários
def test_cenarios_antes_e_depois(client, auth, factory):
    fid = factory["id"]
    antes = client.post(f"/factories/{fid}/scenarios", json={"name": "Situação inicial"}, headers=auth)
    assert antes.status_code == 201 and antes.json()["production_per_hour"] == 11400 and len(antes.json()["machines"]) == 8
    rot = by_type(factory, "rotuladora")
    client.patch(f"/factories/{fid}/machines/{rot['id']}", json={"units_in_parallel": 2}, headers=auth)
    depois = client.post(f"/factories/{fid}/scenarios", json={"name": "Com 2 rotuladoras"}, headers=auth).json()
    cmp = client.get(f"/factories/{fid}/scenarios/compare", params={"a": antes.json()["id"], "b": depois["id"]}, headers=auth).json()
    assert cmp["production_per_hour"]["diff"] == 600 and abs(cmp["production_per_hour"]["pct"] - 600 / 11400 * 100) < 1e-9
    assert cmp["before"]["name"] == "Situação inicial" and any(m["name"] == "Rotuladora" and m["output"]["diff"] > 0 for m in cmp["machines"])
    assert len(client.get(f"/factories/{fid}/scenarios", headers=auth).json()) == 2
    assert client.delete(f"/factories/{fid}/scenarios/{antes.json()['id']}", headers=auth).status_code == 204
    assert client.get(f"/factories/{fid}/scenarios/{antes.json()['id']}", headers=auth).status_code == 404
    assert client.post(f"/factories/{fid}/scenarios", json={"name": ""}, headers=auth).status_code == 422


def test_cenario_sobrevive_quando_a_maquina_e_removida(client, auth, factory):
    fid = factory["id"]
    foto = client.post(f"/factories/{fid}/scenarios", json={"name": "foto"}, headers=auth).json()
    client.delete(f"/factories/{fid}/machines/{by_type(factory, 'esteira')['id']}", headers=auth)
    again = client.get(f"/factories/{fid}/scenarios/{foto['id']}", headers=auth).json()
    assert len(again["machines"]) == 8 and any(m["machine_id"] is None for m in again["machines"])   # a foto não muda


# ------------------------------------------------------------------------------------- Play
def test_play_completo_resultado_final_e_historico(client, auth, factory):
    fid = factory["id"]
    r = client.post(f"/factories/{fid}/play", json={"speed": 20, "duration_min": 60}, headers=auth)
    assert r.status_code == 200
    r = r.json()
    assert r["finished"] is True and r["id"] and r["duration_min"] == 60 and r["speed"] == 20
    assert 0 < r["produced"] < 11400                                  # o produto leva 3 min por etapa para chegar: perde as primeiras horas
    assert abs(r["average_per_hour"] - r["produced"]) < 1e-9          # 1 hora simulada
    assert 0 < r["pct_of_best"] < 100 and r["energy_kwh"] > 0 and r["queue_total"] > 0
    assert r["bottleneck"]["type"] == "rotuladora" and r["max_risk"] == 0.02
    assert r["timeline"][-1]["produced"] == r["produced"] and r["timeline"][0]["t"] < r["timeline"][-1]["t"]
    assert r["events"][-1]["text"] == "Simulação terminada" and any("começou a trabalhar" in e["text"] for e in r["events"])
    hist = client.get(f"/factories/{fid}/simulations", headers=auth).json()
    assert len(hist) == 1 and hist[0]["id"] == r["id"] and hist[0]["bottleneck"]["type"] == "rotuladora" and hist[0]["produced"] == round(r["produced"])
    # os eventos da simulação foram para o registro, ligados a ela
    assert any(e["simulation_id"] == r["id"] for e in client.get(f"/factories/{fid}/events?limit=200", headers=auth).json())


def test_play_regras(client, auth, factory):
    fid = factory["id"]
    assert client.post(f"/factories/{fid}/play", json={"speed": 7, "duration_min": 60}, headers=auth).status_code == 422
    assert client.post(f"/factories/{fid}/play", json={"speed": 20, "duration_min": 5}, headers=auth).status_code == 422
    vazia = client.post("/factories", json={"name": "Vazia2"}, headers=auth).json()["id"]
    assert client.post(f"/factories/{vazia}/play", json={}, headers=auth).status_code == 422
    nao_salva = client.post(f"/factories/{fid}/play", json={"speed": 60, "duration_min": 30, "save": False}, headers=auth).json()
    assert nao_salva["id"] is None and client.get(f"/factories/{fid}/simulations", headers=auth).json() == []
    longa = client.post(f"/factories/{fid}/play", json={"speed": 60, "duration_min": 480}, headers=auth).json()
    assert 7 * 11400 < longa["produced"] < 8 * 11400 and len(longa["timeline"]) <= 241
    client.patch(f"/factories/{fid}", json={"emergency_stop": True}, headers=auth)
    assert client.post(f"/factories/{fid}/play", json={"speed": 60, "duration_min": 60, "save": False}, headers=auth).json()["produced"] == 0


def test_play_ao_vivo_pelo_websocket(client, auth, factory):
    token = auth["Authorization"].split()[1]
    fid = factory["id"]
    with client.websocket_connect(f"/factories/{fid}/play/ws?token={token}&speed=60&duration_min=60&realtime=false") as ws:
        msgs = []
        while True:
            m = ws.receive_json()
            msgs.append(m)
            if m["type"] in ("result", "error"):
                break
    assert msgs[0]["type"] == "start" and msgs[0]["duration_min"] == 60
    ticks = [m for m in msgs if m["type"] == "tick"]
    assert [t["t"] for t in ticks] == [15, 30, 45, 60]                                         # 0,25 s x 60 = 15 min por quadro
    assert set(ticks[0]["machines"]) == {str(m["id"]) for m in factory["machines"]}
    # o produto leva 21 min para chegar à rotuladora (7 etapas x 3 min): nada sai nos primeiros quadros
    assert ticks[0]["produced"] == 0 and ticks[-1]["produced"] > ticks[1]["produced"] >= 0 and ticks[-1]["produced"] > 0
    assert ticks[0]["machines"][str(factory["machines"][-1]["id"])]["waiting_for_product"] is True
    final = msgs[-1]
    assert final["type"] == "result" and final["finished"] is True and abs(final["produced"] - ticks[-1]["produced"]) < 1e-9 and final["id"]
    assert len(client.get(f"/factories/{fid}/simulations", headers=auth).json()) == 1          # ficou no histórico


def test_websocket_recusa_token_ruim_e_parametros_ruins(client, auth, factory):
    fid = factory["id"]
    with client.websocket_connect(f"/factories/{fid}/play/ws?token=lixo") as ws:
        assert ws.receive_json()["type"] == "error"
    token = auth["Authorization"].split()[1]
    with client.websocket_connect(f"/factories/{fid}/play/ws?token={token}&speed=3") as ws:
        m = ws.receive_json()
        assert m["type"] == "error" and "Velocidade" in m["message"]
    with client.websocket_connect(f"/factories/9999/play/ws?token={token}") as ws:
        assert ws.receive_json()["type"] == "error"


def test_websocket_pode_ser_parado(client, auth, factory):
    token = auth["Authorization"].split()[1]
    fid = factory["id"]
    with client.websocket_connect(f"/factories/{fid}/play/ws?token={token}&speed=1&duration_min=480&realtime=true") as ws:
        assert ws.receive_json()["type"] == "start"
        assert ws.receive_json()["type"] == "tick"
        ws.send_text(json.dumps({"cmd": "stop"}))
        while True:
            m = ws.receive_json()
            if m["type"] == "result":
                break
    assert m["finished"] is False
    h = client.get(f"/factories/{fid}/simulations", headers=auth).json()
    assert len(h) == 1 and h[0]["finished"] is False                                       # guardada como "parada antes do fim"


# ------------------------------------------------------------------------------------- conversa
def test_assistente_responde_com_calculos_e_guarda_a_conversa(client, auth, factory):
    fid = factory["id"]
    g = client.post(f"/factories/{fid}/chat", json={"text": "Onde está o gargalo?"}, headers=auth).json()
    assert g["kind"] == "bottleneck" and g["report"]["name"] == "Rotuladora"
    p = client.post(f"/factories/{fid}/chat", json={"text": "Quero aumentar a produção em 10%"}, headers=auth).json()
    assert p["kind"] == "plan" and "+10%" in p["text"] and p["plan"]["steps"]
    f = client.post(f"/factories/{fid}/chat", json={"text": "O que acontece se a enchedora falhar?"}, headers=auth).json()
    assert f["kind"] == "text" and "<b>0</b>" in f["text"] and "Enchedora" in f["text"]
    c = client.post(f"/factories/{fid}/chat", json={"text": "Quanto custa a rotuladora?"}, headers=auth).json()
    assert "mil" in c["text"] and c["cites"]
    e = client.post(f"/factories/{fid}/chat", json={"text": "Quanta energia a fábrica gasta?"}, headers=auth).json()
    assert "kW" in e["text"] and "R$" in e["text"]
    m = client.post(f"/factories/{fid}/chat", json={"text": "Como funciona o pasteurizador?"}, headers=auth).json()
    assert "Pasteurizador" in m["text"] and "Dica" in m["text"] and m["cites"]                 # texto do manual do banco
    n = client.post(f"/factories/{fid}/chat", json={"text": "qual a capital da França?"}, headers=auth).json()
    assert "não sei" in n["text"].lower() and "não uma IA" in n["text"]
    hist = client.get(f"/factories/{fid}/chat", headers=auth).json()
    assert len(hist["messages"]) == 14 and hist["messages"][0]["author"] == "usuario" and hist["messages"][1]["author"] == "assistente"
    assert hist["suggestions"] and client.post(f"/factories/{fid}/chat", json={"text": ""}, headers=auth).status_code == 422
    assert client.delete(f"/factories/{fid}/chat", headers=auth).json()["deleted"] == 14


def test_assistente_com_fabrica_vazia_e_conversa_privada(client, auth, other_auth, factory):
    vazia = client.post("/factories", json={"name": "Vazia3"}, headers=auth).json()["id"]
    assert "ainda está vazia" in client.post(f"/factories/{vazia}/chat", json={"text": "gargalo"}, headers=auth).json()["text"]
    client.post(f"/factories/{factory['id']}/chat", json={"text": "gargalo"}, headers=auth)
    assert client.get(f"/factories/{factory['id']}/chat", headers=other_auth).status_code == 404
