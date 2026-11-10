"""Montar a fábrica: criar, máquinas, conexões, regras do processo, dono da fábrica e integridade."""
from __future__ import annotations

from tests.conftest import by_type


def test_exemplos_prontos(client, auth):
    ex = client.get("/templates").json()
    assert {e["key"] for e in ex} == {"bebidas", "suco", "cocacola_jundiai", "slmg_chhata", "refres_now_manaos", "coca_cola_canners", "quilmes_gatorade", "quilmes_gatorade_antes", "refriko_sjp", "tial_antes", "tial", "tannourine"}
    b = client.post("/factories", json={"name": "A", "template": "bebidas"}, headers=auth).json()
    s = client.post("/factories", json={"name": "B", "template": "suco"}, headers=auth).json()
    assert len(b["machines"]) == 8 and len(b["connections"]) == 7 and b["example"] == "bebidas"
    assert len(s["machines"]) == 6 and len(s["connections"]) == 5 and s["example"] == "suco"


def test_fabrica_em_branco_e_nome_repetido(client, auth):
    r = client.post("/factories", json={"name": "Vazia", "ambient": 30, "tariff": 1.1}, headers=auth)
    assert r.status_code == 201 and r.json()["machines"] == [] and r.json()["ambient"] == 30 and r.json()["tariff"] == 1.1
    assert client.post("/factories", json={"name": "Vazia"}, headers=auth).status_code == 409
    assert client.post("/factories", json={"name": "  "}, headers=auth).status_code == 422
    assert client.post("/factories", json={"name": "X", "ambient": 50}, headers=auth).status_code == 422
    assert client.post("/factories", json={"name": "X", "template": "cerveja"}, headers=auth).status_code == 404           # exemplo que não existe
    assert client.post("/factories", json={"name": "X", "template": "Cerveja!"}, headers=auth).status_code == 422          # nome inválido


def test_cada_usuario_so_ve_as_suas_fabricas(client, auth, other_auth, factory):
    assert client.get(f"/factories/{factory['id']}", headers=auth).status_code == 200
    for chamada in (client.get, client.delete):
        assert chamada(f"/factories/{factory['id']}", headers=other_auth).status_code == 404
    assert client.get(f"/factories/{factory['id']}/simulate", headers=other_auth).status_code == 404
    assert client.post(f"/factories/{factory['id']}/machines", json={"type": "esteira"}, headers=other_auth).status_code == 404
    assert client.get("/factories", headers=other_auth).json() == []
    # o mesmo nome pode existir para pessoas diferentes
    assert client.post("/factories", json={"name": "Teste"}, headers=other_auth).status_code == 201


def test_mudar_nome_temperatura_tarifa_e_emergencia(client, auth, factory):
    fid = factory["id"]
    r = client.patch(f"/factories/{fid}", json={"name": "Novo nome", "ambient": 35, "tariff": 0.9, "emergency_stop": True}, headers=auth).json()
    assert (r["name"], r["ambient"], r["tariff"], r["emergency_stop"]) == ("Novo nome", 35, 0.9, True)
    sim = client.get(f"/factories/{fid}/simulate", headers=auth).json()
    assert sim["production_per_hour"] == 0 and sim["emergency_stop"] is True   # emergência para tudo
    client.patch(f"/factories/{fid}", json={"emergency_stop": False}, headers=auth)
    assert client.get(f"/factories/{fid}/simulate", headers=auth).json()["production_per_hour"] > 0
    assert client.patch(f"/factories/{fid}", json={"ambient": 46}, headers=auth).status_code == 422
    textos = [e["text"] for e in client.get(f"/factories/{fid}/events", headers=auth).json()]
    assert any("PARADA DE EMERGÊNCIA" in t for t in textos) and any("35 °C" in t for t in textos) and any("religada" in t for t in textos)


