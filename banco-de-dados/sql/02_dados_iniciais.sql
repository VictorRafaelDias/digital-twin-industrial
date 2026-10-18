-- Digital Twin Industrial: dados iniciais (catálogo de máquinas, fontes, preços, glossário e fábricas de exemplo).
-- Gerado por scripts/gerar_banco.py a partir de dados/dados_iniciais.json (que vem do código do front-end).
-- SQL padrão: roda igual no SQLite e no PostgreSQL. Rode depois de 01_schema_*.sql.

-- categorias (6 linhas)
INSERT INTO categorias (id, codigo, nome, descricao, icone, ativa, ordem) VALUES
  (1, 'insumos', 'Insumos', 'Onde a matéria-prima entra na fábrica (água, frutas…). Se o insumo não chega, nada do resto funciona.', 'truck', TRUE, 1),
  (2, 'preparo', 'Preparo', 'Transformam o insumo bruto no produto: lavar, espremer, filtrar, dosar o xarope e misturar com a água.', 'mixer', TRUE, 2),
  (3, 'termico', 'Térmico e gás', 'Tratam a bebida com calor (para eliminar micro-organismos e durar mais) ou colocam gás (CO₂), como no refrigerante.', 'pasteur', TRUE, 3),
  (4, 'envase', 'Envase', 'Colocam a bebida dentro das garrafas. São máquinas delicadas e, com frequência, o gargalo da fábrica.', 'filler', TRUE, 4),
  (5, 'pos', 'Pós-envase', 'Depois que a garrafa está cheia: colar o rótulo e levar a garrafa de uma máquina para a outra.', 'label', TRUE, 5),
  (6, 'frio', 'Refrigeração', 'Mantêm o produto gelado. Quando o produto não é pasteurizado, é o frio que garante a segurança.', 'fridge', TRUE, 6);

-- etapas (10 linhas)
INSERT INTO etapas (id, nome, zona) VALUES
  (1, 'Insumos', 'Recepção e preparo'),
  (2, 'Preparo', 'Recepção e preparo'),
  (3, 'Tratamento térmico', 'Tratamento térmico e gás'),
  (4, 'Carbonatação', 'Tratamento térmico e gás'),
  (5, 'Envase', 'Envase e expedição'),
  (6, 'Transporte', 'Envase e expedição'),
  (7, 'Pós-envase', 'Envase e expedição'),
  (8, 'Extração', 'Recepção e preparo'),
  (9, 'Filtragem', 'Recepção e preparo'),
  (10, 'Refrigeração', 'Câmara fria');

