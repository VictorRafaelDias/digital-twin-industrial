-- Testes de integridade para PostgreSQL (o mesmo conjunto de regras que testes/test_banco.py verifica no SQLite).
-- Cada comando abaixo DEVE ser recusado pelo banco. O bloco DO tenta cada um e confirma que deu erro de integridade;
-- se algum for aceito, o script falha. Nada é gravado (cada tentativa é desfeita).
-- Rodar:  psql digital_twin -v ON_ERROR_STOP=1 -f testes/test_integridade_postgres.sql

DO $$
DECLARE
    casos text[][] := ARRAY[
        ['chave estrangeira: fábrica sem dono',                'INSERT INTO fabricas (usuario_id, nome) VALUES (999, ''sem dono'')'],
        ['chave estrangeira: máquina que não existe no catálogo', 'INSERT INTO fabrica_maquinas (fabrica_id, maquina_id, ritmo) VALUES (1, 999, 10)'],
        ['único: nome de usuário repetido',                    'INSERT INTO usuarios (nome_usuario, nome_exibicao, senha_hash) VALUES (''victor.dias'', ''Repetido'', ''x'')'],
        ['regra: ótimo acima do limite de atenção',            'UPDATE maquinas_catalogo SET valor_otimo = 5000 WHERE codigo = ''enchedora'''],
        ['regra: mais de 6 unidades em paralelo',              'UPDATE fabrica_maquinas SET unidades_paralelo = 7 WHERE id = 1'],
        ['regra: temperatura ambiente acima de 45 °C',         'UPDATE fabricas SET temperatura_ambiente = 60 WHERE id = 1'],
        ['regra: risco acima de 1',                            'UPDATE cenarios SET risco_max = 1.5 WHERE id = 1'],
        ['regra: preço mínimo maior que o máximo',             'UPDATE precos_maquina SET preco_min = 999999999 WHERE id = 1'],
        ['regra: confiança da fonte inválida',                 'UPDATE fontes SET confianca = ''duvidosa'' WHERE id = 1'],
        ['regra: zona inexistente',                            'UPDATE etapas SET zona = ''Lugar nenhum'' WHERE id = 1'],
        ['regra: conexão de uma máquina com ela mesma',        'INSERT INTO conexoes (fabrica_id, origem_id, destino_id) VALUES (1, 1, 1)'],
        ['chave composta: conexão entre máquinas de fábricas diferentes',
                                                                'INSERT INTO conexoes (fabrica_id, origem_id, destino_id) VALUES (1, 1, (SELECT id FROM fabrica_maquinas WHERE fabrica_id = 2 LIMIT 1))'],
        ['RESTRICT: apagar máquina do catálogo em uso',        'DELETE FROM maquinas_catalogo WHERE codigo = ''enchedora'''],
        ['RESTRICT: apagar usuário com histórico de simulação', 'DELETE FROM usuarios WHERE id = 1']
    ];
    i int;
    recusou boolean;
BEGIN
    FOR i IN 1 .. array_length(casos, 1) LOOP
        recusou := false;
        BEGIN
            EXECUTE casos[i][2];
        EXCEPTION WHEN integrity_constraint_violation THEN
            recusou := true;
        END;
        IF NOT recusou THEN
            RAISE EXCEPTION 'FALHOU: o banco ACEITOU: %', casos[i][1];
        END IF;
        RAISE NOTICE 'ok, recusado: %', casos[i][1];
    END LOOP;
    RAISE NOTICE 'Todos os % casos foram recusados pelo banco, como esperado.', array_length(casos, 1);
END $$;