def test_colocar_mudar_e_tirar_maquina(client, auth):
    fid = client.post("/factories", json={"name": "Montagem"}, headers=auth).json()["id"]
    m = client.post(f"/factories/{fid}/machines", json={"type": "enchedora", "x": 100, "y": 50}, headers=auth)
    assert m.status_code == 201 and m.json()["value"] == 200 and m.json()["units_in_parallel"] == 1   # entra no ritmo ótimo
    mid = m.json()["id"]
    r = client.patch(f"/factories/{fid}/machines/{mid}", json={"value": 225, "units_in_parallel": 2}, headers=auth).json()
    assert r["machine"]["value"] == 225 and r["machine"]["units_in_parallel"] == 2
    assert r["simulation"]["machines"][0]["state"] == "alerta"
    # ritmo fora da faixa da máquina
    assert client.patch(f"/factories/{fid}/machines/{mid}", json={"value": 999}, headers=auth).status_code == 422
    assert client.patch(f"/factories/{fid}/machines/{mid}", json={"value": 50}, headers=auth).status_code == 422
    assert client.patch(f"/factories/{fid}/machines/{mid}", json={"units_in_parallel": 7}, headers=auth).status_code == 422
    assert client.patch(f"/factories/{fid}/machines/{mid}", json={"off": True}, headers=auth).json()["simulation"]["machines"][0]["state"] == "desligada"
    assert client.patch(f"/factories/{fid}/machines/9999", json={"off": True}, headers=auth).status_code == 404
    assert client.post(f"/factories/{fid}/machines", json={"type": "inexistente"}, headers=auth).status_code == 404
    assert client.post(f"/factories/{fid}/machines", json={"type": "enchedora", "value": 5}, headers=auth).status_code == 422
    assert client.delete(f"/factories/{fid}/machines/{mid}", headers=auth).status_code == 204
    assert client.get(f"/factories/{fid}", headers=auth).json()["machines"] == []
    assert client.delete(f"/factories/{fid}/machines/{mid}", headers=auth).status_code == 404


def test_tirar_maquina_leva_as_conexoes_junto(client, auth, factory):
    esteira = by_type(factory, "esteira")
    assert client.delete(f"/factories/{factory['id']}/machines/{esteira['id']}", headers=auth).status_code == 204
    f = client.get(f"/factories/{factory['id']}", headers=auth).json()
    assert len(f["machines"]) == 7 and len(f["connections"]) == 5
    assert all(esteira["id"] not in (c["from"], c["to"]) for c in f["connections"])


def test_regras_de_conexao_com_explicacao(client, auth):
    fid = client.post("/factories", json={"name": "Regras"}, headers=auth).json()["id"]
    ids = {t: client.post(f"/factories/{fid}/machines", json={"type": t}, headers=auth).json()["id"]
           for t in ("tanque_agua", "tanque_xarope", "misturador", "enchedora", "rotuladora", "recepcao_fruta", "carbonatador", "pasteurizador", "camara_fria")}
    ligar = lambda a, b: client.post(f"/factories/{fid}/connections", json={"from_id": ids[a], "to_id": ids[b]}, headers=auth)  # noqa: E731

    assert ligar("tanque_agua", "tanque_xarope").status_code == 201
    assert ligar("tanque_agua", "tanque_xarope").status_code == 422          # já ligadas
    r = ligar("tanque_xarope", "tanque_agua")                               # fecharia um círculo
    assert r.status_code == 422 and r.json()["detail"]["level"] == "block" and "círculo" in r.json()["detail"]["message"]
    assert "começo do processo" in ligar("enchedora", "tanque_agua").json()["detail"]["message"]
    assert "ela mesma" in ligar("enchedora", "enchedora").json()["detail"]["message"]
    assert "vem antes" in ligar("enchedora", "misturador").json()["detail"]["message"]
    assert "última etapa" in ligar("camara_fria", "carbonatador").json()["detail"]["message"]
    assert "fluxos diferentes" in ligar("recepcao_fruta", "misturador").json()["detail"]["message"]
    # só o misturador junta origens diferentes
    assert ligar("tanque_xarope", "misturador").status_code == 201
    # a água já alimenta o xarope: uma máquina só alimenta várias de uma vez se forem do mesmo tipo
    assert "mesmo tipo" in ligar("tanque_agua", "misturador").json()["detail"]["message"]
    # ligação que pula etapas é permitida com aviso
    aviso = ligar("misturador", "enchedora")
    assert aviso.status_code == 201 and aviso.json()["warning"] and "pula" in aviso.json()["warning"]
    # consulta sem gravar
    chk = client.get(f"/factories/{fid}/connections/check", params={"from_id": ids["carbonatador"], "to_id": ids["pasteurizador"]}, headers=auth).json()
    assert chk["ok"] is False and chk["level"] == "block" and chk["message"]
    antes = len(client.get(f"/factories/{fid}", headers=auth).json()["connections"])
    client.get(f"/factories/{fid}/connections/check", params={"from_id": ids["tanque_agua"], "to_id": ids["enchedora"]}, headers=auth)
    assert len(client.get(f"/factories/{fid}", headers=auth).json()["connections"]) == antes


