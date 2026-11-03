# Digital Twin Industrial: back-end (API)

API em **Python (FastAPI)** que guarda tudo no banco da pasta [`../banco-de-dados/`](../banco-de-dados/) (25 tabelas) e roda o **mesmo motor de simulação do front-end**. Cobre: login, catálogo de máquinas (manuais, fontes, preços), fábricas por usuário, simulação (gargalo, efeito cascata, fila e energia), planos de objetivo ("quero +10%"), cenários antes × depois, simulação com tempo (Play, inclusive ao vivo por WebSocket), **dashboard** (dados dos gráficos, com temperatura estimada das máquinas), **desgaste, manutenção e depreciação**, **importação de ficha técnica** (leitura por regras, sem IA e sem custo), registro (log) e conversa com o assistente.

O front-end (`../app`) já fala com esta API: na tela de login, marque **"Usar o servidor"**.

## Ver funcionando (3 passos)

Precisa só do Python 3.10 ou mais novo.

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Abra **http://127.0.0.1:8000/docs**: é a documentação interativa (Swagger). Clique em **Authorize**, entre com o usuário de demonstração **`victor.dias`** e a senha **`senha1234`** (ou crie sua conta em `POST /auth/register`) e use qualquer rota clicando em "Try it out".

Na primeira vez o servidor cria sozinho o banco `backend/data/digital_twin.db` (SQLite) com as 25 tabelas e os 345 registros iniciais (catálogo de 14 máquinas, fontes, preços, glossário e fábricas de exemplo). Para recomeçar do zero, apague esse arquivo. Se o arquivo for de uma versão antiga do banco (21 tabelas), o servidor **acrescenta sozinho** as colunas e tabelas novas ao subir, sem perder nenhuma linha.

**Com o front-end:** em outro terminal, `cd app`, `npm install`, `npm run dev`; na tela de login marque **Usar o servidor** (endereço `http://127.0.0.1:8000`) e entre com `victor.dias` / `senha1234`.

**Roteiro de 2 minutos no Swagger:**
1. `POST /auth/login`, depois Authorize com o token.
2. `POST /factories` com `{"name":"Teste","template":"bebidas"}`.
3. `GET /factories/{id}/simulate`: 11.400 garrafas/h, gargalo na rotuladora.
4. `PATCH /factories/{id}/machines/{mid}` com `{"value": 250}` na enchedora: ela falha e o efeito cascata aparece em `connections[].trouble`.
5. `POST /factories/{id}/plans` com `{"type":"pct","value":10}`, depois `POST /factories/{id}/plans/{plan_id}/apply`.
6. `POST /factories/{id}/play` para ver o resultado final da simulação com tempo e a linha do tempo.
7. `GET /factories/{id}/dashboard` (dados dos gráficos) e `GET /factories/{id}/wear` (desgaste de cada máquina).
8. `PATCH /factories/{id}/machines/{mid}` com `{"age_years": 3.75, "months_since_maintenance": 12}` e depois `GET .../simulate`: a máquina velha e sem manutenção rende menos e tem mais risco. `POST .../maintenance` zera o tempo sem manutenção.

## O que ele faz de novo (versão 2)

### Dashboard e temperatura das máquinas
`GET /factories/{id}/dashboard` devolve tudo para os gráficos: a fábrica agora (produção, máximo possível, energia, gargalo, fila), cada máquina (capacidade × saída, fila, risco, consumo e parte da energia, **temperatura estimada**, desgaste) e a última simulação guardada. `GET /factories/{id}/simulations/{sid}` devolve a **linha do tempo** daquela simulação, da fábrica e de cada máquina (no máximo 120 pontos, guardados no banco).

A **temperatura da máquina** é uma **hipótese didática**: ambiente mais um aquecimento proporcional à carga em que ela trabalha, maior acima do ritmo ótimo (motor 40 °C a plena carga, tanque 12 °C, etc.; câmara fria perto de 4 °C). Não vem de ficha de fabricante (`app/engine/thermal.py`).

