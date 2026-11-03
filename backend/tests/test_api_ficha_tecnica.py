"""Importar a ficha técnica de uma máquina: leitura por regras, conferência, duplicidade, versões e exclusão."""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from app import datasheet as ds
from tests.conftest import by_type

# Trecho no formato em que o pypdf devolve a ficha real "Tetra Pak Pasteurizer D Base" (dados técnicos: capacidade, consumo etc.)
FICHA_TETRA_PAK = """Highlights
 Capacity up to 10,000 l/h of milk
 Compact yet service-friendly design
Application
Tetra Pak® Pasteurizer D Base for dairy applications is
designed for continuous processing and pasteurization of
market milk, yoghurt milk, cream and other low acid liquid
dairy products. The heat treatment in the pasteurizer is based on a Tetra Pak Plate Heat Exchanger.
Tetra Pak® Pasteurizer D Base
Simple yet smart pasteurization for your daily dairy applications
Working principle
As standard, Tetra Pak® Pasteurizer D Base is automated
to safeguard production. Production is strictly controlled
by production recipes with processing parameters.
Technical data
Capacity
Pasteurization
Milk and yoghurt milk (l/h) 5,000  10,000
Cream (l/h) 2,500 5,000
Processing parameters
Pasteurization temperature (°C) 74 95 82
Holding time (s) 15 300 15
Consumption data
Approx. consumption data for Tetra Pak Pasteurizer
D Base per 1,000 l of market milk for a dairy processing
2,000 – 10,000 l/h:
Steam 3 bar*  ~21 kg/h
Ice water, 3 bar, 2°C (outlet 7°C)  ~2,20 0 l/h
Rinsing water during CIP, 3 bar  ~945 l/h
• Electricity: 7 – 15 kW, depending on capacity and on
 options excluding connected sub-modules
© Tetra Pak International S.A., 2018, GB
Tetra Pak® Pasteurizer D Base
Capacity 5,000 (l/h)  2,900
Capacity 10,000 (l/h)  2,900
Tetra Pak Homogenizer M25  1,700
Tetra Pak Separator H10  2,450
"""

FICHA_ENCHEDORA = """Krones Modulfill Mini
Filler for still water in PET bottles
Technical data
Output: up to 12,000 bph
Installed power 22 kW
© Krones AG 2022
"""


def txt(conteudo: str, nome: str = "ficha.txt"):
    return {"file": (nome, conteudo.encode("utf-8"), "text/plain")}


# ------------------------------------------------------------------------------------- leitura por regras
def test_numeros_em_formato_ingles_e_brasileiro():
    assert ds.parse_number("5,000") == 5000 and ds.parse_number("5.000") == 5000 and ds.parse_number("1.234.567") == 1234567
    assert ds.parse_number("7,5") == 7.5 and ds.parse_number("7.5") == 7.5 and ds.parse_number("12") == 12
    assert ds.parse_number("5 000") == 5000                                          # espaços do PDF são ignorados
    assert ds.parse_number("abc") is None


def test_extrai_os_dados_da_ficha_da_tetra_pak():
    a = ds.analyze([FICHA_TETRA_PAK], "ficha.pdf")
    f = a["fields"]
    assert (f["maker"]["value"], f["model"]["value"]) == ("Tetra Pak", "Pasteurizer D Base")          # o modelo que mais aparece
    assert f["year"]["value"] == 2018 and "2018" in f["year"]["source_text"]
    assert f["capacity_original"]["value"] == "10.000 l/h" and f["capacity_nominal_per_hour"]["value"] == 20000   # 10.000 l/h / 0,5 L
    assert f["capacity_min_per_hour"]["value"] == 4000                                                # faixa "2,000 – 10,000 l/h" da ficha
    assert "supondo garrafa" in f["capacity_nominal_per_hour"]["note"]
    assert f["power_kw"]["value"] == 15 and "kW" in f["power_kw"]["source_text"]
    assert f["category"]["value"] == "termico" and f["category"]["confidence"] == "sugerido"
    assert f["description"]["value"].startswith("Tetra Pak") and "Working principle" not in f["description"]["value"]
    assert any("converti para garrafas/h" in w for w in a["warnings"])


