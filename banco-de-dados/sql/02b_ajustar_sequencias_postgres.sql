-- PostgreSQL: depois de inserir linhas com id explícito, acerta o contador automático (SERIAL) de cada tabela.
-- Sem isto, o próximo INSERT sem id tentaria reutilizar o id 1 e daria erro de chave duplicada.

SELECT setval(pg_get_serial_sequence('categorias', 'id'), (SELECT MAX(id) FROM categorias));
SELECT setval(pg_get_serial_sequence('etapas', 'id'), (SELECT MAX(id) FROM etapas));
SELECT setval(pg_get_serial_sequence('fontes', 'id'), (SELECT MAX(id) FROM fontes));
SELECT setval(pg_get_serial_sequence('glossario_termos', 'id'), (SELECT MAX(id) FROM glossario_termos));
SELECT setval(pg_get_serial_sequence('usuarios', 'id'), (SELECT MAX(id) FROM usuarios));
SELECT setval(pg_get_serial_sequence('fabricas', 'id'), (SELECT MAX(id) FROM fabricas));
SELECT setval(pg_get_serial_sequence('glossario_palavras', 'id'), (SELECT MAX(id) FROM glossario_palavras));
SELECT setval(pg_get_serial_sequence('maquinas_catalogo', 'id'), (SELECT MAX(id) FROM maquinas_catalogo));
SELECT setval(pg_get_serial_sequence('fabrica_maquinas', 'id'), (SELECT MAX(id) FROM fabrica_maquinas));
SELECT setval(pg_get_serial_sequence('mensagens_chat', 'id'), (SELECT MAX(id) FROM mensagens_chat));
SELECT setval(pg_get_serial_sequence('modelos_reais', 'id'), (SELECT MAX(id) FROM modelos_reais));
SELECT setval(pg_get_serial_sequence('planos_objetivo', 'id'), (SELECT MAX(id) FROM planos_objetivo));
SELECT setval(pg_get_serial_sequence('precos_maquina', 'id'), (SELECT MAX(id) FROM precos_maquina));
SELECT setval(pg_get_serial_sequence('simulacoes', 'id'), (SELECT MAX(id) FROM simulacoes));
SELECT setval(pg_get_serial_sequence('cenarios', 'id'), (SELECT MAX(id) FROM cenarios));
SELECT setval(pg_get_serial_sequence('conexoes', 'id'), (SELECT MAX(id) FROM conexoes));
SELECT setval(pg_get_serial_sequence('eventos_registro', 'id'), (SELECT MAX(id) FROM eventos_registro));
SELECT setval(pg_get_serial_sequence('plano_passos', 'id'), (SELECT MAX(id) FROM plano_passos));
SELECT setval(pg_get_serial_sequence('cenario_maquinas', 'id'), (SELECT MAX(id) FROM cenario_maquinas));
