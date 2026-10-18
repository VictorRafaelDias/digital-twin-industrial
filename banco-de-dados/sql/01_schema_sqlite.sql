-- Digital Twin Industrial: esquema da base de dados (SQLite).
-- Gerado por scripts/gerar_banco.py a partir de scripts/modelo.py. Não edite à mão: edite o modelo e gere de novo.

PRAGMA foreign_keys = ON;  -- o SQLite só confere as chaves estrangeiras se isto estiver ligado

-- Tipos de máquina (grupos do catálogo): Insumos, Preparo, Térmico e gás, Envase, Pós-envase, Refrigeração
CREATE TABLE categorias (
	id INTEGER NOT NULL, 
	codigo VARCHAR(30) NOT NULL, 
	nome VARCHAR(60) NOT NULL, 
	descricao TEXT NOT NULL, 
	icone VARCHAR(30), 
	ativa BOOLEAN DEFAULT 1 NOT NULL, 
	ordem SMALLINT DEFAULT '0' NOT NULL, 
	CONSTRAINT pk_categorias PRIMARY KEY (id), 
	CONSTRAINT uq_categorias_codigo UNIQUE (codigo)
);

-- Etapas do processo produtivo e a área (zona) da planta baixa em que cada uma aparece
CREATE TABLE etapas (
	id INTEGER NOT NULL, 
	nome VARCHAR(60) NOT NULL, 
	zona VARCHAR(40) NOT NULL, 
	CONSTRAINT pk_etapas PRIMARY KEY (id), 
	CONSTRAINT uq_etapas_nome UNIQUE (nome), 
	CONSTRAINT ck_etapas_zona CHECK (zona IN ('Recepção e preparo', 'Tratamento térmico e gás', 'Envase e expedição', 'Câmara fria'))
);

-- Fontes dos números (fichas, artigos, anúncios), cada uma com o nível de confiança
CREATE TABLE fontes (
	id INTEGER NOT NULL, 
	titulo VARCHAR(300) NOT NULL, 
	url VARCHAR(500), 
	tipo VARCHAR(40) NOT NULL, 
	confianca VARCHAR(10) NOT NULL, 
	na_base_conhecimento BOOLEAN DEFAULT 0 NOT NULL, 
	CONSTRAINT pk_fontes PRIMARY KEY (id), 
	CONSTRAINT uq_fontes_url UNIQUE (url), 
	CONSTRAINT ck_fontes_confianca CHECK (confianca IN ('real', 'estimado', 'hipotese'))
);

-- Glossário de palavras difíceis do sistema
CREATE TABLE glossario_termos (
	id INTEGER NOT NULL, 
	grupo VARCHAR(40) NOT NULL, 
	termo VARCHAR(80) NOT NULL, 
	definicao TEXT NOT NULL, 
	CONSTRAINT pk_glossario_termos PRIMARY KEY (id), 
	CONSTRAINT uq_glossario_termos_termo UNIQUE (termo)
);

-- Pessoas que entram no sistema (login simples: usuário e senha, sem perfis)
CREATE TABLE usuarios (
	id INTEGER NOT NULL, 
	nome_usuario VARCHAR(50) NOT NULL, 
	nome_exibicao VARCHAR(100) NOT NULL, 
	senha_hash VARCHAR(255) NOT NULL, 
	ativo BOOLEAN DEFAULT 1 NOT NULL, 
	criado_em DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	ultimo_acesso_em DATETIME, 
	CONSTRAINT pk_usuarios PRIMARY KEY (id), 
	CONSTRAINT uq_usuarios_nome_usuario UNIQUE (nome_usuario)
);

