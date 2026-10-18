-- Digital Twin Industrial: consultas prontas (views).
-- SQL padrão: funciona no SQLite e no PostgreSQL.
-- Uma view é uma consulta salva com nome: dá para usá-la como se fosse uma tabela (SELECT * FROM vw_...).

DROP VIEW IF EXISTS vw_catalogo_completo;
DROP VIEW IF EXISTS vw_fabricas_resumo;
DROP VIEW IF EXISTS vw_cenarios_comparativo;
DROP VIEW IF EXISTS vw_planos_investimento;

-- Catálogo de máquinas com categoria, etapa, zona, capacidade e o preço estimado mais recente.
CREATE VIEW vw_catalogo_completo AS
SELECT
    m.id                  AS maquina_id,
    m.codigo,
    m.nome                AS maquina,
    c.nome                AS categoria,
    e.nome                AS etapa,
    e.zona,
    m.fluxo,
    m.parametro,
    m.unidade,
    m.valor_otimo,
    m.valor_falha,
    m.capacidade_otima,
    m.consumo_parado_kw,
    p.preco_min,
    p.preco_max,
    (SELECT COUNT(*) FROM maquina_fontes mf WHERE mf.maquina_id = m.id) AS qtd_fontes
FROM maquinas_catalogo m
JOIN categorias c ON c.id = m.categoria_id
JOIN etapas e     ON e.id = m.etapa_id
LEFT JOIN precos_maquina p
       ON p.maquina_id = m.id
      AND p.id = (SELECT MAX(p2.id) FROM precos_maquina p2 WHERE p2.maquina_id = m.id);

-- Uma linha por fábrica: dono, quantas máquinas e conexões tem e quantas simulações já rodou.
CREATE VIEW vw_fabricas_resumo AS
SELECT
    f.id                  AS fabrica_id,
    f.nome                AS fabrica,
    u.nome_usuario        AS dono,
    f.temperatura_ambiente,
    (SELECT COUNT(*) FROM fabrica_maquinas fm WHERE fm.fabrica_id = f.id) AS qtd_maquinas,
    (SELECT COUNT(*) FROM conexoes cx         WHERE cx.fabrica_id = f.id) AS qtd_conexoes,
    (SELECT COUNT(*) FROM simulacoes s        WHERE s.fabrica_id = f.id)  AS qtd_simulacoes,
    f.atualizada_em
FROM fabricas f
JOIN usuarios u ON u.id = f.usuario_id;

-- Cenários lado a lado: produção, risco e energia, com o nome da máquina que era o gargalo.
CREATE VIEW vw_cenarios_comparativo AS
SELECT
    cn.id                 AS cenario_id,
    f.nome                AS fabrica,
    cn.nome               AS cenario,
    cn.producao_h,
    cn.risco_max,
    cn.energia_kw,
    mc.nome               AS gargalo
FROM cenarios cn
JOIN fabricas f              ON f.id = cn.fabrica_id
LEFT JOIN fabrica_maquinas fm ON fm.id = cn.gargalo_id
LEFT JOIN maquinas_catalogo mc ON mc.id = fm.maquina_id;

-- Planos de objetivo: quanto aumentam a produção, o risco que trazem, o investimento e o número de passos.
CREATE VIEW vw_planos_investimento AS
SELECT
    pl.id                 AS plano_id,
    f.nome                AS fabrica,
    pl.tipo_objetivo,
    pl.valor_meta,
    pl.producao_antes,
    pl.producao_depois,
    pl.risco_antes,
    pl.risco_depois,
    pl.investimento_min,
    pl.investimento_max,
    pl.atingiu_meta,
    pl.aplicado,
    (SELECT COUNT(*) FROM plano_passos ps WHERE ps.plano_id = pl.id) AS qtd_passos
FROM planos_objetivo pl
JOIN fabricas f ON f.id = pl.fabrica_id;