### Idade, manutenção e depreciação das máquinas
A **idade da máquina** (anos de uso) e os **meses desde a última manutenção** são **dados de entrada**, informados por quem monta a fábrica (campos `age_years` e `months_since_maintenance` ao criar, salvar o desenho ou alterar uma máquina). O padrão é **máquina nova e manutenção em dia**. A simulação e o Play **não gastam** a máquina: o mesmo desenho dá sempre o mesmo resultado (por isso dá para comparar versões). Por dentro, idade e meses viram horas (4.000 h de uso por ano) e usam as colunas de horas que já existiam no banco. Efeitos (todos **hipótese didática**, em `app/engine/wear.py`):
- até **−20%** de rendimento no fim da vida útil e até **−5%** com manutenção muito atrasada;
- o risco base (2%) sobe até **+8 pontos** pela idade e **+4** pela manutenção atrasada;
- a máquina **esquenta** até **+8 °C** pela idade (curva quadrática) e **+4 °C** pela manutenção atrasada;
- **depreciação** linear até 10% do preço de nova; previsão de "manutenção em N horas" e de "fim da vida útil em N horas";
- a **manutenção** (`POST .../maintenance`) zera o tempo desde a última manutenção e fica no histórico; ela **não rejuvenesce** a máquina.

A vida útil e o intervalo de manutenção vêm da categoria da máquina (ex.: envase 25.000 h e 800 h; as mesmas tabelas do banco e do front-end, conferidas por teste). O efeito entra no mesmo motor da simulação: a produção, o gargalo, os planos e o dashboard já consideram máquinas velhas. Os números do exemplo (11.400 garrafas/h) só mudam quando a idade é informada.

### Importar a ficha técnica de uma máquina
`POST /catalog/imports` recebe um PDF (com texto) ou `.txt`. O servidor lê o documento **por regras** (palavras-chave e padrões de texto; **sem IA e sem custo**), extrai fabricante, modelo, ano, capacidade, potência e uma sugestão de tipo, e devolve cada campo com o **trecho do documento e a página** de onde veio. O usuário confere e edita (`/preview`), e o sistema avisa se **já existe uma máquina parecida** (mesmo fabricante e modelo, ou nome parecido), mostrando os dois **lado a lado**. Então o usuário decide (`/confirm`):
- **atualizar** a existente (sobrepõe: serve quando a ficha só traz mais dados);
- **salvar como nova versão** (v2, v3...: a antiga **continua no sistema**);
- **criar** uma máquina nova (se for diferente da parecida).

O mesmo arquivo não entra duas vezes (impressão digital SHA-256). Máquinas importadas podem ser apagadas (`DELETE /catalog/machines/{code}`), exceto se alguma fábrica as usar. Os **limites de ritmo** (ótimo 100%, atenção 110%, falha 120% da capacidade nominal), o consumo parado/variável (15%/85% da potência), a vida útil e a conversão de litros/h em garrafas/h (garrafa de 0,5 L) são **hipóteses didáticas** marcadas na tela; o que a leitura não encontra fica em branco para preencher. Testado com uma ficha real da Tetra Pak (Pasteurizer D Base): leu fabricante, modelo, ano (2018), capacidade (10.000 l/h) e potência (15 kW).

## PostgreSQL

O banco do sistema é o PostgreSQL; o SQLite é só o padrão para abrir sem instalar nada. Para usar o PostgreSQL, aponte a variável `DATABASE_URL`:

```bash
# com Docker (sobe o banco e a API juntos)
cd backend
docker compose up --build

# ou num PostgreSQL já instalado (no Windows: set DATABASE_URL=...)
export DATABASE_URL=postgresql+psycopg2://usuario:senha@localhost:5432/digital_twin
python -m uvicorn app.main:app
```

Para rodar os testes contra um PostgreSQL de teste (**apaga as tabelas dele**): `DT_TEST_DATABASE_URL=postgresql+psycopg2://... python -m pytest`.

> **Validado no PostgreSQL 16.15 (Docker):** os **430 testes** da API passam também contra o PostgreSQL (`DT_TEST_DATABASE_URL`), e o pacote `docker compose up --build` sobe a API e o banco juntos (`/health` responde `postgresql`, 25 tabelas, 345 linhas, login funcionando). A validação achou um defeito que só o PostgreSQL mostra (a carga dos dados iniciais, por causa do símbolo "%" nos textos), já corrigido. Os testes do dia a dia rodam no SQLite, que é mais rápido.

## Como é por dentro