def test_nao_confunde_consumo_de_agua_nem_medidas_com_capacidade():
    a = ds.analyze([FICHA_TETRA_PAK], "f.pdf")
    # 945 l/h (água de enxágue) e 2.900 (milímetros) não são capacidade
    assert a["fields"]["capacity_nominal_per_hour"]["value"] == 20000
    caps = ds.find_capacity([ln for ln in FICHA_TETRA_PAK.splitlines() if ln.strip()])
    assert {c["value"] for c in caps} == {10000, 5000, 2500, 2000}


def test_unidades_em_garrafas_nao_precisam_de_conversao():
    a = ds.analyze([FICHA_ENCHEDORA], "krones.txt")["fields"]
    assert (a["maker"]["value"], a["model"]["value"]) == ("Krones", "Modulfill Mini")
    assert a["capacity_nominal_per_hour"]["value"] == 12000 and a["capacity_nominal_per_hour"]["note"] is None
    assert a["power_kw"]["value"] == 22 and a["year"]["value"] == 2022 and a["category"]["value"] == "envase"


def test_o_que_nao_acha_fica_em_branco_com_aviso():
    a = ds.analyze(["Esta é uma máquina muito boa. Fale com o vendedor para saber mais."], "vazio.txt")
    assert a["fields"]["capacity_nominal_per_hour"]["value"] is None and a["fields"]["capacity_nominal_per_hour"]["confidence"] == "padrao"
    assert a["fields"]["category"]["value"] is None and len(a["warnings"]) >= 3
    d = ds.build_draft(a["fields"], {}, "vazio.txt")
    assert set(" ".join(d["problems"]).split(".")) and len(d["problems"]) == 3                         # nome, tipo e capacidade


def test_rascunho_usa_padroes_marcados_como_hipotese():
    a = ds.analyze([FICHA_TETRA_PAK], "f.pdf")
    d = ds.build_draft(a["fields"], {}, "f.pdf")
    assert d["problems"] == [] and d["limits"] == {"min": 30, "optimal": 100, "warning": 110, "failure": 120, "max": 125}
    assert d["standby_kw"] == 2.25 and d["variable_kw"] == 12.75                                       # 15% parado + resto variável
    assert "hipótese didática" in d["basis"] and d["stage"] == "Tratamento térmico" and d["life_hours"] == 30000
    corrigido = ds.build_draft(a["fields"], {"capacity_nominal_per_hour": 15000, "category": "envase", "limit_optimal": 90, "limit_warning": 105}, "f.pdf")
    assert corrigido["capacity_nominal_per_hour"] == 15000 and corrigido["category"] == "envase" and corrigido["stage"] == "Envase"
    assert corrigido["limits"]["optimal"] == 90 and "informado pelo usuário" in corrigido["basis"]
    assert ds.build_draft(a["fields"], {"limit_optimal": 130}, "f.pdf")["problems"]                      # fora da ordem


def test_ficha_real_da_tetra_pak_se_estiver_disponivel():
    caminho = os.getenv("DT_FICHA_EXEMPLO")
    if not caminho or not Path(caminho).exists():
        pytest.skip("defina DT_FICHA_EXEMPLO com o caminho de uma ficha técnica em PDF para rodar este teste")
    from app.imports import read_pages
    f = ds.analyze(read_pages(Path(caminho).name, Path(caminho).read_bytes()), Path(caminho).name)["fields"]
    assert f["maker"]["value"] == "Tetra Pak" and f["capacity_nominal_per_hour"]["value"] == 20000 and f["power_kw"]["value"] == 15


