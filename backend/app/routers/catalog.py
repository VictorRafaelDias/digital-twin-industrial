"""Catálogo de máquinas, manuais, fontes, glossário e efeitos da temperatura (consulta aberta; ajustes exigem login)."""
from __future__ import annotations

from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, File, Form, Path, Query, UploadFile
from sqlalchemy import Connection

from .. import catalog_admin as ca
from .. import imports as im
from ..db import get_conn
from ..deps import catalog_editor
from ..schemas import CategoryIn, CategoryPatch, ConfirmImportIn, LimitsPatch, MachinePatchCatalog, PreviewImportIn, PricePatch

router = APIRouter(tags=["Catálogo e conhecimento"])


@router.get("/catalog/machines", summary="Lista as máquinas do catálogo")
def machines(category: Optional[str] = Query(None, description="Filtra por categoria (ex.: envase)"),
             flow: Optional[Literal["geral", "suco"]] = Query(None, description="bebidas em geral ou suco natural"),
             q: Optional[str] = Query(None, description="Busca no nome e na descrição"),
             include_inactive: bool = False, conn: Connection = Depends(get_conn)):
    return ca.list_machines(conn, category, flow, q, include_inactive)


@router.get("/catalog/machines/{code}", summary="Uma máquina completa: limites, manual, fontes, preço e modelos reais")
def machine(code: str, conn: Connection = Depends(get_conn)):
    return ca.get_machine(conn, code)


@router.patch("/catalog/machines/{code}/limits", summary="Ajustar os limites (ótimo, atenção, falha)")
def limits(code: str, body: LimitsPatch, _=Depends(catalog_editor), conn: Connection = Depends(get_conn)):
    return ca.patch_limits(conn, code, body.model_dump())


@router.put("/catalog/machines/{code}/price", summary="Informar uma nova faixa de preço estimada (o histórico fica guardado)")
def price(code: str, body: PricePatch, _=Depends(catalog_editor), conn: Connection = Depends(get_conn)):
    return ca.patch_price(conn, code, body.min, body.max, body.note)


@router.patch("/catalog/machines/{code}", summary="Mudar a categoria, o nome ou ativar/desativar a máquina")
def patch_machine(code: str, body: MachinePatchCatalog, _=Depends(catalog_editor), conn: Connection = Depends(get_conn)):
    return ca.patch_machine(conn, code, body.model_dump())


@router.get("/catalog/categories", summary="Tipos de máquina (Insumos, Preparo, Térmico e gás...)")
def categories(conn: Connection = Depends(get_conn)):
    return ca.list_categories(conn)


@router.post("/catalog/categories", status_code=201, summary="Criar um tipo de máquina")
def create_category(body: CategoryIn, _=Depends(catalog_editor), conn: Connection = Depends(get_conn)):
    return ca.create_category(conn, body.code, body.name, body.description, body.icon)


@router.patch("/catalog/categories/{code}", summary="Renomear, descrever ou ligar/desligar um tipo")
def patch_category(code: str, body: CategoryPatch, _=Depends(catalog_editor), conn: Connection = Depends(get_conn)):
    return ca.patch_category(conn, code, body.model_dump())


@router.delete("/catalog/categories/{code}", status_code=204, summary="Apagar um tipo (só se não tiver máquinas)")
def delete_category(code: str, _=Depends(catalog_editor), conn: Connection = Depends(get_conn)):
    ca.delete_category(conn, code)


@router.get("/catalog/stages", summary="Etapas do processo e a zona da planta baixa de cada uma")
def stages(conn: Connection = Depends(get_conn)):
    return ca.list_stages(conn)


@router.get("/catalog/sources", summary="Fontes dos números, com link e confiança (real, estimado ou hipótese)")
def sources(confidence: Optional[Literal["real", "estimado", "hipotese"]] = None, knowledge_base: Optional[bool] = None,
            conn: Connection = Depends(get_conn)):
    return ca.list_sources(conn, confidence, knowledge_base)


@router.get("/catalog/real-models", summary="Modelos comerciais reais pesquisados (Krones, Tetra Pak...)")
def real_models(machine: Optional[str] = None, conn: Connection = Depends(get_conn)):
    return ca.list_real_models(conn, machine)


