-- Digital Twin Industrial: esquema da base de dados (PostgreSQL).
-- Gerado por scripts/gerar_banco.py a partir de scripts/modelo.py. Não edite à mão: edite o modelo e gere de novo.

-- Tipos de máquina (grupos do catálogo): Insumos, Preparo, Térmico e gás, Envase, Pós-envase, Refrigeração
CREATE TABLE categorias (
	id SERIAL NOT NULL, 
	codigo VARCHAR(30) NOT NULL, 
	nome VARCHAR(60) NOT NULL, 
	descricao TEXT NOT NULL, 
	icone VARCHAR(30), 
	ativa BOOLEAN DEFAULT true NOT NULL, 
	ordem SMALLINT DEFAULT '0' NOT NULL, 
	CONSTRAINT pk_categorias PRIMARY KEY (id), 
	CONSTRAINT uq_categorias_codigo UNIQUE (codigo)
);

-- Etapas do processo produtivo e a área (zona) da planta baixa em que cada uma aparece
CREATE TABLE etapas (
	id SERIAL NOT NULL, 
	nome VARCHAR(60) NOT NULL, 
	zona VARCHAR(40) NOT NULL, 
	CONSTRAINT pk_etapas PRIMARY KEY (id), 
	CONSTRAINT uq_etapas_nome UNIQUE (nome), 
	CONSTRAINT ck_etapas_zona CHECK (zona IN ('Recepção e preparo', 'Tratamento térmico e gás', 'Envase e expedição', 'Câmara fria'))
);

-- Fontes dos números (fichas, artigos, anúncios), cada uma com o nível de confiança
CREATE TABLE fontes (
	id SERIAL NOT NULL, 
	titulo VARCHAR(300) NOT NULL, 
	url VARCHAR(500), 
	tipo VARCHAR(40) NOT NULL, 
	confianca VARCHAR(10) NOT NULL, 
	na_base_conhecimento BOOLEAN DEFAULT false NOT NULL, 
	CONSTRAINT pk_fontes PRIMARY KEY (id), 
	CONSTRAINT uq_fontes_url UNIQUE (url), 
	CONSTRAINT ck_fontes_confianca CHECK (confianca IN ('real', 'estimado', 'hipotese'))
);

-- Glossário de palavras difíceis do sistema
CREATE TABLE glossario_termos (
	id SERIAL NOT NULL, 
	grupo VARCHAR(40) NOT NULL, 
	termo VARCHAR(80) NOT NULL, 
	definicao TEXT NOT NULL, 
	CONSTRAINT pk_glossario_termos PRIMARY KEY (id), 
	CONSTRAINT uq_glossario_termos_termo UNIQUE (termo)
);

-- Pessoas que entram no sistema (login simples: usuário e senha, sem perfis)
CREATE TABLE usuarios (
	id SERIAL NOT NULL, 
	nome_usuario VARCHAR(50) NOT NULL, 
	nome_exibicao VARCHAR(100) NOT NULL, 
	senha_hash VARCHAR(255) NOT NULL, 
	ativo BOOLEAN DEFAULT true NOT NULL, 
	criado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	ultimo_acesso_em TIMESTAMP WITHOUT TIME ZONE, 
	CONSTRAINT pk_usuarios PRIMARY KEY (id), 
	CONSTRAINT uq_usuarios_nome_usuario UNIQUE (nome_usuario)
);

-- Fábricas salvas pelos usuários (cada uma é um mapa de máquinas ligadas entre si)
CREATE TABLE fabricas (
	id SERIAL NOT NULL, 
	usuario_id INTEGER NOT NULL, 
	nome VARCHAR(100) NOT NULL, 
	exemplo_origem VARCHAR(20), 
	temperatura_ambiente SMALLINT DEFAULT '25' NOT NULL, 
	tarifa_energia NUMERIC(8, 4) DEFAULT '0.85' NOT NULL, 
	parada_emergencia BOOLEAN DEFAULT false NOT NULL, 
	criada_em TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	atualizada_em TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
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
	id SERIAL NOT NULL, 
	termo_id INTEGER NOT NULL, 
	palavra VARCHAR(60) NOT NULL, 
	CONSTRAINT pk_glossario_palavras PRIMARY KEY (id), 
	CONSTRAINT uq_glossario_palavras_palavra UNIQUE (palavra), 
	CONSTRAINT fk_glossario_palavras_termo_id FOREIGN KEY(termo_id) REFERENCES glossario_termos (id) ON DELETE CASCADE
);
CREATE INDEX ix_glossario_palavras_termo_id ON glossario_palavras (termo_id);

