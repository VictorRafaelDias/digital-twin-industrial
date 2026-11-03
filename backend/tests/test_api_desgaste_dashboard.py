"""Dashboard (dados dos gráficos, linha do tempo guardada), temperatura estimada, desgaste, depreciação e manutenção."""
from __future__ import annotations

import pytest

from app.engine import wear as W
from app.engine.simulate import simulate
from app.engine.thermal import machine_temperature
from app.engine.types import Edge, Node, SimContext
from tests.conftest import by_type
from tests.helpers import catalog_from_front


def machine(s, code):
    return next(m for m in s["machines"] if m["type"] == code)


# ------------------------------------------------------------------------------------- motor: desgaste
def test_sem_horas_o_desgaste_nao_muda_nada():
    w = W.wear_of(0, 0, 0, 25000, 800)
    assert (w.capacity_factor, w.risk_add, w.status) == (1.0, 0.0, "ok") and w.residual_fraction == 1.0


def test_curva_de_desgaste_da_idade_e_da_manutencao_atrasada():
    meio = W.wear_of(12500, 12500, 12500, 25000, 800)                 # metade da vida, manutenção em dia
    assert abs(meio.capacity_factor - 0.90) < 1e-12 and abs(meio.risk_add - 0.02) < 1e-12 and meio.status == "ok"
    fim = W.wear_of(25000, 25000, 25000, 25000, 800)
    assert abs(fim.capacity_factor - 0.80) < 1e-12 and abs(fim.risk_add - 0.08) < 1e-12 and fim.status == "fim_de_vida"
    assert abs(fim.residual_fraction - 0.10) < 1e-12 and fim.hours_of_life_left == 0
    atrasada = W.wear_of(1700, 0, 1700, 25000, 800)                   # 900 h acima do intervalo: mais de um intervalo de atraso
    assert atrasada.status == "manutencao_atrasada" and atrasada.maintenance_overdue > 1 and atrasada.hours_to_maintenance < 0
    assert atrasada.capacity_factor < 1 and atrasada.risk_add > 0.04
    assert W.wear_of(700, 0, 700, 25000, 800).status == "atencao"       # a 80% do intervalo
    assert W.wear_of(1e9, 0, 1e9, 25000, 800).capacity_factor == 0.75                          # perda máxima: 20% pela idade + 5% pelo atraso


def test_desgaste_anda_mais_rapido_acima_do_otimo_e_para_quando_desligada_ou_falhada():
    cat = catalog_from_front()
    enchedora = cat["enchedora"]
    assert W.wear_speed(enchedora, 200, False, False) == 1.0 and W.wear_speed(enchedora, 150, False, False) == 1.0
    assert 1.0 < W.wear_speed(enchedora, 225, False, False) < 4.0
    assert abs(W.wear_speed(enchedora, 244.999, False, False) - 4.0) < 0.01
    assert W.wear_speed(enchedora, 250, False, False) == 0.0           # falhou: parada
    assert W.wear_speed(enchedora, 200, True, False) == 0.0            # desligada


def test_manutencao_recupera_parte_do_desgaste():
    assert W.after_maintenance(1000, "preventiva") == 400 and W.after_maintenance(1000, "corretiva") == 200


def test_desgaste_entra_na_simulacao_e_nao_estraga_o_calculo_sem_desgaste():
    cat = catalog_from_front()
    nodes = [Node("a", "tanque_agua", value=8), Node("b", "enchedora", value=200)]
    edges = [Edge("e", "a", "b")]
    ctx = SimContext(cat, 25)
    base = simulate(nodes, edges, ctx)
    gasta = [n.copy() for n in nodes]
    gasta[1].wear_cap, gasta[1].wear_risk = 0.8, 0.08
    r = simulate(gasta, edges, ctx)
    assert abs(r.res["b"].cap - base.res["b"].cap * 0.8) < 1e-9 and abs(r.res["b"].risk - 0.10) < 1e-12
    assert r.production < base.production
    falhou = [n.copy() for n in nodes]
    falhou[1].value, falhou[1].wear_risk = 250, 0.08
    assert simulate(falhou, edges, ctx).res["b"].risk == 1              # em falha o risco é 100% (não passa disso)