@router.get("/glossary", summary="Glossário de palavras difíceis")
def glossary(q: Optional[str] = None, group: Optional[str] = None, conn: Connection = Depends(get_conn)):
    return ca.list_glossary(conn, q, group)


@router.get("/ambient/effects", summary="O que a temperatura ambiente muda em cada máquina (e a dilatação da água)")
def ambient_effects(temperature: float = Query(25, ge=0, le=45, description="°C"), conn: Connection = Depends(get_conn)):
    return ca.ambient_effects(conn, temperature)


# ------------------------------------------------------------------------------------------------ dados reais: ficha técnica
def _overrides(fields) -> dict:
    return {k: v for k, v in fields.model_dump().items() if v is not None}


@router.post("/catalog/imports", status_code=201, tags=["Dados reais (ficha técnica)"],
             summary="Anexar a ficha técnica de uma máquina (PDF ou texto): o sistema lê e propõe os dados")
def upload_datasheet(file: UploadFile = File(..., description="PDF com texto selecionável ou arquivo .txt"),
                     bottle_volume_l: float = Form(0.5, description="Garrafa de referência (L) para converter litros/h em garrafas/h"),
                     user=Depends(catalog_editor), conn: Connection = Depends(get_conn)):
    return im.analyze_upload(conn, user.id, file.filename or "ficha.pdf", file.file.read(), bottle_volume_l)


@router.get("/catalog/imports", tags=["Dados reais (ficha técnica)"], summary="Documentos já anexados")
def list_imports(_=Depends(catalog_editor), conn: Connection = Depends(get_conn)):
    return im.list_imports(conn)


@router.get("/catalog/imports/{import_id}", tags=["Dados reais (ficha técnica)"],
            summary="Um documento: o que foi lido (com o trecho de origem), o rascunho da máquina e as máquinas parecidas que já existem")
def get_import(import_id: Annotated[int, Path(ge=1, le=2_147_483_647)], _=Depends(catalog_editor), conn: Connection = Depends(get_conn)):
    return im.get_import(conn, import_id)


@router.post("/catalog/imports/{import_id}/preview", tags=["Dados reais (ficha técnica)"],
             summary="Refaz o rascunho com as suas correções (não grava nada)")
def preview_import(import_id: Annotated[int, Path(ge=1, le=2_147_483_647)], body: PreviewImportIn, _=Depends(catalog_editor), conn: Connection = Depends(get_conn)):
    return im.get_import(conn, import_id, _overrides(body.fields))


@router.post("/catalog/imports/{import_id}/confirm", tags=["Dados reais (ficha técnica)"],
             summary="Confirmar: criar a máquina, atualizar a existente (sobrepõe) ou salvar como nova versão")
def confirm_import(import_id: Annotated[int, Path(ge=1, le=2_147_483_647)], body: ConfirmImportIn, user=Depends(catalog_editor), conn: Connection = Depends(get_conn)):
    return im.confirm_import(conn, user.id, import_id, body.decision, body.target_code, _overrides(body.fields), body.confirm_different)


@router.delete("/catalog/imports/{import_id}", status_code=204, tags=["Dados reais (ficha técnica)"], summary="Descartar a análise (não vira máquina)")
def discard_import(import_id: Annotated[int, Path(ge=1, le=2_147_483_647)], _=Depends(catalog_editor), conn: Connection = Depends(get_conn)):
    im.discard_import(conn, import_id)


@router.get("/catalog/machines/{code}/versions", summary="Versões da mesma máquina (v1, v2...): as antigas continuam no sistema")
def machine_versions(code: str, conn: Connection = Depends(get_conn)):
    return im.list_versions(conn, code)


@router.delete("/catalog/machines/{code}", tags=["Dados reais (ficha técnica)"], summary="Apagar uma máquina importada (só se nenhuma fábrica usar)")
def delete_machine(code: str, _=Depends(catalog_editor), conn: Connection = Depends(get_conn)):
    return im.delete_machine(conn, code)
