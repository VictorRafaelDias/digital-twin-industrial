# Dicionário de dados

Gerado automaticamente por `scripts/gerar_banco.py` a partir de `scripts/modelo.py`. Descreve cada tabela, coluna, tipo, chave e regra de integridade.

Legenda: **PK** = chave primária; **FK** = chave estrangeira; **UQ** = valor único; **NN** = obrigatório (não pode ficar vazio).

A base tem **21 tabelas**, em 5 módulos.

| Módulo | Tabelas |
|---|---|
| Acesso | `usuarios` |
| Catálogo de máquinas | `categorias`, `etapas`, `maquinas_catalogo`, `manuais_maquina`, `fontes`, `maquina_fontes`, `precos_maquina`, `modelos_reais` |
| Apoio ao usuário | `glossario_termos`, `glossario_palavras`, `mensagens_chat` |
| Fábricas | `fabricas`, `fabrica_maquinas`, `conexoes` |
| Simulação e resultados | `cenarios`, `cenario_maquinas`, `simulacoes`, `planos_objetivo`, `plano_passos`, `eventos_registro` |

## Módulo: Acesso

### `usuarios`

Pessoas que entram no sistema (login simples: usuário e senha, sem perfis)

| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|---|
| `id` | INTEGER | PK | sim |  | Identificador da linha (gerado automaticamente) |
| `nome_usuario` | VARCHAR(50) | UQ | sim |  | Nome de login (único) |
| `nome_exibicao` | VARCHAR(100) |  | sim |  | Nome mostrado na tela |
| `senha_hash` | VARCHAR(255) |  | sim |  | Senha protegida (PBKDF2-SHA256 com sal); nunca a senha em texto |
| `ativo` | BOOLEAN |  | sim | verdadeiro | Falso = usuário desativado |
| `criado_em` | DATETIME |  | sim | agora | Quando a conta foi criada |
| `ultimo_acesso_em` | DATETIME |  | não |  | Último login (vazio se nunca entrou) |

## Módulo: Catálogo de máquinas

### `categorias`

Tipos de máquina (grupos do catálogo): Insumos, Preparo, Térmico e gás, Envase, Pós-envase, Refrigeração

| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|---|
| `id` | INTEGER | PK | sim |  | Identificador da linha (gerado automaticamente) |
| `codigo` | VARCHAR(30) | UQ | sim |  | Código curto (ex.: insumos, preparo, termico) |
| `nome` | VARCHAR(60) |  | sim |  | Nome mostrado na lista de máquinas e no manual |
| `descricao` | TEXT |  | sim |  | Explicação em palavras simples |
| `icone` | VARCHAR(30) |  | não |  | Nome do ícone usado na tela |
| `ativa` | BOOLEAN |  | sim | verdadeiro | Falso = a categoria some da lista e do manual |
| `ordem` | SMALLINT |  | sim | 0 | Ordem de exibição |

### `etapas`

Etapas do processo produtivo e a área (zona) da planta baixa em que cada uma aparece

| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|---|
| `id` | INTEGER | PK | sim |  | Identificador da linha (gerado automaticamente) |
| `nome` | VARCHAR(60) | UQ | sim |  | Etapa do processo (ex.: Envase, Pós-envase) |
| `zona` | VARCHAR(40) |  | sim |  | Área da fábrica vista de cima onde a etapa fica |

Regras de integridade:

- **Regra** `ck_etapas_zona`: `zona IN ('Recepção e preparo', 'Tratamento térmico e gás', 'Envase e expedição', 'Câmara fria')`

### `maquinas_catalogo`

Catálogo: os tipos de máquina que podem ser colocados numa fábrica, com limites, capacidade e consumo

| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|---|
| `id` | INTEGER | PK | sim |  | Identificador da linha (gerado automaticamente) |
| `codigo` | VARCHAR(40) | UQ | sim |  | Código único da máquina (ex.: enchedora, extratora) |
| `nome` | VARCHAR(80) |  | sim |  | Nome mostrado na tela |
| `categoria_id` | INTEGER | FK → categorias.id (RESTRICT) | sim |  | Categoria da máquina |
| `etapa_id` | INTEGER | FK → etapas.id (RESTRICT) | sim |  | Etapa do processo |
| `fluxo` | VARCHAR(10) |  | sim | geral | geral = bebidas em geral; suco = suco de laranja natural |
| `icone` | VARCHAR(30) |  | não |  | Nome do ícone usado na tela |
| `parametro` | VARCHAR(60) |  | sim |  | O que o ritmo controla (ex.: Cadência, Vazão, Rotação) |
| `unidade` | VARCHAR(15) |  | sim |  | Unidade do ritmo (ex.: gf/min, m³/h, RPM) |
| `valor_min` | NUMERIC(12, 3) |  | sim |  | Menor ritmo permitido |
| `valor_otimo` | NUMERIC(12, 3) |  | sim |  | Ritmo ótimo: trabalha bem, risco baixo |
| `valor_atencao` | NUMERIC(12, 3) |  | sim |  | Limite da zona de atenção (acima do ótimo) |
| `valor_falha` | NUMERIC(12, 3) |  | sim |  | A partir deste ritmo a máquina falha |
| `valor_max` | NUMERIC(12, 3) |  | sim |  | Maior ritmo permitido pelo controle |
| `capacidade_otima` | NUMERIC(12, 2) |  | sim |  | Garrafas por hora que uma unidade entrega no ritmo ótimo |
| `consumo_parado_kw` | NUMERIC(8, 3) |  | sim |  | Consumo com a máquina ligada e sem produzir (kW) |
| `consumo_variavel_kw` | NUMERIC(8, 3) |  | sim |  | Consumo adicional ao produzir no ótimo (kW) |
| `ordem_processo` | SMALLINT |  | não |  | Posição no processo (0 = começo, 9 = fim); vazio = pode ficar entre quaisquer etapas |
| `sensibilidade_termica` | VARCHAR(15) |  | sim | nenhuma | Como reage à temperatura ambiente |
| `aceita_varias_entradas` | BOOLEAN |  | sim | falso | Verdadeiro = recebe origens diferentes (ex.: misturador) |
| `etapa_final` | BOOLEAN |  | sim | falso | Verdadeiro = última etapa: nada vem depois |
| `descricao` | TEXT |  | sim |  | O que a máquina faz, em palavras simples |
| `risco_fisico` | TEXT |  | sim |  | O que pode dar errado fisicamente |
| `base_dos_numeros` | TEXT |  | sim |  | Nota de em que os números se baseiam (hipótese didática ou fonte) |
| `ativa` | BOOLEAN |  | sim | verdadeiro | Falso = máquina fora do catálogo |

Regras de integridade:

- **Regra** `ck_maquinas_catalogo_limites`: `valor_min <= valor_otimo AND valor_otimo <= valor_atencao AND valor_atencao <= valor_falha AND valor_falha <= valor_max`
- **Regra** `ck_maquinas_catalogo_fluxo`: `fluxo IN ('geral', 'suco')`
- **Regra** `ck_maquinas_catalogo_capacidade`: `capacidade_otima > 0`
- **Regra** `ck_maquinas_catalogo_consumo`: `consumo_parado_kw >= 0 AND consumo_variavel_kw >= 0`
- **Regra** `ck_maquinas_catalogo_sensibilidade`: `sensibilidade_termica IN ('tanque', 'motor', 'frio', 'viscosidade', 'nenhuma')`
- **Regra** `ck_maquinas_catalogo_ordem`: `ordem_processo IS NULL OR (ordem_processo >= 0 AND ordem_processo <= 9)`

Índices: `ix_maquinas_catalogo_categoria_id`

### `manuais_maquina`

Texto do Manual das máquinas (relação 1 para 1 com o catálogo)

| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|---|
| `maquina_id` | INTEGER | PK, FK → maquinas_catalogo.id (CASCADE) | sim |  | Máquina a que o manual pertence (1 manual por máquina) |
| `o_que_faz` | TEXT |  | sim |  | Descrição completa da máquina |
| `como_funciona_ritmo` | TEXT |  | sim |  | Como o ritmo funciona |
| `dicas` | TEXT |  | sim |  | Dicas e cuidados |

### `fontes`

Fontes dos números (fichas, artigos, anúncios), cada uma com o nível de confiança

| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|---|
| `id` | INTEGER | PK | sim |  | Identificador da linha (gerado automaticamente) |
| `titulo` | VARCHAR(300) |  | sim |  | Nome da fonte |
| `url` | VARCHAR(500) | UQ | não |  | Link da fonte (todo dado real tem link) |
| `tipo` | VARCHAR(40) |  | sim |  | Ex.: ficha técnica, artigo científico, anúncio de fornecedor |
| `confianca` | VARCHAR(10) |  | sim |  | real, estimado ou hipotese |
| `na_base_conhecimento` | BOOLEAN |  | sim | falso | Verdadeiro = documento consultado pelo assistente de conversa |

