# Empresas reais no simulador

Pedido do professor para a apresentação final: **trazer o sistema para o mundo real**, reproduzindo a linha de empresas de verdade
(com a velocidade de produção que elas publicam) e mostrar o que o simulador diz ao ampliar ou melhorar.

No menu **Exemplos** há agora dez mapas, de **oito empresas** (Quilmes e Tial têm um mapa "antes" e um "depois"). Os números e as fontes de cada um estão em [evidencias-empresas.md](evidencias-empresas.md). Ao carregar um deles abre a janela **Sobre a fábrica** (fontes, o que é
documentado, o que foi assumido e o histórico). Depois, `Exemplos › Sobre a fábrica carregada…` abre de novo.

## Como os mapas foram montados (e o que NÃO é real)

- **Real e documentado:** a velocidade da linha, em garrafas por hora, publicada pela empresa, pelo fabricante do equipamento ou pela imprensa
  (cada mapa tem os links). Também o tipo de bebida e, quando citado, as máquinas principais (sopradora, enchedora, hot-fill...).
- **Hipótese (dita na tela):** as empresas **não publicam** o arranjo interno (quantos tanques, bombas, pasteurizadores). Por isso a cadeia de etapas
  segue o processo típico daquela bebida e a **quantidade de unidades de cada máquina foi calculada** para a linha sustentar a velocidade publicada:
  a enchedora define o ritmo (unidades = velocidade ÷ 12.000 garrafas/h, para cima; o ritmo é ajustado para bater o número) e as outras etapas têm
  cerca de 5% de folga. A enchedora é o gargalo, como numa linha real balanceada.
- **Fora do mapa:** o que não existe no catálogo de máquinas (sopro de garrafas PET, lavagem de garrafas retornáveis, tratamento de água, paletização).
- O mapa é **uma linha de envase**, não a fábrica inteira (a fábrica de Jundiaí tem 17 linhas, por exemplo).
- Testes automáticos garantem que cada mapa produz a velocidade publicada (diferença menor que 1%), que a enchedora é o gargalo e que as
  conexões respeitam as regras do sistema. Os mesmos mapas existem na API (`POST /factories` com `template`), conferidos contra o front-end.

## As oito empresas

| # | Empresa | Linha | Velocidade publicada | Tipo |
|---|---|---|---|---|
| 1 | **Coca-Cola FEMSA Brasil**, Jundiaí (SP) | 17ª linha, vidro retornável (1 L e KS 290 ml) | 50.000 garrafas/h | refrigerante, vidro |
| 2 | **SLMG Beverages**, Chhata (Índia) | KHS InnoPET TriBlock, PET 250 ml a 2 L | 48.000 garrafas/h | refrigerante, PET |
| 3 | **Refres Now** (Manaos), La Matanza (Argentina) | Sidel Combi, PET 2,5 L | 30.000 garrafas/h | refrigerante, PET |
| 4 | **Coca-Cola Canners**, Wadeville (África do Sul) | KHS hot-fill, PET 0,3 a 1,5 L | 48.000 garrafas/h | chás, isotônicos e sucos (hot-fill) |
| 5 | **Cervecería y Maltería Quilmes** (Argentina) | Gatorade hot-fill, PET 300 a 1200 ml | 22.000 → 45.000 garrafas/h (2020) | isotônico (hot-fill) |
| 6 | **Tannourine Water** (Líbano) | Sidel Matrix Combi | 31.500 garrafas/h | água mineral |
| 7 | **Refriko (Grupo RFK)**, São José dos Pinhais (PR) | linha de refrigerantes da fábrica nova | 33.000 garrafas/h | refrigerante |
| 8 | **Tial**, Visconde do Rio Branco (MG) | nova linha de pasteurização de suco pronto | 11.000 → 37.000 litros/h | suco pronto (assumido 1 L = 1 garrafa) |

