"""Dashboard (dados dos gráficos, linha do tempo guardada), temperatura estimada, idade e manutenção das máquinas, depreciação."""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.engine import wear as W
from app.engine.simulate import simulate
from app.engine.thermal import machine_temperature
from app.engine.types import Edge, Node, SimContext
from tests.conftest import by_type
from tests.helpers import catalog_from_front


def dias_atras(n: int) -> str:
    """A data (AAAA-MM-DD) de n dias atrás: os testes não dependem do dia em que rodam."""
    return (date.today() - timedelta(days=n)).isoformat()


def machine(s, code):
    return next(m for m in s["machines"] if m["type"] == code)


def estado(client, auth, fid, code):
    return next(m for m in client.get(f"/factories/{fid}/wear", headers=auth).json()["machines"] if m["type"] == code)


# ------------------------------------------------------------------------------------- motor: desgaste
def test_sem_horas_o_desgaste_nao_muda_nada():
    w = W.wear_of(0, 0, 0, 25000, 800)
    assert (w.capacity_factor, w.risk_add, w.status, w.temp_add) == (1.0, 0.0, "ok", 0.0) and w.residual_fraction == 1.0


def test_curva_de_desgaste_da_idade_e_da_manutencao_atrasada():
    meio = W.wear_of(12500, 12500, 12500, 25000, 800)                 # metade da vida, manutenção em dia
    assert abs(meio.capacity_factor - 0.90) < 1e-12 and abs(meio.risk_add - 0.02) < 1e-12 and meio.status == "ok"
    assert abs(meio.temp_add - 2.0) < 1e-12                           # 8 °C x 0,5^2
    fim = W.wear_of(25000, 25000, 25000, 25000, 800)
    assert abs(fim.capacity_factor - 0.80) < 1e-12 and abs(fim.risk_add - 0.08) < 1e-12 and fim.status == "fim_de_vida"
    assert abs(fim.residual_fraction - 0.10) < 1e-12 and fim.hours_of_life_left == 0 and abs(fim.temp_add - 8.0) < 1e-12
    atrasada = W.wear_of(1700, 0, 1700, 25000, 800)                   # 900 h acima do intervalo: mais de um intervalo de atraso
    assert atrasada.status == "manutencao_atrasada" and atrasada.maintenance_overdue > 1 and atrasada.hours_to_maintenance < 0
    assert atrasada.capacity_factor < 1 and atrasada.risk_add > 0.04 and atrasada.temp_add >= 4.0
    assert W.wear_of(700, 0, 700, 25000, 800).status == "atencao"       # a 80% do intervalo
    ruim = W.wear_of(1e9, 0, 1e9, 25000, 800)
    assert ruim.capacity_factor == 0.75 and abs(ruim.temp_add - 12.0) < 1e-12                  # perda máxima: 20% pela idade + 5% pelo atraso


def test_idade_e_data_da_manutencao_viram_horas():
    assert W.hours_from_inputs(0, 0) == (0.0, 0.0)
    assert W.hours_from_inputs(2.5, 0) == (10000.0, 10000.0)           # manutenção em dia: a última foi hoje
    assert W.hours_from_inputs(2.5, 91.3125) == (10000.0, 9000.0)      # 91,3 dias = 3 meses = 1.000 h sem manutenção
    assert W.hours_from_inputs(1, 5000) == (4000.0, 0.0)               # nunca fez manutenção: os dias não passam da idade
    assert W.hours_from_inputs(-3, -3) == (0.0, 0.0)
    assert W.maintenance_at(10000, 91.3125) == 9000.0 and W.age_from_hours(10000) == 2.5
    assert W.months_from_days(365.25) == 12.0 and W.months_from_days(0) == 0.0


def test_dias_desde_a_data():
    hoje = date(2026, 11, 3)
    assert W.days_since(None, hoje) == 0.0                              # sem data: conta como em dia
    assert W.days_since(date(2026, 10, 24), hoje) == 10.0
    assert W.days_since(hoje, hoje) == 0.0
    assert W.days_since(date(2027, 1, 1), hoje) == 0.0                  # data no futuro não dá dias negativos