def test_temperatura_estimada():
    cat = catalog_from_front()
    nodes = [Node("a", "tanque_agua", value=8), Node("b", "enchedora", value=200), Node("c", "camara_fria", value=1200)]
    sim = simulate(nodes, [], SimContext(cat, 25))
    t = {n.id: machine_temperature(cat[n.type], n, sim.res[n.id], 25) for n in nodes}
    assert t["a"] == 37.0 and t["b"] == 65.0 and t["c"] == 16.5         # ambiente + aquecimento pela carga; câmara fria: 4 °C + 0,5 por °C acima de 20 + 10 pela carga
    quente = machine_temperature(cat["enchedora"], nodes[1], sim.res["b"], 35)
    assert quente == 75.0                                               # cada °C do ambiente soma 1 °C
    desl = nodes[1].copy()
    desl.off = True
    assert machine_temperature(cat["enchedora"], desl, simulate([desl], [], SimContext(cat, 25)).res["b"], 25) == 25.0
    acima = nodes[1].copy()
    acima.value = 235
    rr = simulate([acima], [], SimContext(cat, 25)).res["b"]
    assert machine_temperature(cat["enchedora"], acima, rr, 25) > 65    # acima do ótimo esquenta mais
    falha = nodes[1].copy()
    falha.value = 250
    assert machine_temperature(cat["enchedora"], falha, simulate([falha], [], SimContext(cat, 25)).res["b"], 25) == 25 + 40 * 1.5


# ------------------------------------------------------------------------------------- API: dashboard
def test_dashboard_da_fabrica(client, auth, factory):
    d = client.get(f"/factories/{factory['id']}/dashboard", headers=auth).json()
    f = d["factory"]
    assert f["production_per_hour"] == 11400 and f["pct_of_best"] == 100 and f["bottleneck"]["name"] == "Rotuladora"
    assert abs(f["queue_total"] - sum(m["queue"] for m in d["machines"])) < 1e-9 and f["queue_total"] >= 600
    assert len(d["machines"]) == 8 and abs(sum(m["energy_share_pct"] for m in d["machines"]) - 100) < 1e-9
    rot = next(m for m in d["machines"] if m["type"] == "rotuladora")
    assert rot["utilization_pct"] == 100 and rot["queue"] == 600 and rot["temperature_c"] > 25
    assert any("fila" in a["text"] for a in d["alerts"]) and d["last_simulation"] is None
    assert {c["chart"] for c in d["chart_guide"]} >= {"Medidor da fábrica", "Rosca de energia", "Temperatura da máquina", "Desgaste"}


def test_dashboard_mostra_falha_e_ganha_a_linha_do_tempo_depois_do_play(client, auth, factory):
    fid = factory["id"]
    ench = by_type(factory, "enchedora")
    client.patch(f"/factories/{fid}/machines/{ench['id']}", json={"value": 250}, headers=auth)
    d = client.get(f"/factories/{fid}/dashboard", headers=auth).json()
    assert d["factory"]["pct_of_best"] == 0 and any(a["level"] == "bad" and "falhou" in a["text"] for a in d["alerts"])
    client.patch(f"/factories/{fid}/machines/{ench['id']}", json={"value": 200}, headers=auth)
    r = client.post(f"/factories/{fid}/play", json={"speed": 20, "duration_min": 120}, headers=auth).json()
    d = client.get(f"/factories/{fid}/dashboard", headers=auth).json()
    assert d["last_simulation"]["id"] == r["id"] and len(d["last_simulation"]["timeline"]) == len(r["timeline"]) > 3
    assert d["last_simulation"]["timeline"][-1]["produced"] == r["timeline"][-1]["produced"]


def test_linha_do_tempo_da_simulacao_fica_guardada_por_fabrica_e_por_maquina(client, auth, factory):
    fid = factory["id"]
    r = client.post(f"/factories/{fid}/play", json={"speed": 60, "duration_min": 480}, headers=auth).json()
    assert len(r["timeline"]) == 32 and set(r["machine_series"]) == {str(m["id"]) for m in factory["machines"]}     # 480 min / 15 min por passo (x60)
    s = client.get(f"/factories/{fid}/simulations/{r['id']}", headers=auth).json()
    assert s["produced"] == round(r["produced"]) and len(s["timeline"]) == len(r["timeline"])
    assert [p["t"] for p in s["timeline"]] == sorted(p["t"] for p in s["timeline"]) and s["timeline"][-1]["t"] == 480
    rot = by_type(factory, "rotuladora")
    serie = s["machine_series"][str(rot["id"])]
    assert len(serie) == len(s["timeline"]) and serie[-1]["output"] == 11400 and serie[-1]["state"] == "normal" and serie[-1]["temperature_c"] > 25
    assert serie[0]["output"] == 0                                        # no começo a rotuladora ainda espera o produto chegar
    assert client.get(f"/factories/{fid}/simulations/99999", headers=auth).status_code == 404