```
backend/
├── app/
│   ├── main.py            monta a API (rotas, CORS, erros) e cria/atualiza o banco ao subir
│   ├── config.py          configurações (variáveis de ambiente)
│   ├── schema.py          carrega as tabelas de ../banco-de-dados/scripts/modelo.py (única fonte da verdade)
│   ├── db.py              conexão (SQLite ou PostgreSQL), criação das tabelas, migração que só acrescenta e dados iniciais
│   ├── security.py        senha (PBKDF2-SHA256 com sal) e token de login (JWT HS256)
│   ├── deps.py            quem é o usuário logado e a fábrica que ele pode acessar
│   ├── catalog_repo.py    lê o catálogo do banco e converte para o motor
│   ├── catalog_admin.py   consultas e ajustes do catálogo, categorias, fontes, glossário, efeitos da temperatura
│   ├── datasheet.py       leitura de fichas técnicas por regras (sem IA)
│   ├── imports.py         importar ficha: conferir, evitar duplicidade, atualizar, versionar, excluir
│   ├── factories.py       fábricas, máquinas, conexões, registro (grava no banco)
│   ├── analysis.py        planos, cenários, Play, linha do tempo, dashboard, registro e conversa
│   ├── maintenance.py     desgaste, manutenção, depreciação e previsão
│   ├── chat.py            assistente de regras (sem IA e sem custo)
│   ├── views.py           converte resultados do motor em respostas da API
│   ├── schemas.py         formato e validação dos pedidos
│   ├── routers/           as rotas, agrupadas (auth, catalog, factories, system)
│   └── engine/            MOTOR DE SIMULAÇÃO (funções puras, sem banco): simulate, connect, goal,
│                          bottleneck, run, cost, water, wear, thermal, format, types
├── tests/                 430 testes automáticos (ver abaixo)
├── scripts/gerar_golden.ts  gera os casos de referência a partir do código do front-end
├── Dockerfile, docker-compose.yml
└── requirements.txt, requirements-dev.txt
```

**Camadas:** rotas (`routers/`) → regras e gravação (`factories.py`, `analysis.py`, `catalog_admin.py`, `imports.py`, `maintenance.py`) → motor (`engine/`, que não conhece o banco). O banco é a última barreira: as regras de integridade (chave composta que impede ligar máquinas de fábricas diferentes, limites coerentes, cascata de exclusão, manutenção que nunca aumenta o desgaste) continuam valendo mesmo que a API tenha um erro.

**Segurança:** a senha nunca é guardada em texto (hash PBKDF2-SHA256 com sal); o login devolve um token assinado (HS256) que vence em 8 h; cada usuário só enxerga as próprias fábricas (a de outra pessoa responde "não encontrada", sem revelar que existe). Em produção, troque `SECRET_KEY`.

**Decisões de projeto:**
- **Sem perfis** (decisão do projeto): qualquer usuário logado pode ajustar limites e preços do catálogo e importar fichas, como na tela Configurações. Para tornar o catálogo somente leitura: `ALLOW_CATALOG_EDIT=0`.
- **O motor é o do front-end**, portado para Python (e o desgaste foi acrescentado nos dois). Os testes provam que os dois dão exatamente o mesmo resultado (ver "Testes").
- **Sem custo, sempre:** o assistente e a leitura de fichas técnicas são regras, não modelos de linguagem pagos.
- Preços são **estimativas**; limites de risco, perda por temperatura, desgaste e temperatura da máquina são **hipóteses didáticas** (a validar). A API devolve sempre a fonte e a confiança (`real`, `estimado` ou `hipotese`).

## Variáveis de ambiente

| Variável | Para quê | Padrão |
|---|---|---|
| `DATABASE_URL` | Banco de dados | SQLite em `backend/data/digital_twin.db` |
| `SECRET_KEY` | Assina os tokens de login | `dev-troque-esta-chave-em-producao` |
| `TOKEN_MINUTES` | Validade do login | `480` (8 h) |
| `CORS_ORIGINS` | Sites que podem chamar a API (separados por vírgula) | `*` |
| `ALLOW_CATALOG_EDIT` | `0` = catálogo somente leitura | `1` |
| `ALLOW_PUBLIC_REGISTER` | `0` = fecha o `POST /auth/register`: só quem já está dentro cadastra gente nova (`POST /users`) | `1` |
| `DT_SEED` | `0` = não carregar os dados iniciais | `1` |
| `DT_TEST_DATABASE_URL` | Só nos testes: roda a suíte num PostgreSQL de teste | (vazio: SQLite) |

