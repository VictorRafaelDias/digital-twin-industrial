# Digital Twin Industrial: base de dados (Sprint 1)

Base de dados do sistema: 21 tabelas, com o **DER** (diagrama entidade-relacionamento), o banco **já criado e populado** e exemplos de **CRUD** (Create, Read, Update, Delete) em todas as tabelas.

## Banco escolhido: PostgreSQL

O banco do sistema é o **PostgreSQL**: aguenta a API e vários usuários gravando ao mesmo tempo, aplica sempre as regras de integridade do modelo (chaves compostas, apagamento em cascata), combina com o backend (Python, FastAPI) e permite, no futuro, buscar nos manuais por significado com a extensão `pgvector` (assistente RAG). A comparação completa com SQLite e MySQL está em [`docs/modelagem.md`](docs/modelagem.md#5-banco-escolhido-sgbd-postgresql).

O texto da entrega, com o motivo da escolha e o link de acesso, está em [`docs/escolha-do-banco.md`](docs/escolha-do-banco.md).

Como o PostgreSQL precisa de um servidor, a entrega traz também uma **cópia portátil em SQLite** (`digital_twin.db`), que abre com duplo clique no DB Browser, sem instalar nada. Os scripts de criação existem para os dois bancos e saem do mesmo modelo.

## O que foi pedido e onde está

| Pedido | Onde está |
|---|---|
| Diagrama entidade-relacionamento (DER) | [`der/`](der/): visão geral, um diagrama por módulo e o modelo completo (arquivos `DER-*.png`) |
| A própria base de dados, com as tabelas criadas | [`digital_twin.db`](digital_twin.db) (SQLite, pronto para abrir) e os scripts de criação em [`sql/`](sql/) (SQLite e PostgreSQL) |
| Capacidade de dar comandos de CRUD | [`sql/04_crud_exemplos.sql`](sql/04_crud_exemplos.sql) (comandos), [`scripts/crud_demo.py`](scripts/crud_demo.py) (roda e mostra tudo) e [`testes/`](testes/) (23 testes automáticos) |
| Documentação | [`docs/Documentacao-Banco-de-Dados.docx`](docs/Documentacao-Banco-de-Dados.docx) (Word, com os DER e o dicionário), [`docs/modelagem.md`](docs/modelagem.md) e [`docs/dicionario-de-dados.md`](docs/dicionario-de-dados.md) |

## Ver rapidamente (3 passos)

1. **Ver o DER:** abra as imagens em [`der/`](der/). Comece por `DER-visao-geral.png`; para ler as colunas, use os diagramas por módulo (`DER-modulo-1-acesso.png` a `DER-modulo-5-simulacao.png`).
2. **Ver o banco:** abra `digital_twin.db` no [DB Browser for SQLite](https://sqlitebrowser.org/) (gratuito). Na aba *Estrutura de Banco de Dados* estão as 21 tabelas e as 4 views; em *Navegar nos Dados* dá para ver e editar as linhas; em *Executar SQL* dá para rodar qualquer comando.
3. **Ver o CRUD funcionando** (precisa só do Python 3.9 ou mais novo, sem instalar nada):
   ```bash
   cd banco-de-dados
   python scripts/crud_demo.py
   ```
   O script roda cada comando de `sql/04_crud_exemplos.sql`, mostra o comando e o resultado (INSERT, SELECT, UPDATE, DELETE) em todas as tabelas e termina provando que o banco voltou ao estado inicial. Ele trabalha numa cópia, então o `digital_twin.db` não muda.

Para rodar os testes: `python -m unittest discover -s testes -v` (23 testes: criação, dados, CRUD em todas as tabelas e recusa de dados inválidos).

## Os dados do banco

O banco já vem com os mesmos dados do front-end (catálogo de máquinas, fontes, preços, glossário) e com fábricas de exemplo:

| Módulo | Tabelas | Linhas iniciais |
|---|---|---|
| Acesso | `usuarios` | 2 |
| Catálogo de máquinas | `categorias` (6), `etapas` (10), `maquinas_catalogo` (14), `manuais_maquina` (14), `fontes` (39), `maquina_fontes` (65), `precos_maquina` (14), `modelos_reais` (18) | 180 |
| Apoio ao usuário | `glossario_termos` (38), `glossario_palavras` (52), `mensagens_chat` (2) | 92 |
| Fábricas | `fabricas` (3), `fabrica_maquinas` (22), `conexoes` (19) | 44 |
| Simulação e resultados | `cenarios` (2), `cenario_maquinas` (16), `simulacoes` (1), `planos_objetivo` (1), `plano_passos` (2), `eventos_registro` (5) | 27 |

Os números de simulação guardados (produção de 11.400 garrafas/h, gargalo na rotuladora, plano de +10%) foram **calculados pelo próprio motor do front-end**, então batem com o que o sistema mostra na tela.

Usuários de demonstração: `victor.dias` e `enzo.fernandes` (senha de demonstração `senha1234`, guardada com hash PBKDF2, nunca em texto). O front-end ainda não confere senha.

## Estrutura da pasta

```
banco-de-dados/
├── digital_twin.db              banco SQLite pronto (esquema + views + dados)
├── der/                         DER: imagens (.png) e o texto-fonte dos diagramas (.mmd, Mermaid)
├── sql/
│   ├── 01_schema_sqlite.sql         CREATE TABLE (SQLite)
│   ├── 01_schema_postgres.sql       CREATE TABLE (PostgreSQL, com comentários nas tabelas e colunas)
│   ├── 02_dados_iniciais.sql        INSERT dos dados iniciais (igual nos dois bancos)
│   ├── 02b_ajustar_sequencias_postgres.sql   acerta os contadores automáticos no PostgreSQL
│   ├── 03_views.sql                 4 consultas prontas (views)
│   └── 04_crud_exemplos.sql         exemplos de CRUD em todas as tabelas
├── docs/
│   ├── Documentacao-Banco-de-Dados.docx   documento Word com tudo (resumo, escolha do banco, DER, CRUD e dicionário)
│   ├── dicionario-de-dados.md       todas as tabelas, colunas, tipos, chaves e regras
│   └── modelagem.md                 decisões de modelagem, normalização e ligação com o sistema
├── scripts/
│   ├── modelo.py                    única definição das tabelas (os .sql e o DER saem daqui)
│   ├── gerar_banco.py               gera os .sql, o digital_twin.db, os .mmd e o dicionário
│   ├── exportar_dados_do_front.ts   leva os dados do front-end para dados/dados_iniciais.json
│   ├── gerar_documento_word.py      gera docs/Documentacao-Banco-de-Dados.docx a partir dos .md e dos DER
│   └── crud_demo.py                 demonstração de CRUD
├── dados/dados_iniciais.json    dados exportados do front-end (entrada do gerador)
└── testes/test_banco.py         testes automáticos
```

## Criar o banco do zero

**SQLite** (precisa do `sqlite3` ou do DB Browser):

```bash
sqlite3 meu_banco.db < sql/01_schema_sqlite.sql
sqlite3 meu_banco.db < sql/02_dados_iniciais.sql
sqlite3 meu_banco.db < sql/03_views.sql
```

**PostgreSQL** (banco do sistema; os scripts saem do mesmo modelo, mas ainda **não foram executados em um servidor PostgreSQL** nesta entrega):

```bash
createdb digital_twin
psql digital_twin -f sql/01_schema_postgres.sql
psql digital_twin -f sql/02_dados_iniciais.sql
psql digital_twin -f sql/02b_ajustar_sequencias_postgres.sql
psql digital_twin -f sql/03_views.sql
```

## Regras que o próprio banco garante

- **Chaves estrangeiras** em todas as ligações, com regra de apagamento definida (apagar uma fábrica apaga em cascata suas máquinas, conexões, cenários e simulações; uma máquina do catálogo em uso **não** pode ser apagada).
- **Uma conexão só liga duas máquinas da mesma fábrica** (chave estrangeira composta) e **nunca uma máquina a ela mesma**.
- **Limites coerentes por máquina:** mínimo ≤ ótimo ≤ atenção ≤ falha ≤ máximo.
- **Faixas válidas:** temperatura de 0 a 45 °C, unidades em paralelo de 1 a 6, risco entre 0 e 1, preço mínimo ≤ preço máximo, confiança da fonte em `real`, `estimado` ou `hipotese`.
- **Valores únicos:** nome de usuário, código de máquina, URL de fonte, termo do glossário, nome da fábrica por usuário.

O detalhe de cada regra está em [`docs/dicionario-de-dados.md`](docs/dicionario-de-dados.md) e a justificativa das decisões em [`docs/modelagem.md`](docs/modelagem.md).

## Regerar tudo (para quem for mexer no modelo)

Edite `scripts/modelo.py` e rode:

```bash
pip install -r scripts/requirements.txt          # SQLAlchemy 2.x, só para gerar os arquivos
cd ../app && npx vite-node ../banco-de-dados/scripts/exportar_dados_do_front.ts   # opcional: reexporta os dados do front
cd ../banco-de-dados && python scripts/gerar_banco.py
```

Os diagramas (.png) são feitos a partir dos `.mmd` (texto Mermaid, que também abre em https://mermaid.live).
