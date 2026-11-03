"""Login, catálogo, manuais, fontes, glossário e efeitos da temperatura."""
from __future__ import annotations

import time

from app.security import confere_senha, criar_token, hash_senha, ler_token
from tests.helpers import catalog_from_front


def test_saude_e_dados_iniciais(client):
    h = client.get("/health").json()
    assert h["status"] == "ok" and h["tables"] == 25 and h["rows"] == 345 and h["database"] in ("sqlite", "postgresql")


def test_login_correto_e_errado(client):
    ok = client.post("/auth/login", json={"username": "victor.dias", "password": "senha1234"})
    assert ok.status_code == 200 and ok.json()["token_type"] == "bearer" and ok.json()["user"]["username"] == "victor.dias"
    assert "senha" not in str(ok.json()["user"]).lower().replace("senha1234", "")
    assert client.post("/auth/login", json={"username": "victor.dias", "password": "errada"}).status_code == 401
    assert client.post("/auth/login", json={"username": "ninguem", "password": "senha1234"}).status_code == 401
    # o login não diferencia maiúsculas do usuário
    assert client.post("/auth/login", json={"username": "VICTOR.DIAS", "password": "senha1234"}).status_code == 200


def test_rotas_protegidas_exigem_login(client):
    assert client.get("/factories").status_code == 401
    assert client.get("/factories", headers={"Authorization": "Bearer lixo"}).status_code == 401
    assert client.get("/auth/me").status_code == 401


def test_cadastro_e_perfil(client):
    r = client.post("/auth/register", json={"username": "ana.souza", "display_name": "Ana Souza", "password": "abc12345"})
    assert r.status_code == 201
    h = {"Authorization": "Bearer " + r.json()["access_token"]}
    assert client.get("/auth/me", headers=h).json()["display_name"] == "Ana Souza"
    assert client.post("/auth/register", json={"username": "ANA.SOUZA", "password": "abc12345"}).status_code == 409
    assert client.post("/auth/register", json={"username": "x", "password": "abc12345"}).status_code == 422
    assert client.post("/auth/register", json={"username": "okname", "password": "123"}).status_code == 422
    # trocar a senha exige a atual
    assert client.patch("/auth/me", json={"new_password": "novasenha1"}, headers=h).status_code == 403
    assert client.patch("/auth/me", json={"current_password": "abc12345", "new_password": "novasenha1"}, headers=h).status_code == 200
    assert client.post("/auth/login", json={"username": "ana.souza", "password": "abc12345"}).status_code == 401
    assert client.post("/auth/login", json={"username": "ana.souza", "password": "novasenha1"}).status_code == 200


def test_senha_e_token():
    h = hash_senha("segredo")
    assert h.startswith("pbkdf2_sha256$100000$") and "segredo" not in h
    assert confere_senha("segredo", h) and not confere_senha("outra", h)
    assert not confere_senha("x", "lixo") and not confere_senha("x", "md5$1$a$b")
    t = criar_token(7, "fulano", "chave", 5)
    assert ler_token(t, "chave")["sub"] == 7
    assert ler_token(t, "outra-chave") is None                       # assinatura errada
    cab, corpo, assin = t.split(".")
    assert ler_token(f"{cab}.{corpo[:-2]}xx.{assin}", "chave") is None  # adulterado
    assert ler_token(criar_token(7, "f", "chave", -1), "chave") is None  # vencido
    assert ler_token("isto.nao.eh", "chave") is None


def test_catalogo_do_banco_e_igual_ao_do_front(client):
    """Os números que o front usa e os que estão no banco são os mesmos."""
    front = catalog_from_front()
    lista = client.get("/catalog/machines").json()
    assert {m["code"] for m in lista} == set(front) and len(lista) == 14
    for m in lista:
        t = front[m["code"]]
        lim = m["limits"]
        assert (lim["min"], lim["optimal"], lim["warning"], lim["failure"], lim["max"]) == (t.min, t.opt, t.warn, t.crit, t.max)
        assert m["capacity_at_optimal"] == t.cap and m["standby_kw"] == t.sb and m["variable_kw"] == t.vr
        assert m["process_order"] == t.rank and m["thermal_sensitivity"] == t.heat and m["name"] == t.name
        assert m["category"] == t.cat and m["flow"] == t.flow


def test_filtros_do_catalogo(client):
    assert {m["category"] for m in client.get("/catalog/machines?category=envase").json()} == {"envase"}
    assert all(m["flow"] == "suco" for m in client.get("/catalog/machines?flow=suco").json())
    # a busca olha nome e descrição (a câmara fria também cita a pasteurização)
    achadas = [m["code"] for m in client.get("/catalog/machines?q=pasteuriz").json()]
    assert "pasteurizador" in achadas and "enchedora" not in achadas
    assert [m["code"] for m in client.get("/catalog/machines?q=rotuladora").json()] == ["rotuladora"]
    assert client.get("/catalog/machines?flow=xx").status_code == 422


def test_maquina_completa_com_manual_fontes_e_preco(client):
    m = client.get("/catalog/machines/enchedora").json()
    assert m["manual"]["what_it_does"] and m["description"] and m["physical_risk"] and m["basis_of_numbers"]
    assert m["price"]["min"] > 0 and m["price"]["max"] >= m["price"]["min"] and m["price"]["edited_by_user"] is False
    assert any(s["url"].startswith("http") for s in m["sources"])
    assert all(s["confidence"] in ("real", "estimado") for s in m["sources"])
    assert client.get("/catalog/machines/nao_existe").status_code == 404


