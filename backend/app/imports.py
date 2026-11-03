"""Importar a ficha técnica de uma máquina: anexar, conferir, evitar duplicidade e criar/atualizar/versionar no catálogo.

Fluxo: 1) anexar o arquivo (o sistema lê e entende POR REGRAS, sem IA e sem custo)
       2) conferir e editar os campos (cada um mostra o trecho do documento de onde veio)
       3) o sistema compara com as máquinas que já existem e avisa se parece uma que já está cadastrada (lado a lado)
       4) o usuário decide: atualizar a existente (sobrepõe), salvar como nova versão (v2, v3...) ou criar uma máquina nova.
As versões antigas continuam no sistema (numa fábrica real, trocar de máquina leva tempo e custo).
"""
from __future__ import annotations

import hashlib
import io
import json
from difflib import SequenceMatcher
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import Connection, delete, func, insert, select, update
from sqlalchemy.exc import IntegrityError

from . import datasheet as ds
from .catalog_repo import load_catalog
from .factories import invalid, log_event, not_found
from .schema import T

MAX_BYTES = 15 * 1024 * 1024
MAX_TEXTO = 300_000
LIMIAR_PARECIDA = 0.82
CAMPOS_COMPARACAO = [  # (campo, rótulo)
    ("name", "Nome"), ("maker", "Fabricante"), ("model", "Modelo"), ("year", "Ano"), ("category", "Tipo"),
    ("capacity_nominal_per_hour", "Capacidade (garrafas/h)"), ("power_kw", "Potência (kW)"),
]


# ---------------------------------------------------------------------------------------------------------
# leitura do arquivo
# ---------------------------------------------------------------------------------------------------------
def read_pages(filename: str, data: bytes) -> list[str]:
    nome = filename.lower()
    if nome.endswith(".pdf") or data[:5] == b"%PDF-":
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data))
            return [(p.extract_text() or "") for p in reader.pages]
        except Exception as e:  # PDF corrompido, protegido por senha etc.
            raise invalid(f"Não consegui abrir o PDF ({type(e).__name__}). Ele está protegido por senha ou corrompido?")
    if nome.endswith((".txt", ".md")):
        for enc in ("utf-8", "latin-1"):
            try:
                return [data.decode(enc)]
            except UnicodeDecodeError:
                continue
    raise invalid("Formato não aceito. Anexe um PDF ou um arquivo de texto (.txt).")


def _norm(s: Optional[str]) -> str:
    return "".join(c for c in ds.sem_acento(s or "") if c.isalnum())


# ---------------------------------------------------------------------------------------------------------
# comparação com o que já existe
# ---------------------------------------------------------------------------------------------------------
def _existing_as_draft(t, power: float) -> dict:
    return {"name": t.name, "maker": t.maker, "model": t.model, "year": t.year, "category": t.cat,
            "capacity_nominal_per_hour": t.cap, "power_kw": round(t.sb + t.vr, 3)}


def find_matches(conn: Connection, draft: dict) -> list[dict]:
    catalog = load_catalog(conn)
    achadas = []
    nome_novo = _norm(f"{draft.get('maker') or ''} {draft.get('model') or ''}") or _norm(draft.get("name"))
    for t in catalog.values():
        razoes = []
        score = 0.0
        if draft.get("maker") and draft.get("model") and t.maker and t.model and _norm(draft["maker"]) == _norm(t.maker) and _norm(draft["model"]) == _norm(t.model):
            razoes.append("mesmo fabricante e modelo")
            score = 1.0
        else:
            candidatos = [_norm(t.name), _norm(f"{t.maker or ''} {t.model or ''}")]
            novos = [nome_novo, _norm(draft.get("name"))]
            melhor = max((SequenceMatcher(None, a, b).ratio() for a in candidatos for b in novos if a and b), default=0.0)
            if melhor >= LIMIAR_PARECIDA:
                razoes.append("nome parecido")
                score = melhor
        if not razoes:
            continue
        existente = _existing_as_draft(t, 0)
        comparacao = []
        for campo, rotulo in CAMPOS_COMPARACAO:
            a, b = existente.get(campo), draft.get(campo)
            if campo == "year":
                dif = a != b and not (a is None and b is None)
            elif isinstance(a, (int, float)) and isinstance(b, (int, float)) and a and b:
                dif = abs(a - b) / max(abs(a), abs(b)) > 0.01
            else:
                dif = _norm(str(a) if a is not None else "") != _norm(str(b) if b is not None else "") and not (a is None and b is None)
            comparacao.append({"field": campo, "label": rotulo, "existing": a, "new": b, "different": bool(dif)})
        achadas.append({"code": t.code, "name": t.name, "version": t.version, "family": t.group or t.code, "origin": t.origin, "active": True,
                        "reason": razoes[0], "score": round(score, 3), "comparison": comparacao,
                        "differences": sum(1 for c in comparacao if c["different"])})
    return sorted(achadas, key=lambda m: -m["score"])