Regras de integridade:

- **Regra** `ck_fontes_confianca`: `confianca IN ('real', 'estimado', 'hipotese')`

### `maquina_fontes`

Liga máquinas e fontes (muitos para muitos)

| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|---|
| `maquina_id` | INTEGER | PK, FK → maquinas_catalogo.id (CASCADE) | sim |  | Máquina |
| `fonte_id` | INTEGER | PK, FK → fontes.id (CASCADE) | sim |  | Fonte |
| `finalidade` | VARCHAR(10) | PK | sim |  | numeros = base dos limites e capacidade; preco = base do preço estimado |

Regras de integridade:

- **Regra** `ck_maquina_fontes_finalidade`: `finalidade IN ('numeros', 'preco')`

Índices: `ix_maquina_fontes_fonte_id`

### `precos_maquina`

Faixas de preço estimadas (nunca cotação), usadas para calcular o custo de uma melhoria

| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|---|
| `id` | INTEGER | PK | sim |  | Identificador da linha (gerado automaticamente) |
| `maquina_id` | INTEGER | FK → maquinas_catalogo.id (CASCADE) | sim |  | Máquina |
| `preco_min` | NUMERIC(14, 2) |  | sim |  | Menor preço estimado de 1 unidade |
| `preco_max` | NUMERIC(14, 2) |  | sim |  | Maior preço estimado de 1 unidade |
| `moeda` | VARCHAR(3) |  | sim | BRL | Moeda (câmbio de referência R$ 5,50 por US$) |
| `observacao` | TEXT |  | não |  | Nota de como a faixa foi estimada |
| `editado_pelo_usuario` | BOOLEAN |  | sim | falso | Verdadeiro = ajustado nas Configurações |
| `vigente_desde` | DATETIME |  | sim | agora | Quando esta faixa passou a valer (permite guardar o histórico) |

Regras de integridade:

- **Regra** `ck_precos_maquina_faixa`: `preco_min >= 0 AND preco_min <= preco_max`

Índices: `ix_precos_maquina_maquina_id`

### `modelos_reais`

Modelos comerciais reais pesquisados (capacidades de fabricantes), com a fonte de cada um

| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|---|
| `id` | INTEGER | PK | sim |  | Identificador da linha (gerado automaticamente) |
| `maquina_id` | INTEGER | FK → maquinas_catalogo.id (CASCADE) | sim |  | Tipo de máquina do catálogo a que o modelo corresponde |
| `fabricante` | VARCHAR(80) |  | sim |  | Fabricante (ex.: Krones, Tetra Pak) |
| `modelo` | VARCHAR(80) |  | sim |  | Nome do modelo |
| `aplicacao` | VARCHAR(200) |  | não |  | Para que serve (ex.: água sem gás em PET) |
| `capacidade_min` | NUMERIC(12, 0) |  | não |  | Capacidade mínima, quando a fonte informa uma faixa |
| `capacidade_max` | NUMERIC(12, 0) |  | sim |  | Capacidade nominal máxima |
| `unidade_capacidade` | VARCHAR(20) |  | sim |  | garrafas/h, latas/h, recipientes/h ou L/h |
| `fonte_id` | INTEGER | FK → fontes.id (RESTRICT) | sim |  | De onde vem o dado (com link e confiança) |
| `observacao` | TEXT |  | não |  | Observações da pesquisa |

Regras de integridade:

- **Único** `uq_modelos_reais_fabricante`: combinação de `fabricante, modelo`
- **Regra** `ck_modelos_reais_capacidade`: `capacidade_max > 0 AND (capacidade_min IS NULL OR capacidade_min <= capacidade_max)`

Índices: `ix_modelos_reais_maquina_id`

## Módulo: Apoio ao usuário

### `glossario_termos`

Glossário de palavras difíceis do sistema

| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|---|
| `id` | INTEGER | PK | sim |  | Identificador da linha (gerado automaticamente) |
| `grupo` | VARCHAR(40) |  | sim |  | Produção, Risco e física, Energia e dinheiro, Processo de bebidas ou Sistema |
| `termo` | VARCHAR(80) | UQ | sim |  | A palavra explicada |
| `definicao` | TEXT |  | sim |  | Explicação em palavras simples |

