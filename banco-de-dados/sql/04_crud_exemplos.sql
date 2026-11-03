-- Digital Twin Industrial: exemplos de CRUD em TODAS as 25 tabelas (21 da versão 1 e 4 da versão 2).
--   C = Create (INSERT)   R = Read (SELECT)   U = Update (UPDATE)   D = Delete (DELETE)
-- SQL padrão: roda no SQLite e no PostgreSQL. Cada bloco cria dados de exemplo, lê, altera e apaga,
-- então no final o banco volta ao que era no começo (ver a conferência no fim do arquivo).
-- Rode depois de 01_schema_*.sql, 02_dados_iniciais.sql e 03_views.sql.
-- No SQLite lembre de ligar as chaves estrangeiras:  PRAGMA foreign_keys = ON;

-- =====================================================================================================
-- BLOCO A: CATÁLOGO (categorias, etapas, maquinas_catalogo, manuais_maquina, fontes, maquina_fontes,
--          precos_maquina, modelos_reais)
-- =====================================================================================================

-- [CREATE] categorias, etapas e uma máquina nova no catálogo
INSERT INTO categorias (codigo, nome, descricao, icone, ativa, ordem)
VALUES ('embalagem', 'Embalagem', 'Máquinas que fecham e embalam os produtos.', 'box', TRUE, 7);

INSERT INTO etapas (nome, zona) VALUES ('Embalagem', 'Envase e expedição');

INSERT INTO maquinas_catalogo (codigo, nome, categoria_id, etapa_id, fluxo, icone, parametro, unidade, valor_min, valor_otimo, valor_atencao,
                               valor_falha, valor_max, capacidade_otima, consumo_parado_kw, consumo_variavel_kw, ordem_processo,
                               sensibilidade_termica, aceita_varias_entradas, etapa_final, descricao, risco_fisico, base_dos_numeros, ativa)
VALUES ('encaixotadora', 'Encaixotadora',
        (SELECT id FROM categorias WHERE codigo = 'embalagem'), (SELECT id FROM etapas WHERE nome = 'Embalagem'),
        'geral', 'box', 'Cadência', 'cx/min', 5, 20, 26, 32, 40, 9000, 1.5, 2.0, 8, 'motor', FALSE, FALSE,
        'Coloca as garrafas dentro das caixas.', 'Cadência alta derruba garrafas e trava a máquina.',
        'Exemplo de CRUD: valores inventados só para demonstração.', TRUE);

INSERT INTO manuais_maquina (maquina_id, o_que_faz, como_funciona_ritmo, dicas)
VALUES ((SELECT id FROM maquinas_catalogo WHERE codigo = 'encaixotadora'),
        'Coloca as garrafas dentro das caixas de papelão.', 'A cadência é quantas caixas por minuto.', 'Confira o alinhamento das caixas.');

INSERT INTO fontes (titulo, url, tipo, confianca, na_base_conhecimento)
VALUES ('Fonte de exemplo do CRUD', 'https://exemplo.com/crud-fonte', 'exemplo', 'hipotese', FALSE);

INSERT INTO maquina_fontes (maquina_id, fonte_id, finalidade)
VALUES ((SELECT id FROM maquinas_catalogo WHERE codigo = 'encaixotadora'),
        (SELECT id FROM fontes WHERE url = 'https://exemplo.com/crud-fonte'), 'numeros');

INSERT INTO precos_maquina (maquina_id, preco_min, preco_max, moeda, observacao, editado_pelo_usuario)
VALUES ((SELECT id FROM maquinas_catalogo WHERE codigo = 'encaixotadora'), 50000, 90000, 'BRL', 'Preço de exemplo.', FALSE);

INSERT INTO modelos_reais (maquina_id, fabricante, modelo, aplicacao, capacidade_min, capacidade_max, unidade_capacidade, fonte_id, observacao)
VALUES ((SELECT id FROM maquinas_catalogo WHERE codigo = 'encaixotadora'), 'Fabricante Exemplo', 'Modelo X1', 'Caixas de papelão',
        NULL, 9000, 'caixas/h', (SELECT id FROM fontes WHERE url = 'https://exemplo.com/crud-fonte'), NULL);