# ---------------------------------------------------------------------------------------------------------
# análise (passo 1 e 2)
# ---------------------------------------------------------------------------------------------------------
def _doc_dict(d, detail: bool = True, conn: Optional[Connection] = None) -> dict:
    campos = json.loads(d.campos_extraidos)
    out = {"id": d.id, "file_name": d.nome_arquivo, "size_bytes": d.tamanho_bytes, "pages": d.paginas, "status": d.status,
           "machine_id": d.maquina_id, "uploaded_at": d.enviado_em}
    if detail:
        out.update({"fields": campos["fields"], "warnings": campos["warnings"], "category_suggestion": campos["category_suggestion"],
                    "bottle_volume_l": campos["bottle_volume_l"], "text_preview": d.texto_extraido[:1200]})
    return out


def analyze_upload(conn: Connection, uid: int, filename: str, data: bytes, bottle_l: float = ds.GARRAFA_PADRAO_L) -> dict:
    if not data:
        raise invalid("O arquivo está vazio.")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, {"message": "Arquivo grande demais (limite de 15 MB)."})
    if not (0.05 <= bottle_l <= 5):
        raise invalid("O volume da garrafa de referência vai de 0,05 L a 5 L.")
    sha = hashlib.sha256(data).hexdigest()
    dc = T["documentos_maquina"]
    existente = conn.execute(select(dc).where(dc.c.sha256 == sha)).first()
    if existente is not None:
        if existente.status == "descartado":
            conn.execute(delete(dc).where(dc.c.id == existente.id))      # foi descartado: pode analisar de novo
        else:
            codigo = None
            if existente.maquina_id:
                codigo = conn.execute(select(T["maquinas_catalogo"].c.codigo).where(T["maquinas_catalogo"].c.id == existente.maquina_id)).scalar()
            raise HTTPException(409, {"message": "Este arquivo já foi anexado antes.", "document_id": existente.id, "status": existente.status, "machine_code": codigo})
    filename = filename.replace("\x00", "")
    paginas = [p.replace("\x00", "") for p in read_pages(filename, data)]   # NUL aparece em arquivos corrompidos e o PostgreSQL não aceita guardá-lo
    texto = "\n".join(paginas)
    if len(texto.strip()) < 80:
        raise invalid("Não consegui ler texto neste documento (talvez seja um PDF escaneado, só com imagens). Use um PDF com texto selecionável.")
    analise = ds.analyze(paginas, filename, bottle_l)
    guardado = {"fields": analise["fields"], "warnings": analise["warnings"], "category_suggestion": analise["category_suggestion"], "bottle_volume_l": bottle_l}
    did = conn.execute(insert(dc).values(
        usuario_id=uid, nome_arquivo=filename[:255], sha256=sha, tamanho_bytes=len(data), paginas=len(paginas), texto_extraido=texto[:MAX_TEXTO],
        campos_extraidos=json.dumps(guardado, ensure_ascii=False), status="analisado")).inserted_primary_key[0]
    log_event(conn, None, uid, f"Ficha técnica anexada: {filename}", "info")
    return get_import(conn, did)


