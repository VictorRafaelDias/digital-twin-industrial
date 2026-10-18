"""Testes da base de dados: esquema, dados iniciais, CRUD em todas as tabelas e regras de integridade.

Rodar (dentro da pasta banco-de-dados):   python -m unittest discover -s testes -v
Só precisa do Python (sqlite3 já vem junto). Os testes usam um banco em memória: o digital_twin.db não é alterado.
"""
import sqlite3
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SQL = RAIZ / "sql"

TABELAS = [
    "usuarios", "categorias", "etapas", "maquinas_catalogo", "manuais_maquina", "fontes", "maquina_fontes", "precos_maquina", "modelos_reais",
    "glossario_termos", "glossario_palavras", "fabricas", "fabrica_maquinas", "conexoes", "cenarios", "cenario_maquinas", "simulacoes",
    "eventos_registro", "planos_objetivo", "plano_passos", "mensagens_chat",
]
INICIAL = {  # linhas depois de 02_dados_iniciais.sql
    "usuarios": 2, "categorias": 6, "etapas": 10, "maquinas_catalogo": 14, "manuais_maquina": 14, "fontes": 39, "maquina_fontes": 65,
    "precos_maquina": 14, "modelos_reais": 18, "glossario_termos": 38, "glossario_palavras": 52, "fabricas": 3, "fabrica_maquinas": 22,
    "conexoes": 19, "cenarios": 2, "cenario_maquinas": 16, "simulacoes": 1, "eventos_registro": 5, "planos_objetivo": 1, "plano_passos": 2,
    "mensagens_chat": 2,
}


def novo_banco() -> sqlite3.Connection:
    con = sqlite3.connect(":memory:")
    for arq in ("01_schema_sqlite.sql", "02_dados_iniciais.sql", "03_views.sql"):
        con.executescript((SQL / arq).read_text(encoding="utf-8"))
    con.execute("PRAGMA foreign_keys = ON")
    return con


def contagens(con: sqlite3.Connection) -> dict[str, int]:
    return {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in TABELAS}