-- fontes (39 linhas)
INSERT INTO fontes (id, titulo, url, tipo, confianca, na_base_conhecimento) VALUES
  (1, 'Hipótese didática do projeto (limites de ritmo e de risco)', NULL, 'hipótese do projeto', 'hipotese', FALSE),
  (2, 'Estimativa por analogia (sem preço público confiável encontrado)', NULL, 'hipótese do projeto', 'hipotese', FALSE),
  (3, 'GW Kent — tanque misturador de 1.000 L em inox (US$ 4.995)', 'https://www.gwkent.com/mixing-blending-tank-1000-l-265-gal.html', 'anúncio de fornecedor', 'estimado', FALSE),
  (4, 'Tetra Pak — blending (xarope e água)', 'https://www.tetrapak.com/solutions/integrated-solutions-equipment/processing-equipment/blending', 'página do fabricante', 'estimado', FALSE),
  (5, 'Tetra Pak In-line Blender B (ficha técnica)', 'https://www.tetrapak.com/en-us/solutions/processing/main-technology-area/blending/in-line-blender-b', 'ficha técnica', 'real', TRUE),
  (6, 'Tetra Pak Pasteurizer BF (ficha técnica)', 'https://www.tetrapak.com/en-us/solutions/integrated-solutions-equipment/processing-equipment/pasteurization/tetra-pak-pasteurizer-bf', 'ficha técnica', 'real', TRUE),
  (7, 'TradeIndia — pasteurizador flash pequeno (35 L, US$ 4.000)', 'https://www.tradeindia.com/products/small-juice-flash-pasteurizer-3735975.html', 'anúncio de fornecedor', 'estimado', FALSE),
  (8, 'IndiaMART — pasteurizador de suco de 1.000 L/h', 'https://m.indiamart.com/proddetail/juice-pasteurizer-machine-pasteurizer-machine-for-juice-22062476288.html', 'anúncio de fornecedor', 'estimado', FALSE),
  (9, 'Tetra Pak — blender com carbonatação', 'https://www.tetrapak.com/solutions/processing/main-technology-area/carbonization/tetra-alblend-carboblender', 'ficha técnica', 'real', FALSE),
  (10, 'BrewBids — carbonatador em linha Padovan, novo (US$ 29.950)', 'https://brewbids.com/?p=58539', 'anúncio de fornecedor', 'estimado', FALSE),
  (11, 'SIBA — carbonatador Carbotech 500 (£ 4.500 usado; £ 9.000 novo)', 'https://siba.co.uk/awpcp/show-ad/?id=49149', 'anúncio de fornecedor', 'estimado', FALSE),
  (12, 'Krones Modulfill VFJ (página do fabricante)', 'https://www.krones.com/en/products/machines/modulfill-vfj-water.php', 'página do fabricante', 'real', TRUE),
  (13, 'Osterroth & Voigt (2021), artigo científico sobre consumo de energia', 'https://doi.org/10.3390/su13179880', 'artigo científico', 'real', TRUE),
  (14, 'Zonesun ZS-CF4 — enchedora isobárica de 4 bicos (US$ 6.980)', 'https://zonesunautopack.com/products/zs-cf4-carbonated-drinks-liquid-filling-machine', 'anúncio de fornecedor', 'estimado', FALSE),
  (15, 'Zonesun ZS-CFC4 — enchedora e tampadora, 800 garrafas/h (US$ 51.999)', 'https://www.zonesuntech.com/products/automatic-4-heads-beer-soda-carbonated-drinks-glass-bottle-crown-caps-bottling-isobaric-filling-capping-machine', 'anúncio de fornecedor', 'estimado', FALSE),
  (16, 'Exapro — ICS multiFILL de 6.000 garrafas/h, usada (preço sob consulta)', 'https://www.exapro.com/ics-multifill-960-24-240-6kk-6sv-p251028072/', 'anúncio de fornecedor', 'estimado', FALSE),
  (17, 'Dorner — esteiras para envase', 'https://www.dornerconveyors.com/industries/canning-bottling', 'página do fabricante', 'estimado', FALSE),
  (18, 'MROSupply — correia modular plástica (US$ 47 a 89 por pé, só a correia)', 'https://www.mrosupply.com/products/2778890/as-markdown/', 'anúncio de fornecedor', 'estimado', FALSE),
  (19, 'Krones Contiroll (página do fabricante)', 'https://www.krones.com/en/products/machines/wrap-around-reel-fed-labelling.php', 'página do fabricante', 'estimado', TRUE),
  (20, 'Zonesun ZS-STB150 — rotuladora de luva, até 150 garrafas/min (US$ 11.999)', 'https://zonesunautopack.com/products/zs-stb150-bottle-sleeving-and-shrinking-labeling-machine', 'anúncio de fornecedor', 'estimado', FALSE),
  (21, 'Alimentos Sem Mitos — suco de laranja industrializado', 'https://alimentossemmitos.com.br/informacao-muda-percepcao-de-consumidores-sobre-suco-de-laranja-industrializado', 'divulgação técnica', 'estimado', FALSE),
  (22, 'ITAL/SP — sucos industrializados', 'https://ital.agricultura.sp.gov.br/sucos/17/', 'divulgação técnica', 'estimado', FALSE),
  (23, 'ResearchGate — vida útil de suco fresco não pasteurizado', 'https://www.researchgate.net/publication/230061467_Shelf_Life_and_Quality_of_Freshly_Squeezed_Unpasteurized_Polyethylene-Bottled_Citrus_Juice', 'artigo científico', 'estimado', FALSE),
  (24, 'Raw Juicery — suco pasteurizado × não pasteurizado', 'https://rawjuicery.com/blogs/articles/pasteurized-vs-unpasteurized-juice', 'site especializado / imprensa', 'estimado', FALSE),
  (25, 'Zanduco — extratora Omcan Citrus Max, 20 laranjas/min (US$ 2.030)', 'https://www.zanduco.com/us/omcan-citrus-max-orange-juice-extractor-20-oranges-per-minute-stainless-steel.html', 'anúncio de fornecedor', 'estimado', FALSE),
  (26, 'Zonesun ZS-ZJ02 — despolpadeira de 0,5 a 2,5 t/h (US$ 11.300)', 'https://www.zonesunautopack.com/ja/products/zonesun-zs-zj02-double-stage-fruit-vegetable-pulping-machine', 'anúncio de fornecedor', 'estimado', FALSE),
  (27, 'UNICEF — câmaras frias de 10 a 40 m³ (US$ 14 mil a 31 mil)', 'https://supply.unicef.org/all-materials/cold-chain-equipment/cold-freezer-rooms.html?p=3', 'compra pública (referência)', 'estimado', FALSE),
  (28, 'Krones Modulfill VFS (página do fabricante)', 'https://www.krones.com/en/products/machines/modulfill-vfs-softdrinks.php', 'página do fabricante', 'real', FALSE),
  (29, 'Krones Modulfill HES (página do fabricante)', 'https://www.krones.com/en/products/machines/modulfill-hes-beer.php', 'página do fabricante', 'estimado', FALSE),
  (30, 'Krones Modulfill HEL (página do fabricante)', 'https://www.krones.com/en/products/machines/modulfill-hel-juice-glas.php', 'página do fabricante', 'estimado', FALSE),
  (31, 'Krones Modulfill Dual (página do fabricante)', 'https://www.krones.com/en/products/machines/modulfill-dual.php', 'página do fabricante', 'estimado', FALSE),
  (32, 'Sidel Matrix SF300 FM (DirectIndustry)', 'https://www.directindustry.com/prod/sidel/product-8751-2141555.html', 'site especializado / imprensa', 'estimado', FALSE),
  (33, 'Sidel Matrix Filler SF700 FM (página do fabricante)', 'https://www.sidel.com/machines-repository/sidel-matrix-filler-sf700-fm/', 'página do fabricante', 'estimado', FALSE),
  (34, 'Krones LinaFlex eSync (página do fabricante)', 'https://www.krones.com/en/products/machines/linaflex-esync.php', 'página do fabricante', 'estimado', FALSE),
  (35, 'Krones MiniFlex (notícia do fabricante)', 'https://www.krones.com/en/company/press/single-lane-instead-of-bulk-conveyors-krones-fresh-approach-to-pasteurisation.php', 'página do fabricante', 'estimado', FALSE),
  (36, 'Sigma Equipment: Alfa Laval HTST usado', 'https://www.sigmaequipment.com/equipment/used/alfa-laval-htst-pasteurizing-system-rated-for-216-gallons-per-hour-330645', 'página de fornecedor', 'estimado', FALSE),
  (37, 'KHS Innoket Neo SK (página do fabricante)', 'https://www.khs.com/en/products/machines-equipment/detail/khs-innoket-neo-sk-labeling-machine/', 'página do fabricante', 'estimado', FALSE),
  (38, 'PETnology: KHS Innoket 360', 'https://www.petnology.com/online/news-detail/khs-optimizes-the-innoket-360-roll-fed-labeler-series', 'site especializado / imprensa', 'estimado', FALSE),
  (39, 'BeverageDaily: KHS Innoket 360 Duo', 'https://www.beveragedaily.com/Article/2014/08/06/KHS-launches-Innoket-360-Duo-roll-fed-labeler/', 'site especializado / imprensa', 'estimado', FALSE);