### `glossario_palavras`

Palavras que disparam a explicação de um termo nas telas (um termo pode ter várias)

| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|---|
| `id` | INTEGER | PK | sim |  | Identificador da linha (gerado automaticamente) |
| `termo_id` | INTEGER | FK → glossario_termos.id (CASCADE) | sim |  | Termo do glossário |
| `palavra` | VARCHAR(60) | UQ | sim |  | Palavra que aparece nas telas e ganha o sublinhado com a explicação |

Índices: `ix_glossario_palavras_termo_id`

### `mensagens_chat`

Conversa do usuário com o assistente

| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|---|
| `id` | INTEGER | PK | sim |  | Identificador da linha (gerado automaticamente) |
| `usuario_id` | INTEGER | FK → usuarios.id (CASCADE) | sim |  | Dono da conversa |
| `fabrica_id` | INTEGER | FK → fabricas.id (SET NULL) | não |  | Fábrica sobre a qual se conversava |
| `autor` | VARCHAR(12) |  | sim |  | usuario ou assistente |
| `texto` | TEXT |  | sim |  | Conteúdo da mensagem |
| `criada_em` | DATETIME |  | sim | agora | Quando foi enviada |

Regras de integridade:

- **Regra** `ck_mensagens_chat_autor`: `autor IN ('usuario', 'assistente')`

Índices: `ix_mensagens_chat_usuario_criada`

## Módulo: Fábricas

### `fabricas`

Fábricas salvas pelos usuários (cada uma é um mapa de máquinas ligadas entre si)

| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|---|
| `id` | INTEGER | PK | sim |  | Identificador da linha (gerado automaticamente) |
| `usuario_id` | INTEGER | FK → usuarios.id (CASCADE) | sim |  | Dono da fábrica |
| `nome` | VARCHAR(100) |  | sim |  | Nome da fábrica |
| `exemplo_origem` | VARCHAR(20) |  | não |  | Exemplo de que partiu (bebidas ou suco); vazio = montada do zero |
| `temperatura_ambiente` | SMALLINT |  | sim | 25 | Temperatura do ambiente em °C (0 a 45) |
| `tarifa_energia` | NUMERIC(8, 4) |  | sim | 0.85 | Preço da energia em R$ por kWh |
| `parada_emergencia` | BOOLEAN |  | sim | falso | Verdadeiro = botão de emergência acionado |
| `criada_em` | DATETIME |  | sim | agora | Quando a fábrica foi criada |
| `atualizada_em` | DATETIME |  | sim | agora | Última alteração |

Regras de integridade:

- **Regra** `ck_fabricas_temperatura`: `temperatura_ambiente >= 0 AND temperatura_ambiente <= 45`
- **Regra** `ck_fabricas_tarifa`: `tarifa_energia >= 0`
- **Único** `uq_fabricas_usuario_nome`: combinação de `usuario_id, nome`
- **Regra** `ck_fabricas_exemplo`: `exemplo_origem IS NULL OR exemplo_origem IN ('bebidas', 'suco')`

Índices: `ix_fabricas_usuario_id`

### `fabrica_maquinas`

Máquinas colocadas numa fábrica (um tipo do catálogo + ritmo, posição e unidades em paralelo)

| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|---|
| `id` | INTEGER | PK | sim |  | Identificador da linha (gerado automaticamente) |
| `fabrica_id` | INTEGER | FK → fabricas.id (CASCADE) | sim |  | Fábrica em que a máquina foi colocada |
| `maquina_id` | INTEGER | FK → maquinas_catalogo.id (RESTRICT) | sim |  | Tipo de máquina do catálogo |
| `pos_x` | INTEGER |  | sim | 0 | Posição horizontal no quadro (pixels) |
| `pos_y` | INTEGER |  | sim | 0 | Posição vertical no quadro (pixels) |
| `ritmo` | NUMERIC(12, 3) |  | sim |  | Ritmo atual (na unidade do parâmetro da máquina) |
| `unidades_paralelo` | SMALLINT |  | sim | 1 | Quantas máquinas iguais trabalham lado a lado (1 a 6) |
| `desligada` | BOOLEAN |  | sim | falso | Verdadeiro = máquina desligada |