-- Catálogo: os tipos de máquina que podem ser colocados numa fábrica, com limites, capacidade e consumo
CREATE TABLE maquinas_catalogo (
	id SERIAL NOT NULL, 
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
	aceita_varias_entradas BOOLEAN DEFAULT false NOT NULL, 
	etapa_final BOOLEAN DEFAULT false NOT NULL, 
	descricao TEXT NOT NULL, 
	risco_fisico TEXT NOT NULL, 
	base_dos_numeros TEXT NOT NULL, 
	ativa BOOLEAN DEFAULT true NOT NULL, 
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
	id SERIAL NOT NULL, 
	fabrica_id INTEGER NOT NULL, 
	maquina_id INTEGER NOT NULL, 
	pos_x INTEGER DEFAULT '0' NOT NULL, 
	pos_y INTEGER DEFAULT '0' NOT NULL, 
	ritmo NUMERIC(12, 3) NOT NULL, 
	unidades_paralelo SMALLINT DEFAULT '1' NOT NULL, 
	desligada BOOLEAN DEFAULT false NOT NULL, 
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
	id SERIAL NOT NULL, 
	usuario_id INTEGER NOT NULL, 
	fabrica_id INTEGER, 
	autor VARCHAR(12) NOT NULL, 
	texto TEXT NOT NULL, 
	criada_em TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	CONSTRAINT pk_mensagens_chat PRIMARY KEY (id), 
	CONSTRAINT ck_mensagens_chat_autor CHECK (autor IN ('usuario', 'assistente')), 
	CONSTRAINT fk_mensagens_chat_usuario_id FOREIGN KEY(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE, 
	CONSTRAINT fk_mensagens_chat_fabrica_id FOREIGN KEY(fabrica_id) REFERENCES fabricas (id) ON DELETE SET NULL
);
CREATE INDEX ix_mensagens_chat_usuario_criada ON mensagens_chat (usuario_id, criada_em);

-- Modelos comerciais reais pesquisados (capacidades de fabricantes), com a fonte de cada um
CREATE TABLE modelos_reais (
	id SERIAL NOT NULL, 
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
	id SERIAL NOT NULL, 
	fabrica_id INTEGER NOT NULL, 
	usuario_id INTEGER NOT NULL, 
	criado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	tipo_objetivo VARCHAR(5) NOT NULL, 
	valor_meta NUMERIC(12, 2), 
	aceita_zona_atencao BOOLEAN DEFAULT false NOT NULL, 
	aceita_paralelo BOOLEAN DEFAULT false NOT NULL, 
	producao_antes NUMERIC(12, 2) NOT NULL, 
	producao_depois NUMERIC(12, 2) NOT NULL, 
	risco_antes NUMERIC(5, 4) NOT NULL, 
	risco_depois NUMERIC(5, 4) NOT NULL, 
	investimento_min NUMERIC(14, 2) DEFAULT '0' NOT NULL, 
	investimento_max NUMERIC(14, 2) DEFAULT '0' NOT NULL, 
	atingiu_meta BOOLEAN NOT NULL, 
	aplicado BOOLEAN DEFAULT false NOT NULL, 
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
	id SERIAL NOT NULL, 
	maquina_id INTEGER NOT NULL, 
	preco_min NUMERIC(14, 2) NOT NULL, 
	preco_max NUMERIC(14, 2) NOT NULL, 
	moeda VARCHAR(3) DEFAULT 'BRL' NOT NULL, 
	observacao TEXT, 
	editado_pelo_usuario BOOLEAN DEFAULT false NOT NULL, 
	vigente_desde TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	CONSTRAINT pk_precos_maquina PRIMARY KEY (id), 
	CONSTRAINT ck_precos_maquina_faixa CHECK (preco_min >= 0 AND preco_min <= preco_max), 
	CONSTRAINT fk_precos_maquina_maquina_id FOREIGN KEY(maquina_id) REFERENCES maquinas_catalogo (id) ON DELETE CASCADE
);
CREATE INDEX ix_precos_maquina_maquina_id ON precos_maquina (maquina_id);

-- Resultado final de cada vez que o usuário roda o Play
CREATE TABLE simulacoes (
	id SERIAL NOT NULL, 
	fabrica_id INTEGER NOT NULL, 
	usuario_id INTEGER NOT NULL, 
	iniciada_em TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	velocidade SMALLINT NOT NULL, 
	duracao_min INTEGER NOT NULL, 
	concluida BOOLEAN DEFAULT true NOT NULL, 
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
	id SERIAL NOT NULL, 
	fabrica_id INTEGER NOT NULL, 
	nome VARCHAR(100) NOT NULL, 
	criado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
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
	id SERIAL NOT NULL, 
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
	id SERIAL NOT NULL, 
	fabrica_id INTEGER, 
	usuario_id INTEGER, 
	simulacao_id INTEGER, 
	ocorrido_em TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
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
	id SERIAL NOT NULL, 
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
	id SERIAL NOT NULL, 
	cenario_id INTEGER NOT NULL, 
	maquina_id INTEGER NOT NULL, 
	fabrica_maquina_id INTEGER, 
	ritmo NUMERIC(12, 3) NOT NULL, 
	unidades_paralelo SMALLINT NOT NULL, 
	desligada BOOLEAN DEFAULT false NOT NULL, 
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

-- Comentários (documentação dentro do banco)
COMMENT ON TABLE categorias IS 'Tipos de máquina (grupos do catálogo): Insumos, Preparo, Térmico e gás, Envase, Pós-envase, Refrigeração';
COMMENT ON COLUMN categorias.id IS 'Identificador da linha (gerado automaticamente)';
COMMENT ON COLUMN categorias.codigo IS 'Código curto (ex.: insumos, preparo, termico)';
COMMENT ON COLUMN categorias.nome IS 'Nome mostrado na lista de máquinas e no manual';
COMMENT ON COLUMN categorias.descricao IS 'Explicação em palavras simples';
COMMENT ON COLUMN categorias.icone IS 'Nome do ícone usado na tela';
COMMENT ON COLUMN categorias.ativa IS 'Falso = a categoria some da lista e do manual';
COMMENT ON COLUMN categorias.ordem IS 'Ordem de exibição';
COMMENT ON TABLE etapas IS 'Etapas do processo produtivo e a área (zona) da planta baixa em que cada uma aparece';
COMMENT ON COLUMN etapas.id IS 'Identificador da linha (gerado automaticamente)';
COMMENT ON COLUMN etapas.nome IS 'Etapa do processo (ex.: Envase, Pós-envase)';
COMMENT ON COLUMN etapas.zona IS 'Área da fábrica vista de cima onde a etapa fica';
COMMENT ON TABLE fontes IS 'Fontes dos números (fichas, artigos, anúncios), cada uma com o nível de confiança';
COMMENT ON COLUMN fontes.id IS 'Identificador da linha (gerado automaticamente)';
COMMENT ON COLUMN fontes.titulo IS 'Nome da fonte';
COMMENT ON COLUMN fontes.url IS 'Link da fonte (todo dado real tem link)';
COMMENT ON COLUMN fontes.tipo IS 'Ex.: ficha técnica, artigo científico, anúncio de fornecedor';
COMMENT ON COLUMN fontes.confianca IS 'real, estimado ou hipotese';
COMMENT ON COLUMN fontes.na_base_conhecimento IS 'Verdadeiro = documento consultado pelo assistente de conversa';
COMMENT ON TABLE glossario_termos IS 'Glossário de palavras difíceis do sistema';
COMMENT ON COLUMN glossario_termos.id IS 'Identificador da linha (gerado automaticamente)';
COMMENT ON COLUMN glossario_termos.grupo IS 'Produção, Risco e física, Energia e dinheiro, Processo de bebidas ou Sistema';
COMMENT ON COLUMN glossario_termos.termo IS 'A palavra explicada';
COMMENT ON COLUMN glossario_termos.definicao IS 'Explicação em palavras simples';
COMMENT ON TABLE usuarios IS 'Pessoas que entram no sistema (login simples: usuário e senha, sem perfis)';
COMMENT ON COLUMN usuarios.id IS 'Identificador da linha (gerado automaticamente)';
COMMENT ON COLUMN usuarios.nome_usuario IS 'Nome de login (único)';
COMMENT ON COLUMN usuarios.nome_exibicao IS 'Nome mostrado na tela';
COMMENT ON COLUMN usuarios.senha_hash IS 'Senha protegida (PBKDF2-SHA256 com sal); nunca a senha em texto';
COMMENT ON COLUMN usuarios.ativo IS 'Falso = usuário desativado';
COMMENT ON COLUMN usuarios.criado_em IS 'Quando a conta foi criada';
COMMENT ON COLUMN usuarios.ultimo_acesso_em IS 'Último login (vazio se nunca entrou)';
COMMENT ON TABLE fabricas IS 'Fábricas salvas pelos usuários (cada uma é um mapa de máquinas ligadas entre si)';
COMMENT ON COLUMN fabricas.id IS 'Identificador da linha (gerado automaticamente)';
COMMENT ON COLUMN fabricas.usuario_id IS 'Dono da fábrica';
COMMENT ON COLUMN fabricas.nome IS 'Nome da fábrica';
COMMENT ON COLUMN fabricas.exemplo_origem IS 'Exemplo de que partiu (bebidas ou suco); vazio = montada do zero';
COMMENT ON COLUMN fabricas.temperatura_ambiente IS 'Temperatura do ambiente em °C (0 a 45)';
COMMENT ON COLUMN fabricas.tarifa_energia IS 'Preço da energia em R$ por kWh';
COMMENT ON COLUMN fabricas.parada_emergencia IS 'Verdadeiro = botão de emergência acionado';
COMMENT ON COLUMN fabricas.criada_em IS 'Quando a fábrica foi criada';
COMMENT ON COLUMN fabricas.atualizada_em IS 'Última alteração';
COMMENT ON TABLE glossario_palavras IS 'Palavras que disparam a explicação de um termo nas telas (um termo pode ter várias)';
COMMENT ON COLUMN glossario_palavras.id IS 'Identificador da linha (gerado automaticamente)';
COMMENT ON COLUMN glossario_palavras.termo_id IS 'Termo do glossário';
COMMENT ON COLUMN glossario_palavras.palavra IS 'Palavra que aparece nas telas e ganha o sublinhado com a explicação';
COMMENT ON TABLE maquinas_catalogo IS 'Catálogo: os tipos de máquina que podem ser colocados numa fábrica, com limites, capacidade e consumo';
COMMENT ON COLUMN maquinas_catalogo.id IS 'Identificador da linha (gerado automaticamente)';
COMMENT ON COLUMN maquinas_catalogo.codigo IS 'Código único da máquina (ex.: enchedora, extratora)';
COMMENT ON COLUMN maquinas_catalogo.nome IS 'Nome mostrado na tela';
COMMENT ON COLUMN maquinas_catalogo.categoria_id IS 'Categoria da máquina';
COMMENT ON COLUMN maquinas_catalogo.etapa_id IS 'Etapa do processo';
COMMENT ON COLUMN maquinas_catalogo.fluxo IS 'geral = bebidas em geral; suco = suco de laranja natural';
COMMENT ON COLUMN maquinas_catalogo.icone IS 'Nome do ícone usado na tela';
COMMENT ON COLUMN maquinas_catalogo.parametro IS 'O que o ritmo controla (ex.: Cadência, Vazão, Rotação)';
COMMENT ON COLUMN maquinas_catalogo.unidade IS 'Unidade do ritmo (ex.: gf/min, m³/h, RPM)';
COMMENT ON COLUMN maquinas_catalogo.valor_min IS 'Menor ritmo permitido';
COMMENT ON COLUMN maquinas_catalogo.valor_otimo IS 'Ritmo ótimo: trabalha bem, risco baixo';
COMMENT ON COLUMN maquinas_catalogo.valor_atencao IS 'Limite da zona de atenção (acima do ótimo)';
COMMENT ON COLUMN maquinas_catalogo.valor_falha IS 'A partir deste ritmo a máquina falha';
COMMENT ON COLUMN maquinas_catalogo.valor_max IS 'Maior ritmo permitido pelo controle';
COMMENT ON COLUMN maquinas_catalogo.capacidade_otima IS 'Garrafas por hora que uma unidade entrega no ritmo ótimo';
COMMENT ON COLUMN maquinas_catalogo.consumo_parado_kw IS 'Consumo com a máquina ligada e sem produzir (kW)';
COMMENT ON COLUMN maquinas_catalogo.consumo_variavel_kw IS 'Consumo adicional ao produzir no ótimo (kW)';
COMMENT ON COLUMN maquinas_catalogo.ordem_processo IS 'Posição no processo (0 = começo, 9 = fim); vazio = pode ficar entre quaisquer etapas';
COMMENT ON COLUMN maquinas_catalogo.sensibilidade_termica IS 'Como reage à temperatura ambiente';
COMMENT ON COLUMN maquinas_catalogo.aceita_varias_entradas IS 'Verdadeiro = recebe origens diferentes (ex.: misturador)';
COMMENT ON COLUMN maquinas_catalogo.etapa_final IS 'Verdadeiro = última etapa: nada vem depois';
COMMENT ON COLUMN maquinas_catalogo.descricao IS 'O que a máquina faz, em palavras simples';
COMMENT ON COLUMN maquinas_catalogo.risco_fisico IS 'O que pode dar errado fisicamente';
COMMENT ON COLUMN maquinas_catalogo.base_dos_numeros IS 'Nota de em que os números se baseiam (hipótese didática ou fonte)';
COMMENT ON COLUMN maquinas_catalogo.ativa IS 'Falso = máquina fora do catálogo';
COMMENT ON TABLE fabrica_maquinas IS 'Máquinas colocadas numa fábrica (um tipo do catálogo + ritmo, posição e unidades em paralelo)';
COMMENT ON COLUMN fabrica_maquinas.id IS 'Identificador da linha (gerado automaticamente)';
COMMENT ON COLUMN fabrica_maquinas.fabrica_id IS 'Fábrica em que a máquina foi colocada';
COMMENT ON COLUMN fabrica_maquinas.maquina_id IS 'Tipo de máquina do catálogo';
COMMENT ON COLUMN fabrica_maquinas.pos_x IS 'Posição horizontal no quadro (pixels)';
COMMENT ON COLUMN fabrica_maquinas.pos_y IS 'Posição vertical no quadro (pixels)';
COMMENT ON COLUMN fabrica_maquinas.ritmo IS 'Ritmo atual (na unidade do parâmetro da máquina)';
COMMENT ON COLUMN fabrica_maquinas.unidades_paralelo IS 'Quantas máquinas iguais trabalham lado a lado (1 a 6)';
COMMENT ON COLUMN fabrica_maquinas.desligada IS 'Verdadeiro = máquina desligada';
COMMENT ON TABLE manuais_maquina IS 'Texto do Manual das máquinas (relação 1 para 1 com o catálogo)';
COMMENT ON COLUMN manuais_maquina.maquina_id IS 'Máquina a que o manual pertence (1 manual por máquina)';
COMMENT ON COLUMN manuais_maquina.o_que_faz IS 'Descrição completa da máquina';
COMMENT ON COLUMN manuais_maquina.como_funciona_ritmo IS 'Como o ritmo funciona';
COMMENT ON COLUMN manuais_maquina.dicas IS 'Dicas e cuidados';
COMMENT ON TABLE maquina_fontes IS 'Liga máquinas e fontes (muitos para muitos)';
COMMENT ON COLUMN maquina_fontes.maquina_id IS 'Máquina';
COMMENT ON COLUMN maquina_fontes.fonte_id IS 'Fonte';
COMMENT ON COLUMN maquina_fontes.finalidade IS 'numeros = base dos limites e capacidade; preco = base do preço estimado';
COMMENT ON TABLE mensagens_chat IS 'Conversa do usuário com o assistente';
COMMENT ON COLUMN mensagens_chat.id IS 'Identificador da linha (gerado automaticamente)';
COMMENT ON COLUMN mensagens_chat.usuario_id IS 'Dono da conversa';
COMMENT ON COLUMN mensagens_chat.fabrica_id IS 'Fábrica sobre a qual se conversava';
COMMENT ON COLUMN mensagens_chat.autor IS 'usuario ou assistente';
COMMENT ON COLUMN mensagens_chat.texto IS 'Conteúdo da mensagem';
COMMENT ON COLUMN mensagens_chat.criada_em IS 'Quando foi enviada';
COMMENT ON TABLE modelos_reais IS 'Modelos comerciais reais pesquisados (capacidades de fabricantes), com a fonte de cada um';
COMMENT ON COLUMN modelos_reais.id IS 'Identificador da linha (gerado automaticamente)';
COMMENT ON COLUMN modelos_reais.maquina_id IS 'Tipo de máquina do catálogo a que o modelo corresponde';
COMMENT ON COLUMN modelos_reais.fabricante IS 'Fabricante (ex.: Krones, Tetra Pak)';
COMMENT ON COLUMN modelos_reais.modelo IS 'Nome do modelo';
COMMENT ON COLUMN modelos_reais.aplicacao IS 'Para que serve (ex.: água sem gás em PET)';
COMMENT ON COLUMN modelos_reais.capacidade_min IS 'Capacidade mínima, quando a fonte informa uma faixa';
COMMENT ON COLUMN modelos_reais.capacidade_max IS 'Capacidade nominal máxima';
COMMENT ON COLUMN modelos_reais.unidade_capacidade IS 'garrafas/h, latas/h, recipientes/h ou L/h';
COMMENT ON COLUMN modelos_reais.fonte_id IS 'De onde vem o dado (com link e confiança)';
COMMENT ON COLUMN modelos_reais.observacao IS 'Observações da pesquisa';
COMMENT ON TABLE planos_objetivo IS 'Planos do tipo ''quero +10%% de produção'': o que fazer, o resultado esperado e o investimento';
COMMENT ON COLUMN planos_objetivo.id IS 'Identificador da linha (gerado automaticamente)';
COMMENT ON COLUMN planos_objetivo.fabrica_id IS 'Fábrica';
COMMENT ON COLUMN planos_objetivo.usuario_id IS 'Quem pediu o plano';
COMMENT ON COLUMN planos_objetivo.criado_em IS 'Quando o plano foi calculado';
COMMENT ON COLUMN planos_objetivo.tipo_objetivo IS 'pct = aumentar em %%; abs = chegar a uma produção; risk = reduzir o risco';
COMMENT ON COLUMN planos_objetivo.valor_meta IS 'Valor pedido (%% ou garrafas/h); vazio para risk';
COMMENT ON COLUMN planos_objetivo.aceita_zona_atencao IS 'Permitiu operar acima do ótimo?';
COMMENT ON COLUMN planos_objetivo.aceita_paralelo IS 'Permitiu usar mais máquinas em paralelo?';
COMMENT ON COLUMN planos_objetivo.producao_antes IS 'Produção antes do plano (garrafas/h)';
COMMENT ON COLUMN planos_objetivo.producao_depois IS 'Produção prevista depois do plano';
COMMENT ON COLUMN planos_objetivo.risco_antes IS 'Risco máximo antes (0 a 1)';
COMMENT ON COLUMN planos_objetivo.risco_depois IS 'Risco máximo depois (0 a 1)';
COMMENT ON COLUMN planos_objetivo.investimento_min IS 'Investimento estimado mínimo (R$)';
COMMENT ON COLUMN planos_objetivo.investimento_max IS 'Investimento estimado máximo (R$)';
COMMENT ON COLUMN planos_objetivo.atingiu_meta IS 'O plano consegue chegar à meta?';
COMMENT ON COLUMN planos_objetivo.aplicado IS 'O usuário aplicou o plano na fábrica?';
COMMENT ON TABLE precos_maquina IS 'Faixas de preço estimadas (nunca cotação), usadas para calcular o custo de uma melhoria';
COMMENT ON COLUMN precos_maquina.id IS 'Identificador da linha (gerado automaticamente)';
COMMENT ON COLUMN precos_maquina.maquina_id IS 'Máquina';
COMMENT ON COLUMN precos_maquina.preco_min IS 'Menor preço estimado de 1 unidade';
COMMENT ON COLUMN precos_maquina.preco_max IS 'Maior preço estimado de 1 unidade';
COMMENT ON COLUMN precos_maquina.moeda IS 'Moeda (câmbio de referência R$ 5,50 por US$)';
COMMENT ON COLUMN precos_maquina.observacao IS 'Nota de como a faixa foi estimada';
COMMENT ON COLUMN precos_maquina.editado_pelo_usuario IS 'Verdadeiro = ajustado nas Configurações';
COMMENT ON COLUMN precos_maquina.vigente_desde IS 'Quando esta faixa passou a valer (permite guardar o histórico)';
COMMENT ON TABLE simulacoes IS 'Resultado final de cada vez que o usuário roda o Play';
COMMENT ON COLUMN simulacoes.id IS 'Identificador da linha (gerado automaticamente)';
COMMENT ON COLUMN simulacoes.fabrica_id IS 'Fábrica simulada';
COMMENT ON COLUMN simulacoes.usuario_id IS 'Quem rodou o Play';
COMMENT ON COLUMN simulacoes.iniciada_em IS 'Quando o Play foi iniciado';
COMMENT ON COLUMN simulacoes.velocidade IS 'Velocidade usada: 1, 5, 20 ou 60 vezes';
COMMENT ON COLUMN simulacoes.duracao_min IS 'Duração simulada em minutos (30, 60 ou 480)';
COMMENT ON COLUMN simulacoes.concluida IS 'Falso = parada antes do fim';
COMMENT ON COLUMN simulacoes.garrafas_produzidas IS 'Total produzido no período';
COMMENT ON COLUMN simulacoes.energia_kwh IS 'Energia gasta no período (kWh)';
COMMENT ON COLUMN simulacoes.fila_total IS 'Garrafas paradas na fila ao final';
COMMENT ON COLUMN simulacoes.pct_do_maximo IS 'Percentual do máximo possível (tudo no ótimo)';
COMMENT ON COLUMN simulacoes.risco_max IS 'Maior risco visto (0 a 1)';
COMMENT ON COLUMN simulacoes.gargalo_maquina_id IS 'Tipo de máquina que mais limitou a fábrica';
COMMENT ON TABLE cenarios IS 'Fotos de uma fábrica simulada, para comparar antes e depois';
COMMENT ON COLUMN cenarios.id IS 'Identificador da linha (gerado automaticamente)';
COMMENT ON COLUMN cenarios.fabrica_id IS 'Fábrica fotografada';
COMMENT ON COLUMN cenarios.nome IS 'Nome do cenário (ex.: Situação inicial)';
COMMENT ON COLUMN cenarios.criado_em IS 'Quando a foto foi tirada';
COMMENT ON COLUMN cenarios.temperatura_ambiente IS 'Temperatura considerada (°C)';
COMMENT ON COLUMN cenarios.producao_h IS 'Produção da fábrica (garrafas por hora)';
COMMENT ON COLUMN cenarios.risco_max IS 'Risco da pior máquina (0 a 1)';
COMMENT ON COLUMN cenarios.energia_kw IS 'Consumo total (kW)';
COMMENT ON COLUMN cenarios.gargalo_id IS 'Máquina que era o gargalo';
COMMENT ON TABLE conexoes IS 'Ligações entre duas máquinas da mesma fábrica (por onde o produto passa)';
COMMENT ON COLUMN conexoes.id IS 'Identificador da linha (gerado automaticamente)';
COMMENT ON COLUMN conexoes.fabrica_id IS 'Fábrica';
COMMENT ON COLUMN conexoes.origem_id IS 'Máquina de origem (a que envia o produto)';
COMMENT ON COLUMN conexoes.destino_id IS 'Máquina de destino (a que recebe o produto)';
COMMENT ON TABLE eventos_registro IS 'Registro (log) do que o usuário faz e do que acontece durante a simulação';
COMMENT ON COLUMN eventos_registro.id IS 'Identificador da linha (gerado automaticamente)';
COMMENT ON COLUMN eventos_registro.fabrica_id IS 'Fábrica a que o evento se refere (vazio = evento geral)';
COMMENT ON COLUMN eventos_registro.usuario_id IS 'Quem causou o evento';
COMMENT ON COLUMN eventos_registro.simulacao_id IS 'Simulação em que ocorreu (se foi durante o Play)';
COMMENT ON COLUMN eventos_registro.ocorrido_em IS 'Quando aconteceu';
COMMENT ON COLUMN eventos_registro.tipo IS 'info, ok, warn ou bad (cor da linha no Registro)';
COMMENT ON COLUMN eventos_registro.mensagem IS 'O que aconteceu';
COMMENT ON TABLE plano_passos IS 'Passos de um plano (qual máquina mexer, de quanto para quanto, por quê e quanto custa)';
COMMENT ON COLUMN plano_passos.id IS 'Identificador da linha (gerado automaticamente)';
COMMENT ON COLUMN plano_passos.plano_id IS 'Plano';
COMMENT ON COLUMN plano_passos.ordem IS 'Posição do passo no plano (1, 2, 3...)';
COMMENT ON COLUMN plano_passos.acao IS 'ligar, paralelo ou ritmo';
COMMENT ON COLUMN plano_passos.fabrica_maquina_id IS 'Máquina da fábrica afetada (vazio se foi removida)';
COMMENT ON COLUMN plano_passos.maquina_id IS 'Tipo da máquina afetada';
COMMENT ON COLUMN plano_passos.ritmo_antes IS 'Ritmo antes (ação ritmo)';
COMMENT ON COLUMN plano_passos.ritmo_depois IS 'Ritmo depois (ação ritmo)';
COMMENT ON COLUMN plano_passos.unidades_antes IS 'Unidades em paralelo antes (ação paralelo)';
COMMENT ON COLUMN plano_passos.unidades_depois IS 'Unidades em paralelo depois (ação paralelo)';
COMMENT ON COLUMN plano_passos.motivo IS 'O porquê do passo, em palavras simples';
COMMENT ON COLUMN plano_passos.custo_min IS 'Custo estimado mínimo do passo (R$)';
COMMENT ON COLUMN plano_passos.custo_max IS 'Custo estimado máximo do passo (R$)';
COMMENT ON TABLE cenario_maquinas IS 'Situação de cada máquina dentro de um cenário (capacidade, saída, fila, risco e energia)';
COMMENT ON COLUMN cenario_maquinas.id IS 'Identificador da linha (gerado automaticamente)';
COMMENT ON COLUMN cenario_maquinas.cenario_id IS 'Cenário';
COMMENT ON COLUMN cenario_maquinas.maquina_id IS 'Tipo da máquina';
COMMENT ON COLUMN cenario_maquinas.fabrica_maquina_id IS 'Máquina na fábrica (vazio se ela foi removida depois)';
COMMENT ON COLUMN cenario_maquinas.ritmo IS 'Ritmo na foto';
COMMENT ON COLUMN cenario_maquinas.unidades_paralelo IS 'Unidades em paralelo na foto';
COMMENT ON COLUMN cenario_maquinas.desligada IS 'Estava desligada?';
COMMENT ON COLUMN cenario_maquinas.capacidade_h IS 'Quanto conseguia entregar (garrafas/h)';
COMMENT ON COLUMN cenario_maquinas.saida_h IS 'O que realmente saía (garrafas/h)';
COMMENT ON COLUMN cenario_maquinas.fila_h IS 'Excesso parado esperando esta máquina (garrafas/h)';
COMMENT ON COLUMN cenario_maquinas.risco IS 'Risco de falha (0 a 1)';
COMMENT ON COLUMN cenario_maquinas.estado IS 'normal, alerta, critico, falha ou desligada';
COMMENT ON COLUMN cenario_maquinas.energia_kw IS 'Consumo (kW)';