## Simulação ao vivo (WebSocket)

`ws://127.0.0.1:8000/factories/{id}/play/ws?token=<token>&speed=20&duration_min=60`

O servidor manda um quadro (`"type":"tick"`) a cada 0,25 s com o minuto simulado, as garrafas produzidas, a energia, a fila e o estado e a temperatura de cada máquina; no fim manda `"type":"result"` (e guarda no histórico, com a linha do tempo e o desgaste). O cliente pode mandar `{"cmd":"pause"}`, `{"cmd":"resume"}` ou `{"cmd":"stop"}`. Com `&realtime=false` o servidor não espera os 0,25 s (útil em testes). Velocidades: 1, 5, 20 e 60; em ×1, 1 segundo real = 1 minuto simulado, e o produto leva 3 minutos por etapa para chegar a cada máquina. (O front-end calcula o Play no navegador, com a mesma conta, e manda ao servidor só o pedido de guardar o resultado ao terminar.)

## Todas as rotas (69 + o WebSocket)

**Sistema**

| Método | Rota | O que faz |
|---|---|---|
| GET | `/health` | O servidor e o banco estão de pé? |

**Acesso (login)**

| Método | Rota | O que faz |
|---|---|---|
| POST | `/auth/register` | Criar uma conta |
| POST | `/auth/login` | Entrar (devolve o token) |
| GET | `/auth/me` | Quem sou eu |
| PATCH | `/auth/me` | Mudar o nome mostrado ou a senha |

**Catálogo e conhecimento**

| Método | Rota | O que faz |
|---|---|---|
| GET | `/catalog/machines` | Lista as máquinas do catálogo |
| GET | `/catalog/machines/{code}` | Uma máquina completa: limites, manual, fontes, preço e modelos reais |
| PATCH | `/catalog/machines/{code}` | Mudar a categoria, o nome ou ativar/desativar a máquina |
| DELETE | `/catalog/machines/{code}` | Apagar uma máquina importada (só se nenhuma fábrica usar) |
| GET | `/catalog/machines/{code}/versions` | Versões da mesma máquina (v1, v2...): as antigas continuam no sistema |
| PATCH | `/catalog/machines/{code}/limits` | Ajustar os limites (ótimo, atenção, falha) |
| PUT | `/catalog/machines/{code}/price` | Informar uma nova faixa de preço estimada (o histórico fica guardado) |
| GET | `/catalog/categories` | Tipos de máquina (Insumos, Preparo, Térmico e gás...) |
| POST | `/catalog/categories` | Criar um tipo de máquina |
| PATCH | `/catalog/categories/{code}` | Renomear, descrever ou ligar/desligar um tipo |
| DELETE | `/catalog/categories/{code}` | Apagar um tipo (só se não tiver máquinas) |
| GET | `/catalog/stages` | Etapas do processo e a zona da planta baixa de cada uma |
| GET | `/catalog/sources` | Fontes dos números, com link e confiança (real, estimado ou hipótese) |
| GET | `/catalog/real-models` | Modelos comerciais reais pesquisados (Krones, Tetra Pak...) |
| GET | `/glossary` | Glossário de palavras difíceis |
| GET | `/ambient/effects` | O que a temperatura ambiente muda em cada máquina (e a dilatação da água) |

**Usuários** (sem perfis: quem está dentro pode ver a lista, cadastrar gente nova e ativar/desativar contas; ninguém é apagado)

| Método | Rota | O que faz |
|---|---|---|
| GET | `/users` | Quem está cadastrado (login, nome, nº de fábricas, último acesso, se está ativo, qual sou eu) |
| POST | `/users` | Cadastra um usuário novo (login, nome opcional, senha de no mínimo 6 caracteres) |
| PATCH | `/users/{id}` | `{"active": false}` desativa (não consegue entrar, nem com token antigo); `true` reativa. Não deixa desativar a si mesmo nem o último ativo |

**Dados reais (ficha técnica)**