def _row(conn: Connection, did: int):
    d = conn.execute(select(T["documentos_maquina"]).where(T["documentos_maquina"].c.id == did)).first()
    if d is None:
        raise not_found("Documento não encontrado.")
    return d


def get_import(conn: Connection, did: int, overrides: Optional[dict] = None) -> dict:
    """O documento analisado, o rascunho da máquina (com o que o usuário já editou) e as máquinas parecidas que já existem."""
    d = _row(conn, did)
    out = _doc_dict(d)
    draft = ds.build_draft(out["fields"], overrides or {}, d.nome_arquivo)
    out["draft"] = draft
    out["matches"] = find_matches(conn, draft)
    out["can_create_new"] = not any(m["score"] >= LIMIAR_PARECIDA for m in out["matches"])
    return out


def list_imports(conn: Connection) -> list[dict]:
    dc = T["documentos_maquina"]
    return [_doc_dict(d, detail=False) for d in conn.execute(select(dc).order_by(dc.c.id.desc())).all()]


def discard_import(conn: Connection, did: int) -> None:
    d = _row(conn, did)
    if d.status == "importado":
        raise HTTPException(409, {"message": "Este documento já virou máquina. Para desfazer, apague a máquina importada."})
    conn.execute(update(T["documentos_maquina"]).where(T["documentos_maquina"].c.id == did).values(status="descartado"))


# ---------------------------------------------------------------------------------------------------------
# confirmar (passo 4)
# ---------------------------------------------------------------------------------------------------------
def _unique_name(catalog, nome: str, sufixo: str) -> str:
    """Duas máquinas nunca aparecem com o mesmo nome na lista: se já existe, acrescenta o sufixo (ex.: ' (v2)') ou um número."""
    usados = {t.name.lower() for t in catalog.values()}
    if nome.lower() not in usados and not sufixo:
        return nome
    candidato = (nome + sufixo) if sufixo else nome
    n = 2
    while candidato.lower() in usados:
        candidato = f"{nome}{sufixo} ({n})" if sufixo else f"{nome} ({n})"
        n += 1
    return candidato


def _unique_code(conn: Connection, base: str) -> str:
    mc = T["maquinas_catalogo"]
    codigo, n = base, 2
    while conn.execute(select(mc.c.id).where(mc.c.codigo == codigo)).first():
        codigo = f"{base[:34]}_{n}"
        n += 1
    return codigo


def _link_sources(conn: Connection, machine_id: int, filename: str) -> None:
    fo, mf = T["fontes"], T["maquina_fontes"]
    fid = conn.execute(insert(fo).values(titulo=f"Ficha técnica anexada: {filename}"[:300], url=None, tipo="ficha técnica anexada", confianca="real",
                                         na_base_conhecimento=True)).inserted_primary_key[0]
    conn.execute(insert(mf).values(maquina_id=machine_id, fonte_id=fid, finalidade="numeros"))
    hip = conn.execute(select(fo.c.id).where(fo.c.titulo.like("Hipótese didática do projeto%"))).scalar()
    ja = conn.execute(select(mf.c.maquina_id).where(mf.c.maquina_id == machine_id, mf.c.fonte_id == hip, mf.c.finalidade == "numeros")).first() if hip else True
    if hip and not ja:
        conn.execute(insert(mf).values(maquina_id=machine_id, fonte_id=hip, finalidade="numeros"))


def _ids(conn: Connection, categoria: str, etapa: Optional[str]) -> tuple[int, int]:
    cid = conn.execute(select(T["categorias"].c.id).where(T["categorias"].c.codigo == categoria)).scalar()
    eid = conn.execute(select(T["etapas"].c.id).where(T["etapas"].c.nome == etapa)).scalar() if etapa else None
    if cid is None or eid is None:
        raise invalid("O tipo escolhido não existe no catálogo.")
    return cid, eid