def test_intervalos_por_categoria_sao_de_3_ou_6_meses():
    assert W.MAINT_H_BY_CAT == {"insumos": 2000, "preparo": 2000, "termico": 1000, "envase": 1000, "pos": 1000, "frio": 2000}
    assert {c: round(h / W.HORAS_USO_ANO * 12) for c, h in W.MAINT_H_BY_CAT.items()} == {"insumos": 6, "preparo": 6, "termico": 3, "envase": 3, "pos": 3, "frio": 6}


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


def test_maquina_velha_esquenta_mais():
    cat = catalog_from_front()
    nova = Node("b", "enchedora", value=200)
    velha = nova.copy()
    velha.wear_temp = 8.0
    sim = simulate([nova], [], SimContext(cat, 25))
    assert machine_temperature(cat["enchedora"], velha, sim.res["b"], 25) == machine_temperature(cat["enchedora"], nova, sim.res["b"], 25) + 8.0
    velha.off = True
    assert machine_temperature(cat["enchedora"], velha, sim.res["b"], 25) == 25.0       # desligada não esquenta, qualquer que seja a idade


def test_maquina_velha_rende_menos_mas_nao_esfria():
    cat = catalog_from_front()
    nova = Node("b", "enchedora", value=200)
    velha = nova.copy()
    velha.wear_cap, velha.wear_temp = 0.8, 8.0
    t_nova = machine_temperature(cat["enchedora"], nova, simulate([nova], [], SimContext(cat, 25)).res["b"], 25)
    t_velha = machine_temperature(cat["enchedora"], velha, simulate([velha], [], SimContext(cat, 25)).res["b"], 25)
    assert t_velha == t_nova + 8.0                                      # a carga é sobre a capacidade real: só a idade soma


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
    r = client.post(f"/factories/{factory['id']}/play", json={"speed": 5, "duration_min": 480}, headers=auth).json()
    assert len(r["timeline"]) <= 121 and r["timeline"][-1]["t"] == 480


def test_nao_salvar_nao_grava_a_linha_do_tempo(client, auth, factory):
    fid = factory["id"]
    antes = client.get("/health").json()["rows_by_table"]
    r = client.post(f"/factories/{fid}/play", json={"speed": 60, "duration_min": 60, "save": False}, headers=auth).json()
    assert r["id"] is None and r["timeline"] and r["wear_added"] == []
    assert client.get("/health").json()["rows_by_table"]["simulacao_pontos"] == antes["simulacao_pontos"]


# ------------------------------------------------------------------------------------- API: idade, manutenção e depreciação
def test_maquina_nova_por_padrao_e_o_play_nao_envelhece_nada(client, auth, factory):
    fid = factory["id"]
    for m in client.get(f"/factories/{fid}/wear", headers=auth).json()["machines"]:
        assert m["age_years"] == 0 and m["last_maintenance_date"] is None and m["months_since_maintenance"] == 0 and m["status"] == "ok" and m["capacity_factor"] == 1
    antes = client.get(f"/factories/{fid}/simulate", headers=auth).json()["production_per_hour"]
    for _ in range(2):
        client.post(f"/factories/{fid}/play", json={"speed": 60, "duration_min": 480, "apply_wear": True}, headers=auth)   # apply_wear é ignorado
    depois = client.get(f"/factories/{fid}/wear", headers=auth).json()
    assert all(m["age_years"] == 0 and m["wear_hours"] == 0 and m["operating_hours"] == 0 for m in depois["machines"])
    assert client.get(f"/factories/{fid}/simulate", headers=auth).json()["production_per_hour"] == antes          # simular não gasta a fábrica