# ------------------------------------------------------------------------------------- API: anexar e conferir
def test_anexar_e_conferir(client, auth):
    r = client.post("/catalog/imports", files=txt(FICHA_TETRA_PAK), headers=auth)
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["status"] == "analisado" and d["fields"]["maker"]["value"] == "Tetra Pak" and d["draft"]["category"] == "termico"
    assert d["matches"] == [] and d["can_create_new"] is True and d["text_preview"]
    assert client.get(f"/catalog/imports/{d['id']}", headers=auth).json()["draft"]["name"] == "Pasteurizer D Base"
    assert [x["id"] for x in client.get("/catalog/imports", headers=auth).json()] == [d["id"]]
    assert client.post("/catalog/imports", files=txt(FICHA_TETRA_PAK), headers={}).status_code == 401


def test_conferencia_com_correcoes_sem_gravar(client, auth):
    d = client.post("/catalog/imports", files=txt(FICHA_TETRA_PAK), headers=auth).json()
    p = client.post(f"/catalog/imports/{d['id']}/preview", json={"fields": {"name": "Pasteurizador do Enzo", "capacity_nominal_per_hour": 18000, "category": "termico"}}, headers=auth).json()
    assert p["draft"]["name"] == "Pasteurizador do Enzo" and p["draft"]["capacity_nominal_per_hour"] == 18000
    assert client.get(f"/catalog/imports/{d['id']}", headers=auth).json()["draft"]["name"] == "Pasteurizer D Base"        # nada foi gravado
    assert client.post(f"/catalog/imports/{d['id']}/preview", json={"fields": {"category": "cerveja"}}, headers=auth).status_code == 422


def test_mesmo_arquivo_nao_entra_duas_vezes(client, auth):
    d = client.post("/catalog/imports", files=txt(FICHA_TETRA_PAK), headers=auth).json()
    r = client.post("/catalog/imports", files=txt(FICHA_TETRA_PAK, "outro-nome.txt"), headers=auth)
    assert r.status_code == 409 and r.json()["detail"]["document_id"] == d["id"] and "já foi anexado" in r.json()["detail"]["message"]
    # descartado pode ser analisado de novo
    assert client.delete(f"/catalog/imports/{d['id']}", headers=auth).status_code == 204
    assert client.post("/catalog/imports", files=txt(FICHA_TETRA_PAK), headers=auth).status_code == 201


def test_arquivos_invalidos(client, auth):
    assert client.post("/catalog/imports", files={"file": ("a.docx", b"PK\x03\x04 nada", "application/octet-stream")}, headers=auth).status_code == 422
    assert client.post("/catalog/imports", files={"file": ("vazio.txt", b"", "text/plain")}, headers=auth).status_code == 422
    r = client.post("/catalog/imports", files=txt("pouco texto"), headers=auth)
    assert r.status_code == 422 and "ler texto" in r.json()["detail"]["message"]
    r = client.post("/catalog/imports", files={"file": ("ruim.pdf", b"%PDF-1.4 isto nao e um pdf de verdade", "application/pdf")}, headers=auth)
    assert r.status_code == 422 and "PDF" in r.json()["detail"]["message"]


def test_pdf_de_verdade(client, auth):
    pymupdf = pytest.importorskip("pymupdf")
    doc = pymupdf.open()
    for i, bloco in enumerate(FICHA_TETRA_PAK.split("Technical data")):
        pagina = doc.new_page()
        pagina.insert_text((50, 60), (bloco if i == 0 else "Technical data" + bloco).replace("®", "").replace("°", " ").replace("©", "(c)").replace("•", "-").replace("–", "-"), fontsize=8)
    pdf = doc.tobytes()
    r = client.post("/catalog/imports", files={"file": ("ficha.pdf", pdf, "application/pdf")}, headers=auth)
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["pages"] == 2 and d["fields"]["capacity_nominal_per_hour"]["value"] == 20000 and d["fields"]["capacity_nominal_per_hour"]["page"] in (1, 2)
    assert d["fields"]["maker"]["value"] == "Tetra Pak" and d["draft"]["category"] == "termico"


# ------------------------------------------------------------------------------------- API: criar, usar na fábrica, versões
def importar(client, auth, texto=FICHA_TETRA_PAK, nome="ficha.txt", **corpo):
    d = client.post("/catalog/imports", files=txt(texto, nome), headers=auth).json()
    return d, client.post(f"/catalog/imports/{d['id']}/confirm", json={"decision": "create", **corpo}, headers=auth)


