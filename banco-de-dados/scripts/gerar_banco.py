#!/usr/bin/env python3
"""Gera tudo da base de dados a partir do modelo (scripts/modelo.py) e dos dados do front (dados/dados_iniciais.json).

Saídas (todas versionadas no repositório):
  sql/01_schema_sqlite.sql      comandos CREATE TABLE para SQLite
  sql/01_schema_postgres.sql    comandos CREATE TABLE para PostgreSQL (com comentários nas tabelas e colunas)
  sql/02_dados_iniciais.sql     dados iniciais (INSERT), iguais para os dois bancos
  sql/02b_ajustar_sequencias_postgres.sql   acerta os contadores automáticos do PostgreSQL depois do INSERT
  digital_twin.db               banco SQLite pronto (esquema + views + dados iniciais)
  der/der_*.mmd                 diagramas entidade-relacionamento (Mermaid)
  docs/dicionario-de-dados.md   dicionário de dados

Uso:  python scripts/gerar_banco.py
Requer: SQLAlchemy 2.x (só para gerar os arquivos; o banco entregue funciona sem ela).
"""
from __future__ import annotations

import base64
import hashlib
import json
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.schema import CreateIndex, CreateTable, SetColumnComment, SetTableComment

import modelo as M

RAIZ = Path(__file__).resolve().parent.parent
SQL_DIR, DER_DIR, DOCS_DIR = RAIZ / "sql", RAIZ / "der", RAIZ / "docs"
BANCO = RAIZ / "digital_twin.db"
DADOS = json.loads((RAIZ / "dados" / "dados_iniciais.json").read_text(encoding="utf-8"))
BASE_TEMPO = datetime(2026, 10, 18, 9, 0, 0)


# =====================================================================================================
# 1) ESQUEMA (CREATE TABLE) PARA SQLITE E POSTGRESQL
# =====================================================================================================
def gerar_esquema(dialeto, nome: str) -> str:
    sqlite_ = nome == "sqlite"
    topo = [
        f"-- Digital Twin Industrial: esquema da base de dados ({'SQLite' if sqlite_ else 'PostgreSQL'}).",
        "-- Gerado por scripts/gerar_banco.py a partir de scripts/modelo.py. Não edite à mão: edite o modelo e gere de novo.",
        "",
    ]
    if sqlite_:
        topo += ["PRAGMA foreign_keys = ON;  -- o SQLite só confere as chaves estrangeiras se isto estiver ligado", ""]
    corpo: list[str] = []
    for tabela in M.metadata.sorted_tables:
        corpo.append(f"-- {tabela.comment}")
        corpo.append(str(CreateTable(tabela).compile(dialect=dialeto)).strip() + ";")
        for ix in sorted(tabela.indexes, key=lambda i: i.name):
            corpo.append(str(CreateIndex(ix).compile(dialect=dialeto)).strip() + ";")
        corpo.append("")
    if not sqlite_:  # o PostgreSQL guarda comentários de tabela e coluna dentro do banco
        corpo.append("-- Comentários (documentação dentro do banco)")
        for tabela in M.metadata.sorted_tables:
            corpo.append(str(SetTableComment(tabela).compile(dialect=dialeto)).strip() + ";")
            for col in tabela.columns:
                if col.comment:
                    corpo.append(str(SetColumnComment(col).compile(dialect=dialeto)).strip() + ";")
        corpo.append("")
    return "\n".join(topo + corpo)