-- glossario_termos (38 linhas)
INSERT INTO glossario_termos (id, grupo, termo, definicao) VALUES
  (1, 'Produção', 'Gargalo', 'A máquina mais lenta da fábrica. Ela limita a produção de todas as outras, como o gargalo de uma garrafa limita a água que sai.'),
  (2, 'Produção', 'Ritmo', 'O “botão” principal da máquina: quanto líquido passa (vazão), quantas garrafas por minuto (cadência) ou quantas voltas por minuto (rotação). Depende da máquina.'),
  (3, 'Produção', 'Capacidade', 'Quantas garrafas por hora a máquina consegue entregar no ritmo em que está.'),
  (4, 'Produção', 'Saída real', 'O que realmente sai da máquina. Pode ser menor que a capacidade se ela receber pouco produto da máquina anterior.'),
  (5, 'Produção', 'Vazão', 'Quantidade de líquido que passa por hora (litros ou m³ por hora).'),
  (6, 'Produção', 'Cadência', 'Quantas garrafas por minuto a máquina trabalha.'),
  (7, 'Produção', 'RPM', 'Rotações por minuto: quantas voltas o eixo da máquina dá em um minuto.'),
  (8, 'Produção', 'gf (garrafas)', 'Abreviação de “garrafas”. “gf/h” = garrafas por hora; “gf/min” = garrafas por minuto.'),
  (9, 'Produção', 'm³ (metro cúbico)', 'Mil litros. Uma vazão de 8 m³/h são 8.000 litros por hora.'),
  (10, 'Produção', 'Eficiência (OEE)', 'Quanto a fábrica produz comparado com o máximo que ela faria com tudo no ponto ótimo. 100% = aproveitamento total.'),
  (11, 'Produção', 'Unidades em paralelo', 'Usar mais de uma máquina igual lado a lado (ex.: 2 pasteurizadores) para somar a capacidade daquela etapa.'),
  (12, 'Produção', 'Fila', 'O excesso que uma máquina entrega além do que a seguinte aguenta. Fica parado esperando: nada some (ideia da conservação da massa).'),
  (13, 'Produção', 'Conservação da massa (Lavoisier)', '“Na natureza nada se cria, nada se perde, tudo se transforma.” No simulador: o que entra numa máquina sai dela ou fica parado na fila.'),
  (14, 'Produção', 'Efeito cascata', 'Quando uma máquina com problema faz as seguintes sofrerem também. No quadro aparece como um rastro vermelho que vai enfraquecendo.'),
  (15, 'Produção', 'A montante / a jusante', 'Montante = as máquinas que vêm antes (de onde o produto vem). Jusante = as que vêm depois.'),
  (16, 'Produção', 'Divisão e junção', 'Divisão: uma máquina alimenta várias iguais e o fluxo se reparte. Junção: várias entram numa só (ex.: água e xarope no misturador).'),
  (17, 'Risco e física', 'Ótimo', 'O ritmo em que a máquina trabalha bem, com pouco desgaste e risco baixo (cerca de 2%).'),
  (18, 'Risco e física', 'Atenção (alerta)', 'Acima do ótimo: produz um pouco mais, mas o desgaste e o risco de quebra sobem (de 2% até 10%).'),
  (19, 'Risco e física', 'Zona crítica', 'Faixa perto do limite da máquina (risco de 10% a 40%). Pequenas variações já podem fazer a máquina parar.'),
  (20, 'Risco e física', 'Falha', 'Passou do limite: a máquina para e tudo o que vem depois dela fica sem produto.'),
  (21, 'Risco e física', 'Risco de falha', 'Chance estimada de a máquina parar no ritmo atual. É uma estimativa didática do simulador, não uma medição.'),
  (22, 'Risco e física', 'Sobrecarga', 'Pedir à máquina mais do que ela foi feita para entregar. Gera calor, vibração e desgaste.'),
  (23, 'Risco e física', 'Cavitação', 'Bolhas que se formam dentro de uma bomba quando ela é forçada. Ao estourar, elas “mordem” e desgastam o metal.'),
  (24, 'Risco e física', 'Dilatação térmica', 'Materiais e líquidos aumentam de volume com o calor. Num tanque cheio isso eleva a pressão e reduz a margem de segurança.'),
  (25, 'Risco e física', 'Viscosidade', 'O quanto um líquido é “grosso”. O xarope fica mais grosso no frio e escoa mais devagar.'),
  (26, 'Risco e física', 'Compressor', 'Peça do sistema de frio que comprime o gás refrigerante. Em ambiente quente ele trabalha mais e rende menos.'),
  (27, 'Energia e dinheiro', 'kW e kWh', 'kW é a potência (quanta energia a máquina puxa a cada instante). kWh é a energia gasta: 1 kW ligado por 1 hora = 1 kWh, que é o que aparece na conta de luz.'),
  (28, 'Energia e dinheiro', 'Consumo parado (standby)', 'Mesmo sem trabalhar, a máquina ligada gasta energia. Nunca é zero.'),
  (29, 'Energia e dinheiro', 'Investimento estimado', 'Quanto custaria comprar a máquina extra. É uma faixa de preço tirada de anúncios de fornecedores, não uma cotação.'),
  (30, 'Processo de bebidas', 'Pasteurização', 'Aquecer a bebida por pouco tempo para eliminar micro-organismos e ela durar mais. O suco natural não passa por isso.'),
  (31, 'Processo de bebidas', 'Carbonatação', 'Dissolver gás carbônico (CO₂) na bebida, como no refrigerante.'),
  (32, 'Processo de bebidas', 'Brix', 'Medida de açúcar da bebida (°Brix). Define a doçura.'),
  (33, 'Processo de bebidas', 'Envase', 'A etapa de colocar a bebida dentro das garrafas.'),
  (34, 'Processo de bebidas', 'Insumo', 'Matéria-prima que entra na fábrica (água, açúcar, frutas…).'),
  (35, 'Sistema', 'Receita (Econômico, Padrão, Máximo seguro)', 'Ritmos prontos para uma máquina: Econômico (mais leve), Padrão (ótimo) e Máximo seguro (o limite da zona de atenção).'),
  (36, 'Sistema', 'Parada de emergência', 'O botão vermelho que para todas as máquinas de uma vez.'),
  (37, 'Sistema', 'Hipótese didática', 'Número escolhido para o simulador mostrar o efeito, sem vir de medição ou ficha técnica. Sempre vem com uma nota dizendo em que se baseia.'),
  (38, 'Sistema', 'Real × estimado', '“Real” = vem de uma fonte com link (ficha, artigo). “Estimado” = adaptado de uma fonte, mas não igual a ela.');

-- usuarios (2 linhas)
INSERT INTO usuarios (id, nome_usuario, nome_exibicao, senha_hash, ativo, criado_em, ultimo_acesso_em) VALUES
  (1, 'victor.dias', 'Victor Rafael de Oliveira Dias', 'pbkdf2_sha256$100000$f5c5c7151f747cab$WZfrgEtyFKB3/2XBGTdFRHOUdcxga71+9wTP8h5ffrM=', TRUE, '2026-10-18 09:00:00', '2026-10-18 09:30:00'),
  (2, 'enzo.fernandes', 'Enzo Fernandes', 'pbkdf2_sha256$100000$3106c9f5dceaf1ef$FsNUNlMpaR5udpyPKztp8mKixt/PvYQ/JBQjwkMouBw=', TRUE, '2026-10-18 09:01:00', '2026-10-18 09:31:00');

-- fabricas (3 linhas)
INSERT INTO fabricas (id, usuario_id, nome, exemplo_origem, temperatura_ambiente, tarifa_energia, parada_emergencia, criada_em, atualizada_em) VALUES
  (1, 1, 'Bebidas em geral', 'bebidas', 25, 0.85, FALSE, '2026-10-18 09:40:00', '2026-10-18 10:00:00'),
  (2, 1, 'Suco de laranja natural', 'suco', 25, 0.85, FALSE, '2026-10-18 10:40:00', '2026-10-18 11:00:00'),
  (3, 2, 'Linha de bebidas do Enzo', 'bebidas', 25, 0.85, FALSE, '2026-10-18 11:40:00', '2026-10-18 12:00:00');

