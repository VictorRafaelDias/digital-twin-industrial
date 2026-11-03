# Modelagem da base de dados

Como a base foi pensada e por que cada decisão foi tomada. O detalhe de cada tabela e coluna está no [dicionário de dados](dicionario-de-dados.md); os diagramas estão em [`../der/`](../der/).

## 1. O que o sistema precisa guardar

A partir das telas do front-end, o sistema precisa lembrar de:

| Necessidade | Vem de qual tela ou função | Tabelas |
|---|---|---|
| Quem entra no sistema | Login | `usuarios` |
| As máquinas que existem para montar a fábrica, com limites, capacidade e consumo | Lista de máquinas, aba Máquina, Configurações › Limites | `categorias`, `etapas`, `maquinas_catalogo` |
| Explicação de cada máquina | Manual das máquinas | `manuais_maquina` |
| De onde vêm os números (com link e confiança) | "De onde vêm os números", Catálogo e fontes | `fontes`, `maquina_fontes` |
| Preço estimado de uma melhoria | Resultados › Avisos, Configurações › Preços | `precos_maquina` |
| Modelos comerciais reais pesquisados | Pesquisa de mercado do projeto | `modelos_reais` |
| Palavras difíceis explicadas | Glossário e termos sublinhados | `glossario_termos`, `glossario_palavras` |
| A fábrica montada pelo usuário | Aba Montar | `fabricas`, `fabrica_maquinas`, `conexoes` |
| Fotos "antes e depois" de uma fábrica | Resultados › Antes × depois | `cenarios`, `cenario_maquinas` |
| Resultado de cada Play | Janela de resultado final | `simulacoes` |
| O que aconteceu e quando | Aba Registro | `eventos_registro` |
| Planos do tipo "quero +10%" | Aba Objetivo, simular uma melhoria | `planos_objetivo`, `plano_passos` |
| Conversa com o assistente | Aba Conversa | `mensagens_chat` |

## 2. Entidades e relacionamentos

Cada linha lê-se "um(a) X … vários(as) Y".

| Relacionamento | Cardinalidade | Observação |
|---|---|---|
| `usuarios` possui `fabricas` | 1 para N | apagar o usuário apaga as fábricas dele (se não houver histórico de simulação) |
| `categorias` agrupa `maquinas_catalogo` | 1 para N | |
| `etapas` contém `maquinas_catalogo` | 1 para N | a etapa também diz em que zona da planta baixa a máquina aparece |
| `maquinas_catalogo` tem `manuais_maquina` | 1 para 1 | a chave primária do manual é a própria chave estrangeira |
| `maquinas_catalogo` N para N `fontes` | N para N | tabela de ligação `maquina_fontes`, com a finalidade (`numeros` ou `preco`) |
| `maquinas_catalogo` tem `precos_maquina` | 1 para N | permite guardar o histórico de preços |
| `maquinas_catalogo` é exemplificada por `modelos_reais` | 1 para N | cada modelo real aponta para uma fonte |
| `glossario_termos` é chamado por `glossario_palavras` | 1 para N | |
| `fabricas` contém `fabrica_maquinas` | 1 para N | cada uma é "um tipo do catálogo colocado na fábrica" |
| `maquinas_catalogo` instancia `fabrica_maquinas` | 1 para N | |
| `fabrica_maquinas` liga-se a `fabrica_maquinas` por `conexoes` | N para N (auto-relacionamento) | origem e destino da mesma fábrica |
| `fabricas` gera `cenarios`; `cenarios` detalha `cenario_maquinas` | 1 para N, 1 para N | |
| `fabricas` é simulada em `simulacoes`; recebe `planos_objetivo` | 1 para N | |
| `planos_objetivo` é feito de `plano_passos` | 1 para N | |
| `simulacoes` e `fabricas` registram `eventos_registro` | 1 para N (opcional) | o evento pode ser geral, de uma fábrica ou de uma simulação |
| `usuarios` escreve `mensagens_chat` | 1 para N | |

## 3. Normalização

O modelo está na **terceira forma normal (3FN)**:

- **1FN (valores atômicos):** nenhuma coluna guarda lista. As palavras que disparam um termo do glossário ficaram numa tabela própria (`glossario_palavras`), e as fontes de cada máquina em `maquina_fontes`, em vez de colunas com várias palavras ou links.
- **2FN (nada depende de parte da chave):** nas tabelas com chave composta (`maquina_fontes`) a única coluna extra faz parte da chave; as demais tabelas têm chave de uma coluna.
- **3FN (nada depende de outra coluna que não seja a chave):** a zona da planta baixa depende da etapa, então mora em `etapas` e não em cada máquina; a categoria mora em `categorias`; o nome do dono de uma fábrica é lido de `usuarios`, não repetido.