def test_ajuste_de_limites_so_logado_e_com_regra(client, auth):
    corpo = {"optimal": 190, "warning": 220}
    assert client.patch("/catalog/machines/enchedora/limits", json=corpo).status_code == 401
    r = client.patch("/catalog/machines/enchedora/limits", json=corpo, headers=auth)
    assert r.status_code == 200 and r.json()["limits"]["optimal"] == 190 and r.json()["limits"]["failure"] == 245
    # fora da ordem: ótimo > atenção
    bad = client.patch("/catalog/machines/enchedora/limits", json={"optimal": 230, "warning": 220}, headers=auth)
    assert bad.status_code == 422 and "mínimo" in bad.json()["detail"]["message"]
    # acima do máximo da máquina
    assert client.patch("/catalog/machines/enchedora/limits", json={"failure": 999}, headers=auth).status_code == 422


def test_preco_novo_guarda_historico(client, auth):
    antes = client.get("/health").json()["rows_by_table"]["precos_maquina"]
    r = client.put("/catalog/machines/esteira/price", json={"min": 10000, "max": 20000, "note": "cotei com o fornecedor"}, headers=auth)
    assert r.status_code == 200 and r.json()["price"] == {"min": 10000.0, "max": 20000.0, "note": "cotei com o fornecedor", "edited_by_user": True, "sources": r.json()["price"]["sources"]}
    assert client.get("/health").json()["rows_by_table"]["precos_maquina"] == antes + 1
    assert client.put("/catalog/machines/esteira/price", json={"min": 30, "max": 20}, headers=auth).status_code == 422


def test_categorias_tipos_de_maquina(client, auth):
    cats = client.get("/catalog/categories").json()
    assert [c["code"] for c in cats] == ["insumos", "preparo", "termico", "envase", "pos", "frio"]
    assert sum(c["machine_count"] for c in cats) == 14
    novo = client.post("/catalog/categories", json={"code": "embalagem", "name": "Embalagem"}, headers=auth)
    assert novo.status_code == 201 and novo.json()["machine_count"] == 0
    assert client.post("/catalog/categories", json={"code": "embalagem", "name": "Outra"}, headers=auth).status_code == 409
    assert client.patch("/catalog/categories/embalagem", json={"name": "Embalagens", "active": False}, headers=auth).json()["active"] is False
    assert client.delete("/catalog/categories/embalagem", headers=auth).status_code == 204
    # categoria com máquinas não pode ser apagada: desative
    assert client.delete("/catalog/categories/envase", headers=auth).status_code == 409
    # mudar a categoria de uma máquina
    assert client.patch("/catalog/machines/esteira", json={"category": "envase"}, headers=auth).json()["category"] == "envase"
    assert client.patch("/catalog/machines/esteira", json={"category": "nada"}, headers=auth).status_code == 404


def test_maquina_desativada_some_da_lista_e_nao_entra_na_fabrica(client, auth, factory):
    client.patch("/catalog/machines/esteira", json={"active": False}, headers=auth)
    assert "esteira" not in {m["code"] for m in client.get("/catalog/machines").json()}
    assert "esteira" in {m["code"] for m in client.get("/catalog/machines?include_inactive=true").json()}
    r = client.post(f"/factories/{factory['id']}/machines", json={"type": "esteira"}, headers=auth)
    assert r.status_code == 422 and "desativada" in r.json()["detail"]["message"]


def test_fontes_modelos_etapas_glossario(client):
    fontes = client.get("/catalog/sources").json()
    assert len(fontes) == 39 and {f["confidence"] for f in fontes} <= {"real", "estimado", "hipotese"}
    assert all(f["url"] for f in client.get("/catalog/sources?confidence=real").json())
    assert len(client.get("/catalog/real-models").json()) == 18
    assert all(m["machine"] == "enchedora" for m in client.get("/catalog/real-models?machine=enchedora").json())
    assert len(client.get("/catalog/stages").json()) == 10
    g = client.get("/glossary").json()
    assert len(g) == 38 and all(t["keywords"] for t in g)
    assert [t["term"] for t in client.get("/glossary?q=lavoisier").json()]
    assert all(t["group"] == "Energia e dinheiro" for t in client.get("/glossary?group=Energia e dinheiro").json())


def test_efeitos_da_temperatura(client):
    quente = client.get("/ambient/effects?temperature=35").json()
    tanque = next(m for m in quente["machines"] if m["type"] == "tanque_agua")
    assert abs(tanque["capacity_factor"] - 0.96) < 1e-9 and abs(tanque["capacity_lost_pct"] - 4) < 1e-9
    assert next(m for m in quente["machines"] if m["type"] == "camara_fria")["capacity_factor"] == 0.85
    assert quente["water"]["extra_liters_vs_20c"] > 0 and {b["confidence"] for b in quente["basis"]} == {"real", "hipotese"}
    neutro = client.get("/ambient/effects?temperature=25").json()
    assert all(m["capacity_lost_pct"] == 0 for m in neutro["machines"])
    assert client.get("/ambient/effects?temperature=99").status_code == 422