Regras de integridade:

- **Regra** `ck_fabrica_maquinas_posicao`: `pos_x >= 0 AND pos_y >= 0`
- **Único** `uq_fabrica_maquinas_fabrica_id`: combinação de `fabrica_id, id`
- **Regra** `ck_fabrica_maquinas_paralelo`: `unidades_paralelo >= 1 AND unidades_paralelo <= 6`
- **Regra** `ck_fabrica_maquinas_ritmo`: `ritmo >= 0`

Índices: `ix_fabrica_maquinas_fabrica_id`, `ix_fabrica_maquinas_maquina_id`

### `conexoes`

Ligações entre duas máquinas da mesma fábrica (por onde o produto passa)

| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|---|
| `id` | INTEGER | PK | sim |  | Identificador da linha (gerado automaticamente) |
| `fabrica_id` | INTEGER | FK → fabricas.id (CASCADE) | sim |  | Fábrica |
| `origem_id` | INTEGER | FK → fabrica_maquinas.id (CASCADE) | sim |  | Máquina de origem (a que envia o produto) |
| `destino_id` | INTEGER | FK → fabrica_maquinas.id (CASCADE) | sim |  | Máquina de destino (a que recebe o produto) |

Regras de integridade:

- **Único** `uq_conexoes_origem_destino`: combinação de `origem_id, destino_id`
- **Chave estrangeira composta** `fk_conexoes_origem`: `(fabrica_id, origem_id)` → `fabrica_maquinas` (garante que as duas pontas pertencem à mesma fábrica)
- **Regra** `ck_conexoes_sem_laco`: `origem_id <> destino_id`
- **Chave estrangeira composta** `fk_conexoes_destino`: `(fabrica_id, destino_id)` → `fabrica_maquinas` (garante que as duas pontas pertencem à mesma fábrica)

Índices: `ix_conexoes_destino_id`, `ix_conexoes_fabrica_id`

## Módulo: Simulação e resultados

### `cenarios`

Fotos de uma fábrica simulada, para comparar antes e depois

| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|---|
| `id` | INTEGER | PK | sim |  | Identificador da linha (gerado automaticamente) |
| `fabrica_id` | INTEGER | FK → fabricas.id (CASCADE) | sim |  | Fábrica fotografada |
| `nome` | VARCHAR(100) |  | sim |  | Nome do cenário (ex.: Situação inicial) |
| `criado_em` | DATETIME |  | sim | agora | Quando a foto foi tirada |
| `temperatura_ambiente` | SMALLINT |  | sim |  | Temperatura considerada (°C) |
| `producao_h` | NUMERIC(12, 2) |  | sim |  | Produção da fábrica (garrafas por hora) |
| `risco_max` | NUMERIC(5, 4) |  | sim |  | Risco da pior máquina (0 a 1) |
| `energia_kw` | NUMERIC(10, 3) |  | sim |  | Consumo total (kW) |
| `gargalo_id` | INTEGER | FK → fabrica_maquinas.id (SET NULL) | não |  | Máquina que era o gargalo |

Regras de integridade:

- **Regra** `ck_cenarios_valores`: `producao_h >= 0 AND energia_kw >= 0`
- **Regra** `ck_cenarios_risco`: `risco_max >= 0 AND risco_max <= 1`

Índices: `ix_cenarios_fabrica_id`

### `cenario_maquinas`

Situação de cada máquina dentro de um cenário (capacidade, saída, fila, risco e energia)

| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|---|
| `id` | INTEGER | PK | sim |  | Identificador da linha (gerado automaticamente) |
| `cenario_id` | INTEGER | FK → cenarios.id (CASCADE) | sim |  | Cenário |
| `maquina_id` | INTEGER | FK → maquinas_catalogo.id (RESTRICT) | sim |  | Tipo da máquina |
| `fabrica_maquina_id` | INTEGER | FK → fabrica_maquinas.id (SET NULL) | não |  | Máquina na fábrica (vazio se ela foi removida depois) |
| `ritmo` | NUMERIC(12, 3) |  | sim |  | Ritmo na foto |
| `unidades_paralelo` | SMALLINT |  | sim |  | Unidades em paralelo na foto |
| `desligada` | BOOLEAN |  | sim | falso | Estava desligada? |
| `capacidade_h` | NUMERIC(12, 2) |  | sim |  | Quanto conseguia entregar (garrafas/h) |
| `saida_h` | NUMERIC(12, 2) |  | sim |  | O que realmente saía (garrafas/h) |
| `fila_h` | NUMERIC(12, 2) |  | sim | 0 | Excesso parado esperando esta máquina (garrafas/h) |
| `risco` | NUMERIC(5, 4) |  | sim |  | Risco de falha (0 a 1) |
| `estado` | VARCHAR(10) |  | sim |  | normal, alerta, critico, falha ou desligada |
| `energia_kw` | NUMERIC(10, 3) |  | sim |  | Consumo (kW) |