def test_amostragem_limita_os_pontos(client, auth, factory):
    r = client.post(f"/factories/{factory['id']}/play", json={"speed": 5, "duration_min": 480, "apply_wear": False}, headers=auth).json()
    assert len(r["timeline"]) <= 121 and r["timeline"][-1]["t"] == 480


def test_nao_salvar_nao_grava_a_linha_do_tempo_nem_envelhece(client, auth, factory):
    fid = factory["id"]
    antes = client.get("/health").json()["rows_by_table"]
    r = client.post(f"/factories/{fid}/play", json={"speed": 60, "duration_min": 60, "save": False}, headers=auth).json()
    assert r["id"] is None and r["timeline"] and r["wear_added"] == []
    assert client.get("/health").json()["rows_by_table"]["simulacao_pontos"] == antes["simulacao_pontos"]
    assert all(m["operating_hours"] == 0 for m in client.get(f"/factories/{fid}/wear", headers=auth).json()["machines"])


# ------------------------------------------------------------------------------------- API: desgaste e manutenção
def test_o_play_envelhece_as_maquinas_que_trabalharam(client, auth, factory):
    fid = factory["id"]
    r = client.post(f"/factories/{fid}/play", json={"speed": 60, "duration_min": 480}, headers=auth).json()
    assert len(r["wear_added"]) == 8
    w = client.get(f"/factories/{fid}/wear", headers=auth).json()
    assert all(m["operating_hours"] == 8 and m["wear_hours"] == 8 for m in w["machines"])       # ritmo ótimo: 1 h de uso = 1 h de desgaste
    assert all(m["status"] == "ok" for m in w["machines"])


def test_operar_acima_do_otimo_desgasta_mais_rapido(client, auth, factory):
    fid, rot = factory["id"], by_type(factory, "rotuladora")
    client.patch(f"/factories/{fid}/machines/{rot['id']}", json={"value": 235}, headers=auth)
    client.post(f"/factories/{fid}/play", json={"speed": 60, "duration_min": 600}, headers=auth)
    w = client.get(f"/factories/{fid}/wear", headers=auth).json()
    r = next(m for m in w["machines"] if m["type"] == "rotuladora")
    outra = next(m for m in w["machines"] if m["type"] == "esteira")
    assert r["operating_hours"] == outra["operating_hours"] == 10 and r["wear_hours"] > 2 * outra["wear_hours"]


def test_maquina_desligada_ou_falhada_nao_envelhece(client, auth, factory):
    fid = factory["id"]
    client.patch(f"/factories/{fid}/machines/{by_type(factory, 'esteira')['id']}", json={"off": True}, headers=auth)
    client.patch(f"/factories/{fid}/machines/{by_type(factory, 'enchedora')['id']}", json={"value": 250}, headers=auth)
    client.post(f"/factories/{fid}/play", json={"speed": 60, "duration_min": 240}, headers=auth)
    w = client.get(f"/factories/{fid}/wear", headers=auth).json()
    for code in ("esteira", "enchedora"):
        assert next(m for m in w["machines"] if m["type"] == code)["operating_hours"] == 0
    assert next(m for m in w["machines"] if m["type"] == "rotuladora")["operating_hours"] == 4


def test_envelhecer_uma_maquina_baixa_o_rendimento_e_sobe_o_risco(client, auth, factory):
    fid, rot = factory["id"], by_type(factory, "rotuladora")
    antes = client.get(f"/factories/{fid}/simulate", headers=auth).json()
    r = client.post(f"/factories/{fid}/machines/{rot['id']}/age", json={"hours": 15000}, headers=auth)
    # metade da vida útil (-10%) e manutenção muito atrasada (-5%)
    assert r.status_code == 200 and r.json()["life_used_pct"] == 50 and abs(r.json()["capacity_factor"] - 0.85) < 1e-9 and abs(r.json()["risk_added"] - 0.06) < 1e-9
    assert r.json()["status"] == "manutencao_atrasada"                      # 15.000 h sem manutenção, intervalo de 1.000 h
    depois = client.get(f"/factories/{fid}/simulate", headers=auth).json()
    assert depois["production_per_hour"] < antes["production_per_hour"]
    assert machine(depois, "rotuladora")["wear"]["capacity_factor"] == 0.85 and abs(machine(depois, "rotuladora")["risk"] - 0.08) < 1e-9
    assert abs(depois["production_per_hour"] - 11400 * 0.85) < 1e-6
    assert depois["bottleneck"]["type"] == "rotuladora"
    assert client.post(f"/factories/{fid}/machines/{rot['id']}/age", json={"hours": 0}, headers=auth).status_code == 422
    assert client.post(f"/factories/{fid}/machines/99999/age", json={"hours": 5}, headers=auth).status_code == 404