def _create_machine(conn: Connection, draft: dict, filename: str, code: str, version: int, group: str, name: str) -> int:
    mc, mm = T["maquinas_catalogo"], T["manuais_maquina"]
    cid, eid = _ids(conn, draft["category"], draft["stage"])
    lim = draft["limits"]
    mid = conn.execute(insert(mc).values(
        codigo=code, nome=name[:80], categoria_id=cid, etapa_id=eid, fluxo="geral", icone=draft["icon"], parametro="Carga (% da capacidade nominal)", unidade="%",
        valor_min=lim["min"], valor_otimo=lim["optimal"], valor_atencao=lim["warning"], valor_falha=lim["failure"], valor_max=lim["max"],
        capacidade_otima=draft["capacity_nominal_per_hour"], consumo_parado_kw=draft["standby_kw"], consumo_variavel_kw=draft["variable_kw"],
        ordem_processo=draft["process_order"], sensibilidade_termica=draft["thermal_sensitivity"], aceita_varias_entradas=False, etapa_final=False,
        descricao=draft["description"], risco_fisico="Trabalhar acima do ritmo recomendado aumenta o desgaste e o risco de parada (hipótese didática).",
        base_dos_numeros=draft["basis"], ativa=True, fabricante=(draft["maker"] or None), modelo=(draft["model"] or None),
        ano_modelo=draft["year"], versao=version, grupo_codigo=group, origem="importada", vida_util_h=draft["life_hours"],
        intervalo_manutencao_h=draft["maintenance_interval_hours"])).inserted_primary_key[0]
    conn.execute(insert(mm).values(maquina_id=mid, o_que_faz=draft["description"], como_funciona_ritmo=draft["how_it_works"],
                                   dicas="Máquina importada de uma ficha técnica: confira os limites e o consumo antes de confiar nos números (hipótese didática)."))
    _link_sources(conn, mid, filename)
    return mid


def _update_machine(conn: Connection, target_code: str, draft: dict, filename: str, overrides: dict) -> int:
    mc = T["maquinas_catalogo"]
    row = conn.execute(select(mc).where(mc.c.codigo == target_code)).first()
    if row is None:
        raise not_found(f"Máquina '{target_code}' não existe no catálogo.")
    v: dict = {}
    if draft.get("maker"):
        v["fabricante"] = draft["maker"]
    if draft.get("model"):
        v["modelo"] = draft["model"]
    if draft.get("year"):
        v["ano_modelo"] = draft["year"]
    if draft.get("capacity_nominal_per_hour"):
        v["capacidade_otima"] = draft["capacity_nominal_per_hour"]
    if draft.get("power_kw") and draft["energy_confidence"] != "padrao":
        v["consumo_parado_kw"], v["consumo_variavel_kw"] = draft["standby_kw"], draft["variable_kw"]
    if overrides.get("description") or draft.get("description"):
        v["descricao"] = draft["description"]
    v["base_dos_numeros"] = (row.base_dos_numeros + f" | Atualizada com a ficha técnica '{filename}'.")[:2000]
    conn.execute(update(mc).where(mc.c.id == row.id).values(**v))
    mm = T["manuais_maquina"]
    if draft.get("how_it_works"):
        conn.execute(update(mm).where(mm.c.maquina_id == row.id).values(o_que_faz=draft["description"], como_funciona_ritmo=draft["how_it_works"]))
    _link_sources(conn, row.id, filename)
    return row.id