def test_nao_cria_circulo_nem_liga_maquinas_de_outra_fabrica(client, auth, factory):
    fid = factory["id"]
    agua, xarope = by_type(factory, "tanque_agua"), by_type(factory, "tanque_xarope")
    r = client.post(f"/factories/{fid}/connections", json={"from_id": xarope["id"], "to_id": agua["id"]}, headers=auth)
    assert r.status_code == 422
    outra = client.post("/factories", json={"name": "Outra"}, headers=auth).json()["id"]
    estranha = client.post(f"/factories/{outra}/machines", json={"type": "rotuladora"}, headers=auth).json()["id"]
    r = client.post(f"/factories/{fid}/connections", json={"from_id": agua["id"], "to_id": estranha}, headers=auth)
    assert r.status_code == 422        # a máquina não existe NESTA fábrica


def test_divisao_de_fluxo_em_paralelo(client, auth, factory):
    """Uma máquina pode alimentar várias do mesmo tipo (linhas em paralelo), e a produção soma."""
    fid = factory["id"]
    base = client.get(f"/factories/{fid}/simulate", headers=auth).json()["production_per_hour"]
    past = by_type(factory, "pasteurizador")
    segunda = client.post(f"/factories/{fid}/machines", json={"type": "pasteurizador", "x": 730, "y": 150}, headers=auth).json()
    misturador, carbonatador = by_type(factory, "misturador"), by_type(factory, "carbonatador")
    assert client.post(f"/factories/{fid}/connections", json={"from_id": misturador["id"], "to_id": segunda["id"]}, headers=auth).status_code == 201
    assert client.post(f"/factories/{fid}/connections", json={"from_id": segunda["id"], "to_id": carbonatador["id"]}, headers=auth).status_code == 201
    f = client.get(f"/factories/{fid}", headers=auth).json()
    kinds = {c["kind"] for c in f["connections"]}
    assert "divisão" in kinds and "junção" in kinds
    # fábrica continua limitada pela rotuladora
    assert client.get(f"/factories/{fid}/simulate", headers=auth).json()["production_per_hour"] == base
    # misturador ainda não aceita mandar para tipos diferentes
    r = client.post(f"/factories/{fid}/connections", json={"from_id": misturador["id"], "to_id": by_type(factory, "enchedora")["id"]}, headers=auth)
    assert r.status_code == 422 and "mesmo tipo" in r.json()["detail"]["message"]
    assert past["id"] != segunda["id"]


def test_apagar_conexao_e_limpar_tudo(client, auth, factory):
    fid = factory["id"]
    cid = factory["connections"][0]["id"]
    assert client.delete(f"/factories/{fid}/connections/{cid}", headers=auth).status_code == 204
    assert client.delete(f"/factories/{fid}/connections/{cid}", headers=auth).status_code == 404
    assert client.delete(f"/factories/{fid}/machines", headers=auth).status_code == 204
    f = client.get(f"/factories/{fid}", headers=auth).json()
    assert f["machines"] == [] and f["connections"] == []