def test_idade_e_manutencao_atrasada_baixam_o_rendimento_e_sobem_o_risco(client, auth, factory):
    fid, rot = factory["id"], by_type(factory, "rotuladora")
    antes = client.get(f"/factories/{fid}/simulate", headers=auth).json()
    # metade da vida útil (a rotuladora é pós-envase: 30.000 h = 7,5 anos, então 3,75 anos) e última manutenção há 1 ano (intervalo: 3 meses)
    r = client.patch(f"/factories/{fid}/machines/{rot['id']}", json={"age_years": 3.75, "last_maintenance_date": dias_atras(365)}, headers=auth)
    assert r.status_code == 200
    w = estado(client, auth, fid, "rotuladora")
    assert w["age_years"] == 3.75 and w["last_maintenance_date"] == dias_atras(365) and w["days_since_maintenance"] == 365 and w["months_since_maintenance"] == 12.0 and w["life_used_pct"] == 50
    assert abs(w["capacity_factor"] - 0.85) < 1e-9 and abs(w["risk_added"] - 0.06) < 1e-9 and w["status"] == "manutencao_atrasada"
    assert abs(w["temperature_added_c"] - 6.0) < 1e-9                       # 8 x 0,25 + 4 x 1
    depois = client.get(f"/factories/{fid}/simulate", headers=auth).json()
    assert depois["production_per_hour"] < antes["production_per_hour"]
    assert machine(depois, "rotuladora")["wear"]["capacity_factor"] == 0.85 and abs(machine(depois, "rotuladora")["risk"] - 0.08) < 1e-9
    assert abs(depois["production_per_hour"] - 11400 * 0.85) < 1e-6 and depois["bottleneck"]["type"] == "rotuladora"
    quente = next(m for m in client.get(f"/factories/{fid}/dashboard", headers=auth).json()["machines"] if m["type"] == "rotuladora")["temperature_c"]
    assert quente > 25 + 6                                                  # esquenta pelo trabalho e mais 6 °C pela idade/manutenção


def test_valores_invalidos_de_idade_sao_recusados(client, auth, factory):
    fid, rot = factory["id"], by_type(factory, "rotuladora")
    amanha = (date.today() + timedelta(days=1)).isoformat()
    for corpo in ({"age_years": -1}, {"age_years": 61}, {"last_maintenance_date": amanha}, {"last_maintenance_date": "1949-12-31"}, {"last_maintenance_date": "ontem"},
                  {"last_maintenance_date": "2026-13-45"}, {"age_years": "velha"}):
        assert client.patch(f"/factories/{fid}/machines/{rot['id']}", json=corpo, headers=auth).status_code in (422,), corpo
    assert client.post(f"/factories/{fid}/machines", json={"type": "esteira", "last_maintenance_date": amanha}, headers=auth).status_code == 422
    assert client.put(f"/factories/{fid}/layout", json={"machines": [{"ref": "a", "type": "esteira", "last_maintenance_date": amanha}]}, headers=auth).status_code == 422
    estado_rot = estado(client, auth, fid, "rotuladora")
    assert estado_rot["age_years"] == 0 and estado_rot["last_maintenance_date"] is None          # nada foi gravado pela metade


def test_maquina_pode_nascer_velha_e_os_meses_nao_passam_da_idade(client, auth, factory):
    fid = factory["id"]
    r = client.post(f"/factories/{fid}/machines", json={"type": "esteira", "age_years": 1, "last_maintenance_date": dias_atras(2000)}, headers=auth)
    assert r.status_code == 201 and r.json()["age_years"] == 1 and r.json()["last_maintenance_date"] == dias_atras(2000)
    w = next(m for m in client.get(f"/factories/{fid}/wear", headers=auth).json()["machines"] if m["id"] == r.json()["id"])
    igual = client.post(f"/factories/{fid}/machines", json={"type": "esteira", "age_years": 1, "last_maintenance_date": dias_atras(365)}, headers=auth).json()["id"]
    w2 = next(m for m in client.get(f"/factories/{fid}/wear", headers=auth).json()["machines"] if m["id"] == igual)
    # a data é anterior à própria máquina (1 ano): conta como nunca ter feito manutenção, igual a uma de 1 ano atrás
    assert (w["capacity_factor"], w["risk_added"], w["status"]) == (w2["capacity_factor"], w2["risk_added"], w2["status"]) and w["status"] == "manutencao_atrasada"