def confirm_import(conn: Connection, uid: int, did: int, decision: str, target_code: Optional[str], overrides: dict, confirm_different: bool) -> dict:
    d = _row(conn, did)
    if d.status != "analisado":
        raise HTTPException(409, {"message": "Este documento já foi processado."})
    out = _doc_dict(d)
    draft = ds.build_draft(out["fields"], overrides, d.nome_arquivo)
    if draft["problems"]:
        raise invalid("Faltam dados para criar a máquina: " + " ".join(draft["problems"]), problems=draft["problems"])
    matches = find_matches(conn, draft)
    parecidas = [m for m in matches if m["score"] >= LIMIAR_PARECIDA]
    catalog = load_catalog(conn)

    if decision == "create":
        if parecidas and not confirm_different:
            raise HTTPException(409, {"message": "Já existe uma máquina parecida no catálogo. Compare lado a lado e escolha atualizar, nova versão, ou confirme que é diferente.",
                                      "matches": parecidas})
        codigo = _unique_code(conn, ds.slug(f"{draft['maker'] or ''} {draft['name']}"))
        nome = _unique_name(catalog, draft["name"], "")
        mid = _create_machine(conn, draft, d.nome_arquivo, codigo, 1, codigo, nome)
        acao = "criada"
    elif decision in ("update", "new_version"):
        if not target_code or target_code not in catalog:
            raise invalid("Informe `target_code`: a máquina existente que será atualizada ou que ganhará uma nova versão.")
        if decision == "update":
            mid = _update_machine(conn, target_code, draft, d.nome_arquivo, overrides)
            codigo, acao = target_code, "atualizada"
        else:
            grupo = catalog[target_code].group or target_code
            versoes = [t.version for t in catalog.values() if (t.group or t.code) == grupo]
            versao = max(versoes) + 1
            codigo = _unique_code(conn, f"{grupo}_v{versao}")
            nome = _unique_name(catalog, draft["name"], f" (v{versao})")
            mid = _create_machine(conn, draft, d.nome_arquivo, codigo, versao, grupo, nome)
            acao = f"criada como versão {versao}"
    else:
        raise invalid("Decisão inválida. Use create, update ou new_version.")

    conn.execute(update(T["documentos_maquina"]).where(T["documentos_maquina"].c.id == did).values(status="importado", maquina_id=mid))
    log_event(conn, None, uid, f"Máquina {acao} a partir da ficha técnica: {codigo}", "ok")
    return {"action": acao, "machine_code": codigo, "machine_id": mid}


# ---------------------------------------------------------------------------------------------------------
# versões e exclusão
# ---------------------------------------------------------------------------------------------------------
def list_versions(conn: Connection, code: str) -> list[dict]:
    catalog = load_catalog(conn)
    if code not in catalog:
        raise not_found(f"Máquina '{code}' não existe no catálogo.")
    grupo = catalog[code].group or code
    return sorted(({"code": t.code, "name": t.name, "version": t.version, "origin": t.origin, "maker": t.maker, "model": t.model, "year": t.year,
                    "capacity_at_optimal": t.cap} for t in catalog.values() if (t.group or t.code) == grupo), key=lambda x: x["version"])


def delete_machine(conn: Connection, code: str) -> dict:
    mc = T["maquinas_catalogo"]
    row = conn.execute(select(mc).where(mc.c.codigo == code)).first()
    if row is None:
        raise not_found(f"Máquina '{code}' não existe no catálogo.")
    if row.origem != "importada":
        raise HTTPException(409, {"message": "Máquinas que vieram com o sistema não podem ser apagadas. Desative-a em vez disso."})
    fm = T["fabrica_maquinas"]
    usadas = conn.execute(select(func.count(func.distinct(fm.c.fabrica_id))).where(fm.c.maquina_id == row.id)).scalar_one()
    if usadas:
        raise HTTPException(409, {"message": f"Esta máquina está em uso em {usadas} fábrica(s). Tire-a das fábricas antes de apagar (ou desative-a).", "factories_using": usadas})
    mf, fo = T["maquina_fontes"], T["fontes"]
    docs = [r.fonte_id for r in conn.execute(select(mf.c.fonte_id).join(fo, fo.c.id == mf.c.fonte_id).where(mf.c.maquina_id == row.id, fo.c.tipo == "ficha técnica anexada")).all()]
    try:
        with conn.begin_nested():
            conn.execute(delete(mc).where(mc.c.id == row.id))
    except IntegrityError:
        raise HTTPException(409, {"message": "Esta máquina aparece em cenários, planos ou simulações guardados. Desative-a em vez de apagar."})
    for fid in docs:  # a fonte do documento só existia para esta máquina
        if not conn.execute(select(mf.c.maquina_id).where(mf.c.fonte_id == fid)).first():
            conn.execute(delete(fo).where(fo.c.id == fid))
    conn.execute(update(T["documentos_maquina"]).where(T["documentos_maquina"].c.maquina_id.is_(None), T["documentos_maquina"].c.status == "importado").values(status="descartado"))
    return {"deleted": code}