# =====================================================================================================
# 2) DADOS INICIAIS
# =====================================================================================================
def lit(v) -> str:
    """Valor em SQL (texto com aspas, NULL, TRUE/FALSE, números)."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return repr(round(v, 6))
    if isinstance(v, datetime):
        return "'" + v.strftime("%Y-%m-%d %H:%M:%S") + "'"
    return "'" + str(v).replace("'", "''") + "'"


def senha_hash(usuario: str, senha: str) -> str:
    """PBKDF2-SHA256 com sal (sal fixo por usuário só para o seed ser reproduzível)."""
    sal = hashlib.sha256(usuario.encode()).hexdigest()[:16]
    dk = hashlib.pbkdf2_hmac("sha256", senha.encode(), sal.encode(), 100_000)
    return f"pbkdf2_sha256$100000${sal}${base64.b64encode(dk).decode()}"


def br(n: float) -> str:
    return f"{round(n):,}".replace(",", ".")


class Semente:
    """Guarda as linhas a inserir, tabela por tabela, e atribui os ids em sequência."""

    def __init__(self) -> None:
        self.linhas: dict[str, list[dict]] = {t.name: [] for t in M.metadata.sorted_tables}

    def add(self, tabela: str, **cols) -> int:
        n = len(self.linhas[tabela]) + 1
        tem_id = "id" in M.metadata.tables[tabela].c  # manuais_maquina e maquina_fontes não têm coluna id
        self.linhas[tabela].append({"id": n, **cols} if tem_id else cols)
        return n


def tipo_da_fonte(url: str | None, titulo: str, confianca: str, finalidade: str) -> str:
    if url is None:
        return "hipótese do projeto"
    h = url.lower()
    if "doi.org" in h or "researchgate" in h:
        return "artigo científico"
    if "tetrapak.com" in h:
        return "ficha técnica" if confianca == "real" else "página do fabricante"
    if any(x in h for x in ("krones.com", "sidel.com", "khs.com")):
        return "página do fabricante"
    if "dornerconveyors" in h:
        return "página do fabricante"
    if any(x in h for x in ("ital.agricultura", "alimentossemmitos")):
        return "divulgação técnica"
    if "unicef" in h:
        return "compra pública (referência)"
    if any(x in h for x in ("directindustry", "petnology", "beveragedaily", "rawjuicery")):
        return "site especializado / imprensa"
    return "anúncio de fornecedor" if finalidade == "preco" else "página de fornecedor"


def montar_sementes() -> Semente:
    s = Semente()
    t = lambda minutos: BASE_TEMPO + timedelta(minutes=minutos)  # noqa: E731

    # ---- usuários (senha de demonstração: senha1234; o front ainda não confere senha) ----
    usuarios = [("victor.dias", "Victor Rafael de Oliveira Dias"), ("enzo.fernandes", "Enzo Fernandes")]
    uid = {}
    for i, (login, nome) in enumerate(usuarios):
        uid[login] = s.add("usuarios", nome_usuario=login, nome_exibicao=nome, senha_hash=senha_hash(login, "senha1234"),
                           ativo=True, criado_em=t(i), ultimo_acesso_em=t(30 + i))

    # ---- catálogo ----
    cat_id = {c["codigo"]: s.add("categorias", codigo=c["codigo"], nome=c["nome"], descricao=c["descricao"], icone=c["icone"], ativa=True, ordem=c["ordem"]) for c in DADOS["categorias"]}
    etapa_id = {e["nome"]: s.add("etapas", nome=e["nome"], zona=e["zona"]) for e in DADOS["etapas"]}

    fonte_id: dict[str, int] = {}
    na_base = set(DADOS["urls_base_conhecimento"])

    def fonte(titulo: str, url: str | None, confianca: str, finalidade: str = "numeros") -> int:
        chave = url or titulo
        if chave not in fonte_id:
            fonte_id[chave] = s.add("fontes", titulo=titulo, url=url, tipo=tipo_da_fonte(url, titulo, confianca, finalidade), confianca=confianca, na_base_conhecimento=bool(url and url in na_base))
        return fonte_id[chave]

    hipotese = fonte("Hipótese didática do projeto (limites de ritmo e de risco)", None, "hipotese")
    analogia = fonte("Estimativa por analogia (sem preço público confiável encontrado)", None, "hipotese", "preco")
    maq_id: dict[str, int] = {}
    for m in DADOS["maquinas"]:
        mid = s.add(
            "maquinas_catalogo", codigo=m["codigo"], nome=m["nome"], categoria_id=cat_id[m["categoria"]], etapa_id=etapa_id[m["etapa"]], fluxo=m["fluxo"],
            icone=m["icone"], parametro=m["parametro"], unidade=m["unidade"], valor_min=m["valor_min"], valor_otimo=m["valor_otimo"], valor_atencao=m["valor_atencao"],
            valor_falha=m["valor_falha"], valor_max=m["valor_max"], capacidade_otima=m["capacidade_otima"], consumo_parado_kw=m["consumo_parado_kw"],
            consumo_variavel_kw=m["consumo_variavel_kw"], ordem_processo=m["ordem_processo"], sensibilidade_termica=m["sensibilidade_termica"],
            aceita_varias_entradas=m["aceita_varias_entradas"], etapa_final=m["etapa_final"], descricao=m["descricao"], risco_fisico=m["risco_fisico"],
            base_dos_numeros=m["base_dos_numeros"], ativa=True)
        maq_id[m["codigo"]] = mid
        s.add("manuais_maquina", maquina_id=mid, **m["manual"])
        vistos: set[tuple[int, str]] = set()

        def ligar(fid: int, finalidade: str) -> None:
            if (fid, finalidade) not in vistos:
                vistos.add((fid, finalidade))
                s.add("maquina_fontes", maquina_id=mid, fonte_id=fid, finalidade=finalidade)

        ligar(hipotese, "numeros")
        for r in m["fontes_numeros"]:
            ligar(fonte(r["titulo"], r["url"], r["confianca"]), "numeros")
        for r in m["preco"]["fontes"]:
            ligar(fonte(r["titulo"], r["url"], r["confianca"], "preco"), "preco")
        if not m["preco"]["fontes"]:
            ligar(analogia, "preco")
        s.add("precos_maquina", maquina_id=mid, preco_min=m["preco"]["min"], preco_max=m["preco"]["max"], moeda="BRL",
              observacao=m["preco"]["observacao"], editado_pelo_usuario=False, vigente_desde=t(5))

    # modelos comerciais reais pesquisados (docs/catalogo-modelos.md): [máquina, fabricante, modelo, aplicação, min, max, unidade, url, confiança, título da fonte]
    modelos = [
        ("enchedora", "Krones", "Modulfill VFJ", "Água sem gás em PET", None, 81000, "garrafas/h", "https://www.krones.com/en/products/machines/modulfill-vfj-water.php", "real", "Krones Modulfill VFJ (página do fabricante)"),
        ("enchedora", "Krones", "Modulfill VFS", "Água com e sem gás em PET", None, 72000, "garrafas/h", "https://www.krones.com/en/products/machines/modulfill-vfs-softdrinks.php", "real", "Krones Modulfill VFS (página do fabricante)"),
        ("enchedora", "Krones", "Modulfill HES", "Cerveja", None, 78000, "recipientes/h", "https://www.krones.com/en/products/machines/modulfill-hes-beer.php", "estimado", "Krones Modulfill HES (página do fabricante)"),
        ("enchedora", "Krones", "Modulfill HEL", "Suco em vidro", None, 78000, "recipientes/h", "https://www.krones.com/en/products/machines/modulfill-hel-juice-glas.php", "estimado", "Krones Modulfill HEL (página do fabricante)"),
        ("enchedora", "Krones", "Modulfill Dual", "Água sem gás em PET", None, 100000, "garrafas/h", "https://www.krones.com/en/products/machines/modulfill-dual.php", "estimado", "Krones Modulfill Dual (página do fabricante)"),
        ("enchedora", "Sidel", "Matrix SF300 FM", "Bebidas com e sem gás em PET", None, 80000, "garrafas/h", "https://www.directindustry.com/prod/sidel/product-8751-2141555.html", "estimado", "Sidel Matrix SF300 FM (DirectIndustry)"),
        ("enchedora", "Sidel", "Matrix Hot Filler SF700", "Sucos, chás e isotônicos (enchimento a quente)", 6000, 60000, "garrafas/h", "https://www.sidel.com/machines-repository/sidel-matrix-filler-sf700-fm/", "estimado", "Sidel Matrix Filler SF700 FM (página do fabricante)"),
        ("pasteurizador", "Krones", "LinaFlex eSync", "Pasteurizador de túnel; bomba de calor opcional", None, 95000, "recipientes/h", "https://www.krones.com/en/products/machines/linaflex-esync.php", "estimado", "Krones LinaFlex eSync (página do fabricante)"),
        ("pasteurizador", "Krones", "MiniFlex", "Pasteurizador de túnel, versão menor", None, 30000, "latas/h", "https://www.krones.com/en/company/press/single-lane-instead-of-bulk-conveyors-krones-fresh-approach-to-pasteurisation.php", "estimado", "Krones MiniFlex (notícia do fabricante)"),
        ("pasteurizador", "Tetra Pak", "Pasteurizer BF", "Sucos, néctares e isotônicos (trocador de placas)", 3000, 55000, "L/h", "https://www.tetrapak.com/en-us/solutions/integrated-solutions-equipment/processing-equipment/pasteurization/tetra-pak-pasteurizer-bf", "real", "Tetra Pak Pasteurizer BF (ficha técnica)"),
        ("pasteurizador", "Alfa Laval", "HTST (unidades pequenas)", "Pasteurização HTST de pequeno porte (anúncios de usados)", 800, 1350, "L/h", "https://www.sigmaequipment.com/equipment/used/alfa-laval-htst-pasteurizing-system-rated-for-216-gallons-per-hour-330645", "estimado", "Sigma Equipment: Alfa Laval HTST usado"),
        ("rotuladora", "Krones", "Contiroll", "Rotuladora de rótulo contínuo (bobina)", 3000, 36000, "recipientes/h", "https://www.krones.com/en/products/machines/wrap-around-reel-fed-labelling.php", "estimado", "Krones Contiroll (página do fabricante)"),
        ("rotuladora", "Krones", "Contiroll HS", "Versão de alta velocidade do Contiroll", 3000, 66000, "recipientes/h", "https://www.krones.com/en/products/machines/wrap-around-reel-fed-labelling.php", "estimado", "Krones Contiroll (página do fabricante)"),
        ("rotuladora", "KHS", "Innoket Neo SK", "Etiqueta autoadesiva em vidro e PET", None, 60000, "garrafas/h", "https://www.khs.com/en/products/machines-equipment/detail/khs-innoket-neo-sk-labeling-machine/", "estimado", "KHS Innoket Neo SK (página do fabricante)"),
        ("rotuladora", "KHS", "Innoket 360 S", "Rotuladora de bobina para PET", None, 50000, "garrafas/h", "https://www.petnology.com/online/news-detail/khs-optimizes-the-innoket-360-roll-fed-labeler-series", "estimado", "PETnology: KHS Innoket 360"),
        ("rotuladora", "KHS", "Innoket 360 Duo", "Rotuladora de bobina para PET descartável", None, 60000, "garrafas/h", "https://www.beveragedaily.com/Article/2014/08/06/KHS-launches-Innoket-360-Duo-roll-fed-labeler/", "estimado", "BeverageDaily: KHS Innoket 360 Duo"),
        ("misturador", "Tetra Pak", "In-line Blender B", "Mistura de xarope e água, até 10 correntes; controle de Brix", 20000, 60000, "L/h", "https://www.tetrapak.com/en-us/solutions/processing/main-technology-area/blending/in-line-blender-b", "real", "Tetra Pak In-line Blender B (ficha técnica)"),
        ("carbonatador", "Tetra Pak", "In-line Blender B com carbonatação", "Mesmo equipamento na versão com carbonatação", 20000, 60000, "L/h", "https://www.tetrapak.com/solutions/processing/main-technology-area/carbonization/tetra-alblend-carboblender", "real", "Tetra Pak: blender com carbonatação"),
    ]
    for codigo, fab, mod, aplic, cmin, cmax, un, url, conf, titulo in modelos:
        s.add("modelos_reais", maquina_id=maq_id[codigo], fabricante=fab, modelo=mod, aplicacao=aplic, capacidade_min=cmin, capacidade_max=cmax,
              unidade_capacidade=un, fonte_id=fonte(titulo, url, conf), observacao=None)

    # ---- glossário ----
    usadas: set[str] = set()
    for g in DADOS["glossario"]:
        tid = s.add("glossario_termos", grupo=g["grupo"], termo=g["termo"], definicao=g["definicao"])
        for p in g["palavras"]:
            if p not in usadas:
                usadas.add(p)
                s.add("glossario_palavras", termo_id=tid, palavra=p)

    # ---- fábricas de exemplo, com cenários, simulação, plano, registro e conversa ----
    minuto = 40
    for f_ in DADOS["fabricas"]:
        fid = s.add("fabricas", usuario_id=uid[f_["usuario"]], nome=f_["nome"], exemplo_origem=f_["exemplo_origem"],
                    temperatura_ambiente=f_["temperatura_ambiente"], tarifa_energia=f_["tarifa_energia"], parada_emergencia=False,
                    criada_em=t(minuto), atualizada_em=t(minuto + 20))
        fm_ids = [s.add("fabrica_maquinas", fabrica_id=fid, maquina_id=maq_id[m["codigo"]], pos_x=m["pos_x"], pos_y=m["pos_y"], ritmo=m["ritmo"],
                        unidades_paralelo=m["unidades_paralelo"], desligada=m["desligada"]) for m in f_["maquinas"]]
        for c in f_["conexoes"]:
            s.add("conexoes", fabrica_id=fid, origem_id=fm_ids[c["origem_indice"]], destino_id=fm_ids[c["destino_indice"]])
        codigos = [m["codigo"] for m in f_["maquinas"]]
        cen_ids = []
        for k, c in enumerate(f_["cenarios"]):
            cid = s.add("cenarios", fabrica_id=fid, nome=c["nome"], criado_em=t(minuto + 5 + k), temperatura_ambiente=c["temperatura_ambiente"],
                        producao_h=c["producao_h"], risco_max=c["risco_max"], energia_kw=c["energia_kw"], gargalo_id=fm_ids[c["gargalo_indice"]])
            cen_ids.append(cid)
            for mq in c["maquinas"]:
                s.add("cenario_maquinas", cenario_id=cid, maquina_id=maq_id[codigos[mq["indice"]]], fabrica_maquina_id=fm_ids[mq["indice"]], ritmo=mq["ritmo"],
                      unidades_paralelo=mq["unidades_paralelo"], desligada=mq["desligada"], capacidade_h=mq["capacidade_h"], saida_h=mq["saida_h"],
                      fila_h=mq["fila_h"], risco=mq["risco"], estado=mq["estado"], energia_kw=mq["energia_kw"])
        sim_ids = []
        for k, sm in enumerate(f_["simulacoes"]):
            sim_ids.append(s.add("simulacoes", fabrica_id=fid, usuario_id=uid[f_["usuario"]], iniciada_em=t(minuto + 12 + k), velocidade=sm["velocidade"],
                                 duracao_min=sm["duracao_min"], concluida=True, garrafas_produzidas=sm["garrafas_produzidas"], energia_kwh=sm["energia_kwh"],
                                 fila_total=sm["fila_total"], pct_do_maximo=sm["pct_do_maximo"], risco_max=sm["risco_max"],
                                 gargalo_maquina_id=maq_id[codigos[sm["gargalo_indice"]]]))
        for pl in f_["planos"]:
            pid = s.add("planos_objetivo", fabrica_id=fid, usuario_id=uid[f_["usuario"]], criado_em=t(minuto + 8), tipo_objetivo=pl["tipo_objetivo"],
                        valor_meta=pl["valor_meta"], aceita_zona_atencao=pl["aceita_zona_atencao"], aceita_paralelo=pl["aceita_paralelo"],
                        producao_antes=pl["producao_antes"], producao_depois=pl["producao_depois"], risco_antes=pl["risco_antes"],
                        risco_depois=pl["risco_depois"], investimento_min=pl["investimento_min"], investimento_max=pl["investimento_max"],
                        atingiu_meta=pl["atingiu_meta"], aplicado=pl["aplicado"])
            for ordem, p in enumerate(pl["passos"], start=1):
                s.add("plano_passos", plano_id=pid, ordem=ordem, acao=p["acao"], fabrica_maquina_id=fm_ids[p["indice"]], maquina_id=maq_id[codigos[p["indice"]]],
                      ritmo_antes=p.get("ritmo_antes"), ritmo_depois=p.get("ritmo_depois"), unidades_antes=p.get("unidades_antes"),
                      unidades_depois=p.get("unidades_depois"), motivo=p["motivo"], custo_min=p.get("custo_min"), custo_max=p.get("custo_max"))
            antes, depois = br(pl["producao_antes"]), br(pl["producao_depois"])
            eventos = [("ok", f"Exemplo carregado: {f_['nome']}"), ("ok", f"Aplicou o plano: produção {antes} → {depois} garrafas/h")]
            for k, (tipo, msg) in enumerate(eventos):
                s.add("eventos_registro", fabrica_id=fid, usuario_id=uid[f_["usuario"]], simulacao_id=None, ocorrido_em=t(minuto + 1 + k * 8), tipo=tipo, mensagem=msg)
            s.add("mensagens_chat", usuario_id=uid[f_["usuario"]], fabrica_id=fid, autor="usuario", texto="Quero aumentar a produção em 10%", criada_em=t(minuto + 7))
            s.add("mensagens_chat", usuario_id=uid[f_["usuario"]], fabrica_id=fid, autor="assistente",
                  texto=f"Dá para chegar a +10%. Produção {antes} → {depois} garrafas/h. Investimento estimado: R$ {br(pl['investimento_min'])} a R$ {br(pl['investimento_max'])}.",
                  criada_em=t(minuto + 7))
        for sm_id in sim_ids:
            for k, (tipo, msg) in enumerate([("ok", "Simulação iniciada (8 h simuladas)"), ("info", "Todas as máquinas já estão trabalhando"), ("ok", "Simulação terminada")]):
                s.add("eventos_registro", fabrica_id=fid, usuario_id=uid[f_["usuario"]], simulacao_id=sm_id, ocorrido_em=t(minuto + 12 + k), tipo=tipo, mensagem=msg)
        minuto += 60
    return s


def gerar_insert(s: Semente) -> str:
    saida = [
        "-- Digital Twin Industrial: dados iniciais (catálogo de máquinas, fontes, preços, glossário e fábricas de exemplo).",
        "-- Gerado por scripts/gerar_banco.py a partir de dados/dados_iniciais.json (que vem do código do front-end).",
        "-- SQL padrão: roda igual no SQLite e no PostgreSQL. Rode depois de 01_schema_*.sql.",
        "",
    ]
    for tabela in M.metadata.sorted_tables:
        linhas = s.linhas[tabela.name]
        if not linhas:
            continue
        colunas = [c.name for c in tabela.columns if c.name in linhas[0]]
        saida.append(f"-- {tabela.name} ({len(linhas)} linhas)")
        saida.append(f"INSERT INTO {tabela.name} ({', '.join(colunas)}) VALUES")
        saida.append(",\n".join("  (" + ", ".join(lit(l[c]) for c in colunas) + ")" for l in linhas) + ";")
        saida.append("")
    return "\n".join(saida)


def gerar_sequencias(s: Semente) -> str:
    saida = [
        "-- PostgreSQL: depois de inserir linhas com id explícito, acerta o contador automático (SERIAL) de cada tabela.",
        "-- Sem isto, o próximo INSERT sem id tentaria reutilizar o id 1 e daria erro de chave duplicada.",
        "",
    ]
    for tabela in M.metadata.sorted_tables:
        if s.linhas[tabela.name] and any(c.name == "id" and c.primary_key for c in tabela.columns):
            saida.append(f"SELECT setval(pg_get_serial_sequence('{tabela.name}', 'id'), (SELECT MAX(id) FROM {tabela.name}));")
    return "\n".join(saida) + "\n"


# =====================================================================================================
# 3) DIAGRAMA ENTIDADE-RELACIONAMENTO (MERMAID)
# =====================================================================================================
ROTULOS = {  # (tabela filha, coluna): "verbo" lido do pai para o filho
    ("maquinas_catalogo", "categoria_id"): "agrupa", ("maquinas_catalogo", "etapa_id"): "contém",
    ("manuais_maquina", "maquina_id"): "tem manual", ("maquina_fontes", "maquina_id"): "usa",
    ("maquina_fontes", "fonte_id"): "sustenta", ("precos_maquina", "maquina_id"): "tem preço",
    ("modelos_reais", "maquina_id"): "exemplificada por", ("modelos_reais", "fonte_id"): "documenta",
    ("glossario_palavras", "termo_id"): "é chamado por", ("fabricas", "usuario_id"): "possui",
    ("fabrica_maquinas", "fabrica_id"): "contém", ("fabrica_maquinas", "maquina_id"): "instancia",
    ("conexoes", "fabrica_id"): "liga dentro de", ("conexoes", "origem_id"): "envia por", ("conexoes", "destino_id"): "recebe por",
    ("cenarios", "fabrica_id"): "gera", ("cenarios", "gargalo_id"): "tinha gargalo", ("cenario_maquinas", "cenario_id"): "detalha",
    ("cenario_maquinas", "maquina_id"): "do tipo", ("cenario_maquinas", "fabrica_maquina_id"): "registra",
    ("simulacoes", "fabrica_id"): "é simulada em", ("simulacoes", "usuario_id"): "roda", ("simulacoes", "gargalo_maquina_id"): "limitou",
    ("eventos_registro", "fabrica_id"): "registra", ("eventos_registro", "usuario_id"): "causa", ("eventos_registro", "simulacao_id"): "ocorre em",
    ("planos_objetivo", "fabrica_id"): "recebe", ("planos_objetivo", "usuario_id"): "pede", ("plano_passos", "plano_id"): "é feito de",
    ("plano_passos", "fabrica_maquina_id"): "mexe em", ("plano_passos", "maquina_id"): "afeta tipo", ("mensagens_chat", "usuario_id"): "escreve",
    ("mensagens_chat", "fabrica_id"): "trata de",
}
TIPOS = {"INTEGER": "int", "SMALLINT": "int", "VARCHAR": "string", "TEXT": "text", "NUMERIC": "decimal", "BOOLEAN": "boolean", "DATETIME": "datetime"}


def tipo_mermaid(col) -> str:
    return TIPOS.get(col.type.compile(dialect=sqlite.dialect()).split("(")[0].upper(), "string")


def mermaid(tabelas: list[str], completo: bool, conceitual: bool = False) -> str:
    """conceitual=True: só as entidades e os relacionamentos (sem colunas), para a visão geral ficar legível."""
    nomes = set(tabelas)
    linhas = ["erDiagram"]
    for nome in ([] if conceitual else tabelas):
        tb = M.metadata.tables[nome]
        fks = {c.name for fk in tb.foreign_keys for c in [fk.parent]}
        linhas.append(f"    {nome} {{")
        for col in tb.columns:
            marcas = []
            if col.primary_key:
                marcas.append("PK")
            if col.name in fks:
                marcas.append("FK")
            if not completo and not marcas and col.name not in ("nome", "nome_usuario", "codigo", "titulo", "termo"):
                continue
            linhas.append(f"        {tipo_mermaid(col)} {col.name}{(' ' + ','.join(marcas)) if marcas else ''}")
        linhas.append("    }")
    feitos = set()
    for nome in tabelas:
        tb = M.metadata.tables[nome]
        for fk in tb.foreign_keys:
            pai = fk.column.table.name
            if pai == "fabrica_maquinas" and fk.column.name == "fabrica_id":
                continue  # parte da chave composta de conexoes: não vira uma linha própria no diagrama
            if pai not in nomes or (nome, fk.parent.name, pai) in feitos:
                continue
            feitos.add((nome, fk.parent.name, pai))
            um_para_um = fk.parent.primary_key and len(tb.primary_key.columns) == 1
            obrigatorio = not fk.parent.nullable
            lado_pai = "||" if obrigatorio else "|o"
            lado_filho = "||" if um_para_um else "o{"
            rotulo = ROTULOS.get((nome, fk.parent.name), fk.parent.name)
            linhas.append(f'    {pai} {lado_pai}--{lado_filho} {nome} : "{rotulo}"')
    return "\n".join(linhas) + "\n"


# =====================================================================================================
# 4) DICIONÁRIO DE DADOS
# =====================================================================================================
def dicionario() -> str:
    d = [
        "# Dicionário de dados",
        "",
        "Gerado automaticamente por `scripts/gerar_banco.py` a partir de `scripts/modelo.py`. Descreve cada tabela, coluna, tipo, chave e regra de integridade.",
        "",
        "Legenda: **PK** = chave primária; **FK** = chave estrangeira; **UQ** = valor único; **NN** = obrigatório (não pode ficar vazio).",
        "",
        f"A base tem **{len(M.metadata.tables)} tabelas**, em 5 módulos.",
        "",
        "| Módulo | Tabelas |",
        "|---|---|",
    ]
    for modulo, tabelas in M.MODULOS.items():
        d.append(f"| {modulo} | {', '.join('`' + x + '`' for x in tabelas)} |")
    d.append("")
    for modulo, tabelas in M.MODULOS.items():
        d += [f"## Módulo: {modulo}", ""]
        for nome in tabelas:
            tb = M.metadata.tables[nome]
            # a coluna fabrica_id de conexoes aparece em duas chaves: a simples (→ fabricas) e a composta; mostramos a simples aqui
            fks = {fk.parent.name: fk for fk in tb.foreign_keys if not (fk.column.table.name == "fabrica_maquinas" and fk.column.name == "fabrica_id")}
            unicos = {c.name for u in tb.constraints if type(u).__name__ == "UniqueConstraint" and len(u.columns) == 1 for c in u.columns}
            d += [f"### `{nome}`", "", tb.comment or "", "", "| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |", "|---|---|---|---|---|---|"]
            for col in tb.columns:
                chave = []
                if col.primary_key:
                    chave.append("PK")
                if col.name in fks:
                    f = fks[col.name]
                    chave.append(f"FK → {f.column.table.name}.{f.column.name}" + (f" ({f.ondelete})" if f.ondelete else ""))
                if col.name in unicos:
                    chave.append("UQ")
                padrao = ""
                if col.server_default is not None:
                    bruto = str(getattr(col.server_default, "arg", col.server_default))
                    padrao = {"true": "verdadeiro", "false": "falso", "current_timestamp": "agora"}.get(bruto.lower(), bruto)
                d.append(f"| `{col.name}` | {col.type.compile(dialect=sqlite.dialect())} | {', '.join(chave)} | {'sim' if not col.nullable else 'não'} | {padrao} | {col.comment or ''} |")
            regras = []
            for c in tb.constraints:
                tipo = type(c).__name__
                if tipo == "CheckConstraint":
                    regras.append(f"- **Regra** `{c.name}`: `{' '.join(str(c.sqltext).split())}`")
                elif tipo == "UniqueConstraint" and len(c.columns) > 1:
                    regras.append(f"- **Único** `{c.name}`: combinação de `{', '.join(x.name for x in c.columns)}`")
                elif tipo == "ForeignKeyConstraint" and len(c.columns) > 1:
                    regras.append(f"- **Chave estrangeira composta** `{c.name}`: `({', '.join(x.name for x in c.columns)})` → `{c.elements[0].column.table.name}`"
                                  f" (garante que as duas pontas pertencem à mesma fábrica)")
            if regras:
                d += ["", "Regras de integridade:", ""] + regras
            if tb.indexes:
                d += ["", "Índices: " + ", ".join(f"`{i.name}`" for i in sorted(tb.indexes, key=lambda x: x.name))]
            d.append("")
    return "\n".join(d) + "\n"


# =====================================================================================================
# 5) EXECUÇÃO
# =====================================================================================================
def escrever(caminho: Path, texto: str) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(texto, encoding="utf-8", newline="\n")


def main() -> None:
    escrever(SQL_DIR / "01_schema_sqlite.sql", gerar_esquema(sqlite.dialect(), "sqlite"))
    escrever(SQL_DIR / "01_schema_postgres.sql", gerar_esquema(postgresql.dialect(), "postgres"))
    semente = montar_sementes()
    escrever(SQL_DIR / "02_dados_iniciais.sql", gerar_insert(semente))
    escrever(SQL_DIR / "02b_ajustar_sequencias_postgres.sql", gerar_sequencias(semente))

    # banco SQLite pronto: esquema + dados + views (os mesmos arquivos .sql que vão para o repositório)
    if BANCO.exists():
        BANCO.unlink()
    con = sqlite3.connect(BANCO)
    for arq in ("01_schema_sqlite.sql", "02_dados_iniciais.sql", "03_views.sql"):
        con.executescript((SQL_DIR / arq).read_text(encoding="utf-8"))
    con.commit()
    con.close()

    # diagramas e dicionário
    todas = [t.name for t in M.metadata.sorted_tables]
    escrever(DER_DIR / "der_visao_geral.mmd", mermaid(todas, completo=False))
    escrever(DER_DIR / "der_completo.mmd", mermaid(todas, completo=True))
    for i, (modulo, tabelas) in enumerate(M.MODULOS.items(), start=1):
        extras = []
        for nome in tabelas:
            for fk in M.metadata.tables[nome].foreign_keys:
                pai = fk.column.table.name
                if pai not in tabelas and pai not in extras:
                    extras.append(pai)
        escrever(DER_DIR / f"der_modulo_{i}.mmd", mermaid(tabelas + extras, completo=True))
    escrever(DOCS_DIR / "dicionario-de-dados.md", dicionario())

    con = sqlite3.connect(BANCO)
    total = {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in todas}
    con.close()
    print(f"ok: {len(todas)} tabelas, {sum(total.values())} linhas iniciais -> {BANCO.name} ({BANCO.stat().st_size // 1024} KB)")
    print(", ".join(f"{k}={v}" for k, v in total.items()))


if __name__ == "__main__":
    main()
