#!/usr/bin/env python3
"""Demonstração de CRUD na base de dados (Create, Read, Update, Delete) em todas as tabelas.

Roda o arquivo sql/04_crud_exemplos.sql comando por comando, mostrando cada comando e o resultado.
Trabalha numa CÓPIA temporária do banco: digital_twin.db não é alterado.

Uso:   python scripts/crud_demo.py            (usa digital_twin.db)
       python scripts/crud_demo.py outro.db   (usa outro banco com o mesmo esquema)
Precisa só do Python 3.8 ou mais novo (biblioteca sqlite3 já vem junto).
"""
import re
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def tabela(colunas: list[str], linhas: list[tuple]) -> str:
    texto = [[("NULL" if v is None else str(v)) for v in l] for l in linhas]
    larg = [max(len(c), *(len(l[i]) for l in texto)) if texto else len(c) for i, c in enumerate(colunas)]
    larg = [min(w, 48) for w in larg]
    cortar = lambda s, w: s if len(s) <= w else s[: w - 1] + "…"  # noqa: E731
    cab = " | ".join(cortar(c, w).ljust(w) for c, w in zip(colunas, larg))
    sep = "-+-".join("-" * w for w in larg)
    corpo = [" | ".join(cortar(v, w).ljust(w) for v, w in zip(l, larg)) for l in texto]
    return "\n".join(["    " + cab, "    " + sep] + ["    " + c for c in corpo])


def comandos(sql: str):
    """Separa o arquivo em (comentários, comando), respeitando ; dentro de textos."""
    comentarios, buf = [], ""
    for linha in sql.splitlines():
        if not buf and (linha.strip().startswith("--") or not linha.strip()):
            if linha.strip().startswith("--"):
                comentarios.append(linha.strip())
            continue
        buf += linha + "\n"
        if sqlite3.complete_statement(buf):
            yield comentarios, buf.strip()
            comentarios, buf = [], ""


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    origem = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / "digital_twin.db"
    with tempfile.TemporaryDirectory() as tmp:
        copia = Path(tmp) / "copia.db"
        shutil.copy(origem, copia)
        con = sqlite3.connect(copia)
        con.execute("PRAGMA foreign_keys = ON")
        print(f"Banco: {origem.name} (cópia temporária; o original não é alterado)\n")
        contagem = {"INSERT": 0, "SELECT": 0, "UPDATE": 0, "DELETE": 0}
        afetadas = {"INSERT": 0, "UPDATE": 0, "DELETE": 0}
        for comentarios, sql in comandos((RAIZ / "sql" / "04_crud_exemplos.sql").read_text(encoding="utf-8")):
            for c in comentarios:
                if c.startswith("-- BLOCO") or c.startswith("-- [") or c.startswith("-- CONFERÊNCIA"):
                    print("\n" + c.replace("-- ", "", 1))
                elif c.startswith("--          "):  # continuação do título do bloco
                    print(c.replace("-- ", "", 1))
            tipo = sql.split(None, 1)[0].upper()
            if tipo not in contagem:
                continue
            resumo = re.sub(r"\s+", " ", sql)
            print("  > " + (resumo if len(resumo) <= 150 else resumo[:147] + "..."))
            cur = con.execute(sql)
            contagem[tipo] += 1
            if tipo == "SELECT":
                print(tabela([d[0] for d in cur.description], cur.fetchall()))
            else:
                afetadas[tipo] += cur.rowcount
                print(f"    {cur.rowcount} linha(s) {'inserida(s)' if tipo == 'INSERT' else 'alterada(s)' if tipo == 'UPDATE' else 'apagada(s)'}")
        con.commit()
        con.close()
    print("\n" + "=" * 70)
    print("RESUMO: " + ", ".join(f"{k}: {v} comandos" for k, v in contagem.items()))
    print(f"Linhas inseridas: {afetadas['INSERT']} | alteradas: {afetadas['UPDATE']} | apagadas por comando (sem contar as apagadas em cascata): {afetadas['DELETE']}")
    print("A conferência final acima mostra que o banco voltou ao estado inicial.")


if __name__ == "__main__":
    main()