-- glossario_palavras (52 linhas)
INSERT INTO glossario_palavras (id, termo_id, palavra) VALUES
  (1, 1, 'gargalo'),
  (2, 2, 'ritmo'),
  (3, 3, 'capacidade'),
  (4, 4, 'saída real'),
  (5, 5, 'vazão'),
  (6, 6, 'cadência'),
  (7, 7, 'RPM'),
  (8, 8, 'gf'),
  (9, 9, 'm³'),
  (10, 10, 'eficiência'),
  (11, 10, 'OEE'),
  (12, 11, 'em paralelo'),
  (13, 11, 'paralelo'),
  (14, 11, 'paralelas'),
  (15, 12, 'fila'),
  (16, 13, 'Lavoisier'),
  (17, 13, 'conservação da massa'),
  (18, 14, 'cascata'),
  (19, 15, 'a montante'),
  (20, 15, 'jusante'),
  (21, 16, 'junção'),
  (22, 17, 'ótimo'),
  (23, 18, 'atenção'),
  (24, 19, 'zona crítica'),
  (25, 19, 'crítico'),
  (26, 20, 'falha'),
  (27, 21, 'risco'),
  (28, 22, 'sobrecarga'),
  (29, 23, 'cavitação'),
  (30, 24, 'dilatação'),
  (31, 24, 'dilata'),
  (32, 25, 'viscosidade'),
  (33, 25, 'grosso'),
  (34, 26, 'compressor'),
  (35, 27, 'kW'),
  (36, 27, 'kWh'),
  (37, 28, 'standby'),
  (38, 28, 'consumo parado'),
  (39, 29, 'investimento'),
  (40, 29, 'custo estimado'),
  (41, 30, 'pasteuriza'),
  (42, 30, 'pasteurização'),
  (43, 31, 'carbonatação'),
  (44, 31, 'CO₂'),
  (45, 32, 'brix'),
  (46, 33, 'envase'),
  (47, 34, 'insumo'),
  (48, 34, 'insumos'),
  (49, 35, 'receita'),
  (50, 36, 'parada de emergência'),
  (51, 37, 'hipótese didática'),
  (52, 38, 'estimado');

-- maquinas_catalogo (14 linhas)
INSERT INTO maquinas_catalogo (id, codigo, nome, categoria_id, etapa_id, fluxo, icone, parametro, unidade, valor_min, valor_otimo, valor_atencao, valor_falha, valor_max, capacidade_otima, consumo_parado_kw, consumo_variavel_kw, ordem_processo, sensibilidade_termica, aceita_varias_entradas, etapa_final, descricao, risco_fisico, base_dos_numeros, ativa) VALUES
  (1, 'tanque_agua', 'Tanque de água', 1, 1, 'geral', 'tank', 'Vazão de saída', 'm³/h', 2, 8, 10, 11.5, 12, 16000, 0.2, 0.8, 0, 'tanque', FALSE, FALSE, 'Guarda a água usada na bebida. A vazão é quanto de água sai por hora.', 'Vazão acima do limite sobrecarrega a bomba e as tubulações (pressão alta) e pode causar vazamento ou transbordamento do tanque.', 'Valores didáticos, escolhidos para uma linha de cerca de 12 mil garrafas/h. Não vêm de ficha de fabricante.', TRUE),
  (2, 'tanque_xarope', 'Tanque de xarope', 2, 2, 'geral', 'tank', 'Dosagem', 'L/h', 400, 1200, 1450, 1550, 1600, 14400, 0.3, 1, 1, 'viscosidade', FALSE, FALSE, 'Guarda o xarope (açúcar e sabor). A dosagem é quanto xarope sai por hora.', 'Dosagem forçada pode causar cavitação na bomba (bolhas que desgastam o metal) e dosar errado, mudando o sabor.', 'Didático. Proporção de referência: 1 parte de xarope para 3 a 6 de água (Tetra Pak, blending — a conferir).', TRUE),
  (3, 'misturador', 'Misturador', 2, 2, 'geral', 'mixer', 'Rotação', 'RPM', 30, 60, 75, 85, 90, 15000, 0.5, 2.5, 2, 'motor', TRUE, FALSE, 'Mistura a água com o xarope. Girar mais rápido mistura mais, mas desgasta mais.', 'Rotação alta aumenta a vibração e a sobrecarga do motor: ele superaquece, eixo e rolamentos se desgastam e pode travar.', 'Capacidade didática. Para comparação: o In-line Blender B da Tetra Pak (20 a 60 mil L/h, ficha real) é bem maior que a nossa linha.', TRUE),
  (4, 'pasteurizador', 'Pasteurizador', 3, 3, 'geral', 'pasteur', 'Vazão', 'm³/h', 3, 6.5, 7.5, 8.5, 9, 13000, 1, 6, 4, 'nenhuma', FALSE, FALSE, 'Aquece a bebida para eliminar micro-organismos. A vazão é quanto líquido passa por hora.', 'Vazão alta passa o líquido rápido demais pelo calor (tratamento incompleto) e força bombas e trocador de calor. Pressão ou temperatura fora da faixa podem parar a linha.', 'Didático. Para comparação: o Pasteurizer BF da Tetra Pak faz 3.000 a 55.000 L/h (ficha real). Os limites de risco são hipótese nossa.', TRUE),
  (5, 'carbonatador', 'Carbonatador', 3, 4, 'geral', 'carbon', 'Vazão', 'm³/h', 3, 7, 8, 8.8, 9, 14000, 0.5, 1.5, 5, 'nenhuma', FALSE, FALSE, 'Coloca gás (CO₂) na bebida, como no refrigerante.', 'Pressão de CO₂ acima do limite pode estourar tubulação ou garrafa; abaixo dela, a bebida fica sem gás.', 'Didático. O equipamento de referência (Tetra Pak) mistura e carbonata. Pressões e limites são hipótese.', TRUE),
  (6, 'enchedora', 'Enchedora', 4, 5, 'geral', 'filler', 'Cadência', 'gf/min', 100, 200, 225, 245, 260, 12000, 2.02, 0.53, 6, 'motor', FALSE, FALSE, 'Coloca a bebida dentro das garrafas. A cadência é quantas garrafas por minuto.', 'Cadência alta aumenta a vibração e o desgaste das válvulas; pode derramar produto ou falhar na hora de encher.', 'Consumo de energia calculado a partir de dado real medido (Osterroth & Voigt, 2021) e adaptado à nossa escala. Capacidade e limites: didáticos (referência: Krones Modulfill VFJ, até 81.000 garrafas/h).', TRUE),
  (7, 'esteira', 'Esteira', 5, 6, 'geral', 'conveyor', 'Velocidade', 'm/s', 0.2, 0.8, 1, 1.15, 1.2, 15000, 0.3, 1.2, NULL, 'motor', FALSE, FALSE, 'Leva as garrafas de uma máquina para a outra.', 'Velocidade ou corrente alta superaquece o motor e pode derrubar ou prender garrafas.', 'Didático. Referências de mercado: Dorner e Krones; sem dados de consumo.', TRUE),
  (8, 'rotuladora', 'Rotuladora', 5, 7, 'geral', 'label', 'Cadência', 'gf/min', 100, 190, 225, 245, 260, 11400, 4.11, 2.52, 8, 'motor', FALSE, FALSE, 'Cola o rótulo nas garrafas. A cadência é quantas garrafas por minuto.', 'Cadência alta desalinha o rótulo, superaquece o motor e pode travar a máquina.', 'Energia a partir do artigo científico (adaptada à nossa escala). Capacidade de referência: Krones Contiroll (3.000 a 36.000/h na versão padrão — a confirmar).', TRUE),
  (9, 'recepcao_fruta', 'Recepção de laranjas', 1, 1, 'suco', 'truck', 'Taxa de recepção', 'kg/h', 100, 500, 650, 750, 800, 1400, 0.3, 1.5, 0, 'nenhuma', FALSE, FALSE, 'Recebe as laranjas que chegam à fábrica.', 'Receber além do limite entope as esteiras e acumula fruta, que estraga.', 'Hipótese didática para uma operação pequena de suco natural. O fluxo (sem pasteurização e com frio crítico) tem apoio nas fontes abaixo; os números desta máquina, não.', TRUE),
  (10, 'lavadora_frutas', 'Lavadora de frutas', 2, 2, 'suco', 'drop', 'Vazão de lavagem', 'kg/h', 100, 550, 700, 800, 900, 1450, 0.4, 2, 1, 'nenhuma', FALSE, FALSE, 'Lava e higieniza as laranjas antes de espremer.', 'Passar fruta rápido demais lava mal (risco de higiene) e sobrecarrega o motor.', 'Hipótese didática para uma operação pequena de suco natural. O fluxo (sem pasteurização e com frio crítico) tem apoio nas fontes abaixo; os números desta máquina, não.', TRUE),
  (11, 'extratora', 'Extratora', 2, 8, 'suco', 'juicer', 'Velocidade', 'RPM', 100, 320, 400, 460, 500, 1300, 0.6, 3.5, 2, 'motor', FALSE, FALSE, 'Espreme as laranjas e separa o suco.', 'Rotação alta sobrecarrega o motor e as lâminas, reduz o rendimento de suco e pode quebrar peças.', 'Hipótese didática para uma operação pequena de suco natural. O fluxo (sem pasteurização e com frio crítico) tem apoio nas fontes abaixo; os números desta máquina, não.', TRUE),
  (12, 'filtro_despolpadeira', 'Filtro/despolpadeira', 2, 9, 'suco', 'filter', 'Vazão de filtragem', 'L/h', 80, 420, 550, 630, 700, 1350, 0.3, 1.8, 3, 'nenhuma', FALSE, FALSE, 'Tira bagaço e sementes do suco.', 'Vazão acima do limite entope o filtro e aumenta a pressão, podendo romper a tela.', 'Hipótese didática para uma operação pequena de suco natural. O fluxo (sem pasteurização e com frio crítico) tem apoio nas fontes abaixo; os números desta máquina, não.', TRUE),
  (13, 'envasadora_suco', 'Envasadora de suco', 4, 5, 'suco', 'filler', 'Cadência', 'gf/min', 8, 20, 26, 32, 40, 1200, 0.5, 2, 6, 'motor', FALSE, FALSE, 'Coloca o suco nas garrafas.', 'Cadência alta derrama suco, enche pela metade e aumenta o risco de contaminação.', 'Hipótese didática para uma operação pequena de suco natural. O fluxo (sem pasteurização e com frio crítico) tem apoio nas fontes abaixo; os números desta máquina, não.', TRUE),
  (14, 'camara_fria', 'Câmara fria', 6, 10, 'suco', 'fridge', 'Vazão de resfriamento', 'gf/h', 200, 1200, 1400, 1550, 1600, 1200, 1.2, 3, 9, 'frio', FALSE, TRUE, 'Guarda o suco gelado. Sem pasteurização, é o frio que mantém o suco seguro.', 'Carga acima do limite faz o compressor trabalhar demais: a temperatura sobe e o suco, que não é pasteurizado, fica inseguro.', 'Hipótese didática para uma operação pequena de suco natural. O fluxo (sem pasteurização e com frio crítico) tem apoio nas fontes abaixo; os números desta máquina, não.', TRUE);