Uma escolha consciente: `cenario_maquinas` e `plano_passos` guardam **valores históricos** (o ritmo, a capacidade e o risco de quando a foto foi tirada). Eles parecem repetir dados da máquina, mas são a **foto** daquele momento: se a máquina mudar depois, a foto não pode mudar. Por isso não é redundância, é histórico. A primeira versão do backend guardava essa foto num campo de texto JSON; aqui virou uma tabela, que permite consultar e somar por SQL.

## 4. Decisões de projeto

- **Identificadores:** chave primária numérica automática (`id`) em quase todas as tabelas; o texto "natural" (código da máquina, nome de usuário, URL da fonte) fica como valor **único**.
- **Chave composta para garantir a mesma fábrica:** `conexoes` aponta para `fabrica_maquinas` usando `(fabrica_id, id)`. Assim o banco recusa ligar uma máquina da fábrica A a uma da fábrica B, sem precisar de gatilho.
- **Regras de apagamento (ON DELETE):**
  - `CASCADE` para o que não existe sem o pai (fábrica → máquinas, conexões, cenários, simulações, planos, eventos).
  - `RESTRICT` para o catálogo: uma máquina usada em alguma fábrica não pode ser apagada; e um usuário com histórico de simulação ou de planos não pode ser apagado (o histórico é protegido).
  - `SET NULL` onde o registro deve sobreviver sem o vínculo (a mensagem do chat continua se a fábrica for apagada; o gargalo de um cenário vira "desconhecido" se a máquina for removida).
- **Tipos:** valores monetários e de ritmo em `NUMERIC` (sem erro de arredondamento de ponto flutuante); datas em `TIMESTAMP`; verdadeiro/falso em `BOOLEAN`; textos curtos em `VARCHAR` com limite e textos longos em `TEXT`.
- **Regras no próprio banco (CHECK):** limites coerentes (mínimo ≤ ótimo ≤ atenção ≤ falha ≤ máximo), temperatura 0 a 45 °C, unidades em paralelo de 1 a 6, risco entre 0 e 1, estados e tipos só nos valores previstos. A tela também valida, mas o banco é a última barreira.
- **Senha:** só o hash (PBKDF2-SHA256 com sal) é guardado.
- **Fontes e confiança:** toda fonte tem `confianca` (`real`, `estimado` ou `hipotese`), seguindo a regra do projeto: dado real tem link; hipótese diz em que se baseia.

## 5. Banco escolhido (SGBD): PostgreSQL

O professor deixou a escolha livre. **O banco do sistema é o PostgreSQL.** O SQLite entra só como cópia portátil para demonstração (abre com duplo clique, sem instalar servidor).

| Critério | PostgreSQL | SQLite | MySQL |
|---|---|---|---|
| Vários usuários e a API gravando ao mesmo tempo | Sim (servidor, transações e bloqueios por linha) | Limitado (um escritor por vez) | Sim |
| Regras de integridade que o modelo usa (chave estrangeira composta, CHECK entre colunas, ON DELETE) | Completo | Completo, mas as chaves estrangeiras precisam ser ligadas a cada conexão | CHECK e chaves compostas com limitações históricas |
| Combina com o backend (Python, FastAPI, SQLAlchemy) | Excelente | Bom (só para protótipo) | Bom |
| Tipos para o que o sistema guarda (NUMERIC exato, TIMESTAMP, BOOLEAN, JSON) | Completo, com JSONB | Tipos fracos (tudo vira poucos tipos internos) | Bom |
| Busca por significado nos manuais (assistente RAG, previsto no projeto) | Extensão `pgvector` no próprio banco | Não tem | Recurso mais recente |
| Custo e licença | Gratuito e código aberto | Gratuito e de domínio público | Gratuito (Oracle) |
| Facilidade para o professor abrir | Precisa de servidor (Docker ou instalação) | Basta o arquivo | Precisa de servidor |

**Por que PostgreSQL para esta aplicação:**

1. **O sistema vai ter uma API gravando e lendo ao mesmo tempo**, com vários usuários e simulações. O SQLite trava com vários escritores; o PostgreSQL foi feito para isso.
2. **A integridade importa**: o modelo usa chaves compostas (uma conexão só liga máquinas da mesma fábrica), regras entre colunas e apagamento em cascata. O PostgreSQL aplica tudo isso sempre, sem configuração extra.
3. **O projeto já previa o PostgreSQL** (decisão `docs/decisoes/0001-stack.md`), então não há troca de rumo.
4. **O assistente com leitura de manuais (RAG)**, que está no escopo, pode usar a extensão `pgvector` para buscar trechos por significado, sem outro banco.
5. É **gratuito, aberto e padrão de mercado**, o que ajuda no futuro (hospedagem, equipe, documentação).

**Como ficou a entrega:**

