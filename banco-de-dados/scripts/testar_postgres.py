#!/usr/bin/env python3
"""Testa a base de dados num servidor PostgreSQL de verdade (rodando no Docker).

O que faz:
  1. sobe o banco (docker compose up -d --wait), se pedido com --subir;
  2. confere que as 21 tabelas, as 4 views e as linhas iniciais foram criadas pelos scripts de sql/;
  3. executa o CRUD completo (sql/04_crud_exemplos.sql) e confere que o banco voltou ao estado inicial;
  4. executa os testes de integridade (testes/test_integridade_postgres.sql): 14 comandos inválidos que o banco precisa recusar.

Uso:   docker compose up -d && python scripts/testar_postgres.py
       python scripts/testar_postgres.py --subir        (sobe o banco antes)
Precisa de Docker. Só usa a biblioteca padrão do Python.
"""
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CONTAINER, USUARIO, BANCO = "digital-twin-postgres", "digital_twin", "digital_twin"
ESPERADO = {
    "usuarios": 2, "categorias": 6, "etapas": 10, "maquinas_catalogo": 14, "manuais_maquina": 14, "fontes": 39, "maquina_fontes": 65,
    "precos_maquina": 14, "modelos_reais": 18, "glossario_termos": 38, "glossario_palavras": 52, "fabricas": 3, "fabrica_maquinas": 22,
    "conexoes": 19, "cenarios": 2, "cenario_maquinas": 16, "simulacoes": 1, "eventos_registro": 5, "planos_objetivo": 1, "plano_passos": 2,
    "mensagens_chat": 2,
}


def run(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    r = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", cwd=RAIZ)
    if check and r.returncode != 0:
        sys.exit(f"ERRO ao executar {' '.join(args)}\n{r.stdout}\n{r.stderr}")
    return r


def psql(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return run("docker", "exec", CONTAINER, "psql", "-U", USUARIO, "-d", BANCO, "-v", "ON_ERROR_STOP=1", *args, check=check)


def consulta(sql: str) -> str:
    return psql("-tAq", "-c", sql).stdout.strip()


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    if "--subir" in sys.argv:
        print("Subindo o PostgreSQL (docker compose up -d --wait)...")
        run("docker", "compose", "up", "-d", "--wait")
    versao = consulta("SHOW server_version")
    print(f"Servidor PostgreSQL {versao} (container {CONTAINER})\n")

    n_tab = int(consulta("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"))
    n_views = int(consulta("SELECT COUNT(*) FROM information_schema.views WHERE table_schema='public'"))
    print(f"[1] Estrutura: {n_tab} tabelas, {n_views} views", "OK" if (n_tab, n_views) == (21, 4) else "FALHOU")
    assert (n_tab, n_views) == (21, 4)

    def contagens() -> dict:
        linhas = consulta(" UNION ALL ".join(f"SELECT '{t}', COUNT(*) FROM {t}" for t in ESPERADO)).splitlines()
        return {l.split("|")[0]: int(l.split("|")[1]) for l in linhas}

    assert contagens() == ESPERADO, f"dados iniciais diferentes: {contagens()}"
    print(f"[2] Dados iniciais: {sum(ESPERADO.values())} linhas em 21 tabelas, iguais às esperadas OK")

    run("docker", "cp", str(RAIZ / "sql"), f"{CONTAINER}:/tmp/sql")
    run("docker", "cp", str(RAIZ / "testes"), f"{CONTAINER}:/tmp/testes")
    psql("-q", "-f", "/tmp/sql/04_crud_exemplos.sql")
    assert contagens() == ESPERADO, "o CRUD não devolveu o banco ao estado inicial"
    print("[3] CRUD completo (INSERT, SELECT, UPDATE e DELETE em todas as tabelas): executado, banco voltou ao estado inicial OK")

    r = psql("-q", "-f", "/tmp/testes/test_integridade_postgres.sql")
    recusados = r.stderr.count("ok, recusado")
    print(f"[4] Integridade: o banco recusou {recusados} de 14 comandos inválidos", "OK" if recusados == 14 else "FALHOU")
    assert recusados == 14
    print("\nTudo certo: a base de dados funciona no PostgreSQL.")


if __name__ == "__main__":
    main()