def test_manutencao_zera_os_meses_mas_nao_rejuvenesce_e_fica_no_historico(client, auth, factory):
    fid, rot = factory["id"], by_type(factory, "rotuladora")
    client.patch(f"/factories/{fid}/machines/{rot['id']}", json={"age_years": 6.25, "last_maintenance_date": dias_atras(730)}, headers=auth)   # 25.000 h de 30.000 h; última manutenção há 2 anos
    r = client.post(f"/factories/{fid}/machines/{rot['id']}/maintenance", json={"kind": "preventiva", "note": "troca de rolamentos"}, headers=auth)
    assert r.status_code == 201 and r.json()["months_since_maintenance"] == 0 and r.json()["last_maintenance_date"] == date.today().isoformat() and r.json()["age_years"] == 6.25
    assert r.json()["maintenance_overdue"] is False and r.json()["status"] == "atencao"      # em dia, mas 80% da vida útil gasta
    assert abs(r.json()["capacity_factor"] - (1 - 0.2 * 25000 / 30000)) < 1e-9                        # a idade continua pesando
    client.post(f"/factories/{fid}/machines/{rot['id']}/maintenance", json={"kind": "corretiva"}, headers=auth)
    hist = client.get(f"/factories/{fid}/maintenance", headers=auth).json()
    assert [(h["kind"], h["wear_before"], h["wear_after"]) for h in hist] == [("corretiva", 25000, 25000), ("preventiva", 25000, 25000)] and hist[1]["note"] == "troca de rolamentos"
    assert len(client.get(f"/factories/{fid}/maintenance?machine_id={rot['id']}", headers=auth).json()) == 2
    assert client.get(f"/factories/{fid}/maintenance?machine_id=99999", headers=auth).json() == []
    assert client.post(f"/factories/{fid}/machines/{rot['id']}/maintenance", json={"kind": "magica"}, headers=auth).status_code == 422
    textos = [e["text"] for e in client.get(f"/factories/{fid}/events", headers=auth).json()]
    assert any("manutenção preventiva registrada" in t for t in textos) and any("730 dia" in t for t in textos)


def test_o_botao_de_horas_de_uso_deixou_de_existir(client, auth, factory):
    rot = by_type(factory, "rotuladora")
    assert client.post(f"/factories/{factory['id']}/machines/{rot['id']}/age", json={"hours": 100}, headers=auth).status_code in (404, 405)


def test_depreciacao_e_valor_residual(client, auth, factory):
    fid, enc = factory["id"], by_type(factory, "enchedora")
    novo = estado(client, auth, fid, "enchedora")
    preco = client.get("/catalog/machines/enchedora", headers=auth).json()["price"]
    meio = (preco["min"] + preco["max"]) / 2
    assert abs(novo["replacement_cost"] - meio) < 1e-6 and novo["residual_value"] == novo["replacement_cost"] and novo["depreciation_per_hour"] > 0
    client.patch(f"/factories/{fid}/machines/{enc['id']}", json={"age_years": 3.125, "last_maintenance_date": dias_atras(365)}, headers=auth)   # metade da vida útil (25.000 h) e manutenção atrasada
    w = client.get(f"/factories/{fid}/wear", headers=auth).json()
    m = next(x for x in w["machines"] if x["type"] == "enchedora")
    assert abs(m["residual_value_fraction"] - 0.55) < 1e-9 and abs(m["residual_value"] - meio * 0.55) < 1e-6
    assert abs(m["life_left_hours"] - 12500) < 1e-9 and abs(m["predicted_end_of_life_in_hours"] - 12500) < 1e-9
    assert w["totals"]["depreciated"] > 0 and w["totals"]["production_lost_to_wear_pct"] > 0
    assert w["totals"]["production_per_hour"] < w["totals"]["production_per_hour_without_wear"]
    assert any(a["machine_id"] == enc["id"] for a in w["alerts"]) and "hipótese" in w["basis"].lower()