Regras de integridade:

- **Regra** `ck_cenario_maquinas_risco`: `risco >= 0 AND risco <= 1`
- **Regra** `ck_cenario_maquinas_estado`: `estado IN ('normal', 'alerta', 'critico', 'falha', 'desligada')`

Índices: `ix_cenario_maquinas_cenario_id`

### `simulacoes`

Resultado final de cada vez que o usuário roda o Play

| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|---|
| `id` | INTEGER | PK | sim |  | Identificador da linha (gerado automaticamente) |
| `fabrica_id` | INTEGER | FK → fabricas.id (CASCADE) | sim |  | Fábrica simulada |
| `usuario_id` | INTEGER | FK → usuarios.id (RESTRICT) | sim |  | Quem rodou o Play |
| `iniciada_em` | DATETIME |  | sim | agora | Quando o Play foi iniciado |
| `velocidade` | SMALLINT |  | sim |  | Velocidade usada: 1, 5, 20 ou 60 vezes |
| `duracao_min` | INTEGER |  | sim |  | Duração simulada em minutos (30, 60 ou 480) |
| `concluida` | BOOLEAN |  | sim | verdadeiro | Falso = parada antes do fim |
| `garrafas_produzidas` | NUMERIC(14, 0) |  | sim |  | Total produzido no período |
| `energia_kwh` | NUMERIC(12, 2) |  | sim |  | Energia gasta no período (kWh) |
| `fila_total` | NUMERIC(14, 0) |  | sim | 0 | Garrafas paradas na fila ao final |
| `pct_do_maximo` | NUMERIC(6, 2) |  | sim |  | Percentual do máximo possível (tudo no ótimo) |
| `risco_max` | NUMERIC(5, 4) |  | sim |  | Maior risco visto (0 a 1) |
| `gargalo_maquina_id` | INTEGER | FK → maquinas_catalogo.id (SET NULL) | não |  | Tipo de máquina que mais limitou a fábrica |

Regras de integridade:

- **Regra** `ck_simulacoes_duracao`: `duracao_min > 0`
- **Regra** `ck_simulacoes_risco`: `risco_max >= 0 AND risco_max <= 1`
- **Regra** `ck_simulacoes_velocidade`: `velocidade IN (1, 5, 20, 60)`
- **Regra** `ck_simulacoes_valores`: `garrafas_produzidas >= 0 AND energia_kwh >= 0 AND fila_total >= 0`

Índices: `ix_simulacoes_fabrica_id`

### `planos_objetivo`

Planos do tipo 'quero +10% de produção': o que fazer, o resultado esperado e o investimento

| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|---|
| `id` | INTEGER | PK | sim |  | Identificador da linha (gerado automaticamente) |
| `fabrica_id` | INTEGER | FK → fabricas.id (CASCADE) | sim |  | Fábrica |
| `usuario_id` | INTEGER | FK → usuarios.id (RESTRICT) | sim |  | Quem pediu o plano |
| `criado_em` | DATETIME |  | sim | agora | Quando o plano foi calculado |
| `tipo_objetivo` | VARCHAR(5) |  | sim |  | pct = aumentar em %; abs = chegar a uma produção; risk = reduzir o risco |
| `valor_meta` | NUMERIC(12, 2) |  | não |  | Valor pedido (% ou garrafas/h); vazio para risk |
| `aceita_zona_atencao` | BOOLEAN |  | sim | falso | Permitiu operar acima do ótimo? |
| `aceita_paralelo` | BOOLEAN |  | sim | falso | Permitiu usar mais máquinas em paralelo? |
| `producao_antes` | NUMERIC(12, 2) |  | sim |  | Produção antes do plano (garrafas/h) |
| `producao_depois` | NUMERIC(12, 2) |  | sim |  | Produção prevista depois do plano |
| `risco_antes` | NUMERIC(5, 4) |  | sim |  | Risco máximo antes (0 a 1) |
| `risco_depois` | NUMERIC(5, 4) |  | sim |  | Risco máximo depois (0 a 1) |
| `investimento_min` | NUMERIC(14, 2) |  | sim | 0 | Investimento estimado mínimo (R$) |
| `investimento_max` | NUMERIC(14, 2) |  | sim | 0 | Investimento estimado máximo (R$) |
| `atingiu_meta` | BOOLEAN |  | sim |  | O plano consegue chegar à meta? |
| `aplicado` | BOOLEAN |  | sim | falso | O usuário aplicou o plano na fábrica? |