def test_salvar_o_desenho_inteiro(client, auth):
    fid = client.post("/factories", json={"name": "Quadro"}, headers=auth).json()["id"]
    corpo = {"machines": [{"ref": "a", "type": "tanque_agua", "x": 10, "y": 20}, {"ref": "b", "type": "tanque_xarope", "value": 1300, "units_in_parallel": 2},
                          {"ref": "c", "type": "misturador", "off": True}],
             "connections": [{"from_ref": "a", "to_ref": "b"}, {"from_ref": "b", "to_ref": "c"}]}
    r = client.put(f"/factories/{fid}/layout", json=corpo, headers=auth)
    assert r.status_code == 200 and set(r.json()["ids_by_ref"]) == {"a", "b", "c"} and len(r.json()["connections"]) == 2
    b = next(m for m in r.json()["machines"] if m["type"] == "tanque_xarope")
    assert b["value"] == 1300 and b["units_in_parallel"] == 2
    # substitui: salvar de novo troca tudo
    r2 = client.put(f"/factories/{fid}/layout", json={"machines": [{"ref": "z", "type": "enchedora"}]}, headers=auth)
    assert len(r2.json()["machines"]) == 1 and r2.json()["connections"] == []
    # inválido não muda nada (conexão proibida)
    ruim = {"machines": [{"ref": "a", "type": "rotuladora"}, {"ref": "b", "type": "tanque_agua"}], "connections": [{"from_ref": "a", "to_ref": "b"}]}
    assert client.put(f"/factories/{fid}/layout", json=ruim, headers=auth).status_code == 422
    assert len(client.get(f"/factories/{fid}", headers=auth).json()["machines"]) == 1
    assert client.put(f"/factories/{fid}/layout", json={"machines": [{"ref": "a", "type": "x"}]}, headers=auth).status_code == 404
    assert client.put(f"/factories/{fid}/layout", json={"machines": [{"ref": "a", "type": "enchedora"}, {"ref": "a", "type": "enchedora"}]}, headers=auth).status_code == 422
    assert client.put(f"/factories/{fid}/layout", json={"machines": [{"ref": "a", "type": "enchedora"}], "connections": [{"from_ref": "a", "to_ref": "q"}]}, headers=auth).status_code == 422


def test_apagar_fabrica_apaga_tudo_dela(client, auth, factory):
    fid = factory["id"]
    client.post(f"/factories/{fid}/scenarios", json={"name": "foto"}, headers=auth)
    client.post(f"/factories/{fid}/plans", json={"type": "pct", "value": 10}, headers=auth)
    client.post(f"/factories/{fid}/play", json={"speed": 60, "duration_min": 30}, headers=auth)
    client.post(f"/factories/{fid}/chat", json={"text": "onde está o gargalo?"}, headers=auth)
    antes = client.get("/health").json()["rows_by_table"]
    assert client.delete(f"/factories/{fid}", headers=auth).status_code == 204
    depois = client.get("/health").json()["rows_by_table"]
    assert depois["fabricas"] == antes["fabricas"] - 1
    for tabela in ("fabrica_maquinas", "conexoes", "cenarios", "cenario_maquinas", "simulacoes", "planos_objetivo", "plano_passos"):
        assert depois[tabela] < antes[tabela], tabela
    assert client.get(f"/factories/{fid}", headers=auth).status_code == 404


def test_o_registro_guarda_o_que_o_usuario_faz(client, auth):
    fid = client.post("/factories", json={"name": "Log"}, headers=auth).json()["id"]
    mid = client.post(f"/factories/{fid}/machines", json={"type": "enchedora"}, headers=auth).json()["id"]
    client.patch(f"/factories/{fid}/machines/{mid}", json={"value": 250}, headers=auth)
    client.patch(f"/factories/{fid}/machines/{mid}", json={"units_in_parallel": 3, "off": True}, headers=auth)
    ev = client.get(f"/factories/{fid}/events", headers=auth).json()
    textos = [e["text"] for e in ev]
    assert any("Adicionou: Enchedora" in t for t in textos)
    assert any("cadência 200,00 → 250,00 gf/min" in t for t in textos)
    assert any("3 unidade(s) em paralelo" in t for t in textos) and any("desligada" in t for t in textos)
    assert next(e for e in ev if "250" in e["text"])["kind"] == "bad"          # passou do limite: falha
    assert all(e["kind"] == "bad" for e in client.get(f"/factories/{fid}/events?kind=bad", headers=auth).json())
    assert len(client.get(f"/factories/{fid}/events?limit=2", headers=auth).json()) == 2
    assert client.get(f"/factories/{fid}/events?kind=xx", headers=auth).status_code == 422
    assert client.delete(f"/factories/{fid}/events", headers=auth).json()["deleted"] >= 4
    assert client.get(f"/factories/{fid}/events", headers=auth).json() == []