-- fabrica_maquinas (22 linhas)
INSERT INTO fabrica_maquinas (id, fabrica_id, maquina_id, pos_x, pos_y, ritmo, unidades_paralelo, desligada) VALUES
  (1, 1, 1, 40, 60, 8, 1, FALSE),
  (2, 1, 2, 270, 60, 1200, 1, FALSE),
  (3, 1, 3, 500, 60, 60, 1, FALSE),
  (4, 1, 4, 730, 60, 6.5, 1, FALSE),
  (5, 1, 5, 730, 250, 7, 1, FALSE),
  (6, 1, 6, 500, 250, 200, 1, FALSE),
  (7, 1, 7, 270, 250, 0.8, 1, FALSE),
  (8, 1, 8, 40, 250, 190, 1, FALSE),
  (9, 2, 9, 40, 60, 500, 1, FALSE),
  (10, 2, 10, 270, 60, 550, 1, FALSE),
  (11, 2, 11, 500, 60, 320, 1, FALSE),
  (12, 2, 12, 500, 250, 420, 1, FALSE),
  (13, 2, 13, 270, 250, 20, 1, FALSE),
  (14, 2, 14, 40, 250, 1200, 1, FALSE),
  (15, 3, 1, 40, 60, 8, 1, FALSE),
  (16, 3, 2, 270, 60, 1200, 1, FALSE),
  (17, 3, 3, 500, 60, 60, 1, FALSE),
  (18, 3, 4, 730, 60, 6.5, 1, FALSE),
  (19, 3, 5, 730, 250, 7, 1, FALSE),
  (20, 3, 6, 500, 250, 200, 1, FALSE),
  (21, 3, 7, 270, 250, 0.8, 1, FALSE),
  (22, 3, 8, 40, 250, 190, 1, FALSE);