-- [READ] a máquina nova, com categoria, etapa, zona, preço e modelo (JOIN entre 6 tabelas)
SELECT m.codigo, m.nome AS maquina, c.nome AS categoria, e.nome AS etapa, e.zona, p.preco_min, p.preco_max,
       mr.fabricante, mr.modelo, f.titulo AS fonte
FROM maquinas_catalogo m
JOIN categorias c ON c.id = m.categoria_id
JOIN etapas e ON e.id = m.etapa_id
JOIN precos_maquina p ON p.maquina_id = m.id
JOIN modelos_reais mr ON mr.maquina_id = m.id
JOIN fontes f ON f.id = mr.fonte_id
WHERE m.codigo = 'encaixotadora';

-- [UPDATE] muda capacidade e ritmo ótimo, preço máximo, nome da categoria, zona da etapa, confiança da fonte e capacidade do modelo
UPDATE maquinas_catalogo SET capacidade_otima = 9500, valor_otimo = 22 WHERE codigo = 'encaixotadora';
UPDATE precos_maquina SET preco_max = 95000, editado_pelo_usuario = TRUE
 WHERE maquina_id = (SELECT id FROM maquinas_catalogo WHERE codigo = 'encaixotadora');
UPDATE categorias SET nome = 'Embalagem e paletização' WHERE codigo = 'embalagem';
UPDATE etapas SET zona = 'Envase e expedição' WHERE nome = 'Embalagem';
UPDATE manuais_maquina SET dicas = 'Confira o alinhamento das caixas a cada turno.'
 WHERE maquina_id = (SELECT id FROM maquinas_catalogo WHERE codigo = 'encaixotadora');
UPDATE fontes SET confianca = 'estimado' WHERE url = 'https://exemplo.com/crud-fonte';
UPDATE modelos_reais SET capacidade_max = 9800 WHERE modelo = 'Modelo X1';

-- [READ] conferindo as alterações
SELECT codigo, capacidade_otima, valor_otimo FROM maquinas_catalogo WHERE codigo = 'encaixotadora';
SELECT preco_min, preco_max, editado_pelo_usuario FROM precos_maquina
 WHERE maquina_id = (SELECT id FROM maquinas_catalogo WHERE codigo = 'encaixotadora');

-- [DELETE] apaga na ordem inversa (primeiro quem depende, depois quem é dependência)
DELETE FROM modelos_reais WHERE modelo = 'Modelo X1';
DELETE FROM precos_maquina WHERE maquina_id = (SELECT id FROM maquinas_catalogo WHERE codigo = 'encaixotadora');
DELETE FROM maquina_fontes WHERE maquina_id = (SELECT id FROM maquinas_catalogo WHERE codigo = 'encaixotadora');
DELETE FROM manuais_maquina WHERE maquina_id = (SELECT id FROM maquinas_catalogo WHERE codigo = 'encaixotadora');
DELETE FROM maquinas_catalogo WHERE codigo = 'encaixotadora';
DELETE FROM fontes WHERE url = 'https://exemplo.com/crud-fonte';
DELETE FROM etapas WHERE nome = 'Embalagem';
DELETE FROM categorias WHERE codigo = 'embalagem';

-- =====================================================================================================
-- BLOCO B: GLOSSÁRIO (glossario_termos, glossario_palavras)
-- =====================================================================================================

-- [CREATE]
INSERT INTO glossario_termos (grupo, termo, definicao)
VALUES ('Sistema', 'Encaixotadora', 'Máquina que coloca as garrafas dentro das caixas.');
INSERT INTO glossario_palavras (termo_id, palavra)
VALUES ((SELECT id FROM glossario_termos WHERE termo = 'Encaixotadora'), 'encaixotadora');

-- [READ]
SELECT t.grupo, t.termo, p.palavra, t.definicao
FROM glossario_termos t JOIN glossario_palavras p ON p.termo_id = t.id
WHERE t.termo = 'Encaixotadora';