A Tial é o único caso com **suco** e com a **melhoria real descrita com números**: o gargalo é o pasteurizador (11 mil → 37 mil litros por hora), e a matéria informa vapor −64,6%, água −50%, perdas −92% e retorno em menos de um ano (conteúdo patrocinado pelo fornecedor, Tetra Pak). O simulador só calcula capacidade, risco e energia elétrica: a economia de vapor, água e perdas **não entra** na conta em reais.

A Quilmes tem **dois mapas** (antes e depois da ampliação de 2020), para repetir no simulador uma ampliação real: carregue o "antes", aplique a melhoria
(dobrar as unidades), rode o Play e compare a V1 com a V2.

## Histórico e fontes

### 1. Coca-Cola FEMSA Brasil (Jundiaí)
- A fábrica produz mais de 2 bilhões de litros por ano, com 17 linhas, e responde por 31% da produção nacional da marca. Inaugurada em 1993, é operada pela Coca-Cola FEMSA Brasil desde 2003. A 17ª linha (retornáveis) custou cerca de R$ 191 milhões e envasa até 50 mil garrafas por hora; o pacote de modernização de 2024 a 2026 passa de R$ 360 milhões.
- A FEMSA (México) tem origem em Monterrey; a Coca-Cola FEMSA concluiu a compra da Panamco em maio de 2003 e é considerada a maior engarrafadora da Coca-Cola da **América Latina** (não encontramos fonte para "maior do mundo").
- Fontes: [Tribuna de Jundiaí](https://tribunadejundiai.com.br/cidades/jundiai/coca-cola-femsa-jundiai-investimento/) · [FEMSA, compra da Panamco](https://femsa.gcs-web.com/node/9486)

### 2. SLMG Beverages (Chhata, Índia)
- Engarrafadora da Coca-Cola formada pela união de engarrafadoras dos irmãos da família Ladhani em Uttar Pradesh (o nome vem das iniciais dos quatro irmãos); descrita como a maior engarrafadora da Coca-Cola na Índia. A fábrica de Chhata tem seis linhas; a nova linha PET (48 mil/h) elevou a capacidade PET em cerca de 35% e foi instalada em cerca de 40 dias. O fundador, S. N. Ladhani, morreu em 2025.
- A estrutura atual (quatro engarrafadoras, por volta de 2019) e a trajetória da família vêm de relatos de imprensa, não de documentos da empresa.
- Fontes: [Food Processing (KHS e SLMG)](https://www.foodprocessing.com.au/content/packaging-labelling-coding/case-study/coca-cola-bottler-in-india-boosts-capacity-for-high-season-542575821) · [KHS](https://www.khs.com/en/company/news/press-releases/detail/khs-and-slmg-beverages-right-on-time) · [Outlook India](https://www.outlookindia.com/outlook-spotlight/s-n-ladhani-india-s-largest-independent-coca-cola-bottler-and-champion-of-nature-conservation-news-310736)

### 3. Refres Now (Manaos, Argentina)
- Dona da gasosa Manaos. Fundada em 2004 por Orlando Canido; a família juntou cerca de US$ 200 mil para comprar o terreno em Virrey del Pino (La Matanza) e antes distribuía a gasosa Sao. Imprensa argentina fala em cerca de 15 linhas e 600 funcionários. Em 2025 comprou a Prodea (Cunnington e Neuss) por cerca de US$ 70 a 74 milhões. A linha Combi de 2014 (30 mil garrafas/h de 2,5 L, 20 estações de sopro, 162 válvulas de enchimento e 18 cabeçotes de tampagem) reduziu em 17% o consumo de energia; em 2017 a Sidel anunciou nova ampliação de cerca de 40%.
- Fontes: [Sidel, 2014](https://www.sidel.com/about/media/press-releases/refres-now-argentina/) · [Sidel, 2017](https://www.packagingconnections.com/v3/pressrelease/refres-now-increase-production-capacity-40-while-halving-energy-consumption-choosing) · [La Nación](https://www.lanacion.com.ar/economia/expedientes-manaos-los-secretos-de-la-gaseosa-mas-popular-del-conurbano-nid1938760/) · [Bloomberg Línea](https://www.bloomberglinea.com/latinoamerica/argentina/manaos-cerro-la-compra-de-cunnington-y-neuss-por-us74-millones/)

### 4. Coca-Cola Canners (Wadeville, África do Sul)
- Unidade de produção perto de Joanesburgo (quatro linhas de latas e duas de PET, cerca de 320 pessoas); envasa Coca-Cola, Sprite, Fanta, Powerade e Glacéau. A linha KHS de hot-fill (matéria de 2016) enche até 48 mil garrafas por hora: o produto é aquecido acima de 100 °C e envasado a cerca de 83 °C; duas enchedoras volumétricas (pedaços de fruta e suco); até 20 bebidas em 8 formatos.
- **Não encontramos fonte confiável** sobre a data de fundação nem a estrutura societária; por isso o documento não afirma nada sobre isso.
- Fontes: [Food Processing](https://foodprocessing.com.au/content/packaging-labelling-coding/case-study/hygienic-bottling-using-hot-fill-technology-334440742) · [KHS](https://www.khs.com/en/company/news/press-releases/detail/coca-cola-uses-customized-hot-fill-system-from-khs) · [SMI, ficha](https://www.smigroup.it/repository-new/doc/COCA%20CANNERS_EN.pdf)

### 5. Quilmes (Argentina)
- A cervejaria foi fundada em 1888 por Otto Bemberg (produção desde 1890) e hoje faz parte do grupo AB InBev; a Sidel a descreve como a maior empresa de bebidas da Argentina. Em 2020 a linha PET de hot-fill da planta Sul de Buenos Aires passou de 22 mil para 45 mil garrafas por hora (primeira sopradora-enchedora Combi da planta), com cerca de 95% de eficiência média com garrafa de 500 ml. Envasa Gatorade (as fontes não detalham a relação comercial com a marca).
- Fontes: [Sidel, 2020](https://www.sidel.com/about/media/press-releases/quilmes-argentina/) · [El Cronista](https://www.cronista.com/apertura/empresas/la-empresa-que-paso-de-ser-expropiada-por-peron-a-conquistar-el-mundo-empresario-con-la-bandera-argentina) · [Mercado](https://mercado.com.ar/marketing/lo-que-no-sabias-sobre-quilmes)

### 6. Tannourine Water (Líbano)
- Empresa de 1978 que envasa água mineral da nascente na região de Tannourine, nas montanhas libanesas (cerca de 1.250 m, segundo uma fonte; outra fala em 1.500 m). Em 2014 anunciou a linha Sidel Matrix Combi de 31.500 garrafas por hora e vendia cerca de 150 milhões de litros por ano. Em 2023 declarou 90 mil garrafas/h na fábrica (sem esclarecer se soma outras linhas). Em outubro de 2025 o Ministério da Saúde suspendeu a produção por suspeita de contaminação; a empresa contestou e voltou a produzir (episódio contestado).
- Fontes: [FoodNavigator](https://www.foodnavigator.com/Article/2015/01/12/Tannourine-Water-boosts-production-with-Sidel-bottling-line/) · [Sidel](https://www.sidel.com/about/media/press-releases/tannourine-lebanon/) · [Missão econômica (Francofonia)](https://missions-economiques.francophonie.org/mission-economique-2023-liban/en/partner/f06967b8-d856-ee11-9937-000d3a4cc0c5/societe-libanaise-des-sources-des-eaux-de-tannourine)

### 7. Refriko (Grupo RFK, Paraná)
- Fábrica nova em São José dos Pinhais (região de Curitiba): linha de refrigerantes de 33 mil garrafas/h e linha de cerveja de 60 mil latas/h; capacidade inicial de 2,3 milhões de bebidas por dia, com meta de 10 milhões por dia; investimento de R$ 400 milhões; terreno de 300 mil m²; meta de receita de R$ 2 bilhões em 2029. O Grupo RFK tem quatro fábricas, 115 produtos e 12 marcas ativas. A matéria não informa a data de fundação nem se a garrafa é PET.
- Fonte: [Gazeta do Povo (jul/2026)](https://www.gazetadopovo.com.br/parana/refriko-mira-producao-de-10-milhoes-de-bebidas-por-dia-com-nova-fabrica-no-parana/)

### 8. Tial (Minas Gerais)
- Fabricante de sucos prontos, líder regional em Minas Gerais (19% do mercado) e com receita de R$ 350 milhões em 2024. A nova linha de pasteurização leva o processamento de 11 mil para até 37 mil litros por hora e substitui as duas linhas antigas.
- Fonte: [Exame, conteúdo patrocinado pela Tetra Pak](https://exame.com/negocios/tecnologia-tetra-pak/)

## Ganho em reais (pedido do Enzo)

Em **Resultados › Comparações** há o bloco **"Ganho em reais (estimativa)"**: compara duas versões e converte a diferença de produção em dinheiro.

- **Conta:** garrafas a mais por hora × horas de operação por ano × preço por garrafa = vendas a mais por ano. O lucro a mais é uma porcentagem desse valor. O retorno do investimento é o investimento adicional (do catálogo de máquinas) ÷ lucro por mês.
- **Três números que a pessoa ajusta:** preço por garrafa (vem preenchido com o ponto médio da faixa pesquisada de cada empresa), horas de operação por ano (padrão **4.000 h**, o mesmo do desgaste) e lucro sobre o preço (padrão **15%**).
- **De onde vêm os preços (links em cada mapa e em [evidencias-empresas.md](evidencias-empresas.md)):** a **portaria SAIF nº 93/2026 de Minas Gerais** publica os preços médios ao consumidor final (PMPF) de refrigerantes e isotônicos usados para calcular imposto: Pepsi 2 L R$ 9,27, Coca-Cola 2 L R$ 11,93, Fanta 2 L R$ 9,36, Guaraná Antarctica 2 L R$ 9,84, Coca-Cola 1 L retornável de vidro R$ 5,92, Pepsi 1 L retornável R$ 4,94, Gatorade 500 ml R$ 6,05, Tubaína 2 L a partir de R$ 4,11. Para suco pronto usamos preços de lojas online (néctar de 1 L entre R$ 10,59 e R$ 10,99, sem data). Água mineral não tem preço público de referência: o usuário digita.
- **De onde vêm os 15%:** a margem operacional pública da Coca-Cola FEMSA (14,3% no 3º trimestre de 2025 e 16,1% no 4º, sem ganhos extraordinários). É da empresa toda, não de uma linha.
- **Como ler com cuidado (está escrito na tela e no PDF):** o preço é de **prateleira** (a fábrica recebe menos), então o resultado é um **teto**; não entram matéria-prima, mão de obra nem a demanda do mercado (capacidade nova só vira dinheiro se alguém comprar); e as máquinas do catálogo são de escala menor que as de uma linha real, então o retorno pelo catálogo sai mais rápido que na vida real. Na Coca-Cola FEMSA o bloco compara com o **custo real publicado** (R$ 191 milhões para 50 mil garrafas/h, R$ 3,8 milhões por 1.000 garrafas/h).
- **Conferência com a realidade:** na Tial, 11.000 garrafas/h × 4.000 h × R$ 10,79 dão R$ 474,8 milhões no preço de prateleira, contra a receita publicada de R$ 350 milhões: a mesma ordem de grandeza, e maior porque a fábrica recebe menos que o preço de prateleira. O mesmo bloco mostra que o ganho (R$ 1,1 bilhão por ano em vendas) é três vezes a receita atual: é **capacidade**, não dinheiro garantido.
- O **PDF** da comparação traz o mesmo bloco.

## O que pedimos e não deu (empresas citadas pelo Enzo)

| Empresa | O que achamos | Por que não virou mapa |
|---|---|---|
| **Pepsi** | A PepsiCo tem fábricas de salgadinhos no Brasil; para bebidas só apareceram, em resultados de busca (não abrimos esses PDFs), linhas da Sidel em outros países (Aquafina no Oriente Médio, 60 mil garrafas/h; Paquistão, mais de 45 mil). O preço oficial da Pepsi (2 L R$ 9,27; 1 L R$ 5,98) está na portaria de MG. | Sem velocidade de linha pública no Brasil. Quem engarrafa a Pepsi no país **não foi confirmado** por nós. |
| **Xandô** | É marca de laticínios e sucos naturais da Fazenda Colorado (matéria de jul/2026 sobre um centro de distribuição na Lapa, São Paulo); não é marca de refrigerante. | Sem dado de linha de produção. |
| **Prat's** | Parceria com a Gelprime para um suco natural com colágeno (Gironews). | Sem dado de capacidade da fábrica. |
| **Ades** | Bebida de soja criada na Argentina em 1988; a Unilever vendeu a operação latino-americana à Coca-Cola e à Coca-Cola FEMSA por US$ 575 milhões (anunciada em 1/6/2016, fechada em 2017). | Sem volume nem velocidade de linha por fábrica. |

Fontes: [Mercado&Consumo, Xandô](https://mercadoeconsumo.com.br/17/07/2026/foodservice/xando-inaugura-centro-de-distribuicao-de-1-950-m%c2%b2-em-sao-paulo-e-foca-em-eficiencia-logistica/) · [Gironews, Prat's e Gelprime](https://gironews.com/lancamentos/gelprime-e-prats-lancam-primeiro-suco-natural-com-proteina-de-colageno/) · [Meio&Mensagem, Coca-Cola compra a Ades](https://www.meioemensagem.com.br/marketing/coca-cola-compra-ades-da-unilever) · [Just Food, Unilever vende a Ades](https://www.just-food.com/news/unilever-to-sell-soy-drinks-business-ades) · [Sidel, Aquafina e Northern Bottling](https://www.sidel.com/media/et1ail2e/sidel_press_article_2023_menabev_pt.pdf)

Como achamos duas empresas brasileiras com dado público (Refriko e Tial), **não foi preciso** o plano B do Enzo (cinco empresas fictícias com documentação).

## O que não entrou (e por quê)

- **Suco de laranja de extração (Citrosuco, Cutrale):** não há número público de capacidade por hora ou por linha (só safras e caixas por ano), e as máquinas de fruta do catálogo são de escala pequena. O caso da Tial cobre o suco pronto a partir de concentrado. Outra empresa achada: a Natural One (Jarinu, SP) anunciou uma linha nova de 100 milhões de litros por ano, mas só em volume anual, sem velocidade por hora.
- **Cerveja (Ambev, Heineken):** o processo (malte, fermentação) não existe no catálogo de máquinas.
- **Coca-Cola/Ambev refrigerantes no Brasil:** só a linha 17 de Jundiaí tem velocidade horária pública; da Ambev encontramos apenas volumes anuais e linhas de cerveja.

## Como usar na apresentação

1. `Exemplos › Empresa real: ...` carrega o mapa e abre a janela com fontes e histórico.
2. **Resultados** mostra a produção (igual ao número publicado), o gargalo (enchedora), o uso de cada máquina e as folgas.
3. Pergunte "e se...": **Resultados › Avisos** sugere melhorias (mais uma enchedora, subir o ritmo) com custo estimado. Aplique, rode o **Play** e compare as versões em **Comparações** (inclui valor estimado dos equipamentos e PDF).
4. Para um caso real de ampliação, use as duas versões da Quilmes (22 mil → 45 mil por hora) ou da Tial (11 mil → 37 mil litros por hora, com a melhoria da nova linha de pasteurização).
5. Abra **Comparações › Ganho em reais**: veja quanto a ampliação vale por ano, em quanto tempo paga e a conferência com a receita publicada da empresa. Exporte o PDF para o relatório final.