-- manuais_maquina (14 linhas)
INSERT INTO manuais_maquina (maquina_id, o_que_faz, como_funciona_ritmo, dicas) VALUES
  (1, 'Reservatório que guarda a água usada na bebida. Ele alimenta as máquinas seguintes numa vazão controlada.', 'A vazão é o quanto de água sai por hora. Aumentar a vazão entrega mais água às máquinas seguintes, mas só ajuda a produção se elas conseguirem usar.', 'Raramente é o gargalo. Cuidado com o nível muito baixo (falta de água) ou muito alto (risco de transbordar).'),
  (2, 'Reservatório do xarope, a mistura concentrada de açúcar e sabor que será diluída na água.', 'A dosagem é quantos litros de xarope saem por hora. A proporção com a água define o sabor e a doçura (Brix) da bebida.', 'O xarope é grosso: a temperatura certa evita dosagem irregular.'),
  (3, 'Mistura a água com o xarope até a bebida ficar uniforme.', 'A rotação (RPM) é a velocidade da pá. Girar mais rápido mistura mais rápido, mas aumenta o desgaste e a vibração.', 'Vibração alta é sinal de desgaste. Perto do limite de rotação, a máquina pode falhar.'),
  (4, 'Aquece a bebida por um tempo controlado para eliminar micro-organismos e aumentar a validade.', 'A vazão é quanto líquido passa por hora. Acima do ótimo o líquido passa rápido demais pelo calor, e o tratamento pode ficar incompleto.', 'A temperatura precisa ficar numa faixa segura: abaixo dela o lote pode ser reprovado; acima dela aumenta o gasto de energia e o desgaste. Suco natural não passa por esta etapa.'),
  (5, 'Dissolve gás carbônico (CO₂) na bebida para torná-la gaseificada.', 'A vazão é quanto líquido recebe gás por hora. Pressão de CO₂ baixa deixa a bebida sem gás; alta demais traz risco de estouro.', 'Só existe em bebidas com gás.'),
  (6, 'Coloca a bebida dentro das garrafas, uma a uma, em alta velocidade.', 'A cadência é quantas garrafas por minuto. Mais cadência produz mais, mas aumenta a vibração e o risco de falha.', 'Costuma ser o coração e o gargalo da linha. Mesmo parada, consome energia.'),
  (7, 'Leva as garrafas de uma máquina para a outra.', 'A velocidade (m/s) define o ritmo do transporte. Rápida demais derruba garrafas; lenta demais forma fila.', 'Corrente do motor acima do limite superaquece. Raramente é o gargalo.'),
  (8, 'Cola o rótulo nas garrafas já cheias.', 'A cadência é quantas garrafas por minuto recebem rótulo. Se for menor que a da enchedora, ela vira o gargalo da linha.', 'Mesmo parada, gasta bastante energia (consumo de espera mais alto que o das outras).'),
  (9, 'Ponto onde as laranjas chegam à fábrica, são descarregadas e seguem para a lavagem.', 'A taxa de recepção é quantos quilos de fruta entram por hora. Receber mais do que a lavadora e a extratora aguentam só forma fila.', 'Frutas de má qualidade aumentam o descarte e reduzem o rendimento de suco.'),
  (10, 'Lava e higieniza as laranjas antes de espremer, tirando terra e sujeira da casca.', 'A vazão de lavagem é quantos quilos de fruta passam por hora. Passar rápido demais lava mal.', 'Lavagem ruim compromete a segurança do suco.'),
  (11, 'Espreme as laranjas e separa o suco da casca e do bagaço.', 'A velocidade (RPM) define quantas frutas são espremidas por hora. Muito rápido reduz o rendimento e desgasta a máquina.', 'É a etapa que mais influencia o rendimento (litros de suco por quilo de fruta).'),
  (12, 'Retira bagaço, sementes e fiapos do suco, deixando a textura desejada.', 'A vazão de filtragem é quantos litros passam por hora. Forçar a vazão entope o filtro.', 'Precisa de limpeza frequente; filtro entupido derruba a produção.'),
  (13, 'Enche as garrafas de suco natural, em escala menor e geralmente mais simples que a enchedora industrial.', 'A cadência é quantas garrafas por minuto. Em operações pequenas ela costuma ser o gargalo.', 'Precisa de higiene rigorosa, já que o suco natural não é pasteurizado.'),
  (14, 'Guarda o suco refrigerado até a expedição, mantendo-o seguro e fresco.', 'A vazão de resfriamento é quantas garrafas por hora conseguem ser resfriadas. Se for menor que o envase, forma fila de garrafas quentes.', 'Em suco natural, o frio é o que protege o produto: a temperatura deve ficar entre 1 e 4 °C.');

-- maquina_fontes (65 linhas)
INSERT INTO maquina_fontes (maquina_id, fonte_id, finalidade) VALUES
  (1, 1, 'numeros'),
  (1, 3, 'preco'),
  (2, 1, 'numeros'),
  (2, 4, 'numeros'),
  (2, 3, 'preco'),
  (3, 1, 'numeros'),
  (3, 5, 'numeros'),
  (3, 3, 'preco'),
  (4, 1, 'numeros'),
  (4, 6, 'numeros'),
  (4, 7, 'preco'),
  (4, 8, 'preco'),
  (5, 1, 'numeros'),
  (5, 9, 'numeros'),
  (5, 10, 'preco'),
  (5, 11, 'preco'),
  (6, 1, 'numeros'),
  (6, 12, 'numeros'),
  (6, 13, 'numeros'),
  (6, 14, 'preco'),
  (6, 15, 'preco'),
  (6, 16, 'preco'),
  (7, 1, 'numeros'),
  (7, 17, 'numeros'),
  (7, 18, 'preco'),
  (8, 1, 'numeros'),
  (8, 19, 'numeros'),
  (8, 13, 'numeros'),
  (8, 20, 'preco'),
  (9, 1, 'numeros'),
  (9, 21, 'numeros'),
  (9, 22, 'numeros'),
  (9, 23, 'numeros'),
  (9, 24, 'numeros'),
  (9, 2, 'preco'),
  (10, 1, 'numeros'),
  (10, 21, 'numeros'),
  (10, 22, 'numeros'),
  (10, 23, 'numeros'),
  (10, 24, 'numeros'),
  (10, 2, 'preco'),
  (11, 1, 'numeros'),
  (11, 21, 'numeros'),
  (11, 22, 'numeros'),
  (11, 23, 'numeros'),
  (11, 24, 'numeros'),
  (11, 25, 'preco'),
  (12, 1, 'numeros'),
  (12, 21, 'numeros'),
  (12, 22, 'numeros'),
  (12, 23, 'numeros'),
  (12, 24, 'numeros'),
  (12, 26, 'preco'),
  (13, 1, 'numeros'),
  (13, 21, 'numeros'),
  (13, 22, 'numeros'),
  (13, 23, 'numeros'),
  (13, 24, 'numeros'),
  (13, 15, 'preco'),
  (14, 1, 'numeros'),
  (14, 21, 'numeros'),
  (14, 22, 'numeros'),
  (14, 23, 'numeros'),
  (14, 24, 'numeros'),
  (14, 27, 'preco');

-- mensagens_chat (2 linhas)
INSERT INTO mensagens_chat (id, usuario_id, fabrica_id, autor, texto, criada_em) VALUES
  (1, 1, 1, 'usuario', 'Quero aumentar a produção em 10%', '2026-10-18 09:47:00'),
  (2, 1, 1, 'assistente', 'Dá para chegar a +10%. Produção 11.400 → 12.600 garrafas/h. Investimento estimado: R$ 40.000 a R$ 140.000.', '2026-10-18 09:47:00');