| Método | Rota | O que faz |
|---|---|---|
| POST | `/catalog/imports` | Anexar a ficha técnica de uma máquina (PDF ou texto): o sistema lê e propõe os dados |
| GET | `/catalog/imports` | Documentos já anexados |
| GET | `/catalog/imports/{import_id}` | Um documento: o que foi lido (com o trecho de origem), o rascunho da máquina e as máquinas parecidas que já existem |
| POST | `/catalog/imports/{import_id}/preview` | Refaz o rascunho com as suas correções (não grava nada) |
| POST | `/catalog/imports/{import_id}/confirm` | Confirmar: criar a máquina, atualizar a existente (sobrepõe) ou salvar como nova versão |
| DELETE | `/catalog/imports/{import_id}` | Descartar a análise (não vira máquina) |

**Fábricas**

| Método | Rota | O que faz |
|---|---|---|
| GET | `/templates` | Exemplos prontos para carregar |
| GET | `/factories` | Minhas fábricas |
| POST | `/factories` | Criar uma fábrica (em branco ou a partir de um exemplo) |
| GET | `/factories/{fid}` | Uma fábrica com as máquinas e as conexões |
| PATCH | `/factories/{fid}` | Nome, temperatura ambiente, tarifa de energia e parada de emergência |
| DELETE | `/factories/{fid}` | Apagar a fábrica (e tudo que é dela) |
| PUT | `/factories/{fid}/layout` | Salvar o desenho inteiro de uma vez (máquinas com `id` são atualizadas no lugar e mantêm o desgaste) |
| POST | `/factories/{fid}/machines` | Colocar uma máquina do catálogo na fábrica |
| DELETE | `/factories/{fid}/machines` | Limpar tudo (todas as máquinas e conexões) |
| PATCH | `/factories/{fid}/machines/{mid}` | Mudar ritmo, unidades em paralelo, ligar/desligar ou posição |
| DELETE | `/factories/{fid}/machines/{mid}` | Tirar uma máquina (as conexões dela saem junto) |
| GET | `/factories/{fid}/connections/check` | Posso ligar A em B? (não grava nada; explica o motivo se não puder) |
| POST | `/factories/{fid}/connections` | Ligar a saída de uma máquina à entrada de outra |
| DELETE | `/factories/{fid}/connections/{cid}` | Desligar duas máquinas |
| GET | `/factories/{fid}/simulate` | Simula a fábrica agora: produção, gargalo, risco, fila, energia, temperatura e efeito cascata |
| GET | `/factories/{fid}/bottleneck` | Por que existe o gargalo e como melhorar (com preço estimado) |
| POST | `/factories/{fid}/what-if` | E se eu colocar mais máquinas no gargalo? (recalcula em cascata) |
| POST | `/factories/{fid}/apply-changes` | Aplicar mudanças (uma opção do gargalo ou o resultado de "e se...") |
| POST | `/factories/{fid}/plans` | Planejar um objetivo ("quero +10%"): passos, porquês, risco e custo |
| GET | `/factories/{fid}/plans` | Planos já calculados desta fábrica |
| GET | `/factories/{fid}/plans/{plan_id}` | Um plano |
| POST | `/factories/{fid}/plans/{plan_id}/apply` | Aplicar o plano na fábrica |
| POST | `/factories/{fid}/scenarios` | Tirar uma "foto" da fábrica agora (para comparar depois) |
| GET | `/factories/{fid}/scenarios` | Cenários salvos |
| GET | `/factories/{fid}/scenarios/compare` | Antes × depois: compara dois cenários |
| GET | `/factories/{fid}/scenarios/{sid}` | Um cenário, máquina por máquina |
| DELETE | `/factories/{fid}/scenarios/{sid}` | Apagar um cenário |
| POST | `/factories/{fid}/play` | Roda a simulação inteira de uma vez, devolve o resultado final e a linha do tempo, e guarda tudo (não gasta as máquinas) |
| GET | `/factories/{fid}/simulations` | Histórico dos resultados finais de simulação |
| GET | `/factories/{fid}/simulations/{sid}` | Uma simulação guardada, com a linha do tempo da fábrica e de cada máquina |
| GET | `/factories/{fid}/dashboard` | Dados para os gráficos: a fábrica agora, cada máquina, energia, desgaste e a última simulação |
| GET | `/factories/{fid}/wear` | Desgaste, depreciação e previsão de manutenção de cada máquina |
| POST | `/factories/{fid}/machines/{mid}/maintenance` | Registrar uma manutenção (recupera parte do desgaste) |
| GET | `/factories/{fid}/maintenance` | Histórico de manutenções da fábrica |
| GET | `/factories/{fid}/events` | Registro (log) do que aconteceu na fábrica |
| DELETE | `/factories/{fid}/events` | Limpar o registro (o das simulações salvas fica) |
| GET | `/factories/{fid}/chat` | Conversa com o assistente |
| POST | `/factories/{fid}/chat` | Perguntar ao assistente (regras, não é uma IA) |
| DELETE | `/factories/{fid}/chat` | Apagar a conversa desta fábrica |