def test_manutencao_recupera_e_fica_no_historico(client, auth, factory):
    fid, rot = factory["id"], by_type(factory, "rotuladora")
    client.post(f"/factories/{fid}/machines/{rot['id']}/age", json={"hours": 5000}, headers=auth)
    r = client.post(f"/factories/{fid}/machines/{rot['id']}/maintenance", json={"kind": "preventiva", "note": "troca de rolamentos"}, headers=auth)
    assert r.status_code == 201 and r.json()["wear_hours"] == 2000 and r.json()["status"] == "ok"
    assert r.json()["hours_since_maintenance"] == 0 and r.json()["operating_hours"] == 5000       # horas de uso reais não zeram
    corretiva = client.post(f"/factories/{fid}/machines/{rot['id']}/maintenance", json={"kind": "corretiva"}, headers=auth).json()
    assert corretiva["wear_hours"] == 400
    hist = client.get(f"/factories/{fid}/maintenance", headers=auth).json()
    assert [(h["kind"], h["wear_before"], h["wear_after"]) for h in hist] == [("corretiva", 2000, 400), ("preventiva", 5000, 2000)] and hist[1]["note"] == "troca de rolamentos"
    assert len(client.get(f"/factories/{fid}/maintenance?machine_id={rot['id']}", headers=auth).json()) == 2
    assert client.get(f"/factories/{fid}/maintenance?machine_id=99999", headers=auth).json() == []
    assert client.post(f"/factories/{fid}/machines/{rot['id']}/maintenance", json={"kind": "magica"}, headers=auth).status_code == 422
    textos = [e["text"] for e in client.get(f"/factories/{fid}/events", headers=auth).json()]
    assert any("manutenção preventiva registrada" in t for t in textos) and any("+5000 h de uso" in t for t in textos)


def test_depreciacao_e_valor_residual(client, auth, factory):
    fid, enc = factory["id"], by_type(factory, "enchedora")
    novo = next(m for m in client.get(f"/factories/{fid}/wear", headers=auth).json()["machines"] if m["type"] == "enchedora")
    preco = client.get("/catalog/machines/enchedora", headers=auth).json()["price"]
    meio = (preco["min"] + preco["max"]) / 2
    assert abs(novo["replacement_cost"] - meio) < 1e-6 and novo["residual_value"] == novo["replacement_cost"] and novo["depreciation_per_hour"] > 0
    client.post(f"/factories/{fid}/machines/{enc['id']}/age", json={"hours": 12500}, headers=auth)        # metade da vida útil (25.000 h)
    w = client.get(f"/factories/{fid}/wear", headers=auth).json()
    m = next(x for x in w["machines"] if x["type"] == "enchedora")
    assert abs(m["residual_value_fraction"] - 0.55) < 1e-9 and abs(m["residual_value"] - meio * 0.55) < 1e-6
    assert abs(m["life_left_hours"] - 12500) < 1e-9 and abs(m["predicted_end_of_life_in_hours"] - 12500) < 1e-9
    assert w["totals"]["depreciated"] > 0 and w["totals"]["production_lost_to_wear_pct"] > 0
    assert w["totals"]["production_per_hour"] < w["totals"]["production_per_hour_without_wear"]
    assert any(a["machine_id"] == enc["id"] for a in w["alerts"]) and "hipótese" in w["basis"].lower()


def test_unidades_em_paralelo_contam_no_custo_de_reposicao(client, auth, factory):
    fid, rot = factory["id"], by_type(factory, "rotuladora")
    um = next(m for m in client.get(f"/factories/{fid}/wear", headers=auth).json()["machines"] if m["type"] == "rotuladora")["replacement_cost"]
    client.patch(f"/factories/{fid}/machines/{rot['id']}", json={"units_in_parallel": 3}, headers=auth)
    tres = next(m for m in client.get(f"/factories/{fid}/wear", headers=auth).json()["machines"] if m["type"] == "rotuladora")["replacement_cost"]
    assert abs(tres - 3 * um) < 1e-6