-- modelos_reais (18 linhas)
INSERT INTO modelos_reais (id, maquina_id, fabricante, modelo, aplicacao, capacidade_min, capacidade_max, unidade_capacidade, fonte_id, observacao) VALUES
  (1, 6, 'Krones', 'Modulfill VFJ', 'Água sem gás em PET', NULL, 81000, 'garrafas/h', 12, NULL),
  (2, 6, 'Krones', 'Modulfill VFS', 'Água com e sem gás em PET', NULL, 72000, 'garrafas/h', 28, NULL),
  (3, 6, 'Krones', 'Modulfill HES', 'Cerveja', NULL, 78000, 'recipientes/h', 29, NULL),
  (4, 6, 'Krones', 'Modulfill HEL', 'Suco em vidro', NULL, 78000, 'recipientes/h', 30, NULL),
  (5, 6, 'Krones', 'Modulfill Dual', 'Água sem gás em PET', NULL, 100000, 'garrafas/h', 31, NULL),
  (6, 6, 'Sidel', 'Matrix SF300 FM', 'Bebidas com e sem gás em PET', NULL, 80000, 'garrafas/h', 32, NULL),
  (7, 6, 'Sidel', 'Matrix Hot Filler SF700', 'Sucos, chás e isotônicos (enchimento a quente)', 6000, 60000, 'garrafas/h', 33, NULL),
  (8, 4, 'Krones', 'LinaFlex eSync', 'Pasteurizador de túnel; bomba de calor opcional', NULL, 95000, 'recipientes/h', 34, NULL),
  (9, 4, 'Krones', 'MiniFlex', 'Pasteurizador de túnel, versão menor', NULL, 30000, 'latas/h', 35, NULL),
  (10, 4, 'Tetra Pak', 'Pasteurizer BF', 'Sucos, néctares e isotônicos (trocador de placas)', 3000, 55000, 'L/h', 6, NULL),
  (11, 4, 'Alfa Laval', 'HTST (unidades pequenas)', 'Pasteurização HTST de pequeno porte (anúncios de usados)', 800, 1350, 'L/h', 36, NULL),
  (12, 8, 'Krones', 'Contiroll', 'Rotuladora de rótulo contínuo (bobina)', 3000, 36000, 'recipientes/h', 19, NULL),
  (13, 8, 'Krones', 'Contiroll HS', 'Versão de alta velocidade do Contiroll', 3000, 66000, 'recipientes/h', 19, NULL),
  (14, 8, 'KHS', 'Innoket Neo SK', 'Etiqueta autoadesiva em vidro e PET', NULL, 60000, 'garrafas/h', 37, NULL),
  (15, 8, 'KHS', 'Innoket 360 S', 'Rotuladora de bobina para PET', NULL, 50000, 'garrafas/h', 38, NULL),
  (16, 8, 'KHS', 'Innoket 360 Duo', 'Rotuladora de bobina para PET descartável', NULL, 60000, 'garrafas/h', 39, NULL),
  (17, 3, 'Tetra Pak', 'In-line Blender B', 'Mistura de xarope e água, até 10 correntes; controle de Brix', 20000, 60000, 'L/h', 5, NULL),
  (18, 5, 'Tetra Pak', 'In-line Blender B com carbonatação', 'Mesmo equipamento na versão com carbonatação', 20000, 60000, 'L/h', 9, NULL);

-- planos_objetivo (1 linhas)
INSERT INTO planos_objetivo (id, fabrica_id, usuario_id, criado_em, tipo_objetivo, valor_meta, aceita_zona_atencao, aceita_paralelo, producao_antes, producao_depois, risco_antes, risco_depois, investimento_min, investimento_max, atingiu_meta, aplicado) VALUES
  (1, 1, 1, '2026-10-18 09:48:00', 'pct', 10, TRUE, TRUE, 11400, 12600, 0.02, 0.084, 40000, 140000, TRUE, TRUE);

-- precos_maquina (14 linhas)
INSERT INTO precos_maquina (id, maquina_id, preco_min, preco_max, moeda, observacao, editado_pelo_usuario, vigente_desde) VALUES
  (1, 1, 20000, 80000, 'BRL', 'Um tanque inox de 1.000 L custa de US$ 1,7 mil (usado) a US$ 5–7 mil (novo). Para 12 m³/h precisamos de tanque e bomba bem maiores: a faixa é uma estimativa por escala.', FALSE, '2026-10-18 09:05:00'),
  (2, 2, 20000, 80000, 'BRL', 'Mesma base do tanque de água (tanque inox com agitador: US$ 2,5 a 7 mil por 1.000 L). Estimativa por escala.', FALSE, '2026-10-18 09:05:00'),
  (3, 3, 30000, 150000, 'BRL', 'Tanque misturador de 1.000 L com agitador: US$ 2,5 a 7 mil. Um misturador contínuo com dosagem custa bem mais; faixa estimada.', FALSE, '2026-10-18 09:05:00'),
  (4, 4, 150000, 600000, 'BRL', 'Só achei anúncios de porte pequeno (35 L por US$ 4 mil; 1.000 L/h por ~US$ 3,5 mil). Para 13 mil L/h a faixa é estimada por escala. Peça cotação.', FALSE, '2026-10-18 09:05:00'),
  (5, 5, 60000, 200000, 'BRL', 'Carbonatador em linha: US$ 29,95 mil novo (Padovan) e £ 4,5 mil usado (Carbotech 500, 500 L/h, £ 9 mil novo). Fabricantes grandes não publicam preço.', FALSE, '2026-10-18 09:05:00'),
  (6, 6, 1500000, 4000000, 'BRL', 'Enchedoras pequenas: US$ 7 mil (240–400 garrafas/h) a US$ 52 mil (800/h, com tampadora). Uma de 12 mil/h é de outra escala (a de 6.000/h usada tem preço sob consulta). Faixa estimada.', FALSE, '2026-10-18 09:05:00'),
  (7, 7, 20000, 80000, 'BRL', 'Só a correia modular custa US$ 144 a 270 por metro. Com motor, estrutura e instalação de uma linha, estimamos esta faixa.', FALSE, '2026-10-18 09:05:00'),
  (8, 8, 40000, 140000, 'BRL', 'Rotuladoras de luva termo-encolhível: US$ 7 mil a 25 mil (até 100–150 garrafas/min).', FALSE, '2026-10-18 09:05:00'),
  (9, 9, 20000, 80000, 'BRL', 'Sem preço encontrado: estimativa por analogia com esteiras e moegas de recebimento.', FALSE, '2026-10-18 09:05:00'),
  (10, 10, 25000, 60000, 'BRL', 'Anúncios de lavadoras de bolhas ficam entre US$ 4,5 mil e 6 mil (300 a 5.000 kg/h), em sites de revenda: fonte fraca, sem link confiável.', FALSE, '2026-10-18 09:05:00'),
  (11, 11, 150000, 600000, 'BRL', 'Extratoras comerciais pequenas custam US$ 0,5 a 2 mil (20–25 laranjas/min). Uma industrial de 1,3 t/h é de outra escala: estimativa.', FALSE, '2026-10-18 09:05:00'),
  (12, 12, 20000, 80000, 'BRL', 'Despolpadeiras de 0,5 a 2,5 t/h: de ~US$ 1 mil a US$ 11 mil.', FALSE, '2026-10-18 09:05:00'),
  (13, 13, 200000, 500000, 'BRL', 'Enchedora de 4 bicos com tampadora a ~800 garrafas/h: US$ 52 mil (≈ R$ 286 mil).', FALSE, '2026-10-18 09:05:00'),
  (14, 14, 120000, 250000, 'BRL', 'Câmaras frias de 10 a 40 m³: US$ 14 mil a 31 mil (cerca de US$ 580 a 1.400 por m³), em compras de vacinas (UNICEF), que costumam ser mais caras que as comerciais.', FALSE, '2026-10-18 09:05:00');