def test_criar_maquina_nova_e_usar_na_fabrica(client, auth):
    d, r = importar(client, auth)
    assert r.status_code == 200 and r.json()["action"] == "criada" and r.json()["machine_code"] == "tetra_pak_pasteurizer_d_base"
    m = client.get("/catalog/machines/tetra_pak_pasteurizer_d_base").json()
    assert m["origin"] == "importada" and m["version"] == 1 and m["family"] == "tetra_pak_pasteurizer_d_base" and m["maker"] == "Tetra Pak" and m["year"] == 2018
    assert m["category"] == "termico" and m["stage"] == "Tratamento térmico" and m["capacity_at_optimal"] == 20000
    assert m["limits"] == {"min": 30, "optimal": 100, "warning": 110, "failure": 120, "max": 125} and m["unit"] == "%"
    assert m["standby_kw"] == 2.25 and m["variable_kw"] == 12.75 and m["life_hours"] == 30000 and m["manual"]["what_it_does"]
    assert any(s["title"].startswith("Ficha técnica anexada") and s["confidence"] == "real" for s in m["sources"]) and "hipótese didática" in m["basis_of_numbers"]
    assert m["price"] is None                                                                    # a ficha não traz preço: fica "consultar o fabricante"
    assert client.get(f"/catalog/imports/{d['id']}", headers=auth).json()["status"] == "importado"
    assert client.post(f"/catalog/imports/{d['id']}/confirm", json={"decision": "create"}, headers=auth).status_code == 409      # já foi processado
    # a máquina funciona na simulação
    fid = client.post("/factories", json={"name": "Com importada"}, headers=auth).json()["id"]
    a = client.post(f"/factories/{fid}/machines", json={"type": "tanque_agua"}, headers=auth).json()
    b = client.post(f"/factories/{fid}/machines", json={"type": "tetra_pak_pasteurizer_d_base"}, headers=auth)
    assert b.status_code == 201 and b.json()["value"] == 100
    s = client.get(f"/factories/{fid}/simulate", headers=auth).json()
    assert next(x for x in s["machines"] if x["type"] == "tetra_pak_pasteurizer_d_base")["capacity"] == 20000
    # em 110% (zona de atenção) rende um pouco mais e o risco sobe
    client.patch(f"/factories/{fid}/machines/{b.json()['id']}", json={"value": 110}, headers=auth)
    s2 = client.get(f"/factories/{fid}/simulate", headers=auth).json()
    assert 20000 < next(x for x in s2["machines"] if x["type"] == "tetra_pak_pasteurizer_d_base")["capacity"] < 22000 and s2["max_risk"] > 0.02
    assert a["id"]


def test_criar_exige_dados_minimos_e_aceita_correcoes(client, auth):
    d = client.post("/catalog/imports", files=txt("Máquina boa, sem números nenhuns, só texto corrido com mais de oitenta caracteres para passar da checagem de leitura."), headers=auth).json()
    r = client.post(f"/catalog/imports/{d['id']}/confirm", json={"decision": "create"}, headers=auth)
    assert r.status_code == 422 and len(r.json()["detail"]["problems"]) == 3
    ok = client.post(f"/catalog/imports/{d['id']}/confirm", headers=auth,
                     json={"decision": "create", "fields": {"name": "Minha misturadora", "category": "preparo", "capacity_nominal_per_hour": 9000, "power_kw": 6}})
    assert ok.status_code == 200 and ok.json()["machine_code"] == "minha_misturadora"
    m = client.get("/catalog/machines/minha_misturadora").json()
    assert m["category"] == "preparo" and m["capacity_at_optimal"] == 9000 and m["standby_kw"] == 0.9 and "informado pelo usuário" in m["basis_of_numbers"]


