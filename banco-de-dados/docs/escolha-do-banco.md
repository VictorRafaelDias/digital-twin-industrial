# Escolha do banco de dados (texto da entrega do Sprint 1)

Este é o texto que acompanha o link de acesso à base de dados. Ele resume a escolha; a comparação completa está em [`modelagem.md`](modelagem.md#5-banco-escolhido-sgbd-postgresql).

## Link de acesso à base de dados

**https://github.com/VictorRafaelDias/digital-twin-industrial/tree/main/banco-de-dados**

Na pasta estão: o DER (`der/`), o banco com as 21 tabelas criadas (`digital_twin.db` e os scripts em `sql/`), os comandos de CRUD (`sql/04_crud_exemplos.sql` e `scripts/crud_demo.py`), os testes e a documentação (`docs/`).

## Banco escolhido: PostgreSQL

Escolhemos o **PostgreSQL** como banco de dados do sistema Digital Twin Industrial. Como ele precisa de um servidor, a entrega traz também uma **cópia portátil em SQLite** (`digital_twin.db`), que abre com duplo clique, sem instalar nada. Os scripts de criação existem para os dois bancos e saem do mesmo modelo.

## Por que o PostgreSQL

1. **O sistema é uma aplicação com API e vários usuários.** O backend (FastAPI) vai ler e gravar ao mesmo tempo em que várias pessoas montam e simulam fábricas. O PostgreSQL trata acessos simultâneos com transações e bloqueios por linha; o SQLite aceita só um escritor por vez.
2. **O modelo depende de regras de integridade fortes**, e o próprio banco precisa garantir que elas sempre valem: uma conexão só liga máquinas da mesma fábrica (chave estrangeira composta), os limites de cada máquina seguem mínimo ≤ ótimo ≤ atenção ≤ falha ≤ máximo (regras entre colunas), e apagar uma fábrica apaga em cascata suas máquinas, conexões e simulações, enquanto uma máquina do catálogo em uso não pode ser apagada. O PostgreSQL aplica tudo isso sem configuração extra.
3. **Combina com o resto do projeto.** O backend é em Python (FastAPI e SQLAlchemy), e o PostgreSQL já estava previsto na decisão de stack do projeto, então não houve troca de rumo.
4. **Tem os tipos certos para o que guardamos:** números exatos (`NUMERIC`) para ritmos, capacidades e preços, datas (`TIMESTAMP`), verdadeiro/falso (`BOOLEAN`) e `JSONB` caso precisemos guardar dados flexíveis.
5. **Prepara o assistente com leitura de manuais (RAG), que está no escopo do projeto.** A extensão `pgvector` permite buscar trechos de manuais por significado no próprio banco, sem um segundo sistema.
6. **É gratuito, de código aberto e padrão de mercado**, o que facilita hospedagem, documentação e a continuidade do trabalho.

## Por que não os outros

- **SQLite:** é ótimo para protótipo e para entregar um arquivo único, por isso o usamos como cópia portátil e nos testes. Mas não foi feito para vários usuários gravando ao mesmo tempo, que é o uso previsto do sistema.
- **MySQL:** também atenderia a parte básica, mas o PostgreSQL combina melhor com o ecossistema Python que usamos e já traz a extensão `pgvector` para o assistente.

## O que foi entregue

- **DER** (diagrama entidade-relacionamento): visão geral e um diagrama por módulo, com todas as colunas.
- **Base de dados:** 21 tabelas em 5 módulos, 4 views e 345 linhas iniciais (o catálogo de 14 máquinas com fontes e preços, o glossário e fábricas de exemplo).
- **CRUD** (Create, Read, Update, Delete) demonstrado em todas as tabelas: `python scripts/crud_demo.py` executa os comandos e mostra os resultados.
- **23 testes automáticos** (SQLite) e **a verificação no PostgreSQL** (`scripts/testar_postgres.py`), que cobrem a criação, os dados, o CRUD em cada tabela e a recusa de dados inválidos.
- **`docker-compose.yml`**, que sobe o PostgreSQL com tudo criado em um comando.
- **Documentação:** documento em PDF e Word, dicionário de dados e texto de modelagem.

## O PostgreSQL foi testado num servidor de verdade

Os scripts de criação foram executados num servidor **PostgreSQL 16 (Docker)** e passaram: as 21 tabelas, as 4 views e os 345 registros iniciais foram criados sem erro; o CRUD completo rodou em todas as tabelas e deixou o banco igual ao inicial; e o banco recusou os 14 comandos inválidos do teste de integridade (chaves estrangeiras, valores únicos, regras entre colunas, chave composta e apagamento restrito).

Para repetir a verificação: `docker compose up -d` (sobe o banco já criado) e `python scripts/testar_postgres.py`, dentro da pasta `banco-de-dados/`. A cópia SQLite (`digital_twin.db`) continua disponível para abrir sem instalar nada e é usada nos testes unitários em Python.