class EsquemaEDados(unittest.TestCase):
    def setUp(self):
        self.con = novo_banco()

    def test_as_21_tabelas_existem(self):
        existentes = {r[0] for r in self.con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertEqual(existentes, set(TABELAS))

    def test_dados_iniciais(self):
        self.assertEqual(contagens(self.con), INICIAL)

    def test_banco_entregue_tem_os_mesmos_dados_que_os_scripts(self):
        entregue = sqlite3.connect(RAIZ / "digital_twin.db")
        self.assertEqual(contagens(entregue), INICIAL)
        self.assertEqual(entregue.execute("PRAGMA integrity_check").fetchone()[0], "ok")
        self.assertEqual(entregue.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_catalogo_bate_com_o_front(self):
        linha = self.con.execute("SELECT nome, capacidade_otima, valor_otimo, valor_falha FROM maquinas_catalogo WHERE codigo='rotuladora'").fetchone()
        self.assertEqual(linha, ("Rotuladora", 11400, 190, 245))

    def test_toda_maquina_tem_manual_preco_e_fonte(self):
        sem = self.con.execute("""SELECT codigo FROM maquinas_catalogo m
            WHERE NOT EXISTS (SELECT 1 FROM manuais_maquina WHERE maquina_id = m.id)
               OR NOT EXISTS (SELECT 1 FROM precos_maquina WHERE maquina_id = m.id)
               OR NOT EXISTS (SELECT 1 FROM maquina_fontes WHERE maquina_id = m.id AND finalidade = 'numeros')""").fetchall()
        self.assertEqual(sem, [])

    def test_exemplo_de_bebidas_reproduz_o_gargalo_do_front(self):
        linha = self.con.execute("SELECT producao_h, gargalo FROM vw_cenarios_comparativo WHERE cenario LIKE 'Situação inicial%'").fetchone()
        self.assertEqual(linha, (11400, "Rotuladora"))

    def test_views_retornam_linhas(self):
        for v in ("vw_catalogo_completo", "vw_fabricas_resumo", "vw_cenarios_comparativo", "vw_planos_investimento"):
            self.assertGreater(self.con.execute(f"SELECT COUNT(*) FROM {v}").fetchone()[0], 0, v)

    def test_senha_nao_fica_em_texto(self):
        for (h,) in self.con.execute("SELECT senha_hash FROM usuarios"):
            self.assertTrue(h.startswith("pbkdf2_sha256$"))
            self.assertNotIn("senha1234", h)


class Crud(unittest.TestCase):
    """Create, Read, Update e Delete em cada tabela (um comando de cada tipo por tabela)."""

    def setUp(self):
        self.con = novo_banco()
        self.ini = contagens(self.con)

    def ciclo(self, tabela, insert, where, update, ler):
        """insert (SQL), where (cláusula para achar a linha), update (SQL com SET), ler (coluna conferida) -> (antes, depois)"""
        con = self.con
        con.execute(insert)
        self.assertEqual(con.execute(f"SELECT COUNT(*) FROM {tabela}").fetchone()[0], self.ini[tabela] + 1, f"{tabela}: INSERT")
        antes = con.execute(f"SELECT {ler} FROM {tabela} WHERE {where}").fetchone()[0]
        con.execute(f"UPDATE {tabela} SET {update[0]} WHERE {where}")
        depois = con.execute(f"SELECT {ler} FROM {tabela} WHERE {update[1]}").fetchone()[0]
        self.assertNotEqual(antes, depois, f"{tabela}: UPDATE")
        con.execute(f"DELETE FROM {tabela} WHERE {update[1]}")
        self.assertEqual(con.execute(f"SELECT COUNT(*) FROM {tabela}").fetchone()[0], self.ini[tabela], f"{tabela}: DELETE")

    def test_crud_em_todas_as_tabelas_pelo_script_de_exemplos(self):
        """Roda o 04_crud_exemplos.sql inteiro: no fim todas as tabelas voltam ao estado inicial."""
        self.con.executescript((SQL / "04_crud_exemplos.sql").read_text(encoding="utf-8"))
        self.assertEqual(contagens(self.con), INICIAL)

    def test_crud_usuarios(self):
        self.ciclo("usuarios", "INSERT INTO usuarios (nome_usuario, nome_exibicao, senha_hash) VALUES ('t1','Teste 1','x')",
                   "nome_usuario='t1'", ("nome_exibicao='Teste Um'", "nome_usuario='t1'"), "nome_exibicao")

    def test_crud_categorias_e_etapas(self):
        self.ciclo("categorias", "INSERT INTO categorias (codigo, nome, descricao) VALUES ('t','Teste','desc')",
                   "codigo='t'", ("nome='Teste 2'", "codigo='t'"), "nome")
        self.ciclo("etapas", "INSERT INTO etapas (nome, zona) VALUES ('Teste','Câmara fria')",
                   "nome='Teste'", ("zona='Envase e expedição'", "nome='Teste'"), "zona")

    def test_crud_fontes_e_precos(self):
        self.ciclo("fontes", "INSERT INTO fontes (titulo, url, tipo, confianca) VALUES ('T','https://t.example','exemplo','real')",
                   "url='https://t.example'", ("confianca='estimado'", "url='https://t.example'"), "confianca")
        self.ciclo("precos_maquina", "INSERT INTO precos_maquina (maquina_id, preco_min, preco_max, observacao) VALUES (1, 1, 2, 'teste')",
                   "observacao='teste'", ("preco_max=5", "observacao='teste'"), "preco_max")

    def test_crud_glossario(self):
        self.ciclo("glossario_termos", "INSERT INTO glossario_termos (grupo, termo, definicao) VALUES ('Sistema','TesteTermo','d')",
                   "termo='TesteTermo'", ("definicao='nova'", "termo='TesteTermo'"), "definicao")
        self.ciclo("glossario_palavras", "INSERT INTO glossario_palavras (termo_id, palavra) VALUES (1, 'palavra-teste')",
                   "palavra='palavra-teste'", ("palavra='outra-palavra'", "palavra='outra-palavra'"), "palavra")

    def test_crud_fabrica_maquinas_conexoes(self):
        con = self.con
        con.execute("INSERT INTO fabricas (usuario_id, nome) VALUES (1, 'Fábrica de teste')")
        fab = con.execute("SELECT id FROM fabricas WHERE nome='Fábrica de teste'").fetchone()[0]
        for ritmo in (200, 190):
            con.execute("INSERT INTO fabrica_maquinas (fabrica_id, maquina_id, ritmo) VALUES (?, 6, ?)", (fab, ritmo))
        a, b = [r[0] for r in con.execute("SELECT id FROM fabrica_maquinas WHERE fabrica_id=? ORDER BY id", (fab,))]
        con.execute("INSERT INTO conexoes (fabrica_id, origem_id, destino_id) VALUES (?,?,?)", (fab, a, b))
        self.assertEqual(con.execute("SELECT qtd_maquinas, qtd_conexoes FROM vw_fabricas_resumo WHERE fabrica_id=?", (fab,)).fetchone(), (2, 1))
        con.execute("UPDATE fabrica_maquinas SET unidades_paralelo=3, desligada=TRUE WHERE id=?", (a,))
        self.assertEqual(con.execute("SELECT unidades_paralelo, desligada FROM fabrica_maquinas WHERE id=?", (a,)).fetchone(), (3, 1))
        con.execute("DELETE FROM fabricas WHERE id=?", (fab,))  # cascata
        self.assertEqual(contagens(con), INICIAL)

    def test_crud_resultados_por_cascata(self):
        con = self.con
        con.execute("INSERT INTO fabricas (usuario_id, nome) VALUES (1, 'F teste')")
        fab = con.execute("SELECT id FROM fabricas WHERE nome='F teste'").fetchone()[0]
        con.execute("INSERT INTO cenarios (fabrica_id, nome, temperatura_ambiente, producao_h, risco_max, energia_kw) VALUES (?, 'C', 25, 100, 0.1, 5)", (fab,))
        cen = con.execute("SELECT id FROM cenarios WHERE fabrica_id=?", (fab,)).fetchone()[0]
        con.execute("INSERT INTO cenario_maquinas (cenario_id, maquina_id, ritmo, unidades_paralelo, capacidade_h, saida_h, risco, estado, energia_kw) VALUES (?,1,8,1,100,100,0.02,'normal',1)", (cen,))
        con.execute("INSERT INTO simulacoes (fabrica_id, usuario_id, velocidade, duracao_min, garrafas_produzidas, energia_kwh, pct_do_maximo, risco_max) VALUES (?,1,5,60,100,10,90,0.02)", (fab,))
        sim = con.execute("SELECT id FROM simulacoes WHERE fabrica_id=?", (fab,)).fetchone()[0]
        con.execute("INSERT INTO eventos_registro (fabrica_id, usuario_id, simulacao_id, tipo, mensagem) VALUES (?,1,?,'ok','teste')", (fab, sim))
        con.execute("INSERT INTO planos_objetivo (fabrica_id, usuario_id, tipo_objetivo, valor_meta, producao_antes, producao_depois, risco_antes, risco_depois, atingiu_meta) VALUES (?,1,'pct',10,100,110,0.02,0.05,TRUE)", (fab,))
        pl = con.execute("SELECT id FROM planos_objetivo WHERE fabrica_id=?", (fab,)).fetchone()[0]
        con.execute("INSERT INTO plano_passos (plano_id, ordem, acao, maquina_id, ritmo_antes, ritmo_depois, motivo) VALUES (?,1,'ritmo',6,200,220,'teste')", (pl,))
        con.execute("INSERT INTO mensagens_chat (usuario_id, fabrica_id, autor, texto) VALUES (1,?,'usuario','oi')", (fab,))
        con.execute("DELETE FROM fabricas WHERE id=?", (fab,))
        depois = contagens(con)
        depois["mensagens_chat"] -= 1  # a mensagem fica, só perde a ligação com a fábrica (ON DELETE SET NULL)
        self.assertEqual(depois, INICIAL)
        self.assertIsNone(con.execute("SELECT fabrica_id FROM mensagens_chat WHERE texto='oi'").fetchone()[0])


class Integridade(unittest.TestCase):
    """O próprio banco recusa dados inválidos."""

    def setUp(self):
        self.con = novo_banco()

    def recusa(self, sql, params=()):
        with self.assertRaises(sqlite3.IntegrityError):
            self.con.execute(sql, params)

    def test_chave_estrangeira(self):
        self.recusa("INSERT INTO fabricas (usuario_id, nome) VALUES (999, 'sem dono')")
        self.recusa("INSERT INTO fabrica_maquinas (fabrica_id, maquina_id, ritmo) VALUES (1, 999, 10)")

    def test_unico(self):
        self.recusa("INSERT INTO usuarios (nome_usuario, nome_exibicao, senha_hash) VALUES ('victor.dias','Repetido','x')")
        self.recusa("INSERT INTO maquinas_catalogo (codigo, nome, categoria_id, etapa_id, parametro, unidade, valor_min, valor_otimo, valor_atencao, valor_falha, valor_max, capacidade_otima, consumo_parado_kw, consumo_variavel_kw, descricao, risco_fisico, base_dos_numeros) "
                    "SELECT 'enchedora','Outra',categoria_id,etapa_id,parametro,unidade,valor_min,valor_otimo,valor_atencao,valor_falha,valor_max,capacidade_otima,consumo_parado_kw,consumo_variavel_kw,descricao,risco_fisico,base_dos_numeros FROM maquinas_catalogo LIMIT 1")

    def test_regras_de_valores(self):
        self.recusa("UPDATE maquinas_catalogo SET valor_otimo = 5000 WHERE codigo='enchedora'")        # ótimo acima da atenção
        self.recusa("UPDATE fabrica_maquinas SET unidades_paralelo = 7 WHERE id = 1")                  # máximo 6
        self.recusa("UPDATE fabricas SET temperatura_ambiente = 60 WHERE id = 1")                      # 0 a 45
        self.recusa("UPDATE cenarios SET risco_max = 1.5 WHERE id = 1")                                # 0 a 1
        self.recusa("UPDATE precos_maquina SET preco_min = 999999999 WHERE id = 1")                    # mínimo acima do máximo
        self.recusa("UPDATE fontes SET confianca = 'duvidosa' WHERE id = 1")                           # real, estimado, hipotese
        self.recusa("UPDATE etapas SET zona = 'Lugar nenhum' WHERE id = 1")

    def test_conexao_nao_liga_maquina_a_ela_mesma(self):
        self.recusa("INSERT INTO conexoes (fabrica_id, origem_id, destino_id) VALUES (1, 1, 1)")

    def test_conexao_so_entre_maquinas_da_mesma_fabrica(self):
        # máquina 1 é da fábrica 1; máquina 9 (primeira da fábrica 2, 'suco') é de outra fábrica
        outra = self.con.execute("SELECT id FROM fabrica_maquinas WHERE fabrica_id = 2 LIMIT 1").fetchone()[0]
        self.recusa("INSERT INTO conexoes (fabrica_id, origem_id, destino_id) VALUES (1, 1, ?)", (outra,))

    def test_nao_apaga_o_que_esta_em_uso(self):
        self.recusa("DELETE FROM maquinas_catalogo WHERE codigo='enchedora'")   # há máquinas de fábricas usando

    def test_usuario_com_historico_de_simulacao_nao_e_apagado(self):
        # simulações e planos usam ON DELETE RESTRICT para o usuário: o histórico é protegido
        self.recusa("DELETE FROM usuarios WHERE id = 1")

    def test_usuario_sem_historico_e_apagado_junto_com_as_fabricas_dele(self):
        con = self.con
        con.execute("INSERT INTO usuarios (nome_usuario, nome_exibicao, senha_hash) VALUES ('novo','Novo','x')")
        uid = con.execute("SELECT id FROM usuarios WHERE nome_usuario='novo'").fetchone()[0]
        con.execute("INSERT INTO fabricas (usuario_id, nome) VALUES (?, 'F do novo')", (uid,))
        fab = con.execute("SELECT id FROM fabricas WHERE usuario_id=?", (uid,)).fetchone()[0]
        con.execute("INSERT INTO fabrica_maquinas (fabrica_id, maquina_id, ritmo) VALUES (?, 1, 8)", (fab,))
        con.execute("DELETE FROM usuarios WHERE id=?", (uid,))
        self.assertEqual(contagens(con), INICIAL)


if __name__ == "__main__":
    unittest.main(verbosity=2)