def test_unidades_em_paralelo_contam_no_custo_de_reposicao(client, auth, factory):
    fid, rot = factory["id"], by_type(factory, "rotuladora")
    um = estado(client, auth, fid, "rotuladora")["replacement_cost"]
    client.patch(f"/factories/{fid}/machines/{rot['id']}", json={"units_in_parallel": 3}, headers=auth)
    tres = estado(client, auth, fid, "rotuladora")["replacement_cost"]
    assert abs(tres - 3 * um) < 1e-6


def test_desgaste_e_privado_de_cada_usuario(client, auth, other_auth, factory):
    fid, rot = factory["id"], by_type(factory, "rotuladora")
    for chamada, url, corpo in ((client.get, f"/factories/{fid}/wear", None), (client.get, f"/factories/{fid}/dashboard", None),
                                (client.patch, f"/factories/{fid}/machines/{rot['id']}", {"age_years": 5}),
                                (client.post, f"/factories/{fid}/machines/{rot['id']}/maintenance", {"kind": "preventiva"})):
        r = chamada(url, headers=other_auth, **({"json": corpo} if corpo else {}))
        assert r.status_code == 404, url
    assert estado(client, auth, fid, "rotuladora")["age_years"] == 0


def test_apagar_maquina_com_manutencao_e_simulacao_nao_quebra(client, auth, factory):
    fid, rot = factory["id"], by_type(factory, "rotuladora")
    client.patch(f"/factories/{fid}/machines/{rot['id']}", json={"age_years": 1}, headers=auth)
    client.post(f"/factories/{fid}/machines/{rot['id']}/maintenance", json={"kind": "preventiva"}, headers=auth)
    sim = client.post(f"/factories/{fid}/play", json={"speed": 60, "duration_min": 60}, headers=auth).json()
    assert client.delete(f"/factories/{fid}/machines/{rot['id']}", headers=auth).status_code == 204
    s = client.get(f"/factories/{fid}/simulations/{sim['id']}", headers=auth)
    assert s.status_code == 200 and str(rot["id"]) not in s.json()["machine_series"] and "None" in s.json()["machine_series"]   # a leitura fica, sem o vínculo
    assert client.get(f"/factories/{fid}/maintenance", headers=auth).json() == []        # o histórico vai junto com a máquina