def test_duplicidade_mostra_lado_a_lado_e_bloqueia_criar_de_novo(client, auth):
    importar(client, auth)
    segunda = FICHA_TETRA_PAK.replace("10,000 l/h", "15,000 l/h").replace("2018", "2022")          # mesma máquina, ficha atualizada
    d = client.post("/catalog/imports", files=txt(segunda, "ficha-2022.txt"), headers=auth).json()
    assert d["can_create_new"] is False and len(d["matches"]) == 1
    m = d["matches"][0]
    assert m["code"] == "tetra_pak_pasteurizer_d_base" and m["reason"] == "mesmo fabricante e modelo" and m["score"] == 1.0
    dif = {c["field"]: c for c in m["comparison"]}
    assert dif["capacity_nominal_per_hour"]["existing"] == 20000 and dif["capacity_nominal_per_hour"]["new"] == 30000 and dif["capacity_nominal_per_hour"]["different"]
    assert dif["year"]["existing"] == 2018 and dif["year"]["new"] == 2022 and dif["year"]["different"]
    assert dif["maker"]["different"] is False and dif["category"]["different"] is False and m["differences"] == 2     # só a capacidade e o ano mudaram
    r = client.post(f"/catalog/imports/{d['id']}/confirm", json={"decision": "create"}, headers=auth)
    assert r.status_code == 409 and r.json()["detail"]["matches"][0]["code"] == "tetra_pak_pasteurizer_d_base"
    forcado = client.post(f"/catalog/imports/{d['id']}/confirm", json={"decision": "create", "confirm_different": True}, headers=auth)
    assert forcado.status_code == 200 and forcado.json()["machine_code"] == "tetra_pak_pasteurizer_d_base_2"           # código novo, sem sobrescrever


def test_atualizar_sobrepoe_os_dados_da_existente(client, auth):
    importar(client, auth)
    mais_dados = FICHA_TETRA_PAK.replace("10,000 l/h", "12,000 l/h").replace("2018", "2020")
    d = client.post("/catalog/imports", files=txt(mais_dados, "atualizacao.txt"), headers=auth).json()
    r = client.post(f"/catalog/imports/{d['id']}/confirm", json={"decision": "update", "target_code": "tetra_pak_pasteurizer_d_base"}, headers=auth)
    assert r.status_code == 200 and r.json()["action"] == "atualizada" and r.json()["machine_code"] == "tetra_pak_pasteurizer_d_base"
    m = client.get("/catalog/machines/tetra_pak_pasteurizer_d_base").json()
    assert m["capacity_at_optimal"] == 24000 and m["year"] == 2020 and m["version"] == 1 and "Atualizada com a ficha técnica 'atualizacao.txt'" in m["basis_of_numbers"]
    assert len([x for x in client.get("/catalog/machines?include_inactive=true").json() if x["family"] == "tetra_pak_pasteurizer_d_base"]) == 1       # não duplicou
    assert sum(1 for s in m["sources"] if s["title"].startswith("Ficha técnica anexada")) == 2                                                          # as duas fichas viram fontes
    assert client.post(f"/catalog/imports/{client.post('/catalog/imports', files=txt(mais_dados + ' x', 'c.txt'), headers=auth).json()['id']}/confirm",
                       json={"decision": "update"}, headers=auth).status_code == 422                    # update exige target_code
    assert client.post(f"/catalog/imports/{client.post('/catalog/imports', files=txt(mais_dados + ' y', 'd.txt'), headers=auth).json()['id']}/confirm",
                       json={"decision": "update", "target_code": "nao_existe"}, headers=auth).status_code == 422


def test_atualizar_uma_maquina_que_veio_com_o_sistema(client, auth):
    d, _ = None, None
    doc = client.post("/catalog/imports", files=txt(FICHA_ENCHEDORA), headers=auth).json()
    antes = client.get("/catalog/machines/enchedora").json()
    r = client.post(f"/catalog/imports/{doc['id']}/confirm", json={"decision": "update", "target_code": "enchedora"}, headers=auth)
    assert r.status_code == 200
    depois = client.get("/catalog/machines/enchedora").json()
    assert depois["capacity_at_optimal"] == 12000 and depois["maker"] == "Krones" and depois["model"] == "Modulfill Mini" and depois["year"] == 2022
    assert depois["limits"] == antes["limits"] and depois["unit"] == antes["unit"] and depois["origin"] == "embutida"   # o ritmo e a origem não mudam
    assert d is None