def test_desgaste_e_privado_de_cada_usuario(client, auth, other_auth, factory):
    fid, rot = factory["id"], by_type(factory, "rotuladora")
    for chamada, url, corpo in ((client.get, f"/factories/{fid}/wear", None), (client.get, f"/factories/{fid}/dashboard", None),
                                (client.post, f"/factories/{fid}/machines/{rot['id']}/age", {"hours": 5}),
                                (client.post, f"/factories/{fid}/machines/{rot['id']}/maintenance", {"kind": "preventiva"})):
        r = chamada(url, headers=other_auth, **({"json": corpo} if corpo else {}))
        assert r.status_code == 404, url


def test_apagar_maquina_com_manutencao_e_simulacao_nao_quebra(client, auth, factory):
    fid, rot = factory["id"], by_type(factory, "rotuladora")
    client.post(f"/factories/{fid}/machines/{rot['id']}/age", json={"hours": 100}, headers=auth)
    client.post(f"/factories/{fid}/machines/{rot['id']}/maintenance", json={"kind": "preventiva"}, headers=auth)
    sim = client.post(f"/factories/{fid}/play", json={"speed": 60, "duration_min": 60}, headers=auth).json()
    assert client.delete(f"/factories/{fid}/machines/{rot['id']}", headers=auth).status_code == 204
    s = client.get(f"/factories/{fid}/simulations/{sim['id']}", headers=auth)
    assert s.status_code == 200 and str(rot["id"]) not in s.json()["machine_series"] and "None" in s.json()["machine_series"]   # a leitura fica, sem o vínculo
    assert client.get(f"/factories/{fid}/maintenance", headers=auth).json() == []        # o histórico vai junto com a máquina


def test_salvar_o_desenho_mantem_o_desgaste_das_maquinas_que_ja_existiam(client, auth, factory):
    fid, rot = factory["id"], by_type(factory, "rotuladora")
    client.post(f"/factories/{fid}/machines/{rot['id']}/age", json={"hours": 700}, headers=auth)
    client.post(f"/factories/{fid}/machines/{rot['id']}/maintenance", json={"kind": "preventiva"}, headers=auth)
    atual = client.get(f"/factories/{fid}", headers=auth).json()
    maquinas = [{"ref": f"m{m['id']}", "id": m["id"], "type": m["type"], "x": m["x"] + 5, "y": m["y"], "value": m["value"], "units_in_parallel": m["units_in_parallel"]}
                for m in atual["machines"] if m["type"] != "esteira"]                                       # a esteira sai do desenho
    ligacoes = [{"from_ref": "m" + str(c["from"]), "to_ref": "m" + str(c["to"])} for c in atual["connections"]
                if by_type(atual, "esteira")["id"] not in (c["from"], c["to"])]
    r = client.put(f"/factories/{fid}/layout", json={"machines": maquinas, "connections": ligacoes}, headers=auth)
    assert r.status_code == 200 and r.json()["ids_by_ref"][f"m{rot['id']}"] == rot["id"]                  # mesma máquina, mesmo id
    assert len(r.json()["machines"]) == 7 and next(m for m in r.json()["machines"] if m["id"] == rot["id"])["x"] == rot["x"] + 5
    w = next(m for m in client.get(f"/factories/{fid}/wear", headers=auth).json()["machines"] if m["id"] == rot["id"])
    assert w["wear_hours"] == 280 and w["operating_hours"] == 700                                          # o desgaste ficou
    assert len(client.get(f"/factories/{fid}/maintenance", headers=auth).json()) == 1                      # e o histórico também
    # uma máquina nova no desenho (sem id) entra do zero; id de outra fábrica é recusado
    nova = client.put(f"/factories/{fid}/layout", json={"machines": maquinas + [{"ref": "n", "type": "esteira"}]}, headers=auth).json()
    assert nova["ids_by_ref"]["n"] not in [m["id"] for m in factory["machines"]]
    outro = client.post("/factories", json={"name": "Outra"}, headers=auth).json()["id"]
    assert client.put(f"/factories/{outro}/layout", json={"machines": [{"ref": "x", "id": rot["id"], "type": "rotuladora"}]}, headers=auth).status_code == 404
    # trocar o tipo de uma máquina existente cria uma nova (não reaproveita o desgaste)
    trocado = client.put(f"/factories/{fid}/layout", json={"machines": [{"ref": "t", "id": rot["id"], "type": "enchedora"}]}, headers=auth).json()
    assert trocado["ids_by_ref"]["t"] != rot["id"]