Regras de integridade:

- **Regra** `ck_planos_objetivo_risco`: `risco_antes >= 0 AND risco_antes <= 1 AND risco_depois >= 0 AND risco_depois <= 1`
- **Regra** `ck_planos_objetivo_tipo`: `tipo_objetivo IN ('pct', 'abs', 'risk')`
- **Regra** `ck_planos_objetivo_investimento`: `investimento_min >= 0 AND investimento_min <= investimento_max`

Índices: `ix_planos_objetivo_fabrica_id`

### `plano_passos`

Passos de um plano (qual máquina mexer, de quanto para quanto, por quê e quanto custa)

| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|---|
| `id` | INTEGER | PK | sim |  | Identificador da linha (gerado automaticamente) |
| `plano_id` | INTEGER | FK → planos_objetivo.id (CASCADE) | sim |  | Plano |
| `ordem` | SMALLINT |  | sim |  | Posição do passo no plano (1, 2, 3...) |
| `acao` | VARCHAR(10) |  | sim |  | ligar, paralelo ou ritmo |
| `fabrica_maquina_id` | INTEGER | FK → fabrica_maquinas.id (SET NULL) | não |  | Máquina da fábrica afetada (vazio se foi removida) |
| `maquina_id` | INTEGER | FK → maquinas_catalogo.id (RESTRICT) | sim |  | Tipo da máquina afetada |
| `ritmo_antes` | NUMERIC(12, 3) |  | não |  | Ritmo antes (ação ritmo) |
| `ritmo_depois` | NUMERIC(12, 3) |  | não |  | Ritmo depois (ação ritmo) |
| `unidades_antes` | SMALLINT |  | não |  | Unidades em paralelo antes (ação paralelo) |
| `unidades_depois` | SMALLINT |  | não |  | Unidades em paralelo depois (ação paralelo) |
| `motivo` | TEXT |  | sim |  | O porquê do passo, em palavras simples |
| `custo_min` | NUMERIC(14, 2) |  | não |  | Custo estimado mínimo do passo (R$) |
| `custo_max` | NUMERIC(14, 2) |  | não |  | Custo estimado máximo do passo (R$) |

Regras de integridade:

- **Regra** `ck_plano_passos_ordem`: `ordem >= 1`
- **Único** `uq_plano_passos_plano_ordem`: combinação de `plano_id, ordem`
- **Regra** `ck_plano_passos_acao`: `acao IN ('ligar', 'paralelo', 'ritmo')`

Índices: `ix_plano_passos_plano_id`

### `eventos_registro`

Registro (log) do que o usuário faz e do que acontece durante a simulação

| Coluna | Tipo | Chave | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|---|
| `id` | INTEGER | PK | sim |  | Identificador da linha (gerado automaticamente) |
| `fabrica_id` | INTEGER | FK → fabricas.id (CASCADE) | não |  | Fábrica a que o evento se refere (vazio = evento geral) |
| `usuario_id` | INTEGER | FK → usuarios.id (SET NULL) | não |  | Quem causou o evento |
| `simulacao_id` | INTEGER | FK → simulacoes.id (CASCADE) | não |  | Simulação em que ocorreu (se foi durante o Play) |
| `ocorrido_em` | DATETIME |  | sim | agora | Quando aconteceu |
| `tipo` | VARCHAR(5) |  | sim | info | info, ok, warn ou bad (cor da linha no Registro) |
| `mensagem` | TEXT |  | sim |  | O que aconteceu |

Regras de integridade:

- **Regra** `ck_eventos_registro_tipo`: `tipo IN ('info', 'ok', 'warn', 'bad')`

Índices: `ix_eventos_registro_fabrica_ocorrido`