-- [UPDATE]
UPDATE glossario_termos SET definicao = 'Máquina que coloca as garrafas dentro das caixas de papelão.' WHERE termo = 'Encaixotadora';
UPDATE glossario_palavras SET palavra = 'encaixotadoras' WHERE palavra = 'encaixotadora';

-- [DELETE]
DELETE FROM glossario_palavras WHERE palavra = 'encaixotadoras';
DELETE FROM glossario_termos WHERE termo = 'Encaixotadora';

-- =====================================================================================================
-- BLOCO C: USUÁRIO E FÁBRICA (usuarios, fabricas, fabrica_maquinas, conexoes)
-- =====================================================================================================

-- [CREATE] um usuário, uma fábrica dele, duas máquinas e a conexão entre elas
INSERT INTO usuarios (nome_usuario, nome_exibicao, senha_hash) VALUES ('ana.souza', 'Ana Souza', 'pbkdf2_sha256$exemplo');

INSERT INTO fabricas (usuario_id, nome, exemplo_origem, temperatura_ambiente, tarifa_energia, parada_emergencia)
VALUES ((SELECT id FROM usuarios WHERE nome_usuario = 'ana.souza'), 'Fábrica da Ana', NULL, 28, 0.90, FALSE);

INSERT INTO fabrica_maquinas (fabrica_id, maquina_id, pos_x, pos_y, ritmo, unidades_paralelo, desligada)
VALUES ((SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana'), (SELECT id FROM maquinas_catalogo WHERE codigo = 'enchedora'), 40, 60, 200, 1, FALSE);
INSERT INTO fabrica_maquinas (fabrica_id, maquina_id, pos_x, pos_y, ritmo, unidades_paralelo, desligada)
VALUES ((SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana'), (SELECT id FROM maquinas_catalogo WHERE codigo = 'rotuladora'), 270, 60, 190, 1, FALSE);

INSERT INTO conexoes (fabrica_id, origem_id, destino_id)
VALUES ((SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana'),
        (SELECT fm.id FROM fabrica_maquinas fm JOIN maquinas_catalogo m ON m.id = fm.maquina_id
          WHERE fm.fabrica_id = (SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana') AND m.codigo = 'enchedora'),
        (SELECT fm.id FROM fabrica_maquinas fm JOIN maquinas_catalogo m ON m.id = fm.maquina_id
          WHERE fm.fabrica_id = (SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana') AND m.codigo = 'rotuladora'));

-- [READ] a fábrica com suas máquinas e a ligação (usa a view vw_fabricas_resumo e um JOIN)
SELECT * FROM vw_fabricas_resumo WHERE fabrica = 'Fábrica da Ana';
SELECT mo.nome AS origem, md.nome AS destino
FROM conexoes c
JOIN fabrica_maquinas fo ON fo.id = c.origem_id  JOIN maquinas_catalogo mo ON mo.id = fo.maquina_id
JOIN fabrica_maquinas fd ON fd.id = c.destino_id JOIN maquinas_catalogo md ON md.id = fd.maquina_id
WHERE c.fabrica_id = (SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana');

-- [UPDATE] muda temperatura e tarifa da fábrica, o ritmo e as unidades em paralelo da rotuladora, desliga a enchedora e muda o nome do usuário
UPDATE fabricas SET temperatura_ambiente = 32, tarifa_energia = 0.95, atualizada_em = CURRENT_TIMESTAMP WHERE nome = 'Fábrica da Ana';
UPDATE fabrica_maquinas SET ritmo = 225, unidades_paralelo = 2
 WHERE fabrica_id = (SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana')
   AND maquina_id = (SELECT id FROM maquinas_catalogo WHERE codigo = 'rotuladora');
UPDATE fabrica_maquinas SET desligada = TRUE
 WHERE fabrica_id = (SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana')
   AND maquina_id = (SELECT id FROM maquinas_catalogo WHERE codigo = 'enchedora');
UPDATE usuarios SET nome_exibicao = 'Ana Souza Lima', ultimo_acesso_em = CURRENT_TIMESTAMP WHERE nome_usuario = 'ana.souza';

-- [READ] conferindo
SELECT f.nome, f.temperatura_ambiente, f.tarifa_energia, m.codigo, fm.ritmo, fm.unidades_paralelo, fm.desligada
FROM fabricas f JOIN fabrica_maquinas fm ON fm.fabrica_id = f.id JOIN maquinas_catalogo m ON m.id = fm.maquina_id
WHERE f.nome = 'Fábrica da Ana';

-- =====================================================================================================
-- BLOCO D: SIMULAÇÃO E RESULTADOS (cenarios, cenario_maquinas, simulacoes, planos_objetivo, plano_passos,
--          eventos_registro, mensagens_chat) usando a fábrica criada acima
-- =====================================================================================================

-- [CREATE]
INSERT INTO cenarios (fabrica_id, nome, temperatura_ambiente, producao_h, risco_max, energia_kw, gargalo_id)
VALUES ((SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana'), 'Cenário de exemplo', 32, 11400, 0.02, 9.5,
        (SELECT fm.id FROM fabrica_maquinas fm JOIN maquinas_catalogo m ON m.id = fm.maquina_id
          WHERE fm.fabrica_id = (SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana') AND m.codigo = 'rotuladora'));

INSERT INTO cenario_maquinas (cenario_id, maquina_id, fabrica_maquina_id, ritmo, unidades_paralelo, desligada, capacidade_h, saida_h, fila_h, risco, estado, energia_kw)
VALUES ((SELECT id FROM cenarios WHERE nome = 'Cenário de exemplo'), (SELECT id FROM maquinas_catalogo WHERE codigo = 'rotuladora'),
        (SELECT fm.id FROM fabrica_maquinas fm JOIN maquinas_catalogo m ON m.id = fm.maquina_id
          WHERE fm.fabrica_id = (SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana') AND m.codigo = 'rotuladora'),
        190, 1, FALSE, 11400, 11400, 0, 0.02, 'normal', 6.6);

INSERT INTO simulacoes (fabrica_id, usuario_id, velocidade, duracao_min, concluida, garrafas_produzidas, energia_kwh, fila_total, pct_do_maximo, risco_max, gargalo_maquina_id)
VALUES ((SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana'), (SELECT id FROM usuarios WHERE nome_usuario = 'ana.souza'),
        20, 480, TRUE, 87000, 190.5, 1200, 95.5, 0.02, (SELECT id FROM maquinas_catalogo WHERE codigo = 'rotuladora'));

INSERT INTO eventos_registro (fabrica_id, usuario_id, simulacao_id, tipo, mensagem)
VALUES ((SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana'), (SELECT id FROM usuarios WHERE nome_usuario = 'ana.souza'),
        (SELECT MAX(id) FROM simulacoes WHERE fabrica_id = (SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana')),
        'ok', 'Simulação terminada (exemplo de CRUD)');

INSERT INTO planos_objetivo (fabrica_id, usuario_id, tipo_objetivo, valor_meta, aceita_zona_atencao, aceita_paralelo, producao_antes, producao_depois,
                             risco_antes, risco_depois, investimento_min, investimento_max, atingiu_meta, aplicado)
VALUES ((SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana'), (SELECT id FROM usuarios WHERE nome_usuario = 'ana.souza'),
        'pct', 10, TRUE, TRUE, 11400, 12600, 0.02, 0.084, 40000, 140000, TRUE, FALSE);

INSERT INTO plano_passos (plano_id, ordem, acao, fabrica_maquina_id, maquina_id, ritmo_antes, ritmo_depois, unidades_antes, unidades_depois, motivo, custo_min, custo_max)
VALUES ((SELECT MAX(id) FROM planos_objetivo WHERE fabrica_id = (SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana')), 1, 'paralelo',
        (SELECT fm.id FROM fabrica_maquinas fm JOIN maquinas_catalogo m ON m.id = fm.maquina_id
          WHERE fm.fabrica_id = (SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana') AND m.codigo = 'rotuladora'),
        (SELECT id FROM maquinas_catalogo WHERE codigo = 'rotuladora'), NULL, NULL, 1, 2,
        'Mesmo no limite seguro, a rotuladora continuava sendo o gargalo.', 40000, 140000);

INSERT INTO mensagens_chat (usuario_id, fabrica_id, autor, texto)
VALUES ((SELECT id FROM usuarios WHERE nome_usuario = 'ana.souza'), (SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana'),
        'usuario', 'Onde está o gargalo?');

-- [READ] resultados (usa as views vw_cenarios_comparativo e vw_planos_investimento)
SELECT * FROM vw_cenarios_comparativo WHERE fabrica = 'Fábrica da Ana';
SELECT * FROM vw_planos_investimento WHERE fabrica = 'Fábrica da Ana';
SELECT s.velocidade, s.duracao_min, s.garrafas_produzidas, s.energia_kwh, m.nome AS gargalo
FROM simulacoes s JOIN maquinas_catalogo m ON m.id = s.gargalo_maquina_id
WHERE s.fabrica_id = (SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana');
SELECT p.ordem, p.acao, m.nome AS maquina, p.unidades_antes, p.unidades_depois, p.motivo
FROM plano_passos p JOIN maquinas_catalogo m ON m.id = p.maquina_id
WHERE p.plano_id = (SELECT MAX(id) FROM planos_objetivo WHERE fabrica_id = (SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana'));

-- [UPDATE]
UPDATE cenarios SET nome = 'Cenário de exemplo (revisado)', producao_h = 11500 WHERE nome = 'Cenário de exemplo';
UPDATE cenario_maquinas SET estado = 'alerta', risco = 0.08
 WHERE cenario_id = (SELECT id FROM cenarios WHERE nome = 'Cenário de exemplo (revisado)');
UPDATE simulacoes SET concluida = FALSE, pct_do_maximo = 90
 WHERE fabrica_id = (SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana');
UPDATE eventos_registro SET tipo = 'warn', mensagem = 'Simulação interrompida (exemplo de CRUD)'
 WHERE mensagem = 'Simulação terminada (exemplo de CRUD)';
UPDATE planos_objetivo SET aplicado = TRUE WHERE fabrica_id = (SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana');
UPDATE plano_passos SET motivo = 'A rotuladora limitava a fábrica inteira.'
 WHERE plano_id = (SELECT MAX(id) FROM planos_objetivo WHERE fabrica_id = (SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana'));
UPDATE mensagens_chat SET texto = 'Onde está o gargalo da minha fábrica?' WHERE texto = 'Onde está o gargalo?';

-- [READ] conferindo
SELECT nome, producao_h FROM cenarios WHERE nome LIKE 'Cenário de exemplo%';
SELECT tipo, mensagem FROM eventos_registro WHERE mensagem LIKE '%exemplo de CRUD%';

-- [DELETE] primeiro alguns filhos, direto
DELETE FROM mensagens_chat WHERE texto = 'Onde está o gargalo da minha fábrica?';
DELETE FROM plano_passos WHERE plano_id = (SELECT MAX(id) FROM planos_objetivo WHERE fabrica_id = (SELECT id FROM fabricas WHERE nome = 'Fábrica da Ana'));

-- [READ] antes de apagar a fábrica: o que existe ligado a ela
SELECT (SELECT COUNT(*) FROM fabrica_maquinas WHERE fabrica_id = f.id) AS maquinas,
       (SELECT COUNT(*) FROM conexoes         WHERE fabrica_id = f.id) AS conexoes,
       (SELECT COUNT(*) FROM cenarios         WHERE fabrica_id = f.id) AS cenarios,
       (SELECT COUNT(*) FROM simulacoes       WHERE fabrica_id = f.id) AS simulacoes,
       (SELECT COUNT(*) FROM planos_objetivo  WHERE fabrica_id = f.id) AS planos,
       (SELECT COUNT(*) FROM eventos_registro WHERE fabrica_id = f.id) AS eventos
FROM fabricas f WHERE f.nome = 'Fábrica da Ana';

-- [DELETE] apagar a fábrica apaga em cascata: máquinas, conexões, cenários (e suas máquinas), simulações, planos e eventos dela
DELETE FROM fabricas WHERE nome = 'Fábrica da Ana';

-- [DELETE] por fim, o usuário de exemplo
DELETE FROM usuarios WHERE nome_usuario = 'ana.souza';

-- =====================================================================================================
-- BLOCO E: VERSÃO 2 (desgaste e manutenção, versões de máquina, fichas técnicas e linha do tempo do Play)
--          (manutencoes, documentos_maquina, simulacao_pontos, simulacao_pontos_maquina e as colunas novas)
-- =====================================================================================================

-- [UPDATE] a primeira máquina da fábrica de exemplo ganha horas de uso e desgaste
UPDATE fabrica_maquinas SET horas_operacao = 1500, horas_desgaste = 1800 WHERE id = (SELECT MIN(id) FROM fabrica_maquinas);

-- [READ] quanto da vida útil ela já gastou (o desgaste vem das colunas novas; a vida útil, do catálogo)
SELECT m.codigo, fm.horas_operacao, fm.horas_desgaste, m.vida_util_h,
       ROUND(100.0 * fm.horas_desgaste / m.vida_util_h, 2) AS vida_gasta_pct
FROM fabrica_maquinas fm JOIN maquinas_catalogo m ON m.id = fm.maquina_id
WHERE fm.id = (SELECT MIN(id) FROM fabrica_maquinas);

-- [CREATE] registrar uma manutenção preventiva (recupera 60% do desgaste)
INSERT INTO manutencoes (fabrica_maquina_id, tipo, horas_desgaste_antes, horas_desgaste_depois, observacao)
VALUES ((SELECT MIN(id) FROM fabrica_maquinas), 'preventiva', 1800, 720, 'troca de vedações');
UPDATE fabrica_maquinas SET horas_desgaste = 720, manutencao_em_h = 720 WHERE id = (SELECT MIN(id) FROM fabrica_maquinas);

-- [READ] histórico de manutenções
SELECT tipo, horas_desgaste_antes, horas_desgaste_depois, observacao FROM manutencoes;

-- [UPDATE] volta a máquina ao estado inicial e [DELETE] apaga a manutenção de exemplo
UPDATE fabrica_maquinas SET horas_operacao = 0, horas_desgaste = 0, manutencao_em_h = 0 WHERE id = (SELECT MIN(id) FROM fabrica_maquinas);
DELETE FROM manutencoes WHERE observacao = 'troca de vedações';

-- [CREATE] anexar uma ficha técnica (o mesmo arquivo não entra duas vezes: sha256 é único)
INSERT INTO documentos_maquina (nome_arquivo, sha256, tamanho_bytes, paginas, texto_extraido, campos_extraidos, status)
VALUES ('ficha-exemplo.pdf', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 1000, 2, 'texto da ficha', '{}', 'analisado');

-- [CREATE] a máquina vira uma NOVA VERSÃO (v2) da enchedora; a v1 continua no catálogo
INSERT INTO maquinas_catalogo (codigo, nome, categoria_id, etapa_id, parametro, unidade, valor_min, valor_otimo, valor_atencao, valor_falha, valor_max,
                               capacidade_otima, consumo_parado_kw, consumo_variavel_kw, descricao, risco_fisico, base_dos_numeros,
                               versao, grupo_codigo, origem, fabricante, modelo)
SELECT 'enchedora_v2', 'Enchedora (v2)', categoria_id, etapa_id, parametro, unidade, valor_min, valor_otimo, valor_atencao, valor_falha, valor_max,
       capacidade_otima * 1.5, consumo_parado_kw, consumo_variavel_kw, descricao, risco_fisico, base_dos_numeros,
       2, 'enchedora', 'importada', 'Krones', 'Modulfill'
FROM maquinas_catalogo WHERE codigo = 'enchedora';
UPDATE documentos_maquina SET status = 'importado', maquina_id = (SELECT id FROM maquinas_catalogo WHERE codigo = 'enchedora_v2')
WHERE sha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

-- [READ] as versões da enchedora e o documento de onde veio a v2
SELECT codigo, versao, origem, capacidade_otima FROM maquinas_catalogo WHERE grupo_codigo = 'enchedora' ORDER BY versao;
SELECT d.nome_arquivo, d.status, m.codigo FROM documentos_maquina d JOIN maquinas_catalogo m ON m.id = d.maquina_id;

-- [DELETE] apagar a máquina importada não apaga o documento (ele só perde o vínculo); depois apagamos o documento
DELETE FROM maquinas_catalogo WHERE codigo = 'enchedora_v2';
DELETE FROM documentos_maquina WHERE sha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

-- [CREATE] linha do tempo de uma simulação: um ponto da fábrica e a leitura de uma máquina nesse ponto
INSERT INTO simulacao_pontos (simulacao_id, minuto, garrafas_acumuladas, producao_h, energia_kwh, fila_total, risco_max)
VALUES ((SELECT MIN(id) FROM simulacoes), 15, 2850, 11400, 6.1, 0, 0.02);
INSERT INTO simulacao_pontos_maquina (ponto_id, fabrica_maquina_id, saida_h, fila_h, risco, estado, energia_kw, temperatura_c)
VALUES ((SELECT MAX(id) FROM simulacao_pontos), (SELECT MIN(id) FROM fabrica_maquinas), 11400, 0, 0.02, 'normal', 3.1, 65.0);

-- [READ] a leitura da máquina em cada minuto da simulação
SELECT p.minuto, p.garrafas_acumuladas, pm.saida_h, pm.temperatura_c, pm.estado
FROM simulacao_pontos p JOIN simulacao_pontos_maquina pm ON pm.ponto_id = p.id;

-- [DELETE] apagar o ponto apaga em cascata a leitura da máquina
DELETE FROM simulacao_pontos WHERE minuto = 15 AND garrafas_acumuladas = 2850;

-- =====================================================================================================
-- CONFERÊNCIA FINAL: linhas de cada tabela. Devem ser iguais às do banco original (ver banco-de-dados/README.md):
-- tudo o que foi criado nos blocos acima foi apagado, inclusive o que caiu pela cascata.
-- =====================================================================================================
SELECT 'usuarios' AS tabela, COUNT(*) AS linhas FROM usuarios
UNION ALL SELECT 'categorias', COUNT(*) FROM categorias
UNION ALL SELECT 'etapas', COUNT(*) FROM etapas
UNION ALL SELECT 'maquinas_catalogo', COUNT(*) FROM maquinas_catalogo
UNION ALL SELECT 'manuais_maquina', COUNT(*) FROM manuais_maquina
UNION ALL SELECT 'fontes', COUNT(*) FROM fontes
UNION ALL SELECT 'maquina_fontes', COUNT(*) FROM maquina_fontes
UNION ALL SELECT 'precos_maquina', COUNT(*) FROM precos_maquina
UNION ALL SELECT 'modelos_reais', COUNT(*) FROM modelos_reais
UNION ALL SELECT 'glossario_termos', COUNT(*) FROM glossario_termos
UNION ALL SELECT 'glossario_palavras', COUNT(*) FROM glossario_palavras
UNION ALL SELECT 'fabricas', COUNT(*) FROM fabricas
UNION ALL SELECT 'fabrica_maquinas', COUNT(*) FROM fabrica_maquinas
UNION ALL SELECT 'conexoes', COUNT(*) FROM conexoes
UNION ALL SELECT 'cenarios', COUNT(*) FROM cenarios
UNION ALL SELECT 'cenario_maquinas', COUNT(*) FROM cenario_maquinas
UNION ALL SELECT 'simulacoes', COUNT(*) FROM simulacoes
UNION ALL SELECT 'eventos_registro', COUNT(*) FROM eventos_registro
UNION ALL SELECT 'planos_objetivo', COUNT(*) FROM planos_objetivo
UNION ALL SELECT 'plano_passos', COUNT(*) FROM plano_passos
UNION ALL SELECT 'mensagens_chat', COUNT(*) FROM mensagens_chat
UNION ALL SELECT 'documentos_maquina', COUNT(*) FROM documentos_maquina
UNION ALL SELECT 'manutencoes', COUNT(*) FROM manutencoes
UNION ALL SELECT 'simulacao_pontos', COUNT(*) FROM simulacao_pontos
UNION ALL SELECT 'simulacao_pontos_maquina', COUNT(*) FROM simulacao_pontos_maquina;