-- simulacoes (1 linhas)
INSERT INTO simulacoes (id, fabrica_id, usuario_id, iniciada_em, velocidade, duracao_min, concluida, garrafas_produzidas, energia_kwh, fila_total, pct_do_maximo, risco_max, gargalo_maquina_id) VALUES
  (1, 1, 1, '2026-10-18 09:52:00', 20, 480, TRUE, 87400, 193.74, 36127, 95.83, 0.02, 8);

-- cenarios (2 linhas)
INSERT INTO cenarios (id, fabrica_id, nome, criado_em, temperatura_ambiente, producao_h, risco_max, energia_kw, gargalo_id) VALUES
  (1, 1, 'Situação inicial (tudo no ótimo)', '2026-10-18 09:45:00', 25, 11400, 0.02, 24.533, 8),
  (2, 1, 'Depois do plano +10% de produção', '2026-10-18 09:46:00', 25, 12600, 0.084, 28.983, 6);

-- conexoes (19 linhas)
INSERT INTO conexoes (id, fabrica_id, origem_id, destino_id) VALUES
  (1, 1, 1, 2),
  (2, 1, 2, 3),
  (3, 1, 3, 4),
  (4, 1, 4, 5),
  (5, 1, 5, 6),
  (6, 1, 6, 7),
  (7, 1, 7, 8),
  (8, 2, 9, 10),
  (9, 2, 10, 11),
  (10, 2, 11, 12),
  (11, 2, 12, 13),
  (12, 2, 13, 14),
  (13, 3, 15, 16),
  (14, 3, 16, 17),
  (15, 3, 17, 18),
  (16, 3, 18, 19),
  (17, 3, 19, 20),
  (18, 3, 20, 21),
  (19, 3, 21, 22);

-- eventos_registro (5 linhas)
INSERT INTO eventos_registro (id, fabrica_id, usuario_id, simulacao_id, ocorrido_em, tipo, mensagem) VALUES
  (1, 1, 1, NULL, '2026-10-18 09:41:00', 'ok', 'Exemplo carregado: Bebidas em geral'),
  (2, 1, 1, NULL, '2026-10-18 09:49:00', 'ok', 'Aplicou o plano: produção 11.400 → 12.600 garrafas/h'),
  (3, 1, 1, 1, '2026-10-18 09:52:00', 'ok', 'Simulação iniciada (8 h simuladas)'),
  (4, 1, 1, 1, '2026-10-18 09:53:00', 'info', 'Todas as máquinas já estão trabalhando'),
  (5, 1, 1, 1, '2026-10-18 09:54:00', 'ok', 'Simulação terminada');

-- plano_passos (2 linhas)
INSERT INTO plano_passos (id, plano_id, ordem, acao, fabrica_maquina_id, maquina_id, ritmo_antes, ritmo_depois, unidades_antes, unidades_depois, motivo, custo_min, custo_max) VALUES
  (1, 1, 1, 'ritmo', 6, 6, 200, 220, NULL, NULL, 'Era o gargalo. Acima do ótimo ela rende mais, mas o risco sobe para 8,4%.', NULL, NULL),
  (2, 1, 2, 'paralelo', 8, 8, NULL, NULL, 1, 2, 'Mesmo no limite seguro dela, continuava sendo o gargalo. Uma unidade a mais soma capacidade a essa etapa. Alternativa: um modelo de maior capacidade.', 40000, 140000);

-- cenario_maquinas (16 linhas)
INSERT INTO cenario_maquinas (id, cenario_id, maquina_id, fabrica_maquina_id, ritmo, unidades_paralelo, desligada, capacidade_h, saida_h, fila_h, risco, estado, energia_kw) VALUES
  (1, 1, 1, 1, 8, 1, FALSE, 16000, 16000, 0, 0.02, 'normal', 1),
  (2, 1, 2, 2, 1200, 1, FALSE, 14400, 14400, 1600, 0.02, 'normal', 1.3),
  (3, 1, 3, 3, 60, 1, FALSE, 15000, 14400, 0, 0.02, 'normal', 2.9),
  (4, 1, 4, 4, 6.5, 1, FALSE, 13000, 13000, 1400, 0.02, 'normal', 7),
  (5, 1, 5, 5, 7, 1, FALSE, 14000, 13000, 0, 0.02, 'normal', 1.893),
  (6, 1, 6, 6, 200, 1, FALSE, 12000, 12000, 1000, 0.02, 'normal', 2.55),
  (7, 1, 7, 7, 0.8, 1, FALSE, 15000, 12000, 0, 0.02, 'normal', 1.26),
  (8, 1, 8, 8, 190, 1, FALSE, 11400, 11400, 600, 0.02, 'normal', 6.63),
  (9, 2, 1, 1, 8, 1, FALSE, 16000, 16000, 0, 0.02, 'normal', 1),
  (10, 2, 2, 2, 1200, 1, FALSE, 14400, 14400, 1600, 0.02, 'normal', 1.3),
  (11, 2, 3, 3, 60, 1, FALSE, 15000, 14400, 0, 0.02, 'normal', 2.9),
  (12, 2, 4, 4, 6.5, 1, FALSE, 13000, 13000, 1400, 0.02, 'normal', 7),
  (13, 2, 5, 5, 7, 1, FALSE, 14000, 13000, 0, 0.02, 'normal', 1.893),
  (14, 2, 6, 6, 220, 1, FALSE, 12600, 12600, 400, 0.084, 'alerta', 2.577),
  (15, 2, 7, 7, 0.8, 1, FALSE, 15000, 12600, 0, 0.02, 'normal', 1.308),
  (16, 2, 8, 8, 190, 2, FALSE, 22800, 12600, 0, 0.02, 'normal', 11.005);
