"""Carrega as tabelas do banco (banco-de-dados/scripts/modelo.py): a mesma definição que gera os scripts SQL e o DER.

Assim o back-end e o banco nunca divergem: se o modelo mudar, a API enxerga a mudança.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from sqlalchemy import MetaData, Table

from .config import Settings


def carregar_modelo(caminho: Path):
    spec = importlib.util.spec_from_file_location("dt_modelo_banco", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Não achei o modelo do banco em {caminho}")
    modulo = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = modulo
    spec.loader.exec_module(modulo)
    return modulo


_modelo = carregar_modelo(Settings().modelo_path)
metadata: MetaData = _modelo.metadata
MODULOS: dict[str, list[str]] = _modelo.MODULOS
T: dict[str, Table] = dict(metadata.tables)