-- Fábricas salvas pelos usuários (cada uma é um mapa de máquinas ligadas entre si)
CREATE TABLE fabricas (
	id INTEGER NOT NULL, 
	usuario_id INTEGER NOT NULL, 
	nome VARCHAR(100) NOT NULL, 
	exemplo_origem VARCHAR(20), 
	temperatura_ambiente SMALLINT DEFAULT '25' NOT NULL, 
	tarifa_energia NUMERIC(8, 4) DEFAULT '0.85' NOT NULL, 
	parada_emergencia BOOLEAN DEFAULT 0 NOT NULL, 
	criada_em DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	atualizada_em DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	CONSTRAINT pk_fabricas PRIMARY KEY (id), 
	CONSTRAINT uq_fabricas_usuario_nome UNIQUE (usuario_id, nome), 
	CONSTRAINT ck_fabricas_exemplo CHECK (exemplo_origem IS NULL OR exemplo_origem IN ('bebidas', 'suco')), 
	CONSTRAINT ck_fabricas_temperatura CHECK (temperatura_ambiente >= 0 AND temperatura_ambiente <= 45), 
	CONSTRAINT ck_fabricas_tarifa CHECK (tarifa_energia >= 0), 
	CONSTRAINT fk_fabricas_usuario_id FOREIGN KEY(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
);
CREATE INDEX ix_fabricas_usuario_id ON fabricas (usuario_id);

-- Palavras que disparam a explicação de um termo nas telas (um termo pode ter várias)
CREATE TABLE glossario_palavras (
	id INTEGER NOT NULL, 
	termo_id INTEGER NOT NULL, 
	palavra VARCHAR(60) NOT NULL, 
	CONSTRAINT pk_glossario_palavras PRIMARY KEY (id), 
	CONSTRAINT uq_glossario_palavras_palavra UNIQUE (palavra), 
	CONSTRAINT fk_glossario_palavras_termo_id FOREIGN KEY(termo_id) REFERENCES glossario_termos (id) ON DELETE CASCADE
);
CREATE INDEX ix_glossario_palavras_termo_id ON glossario_palavras (termo_id);

-- Catálogo: os tipos de máquina que podem ser colocados numa fábrica, com limites, capacidade e consumo
CREATE TABLE maquinas_catalogo (
	id INTEGER NOT NULL, 
	codigo VARCHAR(40) NOT NULL, 
	nome VARCHAR(80) NOT NULL, 
	categoria_id INTEGER NOT NULL, 
	etapa_id INTEGER NOT NULL, 
	fluxo VARCHAR(10) DEFAULT 'geral' NOT NULL, 
	icone VARCHAR(30), 
	parametro VARCHAR(60) NOT NULL, 
	unidade VARCHAR(15) NOT NULL, 
	valor_min NUMERIC(12, 3) NOT NULL, 
	valor_otimo NUMERIC(12, 3) NOT NULL, 
	valor_atencao NUMERIC(12, 3) NOT NULL, 
	valor_falha NUMERIC(12, 3) NOT NULL, 
	valor_max NUMERIC(12, 3) NOT NULL, 
	capacidade_otima NUMERIC(12, 2) NOT NULL, 
	consumo_parado_kw NUMERIC(8, 3) NOT NULL, 
	consumo_variavel_kw NUMERIC(8, 3) NOT NULL, 
	ordem_processo SMALLINT, 
	sensibilidade_termica VARCHAR(15) DEFAULT 'nenhuma' NOT NULL, 
	aceita_varias_entradas BOOLEAN DEFAULT 0 NOT NULL, 
	etapa_final BOOLEAN DEFAULT 0 NOT NULL, 
	descricao TEXT NOT NULL, 
	risco_fisico TEXT NOT NULL, 
	base_dos_numeros TEXT NOT NULL, 
	ativa BOOLEAN DEFAULT 1 NOT NULL, 
	CONSTRAINT pk_maquinas_catalogo PRIMARY KEY (id), 
	CONSTRAINT uq_maquinas_catalogo_codigo UNIQUE (codigo), 
	CONSTRAINT ck_maquinas_catalogo_fluxo CHECK (fluxo IN ('geral', 'suco')), 
	CONSTRAINT ck_maquinas_catalogo_sensibilidade CHECK (sensibilidade_termica IN ('tanque', 'motor', 'frio', 'viscosidade', 'nenhuma')), 
	CONSTRAINT ck_maquinas_catalogo_limites CHECK (valor_min <= valor_otimo AND valor_otimo <= valor_atencao AND valor_atencao <= valor_falha AND valor_falha <= valor_max), 
	CONSTRAINT ck_maquinas_catalogo_capacidade CHECK (capacidade_otima > 0), 
	CONSTRAINT ck_maquinas_catalogo_consumo CHECK (consumo_parado_kw >= 0 AND consumo_variavel_kw >= 0), 
	CONSTRAINT ck_maquinas_catalogo_ordem CHECK (ordem_processo IS NULL OR (ordem_processo >= 0 AND ordem_processo <= 9)), 
	CONSTRAINT fk_maquinas_catalogo_categoria_id FOREIGN KEY(categoria_id) REFERENCES categorias (id) ON DELETE RESTRICT, 
	CONSTRAINT fk_maquinas_catalogo_etapa_id FOREIGN KEY(etapa_id) REFERENCES etapas (id) ON DELETE RESTRICT
);
CREATE INDEX ix_maquinas_catalogo_categoria_id ON maquinas_catalogo (categoria_id);

-- Máquinas colocadas numa fábrica (um tipo do catálogo + ritmo, posição e unidades em paralelo)
CREATE TABLE fabrica_maquinas (
	id INTEGER NOT NULL, 
	fabrica_id INTEGER NOT NULL, 
	maquina_id INTEGER NOT NULL, 
	pos_x INTEGER DEFAULT '0' NOT NULL, 
	pos_y INTEGER DEFAULT '0' NOT NULL, 
	ritmo NUMERIC(12, 3) NOT NULL, 
	unidades_paralelo SMALLINT DEFAULT '1' NOT NULL, 
	desligada BOOLEAN DEFAULT 0 NOT NULL, 
	CONSTRAINT pk_fabrica_maquinas PRIMARY KEY (id), 
	CONSTRAINT uq_fabrica_maquinas_fabrica_id UNIQUE (fabrica_id, id), 
	CONSTRAINT ck_fabrica_maquinas_posicao CHECK (pos_x >= 0 AND pos_y >= 0), 
	CONSTRAINT ck_fabrica_maquinas_ritmo CHECK (ritmo >= 0), 
	CONSTRAINT ck_fabrica_maquinas_paralelo CHECK (unidades_paralelo >= 1 AND unidades_paralelo <= 6), 
	CONSTRAINT fk_fabrica_maquinas_fabrica_id FOREIGN KEY(fabrica_id) REFERENCES fabricas (id) ON DELETE CASCADE, 
	CONSTRAINT fk_fabrica_maquinas_maquina_id FOREIGN KEY(maquina_id) REFERENCES maquinas_catalogo (id) ON DELETE RESTRICT
);
CREATE INDEX ix_fabrica_maquinas_fabrica_id ON fabrica_maquinas (fabrica_id);
CREATE INDEX ix_fabrica_maquinas_maquina_id ON fabrica_maquinas (maquina_id);

-- Texto do Manual das máquinas (relação 1 para 1 com o catálogo)
CREATE TABLE manuais_maquina (
	maquina_id INTEGER NOT NULL, 
	o_que_faz TEXT NOT NULL, 
	como_funciona_ritmo TEXT NOT NULL, 
	dicas TEXT NOT NULL, 
	CONSTRAINT pk_manuais_maquina PRIMARY KEY (maquina_id), 
	CONSTRAINT fk_manuais_maquina_maquina_id FOREIGN KEY(maquina_id) REFERENCES maquinas_catalogo (id) ON DELETE CASCADE
);

-- Liga máquinas e fontes (muitos para muitos)
CREATE TABLE maquina_fontes (
	maquina_id INTEGER NOT NULL, 
	fonte_id INTEGER NOT NULL, 
	finalidade VARCHAR(10) NOT NULL, 
	CONSTRAINT pk_maquina_fontes PRIMARY KEY (maquina_id, fonte_id, finalidade), 
	CONSTRAINT ck_maquina_fontes_finalidade CHECK (finalidade IN ('numeros', 'preco')), 
	CONSTRAINT fk_maquina_fontes_maquina_id FOREIGN KEY(maquina_id) REFERENCES maquinas_catalogo (id) ON DELETE CASCADE, 
	CONSTRAINT fk_maquina_fontes_fonte_id FOREIGN KEY(fonte_id) REFERENCES fontes (id) ON DELETE CASCADE
);
CREATE INDEX ix_maquina_fontes_fonte_id ON maquina_fontes (fonte_id);

-- Conversa do usuário com o assistente
CREATE TABLE mensagens_chat (
	id INTEGER NOT NULL, 
	usuario_id INTEGER NOT NULL, 
	fabrica_id INTEGER, 
	autor VARCHAR(12) NOT NULL, 
	texto TEXT NOT NULL, 
	criada_em DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	CONSTRAINT pk_mensagens_chat PRIMARY KEY (id), 
	CONSTRAINT ck_mensagens_chat_autor CHECK (autor IN ('usuario', 'assistente')), 
	CONSTRAINT fk_mensagens_chat_usuario_id FOREIGN KEY(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE, 
	CONSTRAINT fk_mensagens_chat_fabrica_id FOREIGN KEY(fabrica_id) REFERENCES fabricas (id) ON DELETE SET NULL
);
CREATE INDEX ix_mensagens_chat_usuario_criada ON mensagens_chat (usuario_id, criada_em);

-- Modelos comerciais reais pesquisados (capacidades de fabricantes), com a fonte de cada um
CREATE TABLE modelos_reais (
	id INTEGER NOT NULL, 
	maquina_id INTEGER NOT NULL, 
	fabricante VARCHAR(80) NOT NULL, 
	modelo VARCHAR(80) NOT NULL, 
	aplicacao VARCHAR(200), 
	capacidade_min NUMERIC(12, 0), 
	capacidade_max NUMERIC(12, 0) NOT NULL, 
	unidade_capacidade VARCHAR(20) NOT NULL, 
	fonte_id INTEGER NOT NULL, 
	observacao TEXT, 
	CONSTRAINT pk_modelos_reais PRIMARY KEY (id), 
	CONSTRAINT uq_modelos_reais_fabricante UNIQUE (fabricante, modelo), 
	CONSTRAINT ck_modelos_reais_capacidade CHECK (capacidade_max > 0 AND (capacidade_min IS NULL OR capacidade_min <= capacidade_max)), 
	CONSTRAINT fk_modelos_reais_maquina_id FOREIGN KEY(maquina_id) REFERENCES maquinas_catalogo (id) ON DELETE CASCADE, 
	CONSTRAINT fk_modelos_reais_fonte_id FOREIGN KEY(fonte_id) REFERENCES fontes (id) ON DELETE RESTRICT
);
CREATE INDEX ix_modelos_reais_maquina_id ON modelos_reais (maquina_id);

-- Planos do tipo 'quero +10% de produção': o que fazer, o resultado esperado e o investimento
CREATE TABLE planos_objetivo (
	id INTEGER NOT NULL, 
	fabrica_id INTEGER NOT NULL, 
	usuario_id INTEGER NOT NULL, 
	criado_em DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	tipo_objetivo VARCHAR(5) NOT NULL, 
	valor_meta NUMERIC(12, 2), 
	aceita_zona_atencao BOOLEAN DEFAULT 0 NOT NULL, 
	aceita_paralelo BOOLEAN DEFAULT 0 NOT NULL, 
	producao_antes NUMERIC(12, 2) NOT NULL, 
	producao_depois NUMERIC(12, 2) NOT NULL, 
	risco_antes NUMERIC(5, 4) NOT NULL, 
	risco_depois NUMERIC(5, 4) NOT NULL, 
	investimento_min NUMERIC(14, 2) DEFAULT '0' NOT NULL, 
	investimento_max NUMERIC(14, 2) DEFAULT '0' NOT NULL, 
	atingiu_meta BOOLEAN NOT NULL, 
	aplicado BOOLEAN DEFAULT 0 NOT NULL, 
	CONSTRAINT pk_planos_objetivo PRIMARY KEY (id), 
	CONSTRAINT ck_planos_objetivo_tipo CHECK (tipo_objetivo IN ('pct', 'abs', 'risk')), 
	CONSTRAINT ck_planos_objetivo_investimento CHECK (investimento_min >= 0 AND investimento_min <= investimento_max), 
	CONSTRAINT ck_planos_objetivo_risco CHECK (risco_antes >= 0 AND risco_antes <= 1 AND risco_depois >= 0 AND risco_depois <= 1), 
	CONSTRAINT fk_planos_objetivo_fabrica_id FOREIGN KEY(fabrica_id) REFERENCES fabricas (id) ON DELETE CASCADE, 
	CONSTRAINT fk_planos_objetivo_usuario_id FOREIGN KEY(usuario_id) REFERENCES usuarios (id) ON DELETE RESTRICT
);
CREATE INDEX ix_planos_objetivo_fabrica_id ON planos_objetivo (fabrica_id);

-- Faixas de preço estimadas (nunca cotação), usadas para calcular o custo de uma melhoria
CREATE TABLE precos_maquina (
	id INTEGER NOT NULL, 
	maquina_id INTEGER NOT NULL, 
	preco_min NUMERIC(14, 2) NOT NULL, 
	preco_max NUMERIC(14, 2) NOT NULL, 
	moeda VARCHAR(3) DEFAULT 'BRL' NOT NULL, 
	observacao TEXT, 
	editado_pelo_usuario BOOLEAN DEFAULT 0 NOT NULL, 
	vigente_desde DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	CONSTRAINT pk_precos_maquina PRIMARY KEY (id), 
	CONSTRAINT ck_precos_maquina_faixa CHECK (preco_min >= 0 AND preco_min <= preco_max), 
	CONSTRAINT fk_precos_maquina_maquina_id FOREIGN KEY(maquina_id) REFERENCES maquinas_catalogo (id) ON DELETE CASCADE
);
CREATE INDEX ix_precos_maquina_maquina_id ON precos_maquina (maquina_id);

-- Resultado final de cada vez que o usuário roda o Play
CREATE TABLE simulacoes (
	id INTEGER NOT NULL, 
	fabrica_id INTEGER NOT NULL, 
	usuario_id INTEGER NOT NULL, 
	iniciada_em DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	velocidade SMALLINT NOT NULL, 
	duracao_min INTEGER NOT NULL, 
	concluida BOOLEAN DEFAULT 1 NOT NULL, 
	garrafas_produzidas NUMERIC(14, 0) NOT NULL, 
	energia_kwh NUMERIC(12, 2) NOT NULL, 
	fila_total NUMERIC(14, 0) DEFAULT '0' NOT NULL, 
	pct_do_maximo NUMERIC(6, 2) NOT NULL, 
	risco_max NUMERIC(5, 4) NOT NULL, 
	gargalo_maquina_id INTEGER, 
	CONSTRAINT pk_simulacoes PRIMARY KEY (id), 
	CONSTRAINT ck_simulacoes_velocidade CHECK (velocidade IN (1, 5, 20, 60)), 
	CONSTRAINT ck_simulacoes_duracao CHECK (duracao_min > 0), 
	CONSTRAINT ck_simulacoes_risco CHECK (risco_max >= 0 AND risco_max <= 1), 
	CONSTRAINT ck_simulacoes_valores CHECK (garrafas_produzidas >= 0 AND energia_kwh >= 0 AND fila_total >= 0), 
	CONSTRAINT fk_simulacoes_fabrica_id FOREIGN KEY(fabrica_id) REFERENCES fabricas (id) ON DELETE CASCADE, 
	CONSTRAINT fk_simulacoes_usuario_id FOREIGN KEY(usuario_id) REFERENCES usuarios (id) ON DELETE RESTRICT, 
	CONSTRAINT fk_simulacoes_gargalo_maquina_id FOREIGN KEY(gargalo_maquina_id) REFERENCES maquinas_catalogo (id) ON DELETE SET NULL
);
CREATE INDEX ix_simulacoes_fabrica_id ON simulacoes (fabrica_id);

-- Fotos de uma fábrica simulada, para comparar antes e depois
CREATE TABLE cenarios (
	id INTEGER NOT NULL, 
	fabrica_id INTEGER NOT NULL, 
	nome VARCHAR(100) NOT NULL, 
	criado_em DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	temperatura_ambiente SMALLINT NOT NULL, 
	producao_h NUMERIC(12, 2) NOT NULL, 
	risco_max NUMERIC(5, 4) NOT NULL, 
	energia_kw NUMERIC(10, 3) NOT NULL, 
	gargalo_id INTEGER, 
	CONSTRAINT pk_cenarios PRIMARY KEY (id), 
	CONSTRAINT ck_cenarios_risco CHECK (risco_max >= 0 AND risco_max <= 1), 
	CONSTRAINT ck_cenarios_valores CHECK (producao_h >= 0 AND energia_kw >= 0), 
	CONSTRAINT fk_cenarios_fabrica_id FOREIGN KEY(fabrica_id) REFERENCES fabricas (id) ON DELETE CASCADE, 
	CONSTRAINT fk_cenarios_gargalo_id FOREIGN KEY(gargalo_id) REFERENCES fabrica_maquinas (id) ON DELETE SET NULL
);
CREATE INDEX ix_cenarios_fabrica_id ON cenarios (fabrica_id);

-- Ligações entre duas máquinas da mesma fábrica (por onde o produto passa)
CREATE TABLE conexoes (
	id INTEGER NOT NULL, 
	fabrica_id INTEGER NOT NULL, 
	origem_id INTEGER NOT NULL, 
	destino_id INTEGER NOT NULL, 
	CONSTRAINT pk_conexoes PRIMARY KEY (id), 
	CONSTRAINT fk_conexoes_origem FOREIGN KEY(fabrica_id, origem_id) REFERENCES fabrica_maquinas (fabrica_id, id) ON DELETE CASCADE, 
	CONSTRAINT fk_conexoes_destino FOREIGN KEY(fabrica_id, destino_id) REFERENCES fabrica_maquinas (fabrica_id, id) ON DELETE CASCADE, 
	CONSTRAINT uq_conexoes_origem_destino UNIQUE (origem_id, destino_id), 
	CONSTRAINT ck_conexoes_sem_laco CHECK (origem_id <> destino_id), 
	CONSTRAINT fk_conexoes_fabrica_id FOREIGN KEY(fabrica_id) REFERENCES fabricas (id) ON DELETE CASCADE
);
CREATE INDEX ix_conexoes_destino_id ON conexoes (destino_id);
CREATE INDEX ix_conexoes_fabrica_id ON conexoes (fabrica_id);

-- Registro (log) do que o usuário faz e do que acontece durante a simulação
CREATE TABLE eventos_registro (
	id INTEGER NOT NULL, 
	fabrica_id INTEGER, 
	usuario_id INTEGER, 
	simulacao_id INTEGER, 
	ocorrido_em DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	tipo VARCHAR(5) DEFAULT 'info' NOT NULL, 
	mensagem TEXT NOT NULL, 
	CONSTRAINT pk_eventos_registro PRIMARY KEY (id), 
	CONSTRAINT ck_eventos_registro_tipo CHECK (tipo IN ('info', 'ok', 'warn', 'bad')), 
	CONSTRAINT fk_eventos_registro_fabrica_id FOREIGN KEY(fabrica_id) REFERENCES fabricas (id) ON DELETE CASCADE, 
	CONSTRAINT fk_eventos_registro_usuario_id FOREIGN KEY(usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL, 
	CONSTRAINT fk_eventos_registro_simulacao_id FOREIGN KEY(simulacao_id) REFERENCES simulacoes (id) ON DELETE CASCADE
);
CREATE INDEX ix_eventos_registro_fabrica_ocorrido ON eventos_registro (fabrica_id, ocorrido_em);

-- Passos de um plano (qual máquina mexer, de quanto para quanto, por quê e quanto custa)
CREATE TABLE plano_passos (
	id INTEGER NOT NULL, 
	plano_id INTEGER NOT NULL, 
	ordem SMALLINT NOT NULL, 
	acao VARCHAR(10) NOT NULL, 
	fabrica_maquina_id INTEGER, 
	maquina_id INTEGER NOT NULL, 
	ritmo_antes NUMERIC(12, 3), 
	ritmo_depois NUMERIC(12, 3), 
	unidades_antes SMALLINT, 
	unidades_depois SMALLINT, 
	motivo TEXT NOT NULL, 
	custo_min NUMERIC(14, 2), 
	custo_max NUMERIC(14, 2), 
	CONSTRAINT pk_plano_passos PRIMARY KEY (id), 
	CONSTRAINT uq_plano_passos_plano_ordem UNIQUE (plano_id, ordem), 
	CONSTRAINT ck_plano_passos_acao CHECK (acao IN ('ligar', 'paralelo', 'ritmo')), 
	CONSTRAINT ck_plano_passos_ordem CHECK (ordem >= 1), 
	CONSTRAINT fk_plano_passos_plano_id FOREIGN KEY(plano_id) REFERENCES planos_objetivo (id) ON DELETE CASCADE, 
	CONSTRAINT fk_plano_passos_fabrica_maquina_id FOREIGN KEY(fabrica_maquina_id) REFERENCES fabrica_maquinas (id) ON DELETE SET NULL, 
	CONSTRAINT fk_plano_passos_maquina_id FOREIGN KEY(maquina_id) REFERENCES maquinas_catalogo (id) ON DELETE RESTRICT
);
CREATE INDEX ix_plano_passos_plano_id ON plano_passos (plano_id);

-- Situação de cada máquina dentro de um cenário (capacidade, saída, fila, risco e energia)
CREATE TABLE cenario_maquinas (
	id INTEGER NOT NULL, 
	cenario_id INTEGER NOT NULL, 
	maquina_id INTEGER NOT NULL, 
	fabrica_maquina_id INTEGER, 
	ritmo NUMERIC(12, 3) NOT NULL, 
	unidades_paralelo SMALLINT NOT NULL, 
	desligada BOOLEAN DEFAULT 0 NOT NULL, 
	capacidade_h NUMERIC(12, 2) NOT NULL, 
	saida_h NUMERIC(12, 2) NOT NULL, 
	fila_h NUMERIC(12, 2) DEFAULT '0' NOT NULL, 
	risco NUMERIC(5, 4) NOT NULL, 
	estado VARCHAR(10) NOT NULL, 
	energia_kw NUMERIC(10, 3) NOT NULL, 
	CONSTRAINT pk_cenario_maquinas PRIMARY KEY (id), 
	CONSTRAINT ck_cenario_maquinas_estado CHECK (estado IN ('normal', 'alerta', 'critico', 'falha', 'desligada')), 
	CONSTRAINT ck_cenario_maquinas_risco CHECK (risco >= 0 AND risco <= 1), 
	CONSTRAINT fk_cenario_maquinas_cenario_id FOREIGN KEY(cenario_id) REFERENCES cenarios (id) ON DELETE CASCADE, 
	CONSTRAINT fk_cenario_maquinas_maquina_id FOREIGN KEY(maquina_id) REFERENCES maquinas_catalogo (id) ON DELETE RESTRICT, 
	CONSTRAINT fk_cenario_maquinas_fabrica_maquina_id FOREIGN KEY(fabrica_maquina_id) REFERENCES fabrica_maquinas (id) ON DELETE SET NULL
);
CREATE INDEX ix_cenario_maquinas_cenario_id ON cenario_maquinas (cenario_id);