- Os scripts de criação, dados, views e exemplos de CRUD existem para **os dois**, gerados do mesmo modelo (`scripts/modelo.py`), então nunca saem diferentes. Os dados, as views e o CRUD usam SQL padrão e rodam igual nos dois bancos.
- O `digital_twin.db` (SQLite) é a cópia portátil: serve para o professor abrir, para a demonstração de CRUD e para os testes automáticos.
- **Versão 2 (25 tabelas): os scripts de PostgreSQL foram executados num servidor PostgreSQL 16 (Docker) e passaram:** as 25 tabelas, as 4 views e os 345 registros iniciais foram criados sem erro; o CRUD completo (`sql/04_crud_exemplos.sql`) rodou e deixou o banco igual ao inicial; e o banco recusou os 14 comandos inválidos de `testes/test_integridade_postgres.sql` (chaves estrangeiras, valores únicos, regras CHECK, chave composta e RESTRICT). O `docker-compose.yml` sobe o banco com um comando (`docker compose up -d`) e `scripts/testar_postgres.py` repete essa verificação.
- A validação foi feita com o PostgreSQL 16.15 em contêiner Linux (Alpine). Os testes unitários em Python (`testes/test_banco.py`) continuam rodando no SQLite.

## 6. Ligação com o sistema

- O **front-end** (React) hoje calcula tudo no navegador e não grava no banco. A próxima etapa é uma API (FastAPI) que lê e grava nestas tabelas; o motor de simulação continua o mesmo.
- O **backend atual** (`backend/app/db_models.py`) tem 4 tabelas (`plants`, `machine_instances`, `connections`, `scenarios`), com nomes em inglês. Elas correspondem a `fabricas`, `fabrica_maquinas`, `conexoes` e `cenarios`, que aqui ganharam os campos que o front já usa (unidades em paralelo, máquina desligada, temperatura, tarifa) e as tabelas de catálogo, preço, resultados e registro. A migração é um mapeamento direto de nomes.
- Os **dados iniciais** vêm do próprio código do front (`scripts/exportar_dados_do_front.ts`), para o banco e a tela nunca divergirem.

## 8. Versão 2 do banco (tabelas e colunas novas)

A versão 1 (21 tabelas) foi a entregue no Sprint 1. A versão 2 **só acrescenta**: nada do que já existia mudou. Ela nasceu de três pedidos novos (dashboard, desgaste das máquinas e importação de ficha técnica).

| O que | Onde | Para quê |
|---|---|---|
| `simulacao_pontos` e `simulacao_pontos_maquina` | tabelas novas | Guardam a **linha do tempo** de cada simulação (um ponto por passo, no máximo 120): produção, energia, fila e risco da fábrica, e a leitura de cada máquina (saída, risco, estado, consumo e **temperatura estimada**). Alimentam os gráficos do dashboard. |
| `manutencoes` | tabela nova | Histórico de manutenções de cada máquina da fábrica (preventiva ou corretiva, com o desgaste antes e depois). |
| `documentos_maquina` | tabela nova | Fichas técnicas anexadas: nome, impressão digital (`sha256`, único: o mesmo arquivo não entra duas vezes), texto lido, o que o sistema entendeu (JSON) e a máquina criada a partir dele. |
| `fabrica_maquinas`: `instalada_em`, `horas_operacao`, `horas_desgaste`, `manutencao_em_h` | colunas novas | Idade e desgaste de cada máquina colocada numa fábrica. As horas de desgaste correm mais rápido acima do ritmo ótimo. |
| `maquinas_catalogo`: `fabricante`, `modelo`, `ano_modelo`, `versao`, `grupo_codigo`, `origem`, `vida_util_h`, `intervalo_manutencao_h` | colunas novas | **Versões** da mesma máquina (v1, v2...: as antigas continuam no sistema), origem (embutida ou importada de uma ficha) e a vida útil e o intervalo de manutenção usados no desgaste e na depreciação. |

Regras novas no próprio banco: manutenção nunca aumenta o desgaste; o desgaste na última manutenção nunca passa do desgaste atual; horas nunca negativas; no máximo um ponto por minuto de cada simulação; o estado da máquina na linha do tempo só aceita os 5 valores de sempre; a origem da máquina é `embutida` ou `importada`; a versão começa em 1.

**Hipótese didática:** a vida útil, o intervalo de manutenção, a perda de rendimento com a idade, a depreciação e a temperatura da máquina são valores escolhidos para o simulador mostrar o efeito (estão em `backend/app/engine/wear.py` e `thermal.py`), não vêm de fichas de fabricantes.

**Como um banco antigo vira a versão 2:** o servidor (`backend/`) acrescenta sozinho as colunas que faltam ao subir (migração que só acrescenta; testada com o banco real da versão 1). Os DER em imagem (`der/*.png`) mostram as 21 tabelas da versão 1; as 4 tabelas novas e as colunas novas estão no dicionário de dados e nos arquivos de texto `der/*.mmd`.

## 9. Limitações conhecidas

- Senhas: o login do front sem servidor é apenas de demonstração; com o back-end (`backend/`), o login confere a senha na tabela `usuarios`.
- A linha do tempo do Play guarda no máximo 120 pontos por simulação (não é uma leitura por segundo). Alarmes ficam nos resultados, sem tabela própria.
- O assistente de conversa não guarda os manuais em PDF no banco; só o texto das mensagens.