def test_nova_versao_mantem_a_antiga(client, auth):
    importar(client, auth)
    nova = FICHA_TETRA_PAK.replace("10,000 l/h", "20,000 l/h").replace("2018", "2024")
    d = client.post("/catalog/imports", files=txt(nova, "v2.txt"), headers=auth).json()
    r = client.post(f"/catalog/imports/{d['id']}/confirm", json={"decision": "new_version", "target_code": "tetra_pak_pasteurizer_d_base"}, headers=auth)
    assert r.status_code == 200 and r.json()["machine_code"] == "tetra_pak_pasteurizer_d_base_v2" and "versão 2" in r.json()["action"]
    v = client.get("/catalog/machines/tetra_pak_pasteurizer_d_base/versions").json()
    assert [(x["version"], x["code"], x["capacity_at_optimal"]) for x in v] == [(1, "tetra_pak_pasteurizer_d_base", 20000), (2, "tetra_pak_pasteurizer_d_base_v2", 40000)]
    assert client.get("/catalog/machines/tetra_pak_pasteurizer_d_base_v2/versions").json() == v
    m2 = client.get("/catalog/machines/tetra_pak_pasteurizer_d_base_v2").json()
    assert m2["version"] == 2 and m2["family"] == "tetra_pak_pasteurizer_d_base" and m2["name"].endswith("(v2)") and m2["year"] == 2024
    assert client.get("/catalog/machines/tetra_pak_pasteurizer_d_base").json()["capacity_at_optimal"] == 20000        # a antiga continua igual
    # uma terceira versão
    d3 = client.post("/catalog/imports", files=txt(nova.replace("20,000", "30,000"), "v3.txt"), headers=auth).json()
    r3 = client.post(f"/catalog/imports/{d3['id']}/confirm", json={"decision": "new_version", "target_code": "tetra_pak_pasteurizer_d_base_v2"}, headers=auth)
    assert r3.json()["machine_code"] == "tetra_pak_pasteurizer_d_base_v3"
    # as duas versões podem trabalhar na mesma fábrica (a troca de máquinas leva tempo)
    fid = client.post("/factories", json={"name": "Convivência"}, headers=auth).json()["id"]
    for codigo in ("tetra_pak_pasteurizer_d_base", "tetra_pak_pasteurizer_d_base_v2"):
        assert client.post(f"/factories/{fid}/machines", json={"type": codigo}, headers=auth).status_code == 201


# ------------------------------------------------------------------------------------- API: excluir
def test_excluir_maquina_importada(client, auth):
    d, r = importar(client, auth)
    code = r.json()["machine_code"]
    fid = client.post("/factories", json={"name": "Usa"}, headers=auth).json()["id"]
    mid = client.post(f"/factories/{fid}/machines", json={"type": code}, headers=auth).json()["id"]
    bloqueio = client.delete(f"/catalog/machines/{code}", headers=auth)
    assert bloqueio.status_code == 409 and bloqueio.json()["detail"]["factories_using"] == 1 and "em uso" in bloqueio.json()["detail"]["message"]
    client.delete(f"/factories/{fid}/machines/{mid}", headers=auth)
    assert client.delete(f"/catalog/machines/{code}", headers=auth).json() == {"deleted": code}
    assert client.get(f"/catalog/machines/{code}").status_code == 404
    assert client.get(f"/catalog/imports/{d['id']}", headers=auth).json()["status"] == "descartado"
    assert not any(s["title"].startswith("Ficha técnica anexada") for s in client.get("/catalog/sources").json())     # a fonte do documento saiu junto
    assert client.post("/catalog/imports", files=txt(FICHA_TETRA_PAK), headers=auth).status_code == 201               # e dá para importar de novo