def test_salvar_o_desenho_mantem_a_idade_das_maquinas_que_ja_existiam_e_aceita_valores_novos(client, auth, factory):
    fid, rot = factory["id"], by_type(factory, "rotuladora")
    client.patch(f"/factories/{fid}/machines/{rot['id']}", json={"age_years": 2, "last_maintenance_date": dias_atras(150)}, headers=auth)
    client.post(f"/factories/{fid}/machines/{rot['id']}/maintenance", json={"kind": "preventiva"}, headers=auth)
    atual = client.get(f"/factories/{fid}", headers=auth).json()
    maquinas = [{"ref": f"m{m['id']}", "id": m["id"], "type": m["type"], "x": m["x"] + 5, "y": m["y"], "value": m["value"], "units_in_parallel": m["units_in_parallel"]}
                for m in atual["machines"] if m["type"] != "esteira"]                                       # a esteira sai do desenho
    ligacoes = [{"from_ref": "m" + str(c["from"]), "to_ref": "m" + str(c["to"])} for c in atual["connections"]
                if by_type(atual, "esteira")["id"] not in (c["from"], c["to"])]
    r = client.put(f"/factories/{fid}/layout", json={"machines": maquinas, "connections": ligacoes}, headers=auth)
    assert r.status_code == 200 and r.json()["ids_by_ref"][f"m{rot['id']}"] == rot["id"]                  # mesma máquina, mesmo id
    assert len(r.json()["machines"]) == 7 and next(m for m in r.json()["machines"] if m["id"] == rot["id"])["x"] == rot["x"] + 5
    w = estado(client, auth, fid, "rotuladora")
    assert w["age_years"] == 2 and w["last_maintenance_date"] == date.today().isoformat()                  # a idade e a data ficaram (sem valor novo no pedido)
    assert len(client.get(f"/factories/{fid}/maintenance", headers=auth).json()) == 1                      # e o histórico também
    # com valores novos no pedido, a máquina é atualizada no lugar
    maquinas[[m["id"] for m in atual["machines"] if m["type"] != "esteira"].index(rot["id"])].update({"age_years": 4, "last_maintenance_date": dias_atras(91)})
    client.put(f"/factories/{fid}/layout", json={"machines": maquinas, "connections": ligacoes}, headers=auth)
    w = estado(client, auth, fid, "rotuladora")
    assert w["age_years"] == 4 and w["last_maintenance_date"] == dias_atras(91) and w["months_since_maintenance"] == 3.0
    # uma máquina nova no desenho (sem id) entra do zero; id de outra fábrica é recusado
    nova = client.put(f"/factories/{fid}/layout", json={"machines": maquinas + [{"ref": "n", "type": "esteira"}]}, headers=auth).json()
    assert nova["ids_by_ref"]["n"] not in [m["id"] for m in factory["machines"]]
    outro = client.post("/factories", json={"name": "Outra"}, headers=auth).json()["id"]
    assert client.put(f"/factories/{outro}/layout", json={"machines": [{"ref": "x", "id": rot["id"], "type": "rotuladora"}]}, headers=auth).status_code == 404
    # trocar o tipo de uma máquina existente cria uma nova (não reaproveita a idade)
    trocado = client.put(f"/factories/{fid}/layout", json={"machines": [{"ref": "t", "id": rot["id"], "type": "enchedora"}]}, headers=auth).json()
    assert trocado["ids_by_ref"]["t"] != rot["id"]


def test_apagar_a_data_volta_a_contar_como_em_dia_e_omitir_mantem(client, auth, factory):
    fid, rot = factory["id"], by_type(factory, "rotuladora")
    url = f"/factories/{fid}/machines/{rot['id']}"
    client.patch(url, json={"age_years": 5, "last_maintenance_date": dias_atras(400)}, headers=auth)
    assert estado(client, auth, fid, "rotuladora")["status"] == "manutencao_atrasada"
    client.patch(url, json={"age_years": 5}, headers=auth)                                      # sem o campo: a data fica
    assert estado(client, auth, fid, "rotuladora")["last_maintenance_date"] == dias_atras(400)
    client.patch(url, json={"last_maintenance_date": None}, headers=auth)                       # null apaga: não informada = em dia
    w = estado(client, auth, fid, "rotuladora")
    assert w["last_maintenance_date"] is None and w["months_since_maintenance"] == 0 and w["status"] == "ok"
    textos = [e["text"] for e in client.get(f"/factories/{fid}/events", headers=auth).json()]
    assert any("data da última manutenção apagada" in t for t in textos)


def test_status_pela_data_atencao_e_atrasada(client, auth, factory):
    fid, rot = factory["id"], by_type(factory, "rotuladora")                                    # pós-envase: intervalo de 3 meses (1.000 h)
    url = f"/factories/{fid}/machines/{rot['id']}"
    for dias, esperado in ((30, "ok"), (80, "atencao"), (95, "manutencao_atrasada")):           # 80% do intervalo = 73 dias; 100% = 91 dias
        client.patch(url, json={"age_years": 5, "last_maintenance_date": dias_atras(dias)}, headers=auth)
        assert estado(client, auth, fid, "rotuladora")["status"] == esperado, dias