Mais o WebSocket `/factories/{id}/play/ws` (acima). O Swagger (`/docs`) mostra o formato de cada pedido e resposta, com exemplos.

## Testes

```bash
pip install -r requirements-dev.txt
python -m pytest
```

**430 testes** (mais 1 que só roda com o PDF real, ver abaixo), em grupos:

| Arquivo | O que prova |
|---|---|
| `tests/test_engine_paridade.py` (306) | O motor em Python dá **exatamente os mesmos resultados** do motor do front-end (TypeScript) em 60 fábricas variadas (falhas, filas, divisão de fluxo, temperatura, emergência, **máquinas desgastadas**, Play em andamento), 300 planos de objetivo, relatórios de gargalo, "e se...", 3.300 pares de conexão e 4 simulações de Play completas |
| `tests/test_api_acesso_catalogo.py` | Login, cadastro, token, catálogo igual ao do front, ajuste de limites e preços com regras, categorias, fontes, glossário, efeitos da temperatura |
| `tests/test_api_fabricas.py` | Montar a fábrica, regras de conexão com explicação, dono da fábrica, integridade, salvar o desenho inteiro, registro |
| `tests/test_api_analise.py` | Simulação (11.400 garrafas/h, gargalo na rotuladora), cascata, planos (salvar e aplicar), cenários antes × depois, Play completo e ao vivo (WebSocket), conversa |
| `tests/test_api_desgaste_dashboard.py` | Curva de desgaste e depreciação, temperatura, dashboard, linha do tempo guardada, manutenção, desgaste que sobrevive ao salvar o desenho |
| `tests/test_api_ficha_tecnica.py` | Leitura da ficha (modelo no formato da ficha real da Tetra Pak), números em formato inglês e brasileiro, PDF de verdade, duplicidade lado a lado, atualizar, nova versão, nomes únicos, excluir, limites |
| `tests/test_api_borda.py` | Entradas absurdas: `NaN`/`Infinity`, ids gigantes, textos estranhos (script, emoji, NUL), arquivo de 1,8 MB, fábrica com 200 máquinas, desgaste extremo, 5 usuários ao mesmo tempo. Nunca pode dar erro 500 |
| `tests/test_api_usuarios.py` | Listar, cadastrar, login do usuário novo, desativar (inclusive token antigo), regras de não desativar a si mesmo nem o último ativo, cadastro público fechado |
| `tests/test_play_velocidades.py` | O total produzido num Play não depende da velocidade (30 min em ×1, ×5 e ×60 dão o mesmo; 8 h bate com a conta; o WebSocket termina no mesmo total) |
| `tests/test_migracao.py` | Um banco da versão 1 (reconstruído do git) é atualizado sozinho para a versão 2, sem perder linhas, e a API funciona nele |

Os casos de referência (`tests/golden/`) são gerados pelo próprio código do front-end. Para gerar de novo, a partir da pasta `app/`: `npx vite-node ../backend/scripts/gerar_golden.ts`. Para rodar também o teste com uma ficha técnica real em PDF: `DT_FICHA_EXEMPLO=caminho/da/ficha.pdf python -m pytest`.

## O que ainda não tem (honestidade)

- **Play ao vivo no front-end:** o front calcula o Play no navegador (mesma conta do servidor) e só guarda o resultado no servidor; o WebSocket existe e é testado, mas a tela ainda não o usa.
- **Conversa do front-end:** continua usando as regras locais; o endpoint de conversa do servidor (que consulta os textos de manual do banco) existe, mas a tela ainda não o usa.
- **Assistente com leitura real de manuais (RAG):** o assistente usa regras e os textos de manual que estão no banco.
- **Leitura de PDF escaneado (imagem):** a ficha precisa ter texto selecionável; não há OCR.
- **Desgaste e temperatura** são hipóteses didáticas a validar com o professor.