def test_maquina_que_veio_com_o_sistema_nao_se_apaga(client, auth):
    r = client.delete("/catalog/machines/enchedora", headers=auth)
    assert r.status_code == 409 and "Desative" in r.json()["detail"]["message"]
    assert client.delete("/catalog/machines/nao_existe", headers=auth).status_code == 404
    assert client.delete("/catalog/machines/enchedora").status_code == 401


def test_maquina_em_cenario_guardado_nao_e_apagada(client, auth):
    _, r = importar(client, auth)
    code = r.json()["machine_code"]
    fid = client.post("/factories", json={"name": "Foto"}, headers=auth).json()["id"]
    mid = client.post(f"/factories/{fid}/machines", json={"type": code}, headers=auth).json()["id"]
    client.post(f"/factories/{fid}/scenarios", json={"name": "com a importada"}, headers=auth)
    client.delete(f"/factories/{fid}/machines/{mid}", headers=auth)
    bloqueio = client.delete(f"/catalog/machines/{code}", headers=auth)
    assert bloqueio.status_code == 409 and "cenários" in bloqueio.json()["detail"]["message"]
    assert client.get(f"/catalog/machines/{code}").status_code == 200       # nada foi apagado pela metade


def test_nao_aceita_arquivo_grande_demais(client, auth, monkeypatch):
    from app import imports
    monkeypatch.setattr(imports, "MAX_BYTES", 100)
    r = client.post("/catalog/imports", files=txt("x" * 500), headers=auth)
    assert r.status_code == 413


def test_catalogo_somente_leitura_bloqueia_as_importacoes(tmp_path):
    import warnings
    warnings.filterwarnings("ignore")
    from fastapi.testclient import TestClient
    from app.config import Settings
    from app.main import create_app
    s = Settings()
    s.allow_catalog_edit = False
    with TestClient(create_app(f"sqlite:///{(tmp_path / 'ro.db').as_posix()}", s)) as c:
        h = {"Authorization": "Bearer " + c.post("/auth/login", json={"username": "victor.dias", "password": "senha1234"}).json()["access_token"]}
        assert c.post("/catalog/imports", files=txt(FICHA_TETRA_PAK), headers=h).status_code == 403
        assert c.patch("/catalog/machines/enchedora/limits", json={"optimal": 190}, headers=h).status_code == 403
        assert c.get("/catalog/machines").status_code == 200


def test_nomes_nunca_se_repetem_na_lista(client, auth):
    importar(client, auth)
    d = client.post("/catalog/imports", files=txt(FICHA_TETRA_PAK.replace("10,000 l/h", "30,000 l/h"), "v2.txt"), headers=auth).json()
    # o front manda o nome que está na tela (o mesmo da v1): o servidor diferencia sozinho
    r = client.post(f"/catalog/imports/{d['id']}/confirm", json={"decision": "new_version", "target_code": "tetra_pak_pasteurizer_d_base",
                                                                "fields": {"name": "Pasteurizer D Base"}}, headers=auth).json()
    assert client.get(f"/catalog/machines/{r['machine_code']}").json()["name"] == "Pasteurizer D Base (v2)"
    d3 = client.post("/catalog/imports", files=txt(FICHA_TETRA_PAK.replace("10,000 l/h", "11,000 l/h"), "outra.txt"), headers=auth).json()
    r3 = client.post(f"/catalog/imports/{d3['id']}/confirm", json={"decision": "create", "confirm_different": True}, headers=auth).json()
    assert client.get(f"/catalog/machines/{r3['machine_code']}").json()["name"] == "Pasteurizer D Base (2)"
    nomes = [m["name"] for m in client.get("/catalog/machines").json()]
    assert len(nomes) == len(set(n.lower() for n in nomes))


def test_ano_com_c_entre_parenteses():
    assert ds.analyze(["Tetra Pak Foo Bar\n(c) Tetra Pak International S.A., 2022, GB\nCapacity up to 12,000 bph"], "x.txt")["fields"]["year"]["value"] == 2022
    assert ds.analyze(["Tetra Pak Foo Bar\nCopyright 2019 Tetra Pak"], "x.txt")["fields"]["year"]["value"] == 2019
