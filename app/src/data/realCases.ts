/* Fábricas de empresas reais (exemplos prontos para a apresentação final).

   Como foram montadas: cada mapa reproduz UMA LINHA de envase real, com o número de garrafas por hora publicado pela empresa, pelo
   fornecedor do equipamento ou pela imprensa. As empresas NÃO publicam o arranjo interno (quantas bombas, tanques, etc.), então:
     * a velocidade da linha (garrafas/h) é dado real e documentado, com link;
     * a cadeia de etapas segue o processo típico daquele tipo de bebida (hipótese, dita na tela);
     * a quantidade de unidades de cada máquina é calculada para a linha sustentar a velocidade publicada:
       a enchedora define o ritmo (unidades = velocidade ÷ 12.000 garrafas/h, arredondado para cima, ritmo ajustado para bater o número)
       e as demais etapas têm cerca de 5% de folga (unidades = 1,05 × velocidade ÷ capacidade da máquina, arredondado para cima).
   Os números dos nós são conferidos por teste (a simulação tem de dar a velocidade publicada e o gargalo tem de ser a enchedora). */

export type TemplateNode = [type: string, x: number, y: number, qty?: number, value?: number];

/** Preço de referência por garrafa (R$), só para estimar o ganho em reais: faixa publicada, nunca o preço que a fábrica recebe. */
export interface PriceRef {
  min: number; max: number;
  unit: string;               // a que garrafa o preço se refere
  basis: string;              // de onde vêm os números e o que eles NÃO são
  sources: { t: string; u: string }[];
}

export interface RealCase {
  key: string;
  name: string;               // nome no menu e no quadro
  company: string; place: string;
  what: string;               // o que a linha faz
  ratedBph: number;           // garrafas por hora publicadas
  /** quem limita a linha, quando não é a enchedora (ex.: o pasteurizador, quando o dado publicado é de processamento em L/h) */
  bottleneck?: string;
  /** preço médio por garrafa (faixa publicada) para o ganho em reais; vazio = não achamos preço público */
  price?: PriceRef;
  /** receita anual publicada da empresa, para conferir a ordem de grandeza das contas em reais */
  revenueRef?: { brl: number; year: number; text: string };
  /** investimento real publicado da linha, para comparar com o custo do catálogo */
  investRef?: { text: string; perThousand: number; source: { t: string; u: string } };
  facts: string[];            // o que é documentado (cada item tem fonte nos links)
  assumptions: string[];      // o que foi assumido para montar o mapa
  history: string[];          // um pouco do histórico da empresa
  sources: { t: string; u: string }[];
  nodes: TemplateNode[];
}

/** Posições no quadro: até 4 máquinas numa fileira; mais que isso, 4 em cima (da esquerda para a direita) e o resto embaixo (da direita para a esquerda). */
function chain(spec: [type: string, qty: number, value?: number][]): TemplateNode[] {
  return spec.map(([type, qty, value], i): TemplateNode => {
    const x = spec.length <= 4 ? 40 + 230 * i : i < 4 ? 40 + 230 * i : 730 - 230 * (i - 4);
    const y = spec.length <= 4 || i < 4 ? 60 : 250;
    return value === undefined ? [type, x, y, qty] : [type, x, y, qty, value];
  });
}

const SRC_PMPF = { t: 'Portaria SAIF nº 93/2026 (Minas Gerais): preços médios ao consumidor final (PMPF) de refrigerantes e isotônicos', u: 'https://www.legisweb.com.br/legislacao/?id=497278' };
const PMPF_NOTE = 'PMPF é o preço médio ao consumidor final que o governo de Minas Gerais usa para calcular imposto (vigência de jul a dez/2026): é preço de prateleira, não o que a fábrica recebe, e vale para o Brasil.';
const PRICE = {
  vr1: { min: 4.94, max: 5.92, unit: 'garrafa de vidro retornável de 1 L', basis: `Refrigerantes em vidro retornável de 1 L: Pepsi e Guaraná Antarctica R$ 4,94; Coca-Cola R$ 5,92. ${PMPF_NOTE}`, sources: [SRC_PMPF] } as PriceRef,
  pet1: { min: 5.98, max: 7.31, unit: 'garrafa PET de 1 L', basis: `Refrigerantes PET de 1 L: Pepsi R$ 5,98; Coca-Cola R$ 7,31. É uma referência brasileira: a fábrica fica em outro país. ${PMPF_NOTE}`, sources: [SRC_PMPF] } as PriceRef,
  pet2regional: { min: 4.11, max: 5.80, unit: 'garrafa PET de 2 L (marcas regionais)', basis: `Refrigerantes PET de 2 L de marcas regionais: Ei! Tubaína R$ 4,11; Kitubaína Jota Efe R$ 5,80. Referência brasileira de marca de segunda linha. ${PMPF_NOTE}`, sources: [SRC_PMPF] } as PriceRef,
  iso: { min: 4.07, max: 6.47, unit: 'garrafa PET de isotônico (400 ml a 1 L)', basis: `Gatorade: até 400 ml R$ 4,07; 500 ml R$ 6,05; 1 L R$ 6,47. Referência brasileira. ${PMPF_NOTE}`, sources: [SRC_PMPF] } as PriceRef,
  nectar1: { min: 10.59, max: 10.99, unit: 'caixa de 1 L de néctar de marca líder', basis: 'Preços de loja online (sem data de coleta): néctar de manga Del Valle 1 L R$ 10,59 (Pão de Açúcar) e néctar de maracujá 1 L R$ 10,99 (Extrafarma). São de marca líder; uma marca regional pode custar menos.', sources: [{ t: 'Pão de Açúcar: néctar de manga Del Valle 1 L', u: 'https://www.paodeacucar.com/produto/80070/nectar-manga-del-valle-caixa-1l' }, { t: 'Extrafarma: néctar de maracujá 1 L', u: 'https://www.extrafarma.com.br/suco-mais-nectar-maracuja-1l/p' }] } as PriceRef,
};

const LAYOUT_NOTE_PAST = 'A cadeia de etapas e a quantidade de cada máquina são hipóteses (a empresa não publica o arranjo interno): foram calculadas para a linha sustentar a capacidade publicada, com o pasteurizador como gargalo.';
const LAYOUT_NOTE = 'A cadeia de etapas e a quantidade de cada máquina são hipóteses (a empresa não publica o arranjo interno): foram calculadas para a linha sustentar a velocidade publicada, com a enchedora como gargalo.';

export const REAL_CASES: RealCase[] = [
  {
    key: 'cocacola_jundiai', name: 'Coca-Cola FEMSA · Jundiaí (linha 17, vidro retornável)',
    company: 'Coca-Cola FEMSA Brasil', place: 'Jundiaí (SP), Brasil',
    what: 'Refrigerantes em garrafa de vidro retornável (1 L e KS de 290 ml).', ratedBph: 50000,
    price: PRICE.vr1,
    investRef: { text: 'A 17ª linha custou cerca de R$ 191 milhões para 50 mil garrafas por hora (linha inteira, com o que o catálogo não tem: sopro, lavagem de retornáveis, inspeção, prédio).', perThousand: 3_820_000, source: { t: 'Tribuna de Jundiaí: investimento e a 17ª linha', u: 'https://tribunadejundiai.com.br/cidades/jundiai/coca-cola-femsa-jundiai-investimento/' } },
    facts: [
      'A 17ª linha da fábrica envasa até 50 mil garrafas por hora (investimento de cerca de R$ 191 milhões) e quase dobrou a capacidade em vidro retornável.',
      'A fábrica produz mais de 2 bilhões de litros de bebidas por ano, tem 17 linhas de envase e responde por 31% da produção nacional da marca.',
      'Inaugurada em 1993; operada pela Coca-Cola FEMSA Brasil desde 2003.',
    ],
    assumptions: [
      LAYOUT_NOTE,
      'A lavagem das garrafas retornáveis e a inspeção eletrônica existem na linha real, mas não há essas máquinas no catálogo: ficam de fora.',
      'A fábrica toda tem 17 linhas; este mapa é só a linha 17.',
    ],
    history: [
      'A FEMSA (México) tem origem em Monterrey. A Coca-Cola FEMSA concluiu a compra da Panamco em maio de 2003 e é considerada a maior engarrafadora da Coca-Cola da América Latina.',
      'No Brasil, a fábrica de Jundiaí foi inaugurada em 1993 e opera sob a Coca-Cola FEMSA desde 2003. Entre 2024 e 2026 recebe mais de R$ 360 milhões em modernização e expansão.',
    ],
    sources: [
      { t: 'Tribuna de Jundiaí: investimento e a 17ª linha (50 mil garrafas/h)', u: 'https://tribunadejundiai.com.br/cidades/jundiai/coca-cola-femsa-jundiai-investimento/' },
      { t: 'Coca-Cola FEMSA: compra da Panamco (resultados 2003)', u: 'https://femsa.gcs-web.com/node/9486' },
    ],
    nodes: chain([['tanque_agua', 4], ['tanque_xarope', 4], ['misturador', 4], ['pasteurizador', 5], ['carbonatador', 4], ['enchedora', 5, 166.7], ['esteira', 4], ['rotuladora', 5]]),
  },
  {
    key: 'slmg_chhata', name: 'SLMG Beverages · Chhata (linha PET KHS)',
    company: 'SLMG Beverages (engarrafadora da Coca-Cola)', place: 'Chhata (Uttar Pradesh), Índia',
    what: 'Refrigerantes Coca-Cola em garrafas PET de 250 ml a 2 L.', ratedBph: 48000,
    price: PRICE.pet1,
    facts: [
      'A linha KHS InnoPET TriBlock (sopradora, enchedora e rotuladora num bloco só) processa até 48 mil garrafas PET por hora.',
      'A nova linha elevou a capacidade PET da fábrica em cerca de 35% e responde por cerca de 60% das bebidas produzidas; a fábrica tem seis linhas.',
      'Instalação em cerca de 40 dias, da entrega dos equipamentos à primeira garrafa validada.',
    ],
    assumptions: [LAYOUT_NOTE, 'O sopro das garrafas PET e as máquinas que aplicam a camada de vidro interna (Plasmax) não existem no catálogo: ficam de fora.'],
    history: [
      'A SLMG Beverages reúne engarrafadoras da Coca-Cola dos irmãos da família Ladhani em Uttar Pradesh (o nome vem das iniciais dos quatro irmãos) e é descrita como a maior engarrafadora da Coca-Cola na Índia.',
      'A trajetória da família no engarrafamento vem das décadas de 1980 e 1990; o fundador, S. N. Ladhani, morreu em 2025 (relatos de imprensa; a estrutura atual de quatro engarrafadoras é de cerca de 2019).',
    ],
    sources: [
      { t: 'Food Processing: SLMG amplia a capacidade com a linha KHS (48 mil/h)', u: 'https://www.foodprocessing.com.au/content/packaging-labelling-coding/case-study/coca-cola-bottler-in-india-boosts-capacity-for-high-season-542575821' },
      { t: 'KHS: SLMG Beverages, "right on time"', u: 'https://www.khs.com/en/company/news/press-releases/detail/khs-and-slmg-beverages-right-on-time' },
      { t: 'Outlook India: S. N. Ladhani e a SLMG', u: 'https://www.outlookindia.com/outlook-spotlight/s-n-ladhani-india-s-largest-independent-coca-cola-bottler-and-champion-of-nature-conservation-news-310736' },
    ],
    nodes: chain([['tanque_agua', 4], ['tanque_xarope', 4], ['misturador', 4], ['pasteurizador', 4], ['carbonatador', 4], ['enchedora', 4, 200], ['esteira', 4], ['rotuladora', 5]]),
  },
  {
    key: 'refres_now_manaos', name: 'Refres Now (Manaos) · La Matanza (Combi 2,5 L)',
    company: 'Refres Now (refrigerante Manaos)', place: 'La Matanza (Buenos Aires), Argentina',
    what: 'Refrigerantes em garrafas PET de 2,5 litros (embalagem família).', ratedBph: 30000,
    price: PRICE.pet2regional,
    facts: [
      'A linha Sidel Combi (sopradora, enchedora e tampadora) entrega 30 mil garrafas de 2,5 L por hora.',
      'O Combi tem 20 estações de sopro, 162 válvulas de enchimento e 18 cabeçotes de tampagem; um misturador Sidel Starblend prepara a bebida. A troca reduziu o consumo de eletricidade da linha em 17%.',
      'Em 2017 a Sidel anunciou nova ampliação, de cerca de 40% da produção da fábrica.',
    ],
    assumptions: [LAYOUT_NOTE, 'Os 30 mil/h são de 2014 (antes da ampliação de 2017). Sopro e tampagem não existem no catálogo: ficam de fora.'],
    history: [
      'A Refres Now é a dona da gasosa Manaos. Foi fundada em 2004 por Orlando Canido e a fábrica fica em Virrey del Pino, La Matanza. A família juntou cerca de US$ 200 mil para comprar o terreno; antes distribuía a gasosa Sao.',
      'A imprensa argentina fala em cerca de 15 linhas e 600 funcionários. Em 2025 a empresa comprou a Prodea (marcas Cunnington e Neuss) por cerca de US$ 70 a 74 milhões.',
    ],
    sources: [
      { t: 'Sidel: Refres Now e o Combi para refrigerantes (30 mil/h)', u: 'https://www.sidel.com/about/media/press-releases/refres-now-argentina/' },
      { t: 'Sidel: ampliação de 40% (2017)', u: 'https://www.packagingconnections.com/v3/pressrelease/refres-now-increase-production-capacity-40-while-halving-energy-consumption-choosing' },
      { t: 'La Nación: os segredos da Manaos', u: 'https://www.lanacion.com.ar/economia/expedientes-manaos-los-secretos-de-la-gaseosa-mas-popular-del-conurbano-nid1938760/' },
      { t: 'Bloomberg Línea: compra da Prodea', u: 'https://www.bloomberglinea.com/latinoamerica/argentina/manaos-cerro-la-compra-de-cunnington-y-neuss-por-us74-millones/' },
    ],
    nodes: chain([['tanque_agua', 2], ['tanque_xarope', 3], ['misturador', 3], ['pasteurizador', 3], ['carbonatador', 3], ['enchedora', 3, 166.7], ['esteira', 3], ['rotuladora', 3]]),
  },
  {
    key: 'coca_cola_canners', name: 'Coca-Cola Canners · Wadeville (hot-fill KHS)',
    company: 'Coca-Cola Canners (África do Sul)', place: 'Wadeville (Joanesburgo), África do Sul',
    what: 'Chás gelados, isotônicos e sucos (com e sem pedaços de fruta) em PET de 0,3 a 1,5 L, com enchimento a quente.', ratedBph: 48000,
    price: PRICE.iso,
    facts: [
      'A linha KHS (sopro, enchimento, rotulagem e embalagem) enche até 48 mil garrafas por hora.',
      'Hot-fill: o produto é aquecido acima de 100 °C e envasado a cerca de 83 °C. Há duas enchedoras volumétricas de precisão (uma para os pedaços de fruta, outra para completar com suco) e até 20 bebidas em 8 formatos na mesma linha.',
      'A unidade de Wadeville tem quatro linhas de latas e duas de PET, com cerca de 320 pessoas (ficha do fornecedor SMI).',
    ],
    assumptions: [LAYOUT_NOTE, 'No hot-fill não há carbonatação: a cadeia não tem carbonatador, e o pasteurizador representa o aquecimento a quente.', 'Os 48 mil/h são da matéria de 2016.'],
    history: [
      'Coca-Cola Canners é a unidade de produção de Wadeville, perto de Joanesburgo; envasa Coca-Cola, Sprite, Fanta, Powerade e Glacéau.',
      'Não encontramos fonte confiável sobre a data de fundação nem sobre a estrutura societária, por isso não afirmamos nada sobre isso.',
    ],
    sources: [
      { t: 'Food Processing: hot-fill higiênico na Coca-Cola Canners (48 mil/h)', u: 'https://foodprocessing.com.au/content/packaging-labelling-coding/case-study/hygienic-bottling-using-hot-fill-technology-334440742' },
      { t: 'KHS: Coca-Cola usa sistema hot-fill sob medida', u: 'https://www.khs.com/en/company/news/press-releases/detail/coca-cola-uses-customized-hot-fill-system-from-khs' },
      { t: 'SMI: ficha da Coca-Cola Canners (linhas e pessoas)', u: 'https://www.smigroup.it/repository-new/doc/COCA%20CANNERS_EN.pdf' },
    ],
    nodes: chain([['tanque_agua', 4], ['tanque_xarope', 4], ['misturador', 4], ['pasteurizador', 4], ['enchedora', 4, 200], ['esteira', 4], ['rotuladora', 5]]),
  },
  {
    key: 'quilmes_gatorade', name: 'Quilmes · Buenos Aires Sul (Gatorade, depois da ampliação)',
    company: 'Cervecería y Maltería Quilmes', place: 'Buenos Aires (planta Sul), Argentina',
    what: 'Gatorade e outras bebidas não alcoólicas em PET de 300 a 1200 ml, com enchimento a quente (hot-fill).', ratedBph: 45000,
    price: PRICE.iso,
    facts: [
      'Em 2020 a linha PET passou de 22 mil para 45 mil garrafas por hora, com a primeira sopradora-enchedora Sidel Combi da planta.',
      'Com a garrafa de 500 ml a linha opera a cerca de 95% de eficiência média, com picos de 100%.',
      'A pasteurização é de um pasteurizador Tetra Pak; a recuperação de calor do resfriador economiza de 10% a 15% do calor.',
    ],
    assumptions: [LAYOUT_NOTE, 'No hot-fill não há carbonatação: a cadeia não tem carbonatador. O sopro, o resfriador e a paletização não existem no catálogo.'],
    history: [
      'A Quilmes é a maior empresa de bebidas da Argentina (segundo a Sidel). A cervejaria foi fundada em 1888 por Otto Bemberg, com produção desde 1890, e hoje faz parte do grupo AB InBev.',
      'Além de cerveja, a planta envasa bebidas não alcoólicas como o Gatorade (as fontes encontradas não detalham a relação comercial com a marca).',
    ],
    sources: [
      { t: 'Sidel: linha hot-fill da Quilmes (22 mil para 45 mil/h)', u: 'https://www.sidel.com/about/media/press-releases/quilmes-argentina/' },
      { t: 'El Cronista: história da Quilmes', u: 'https://www.cronista.com/apertura/empresas/la-empresa-que-paso-de-ser-expropiada-por-peron-a-conquistar-el-mundo-empresario-con-la-bandera-argentina' },
      { t: 'Mercado: o que você não sabia sobre a Quilmes', u: 'https://mercado.com.ar/marketing/lo-que-no-sabias-sobre-quilmes' },
    ],
    nodes: chain([['tanque_agua', 3], ['tanque_xarope', 4], ['misturador', 4], ['pasteurizador', 4], ['enchedora', 4, 187.5], ['esteira', 4], ['rotuladora', 5]]),
  },
  {
    key: 'quilmes_gatorade_antes', name: 'Quilmes · Gatorade ANTES da ampliação (22 mil/h)',
    company: 'Cervecería y Maltería Quilmes', place: 'Buenos Aires (planta Sul), Argentina',
    what: 'A mesma linha antes da ampliação de 2020. Use para repetir a ampliação real no simulador: aplique a melhoria, rode o Play e compare a V1 com a V2.', ratedBph: 22000,
    price: PRICE.iso,
    facts: [
      'Antes de 2020 a linha PET de hot-fill enchia 22 mil garrafas por hora; depois da ampliação, 45 mil (ver o mapa "depois da ampliação").',
      'A ampliação dobrou a capacidade de PET da planta: no simulador, é aproximadamente dobrar as unidades de cada máquina.',
    ],
    assumptions: [LAYOUT_NOTE, 'Quantidades escalonadas na mesma proporção do mapa "depois da ampliação".'],
    history: ['Ver o mapa "Quilmes · depois da ampliação".'],
    sources: [{ t: 'Sidel: linha hot-fill da Quilmes (22 mil para 45 mil/h)', u: 'https://www.sidel.com/about/media/press-releases/quilmes-argentina/' }],
    nodes: chain([['tanque_agua', 2], ['tanque_xarope', 2], ['misturador', 2], ['pasteurizador', 2], ['enchedora', 2, 183.3], ['esteira', 2], ['rotuladora', 3]]),
  },
  {
    key: 'refriko_sjp', name: 'Refriko (Grupo RFK) · São José dos Pinhais (linha de refrigerantes)',
    company: 'Refriko (Grupo RFK)', place: 'São José dos Pinhais (PR), Brasil',
    what: 'Refrigerantes (a fábrica também faz cerveja em lata, energéticos e água, que ficam de fora deste mapa).', ratedBph: 33000,
    price: PRICE.pet2regional,
    facts: [
      'A fábrica nova tem uma linha de refrigerantes de 33 mil garrafas por hora e uma linha de cerveja de 60 mil latas por hora.',
      'Capacidade inicial de 2,3 milhões de bebidas por dia, com meta de chegar a 10 milhões por dia nos próximos anos.',
      'Investimento de R$ 400 milhões, em um terreno de 300 mil m², com 24 meses de obra. Meta de receita de R$ 2 bilhões em 2029.',
      'O Grupo RFK tem quatro fábricas em operação, 115 produtos e 12 marcas ativas; refrigerantes respondem por cerca de 40% da receita e energéticos por 30%.',
    ],
    assumptions: [
      LAYOUT_NOTE,
      'A matéria não diz se a garrafa é PET nem o tamanho: para o preço usamos o PET de 2 L de marcas regionais.',
      'A linha de latas de cerveja (60 mil/h), os energéticos e a água (que é engarrafada perto da fonte, em outra unidade) ficam de fora.',
    ],
    history: [
      'A Refriko faz parte do Grupo RFK (diretor-executivo Márcio Mendes). A matéria não informa a data de fundação.',
      'A fábrica de São José dos Pinhais fica na região metropolitana de Curitiba; a matéria é de julho de 2026 e traz o plano de levar guaraná, energéticos e água mineral para a China.',
    ],
    sources: [{ t: 'Gazeta do Povo: Refriko mira 10 milhões de bebidas por dia com nova fábrica no Paraná (jul/2026)', u: 'https://www.gazetadopovo.com.br/parana/refriko-mira-producao-de-10-milhoes-de-bebidas-por-dia-com-nova-fabrica-no-parana/' }],
    nodes: chain([['tanque_agua', 3], ['tanque_xarope', 3], ['misturador', 3], ['pasteurizador', 3], ['carbonatador', 3], ['enchedora', 3, 183.3], ['esteira', 3], ['rotuladora', 4]]),
  },
  {
    key: 'tial_antes', name: 'Tial · suco pronto ANTES da nova linha (11 mil L/h)',
    company: 'Tial (sucos prontos)', place: 'Visconde do Rio Branco (MG), Brasil',
    what: 'Suco pronto para beber, feito de concentrado e água. Este mapa é a fábrica ANTES da nova linha de pasteurização: duas linhas de processamento que somam 11 mil litros por hora.', ratedBph: 11000, bottleneck: 'pasteurizador',
    price: PRICE.nectar1,
    revenueRef: { brl: 350_000_000, year: 2024, text: 'Receita de R$ 350 milhões em 2024 (Exame).' },
    facts: [
      'Antes da modernização, as duas linhas de processamento da fábrica somavam 11 mil litros por hora.',
      'A Tial teve receita de R$ 350 milhões em 2024 e liderava o mercado regional de suco pronto em Minas Gerais, com 19% de participação (quase o dobro da segunda colocada).',
    ],
    assumptions: [
      LAYOUT_NOTE_PAST,
      'O dado publicado é de processamento em litros por hora: assumimos garrafa de 1 L (1 L = 1 garrafa) para caber no simulador. Por isso o gargalo deste mapa é o pasteurizador, e não a enchedora.',
      'A matéria descreve suco feito de água e concentrado: a cadeia tem tanque de concentrado e misturador, e não tem carbonatador.',
    ],
    history: ['Use junto com o mapa "depois da nova linha": a diferença entre os dois é a melhoria real que a empresa fez.'],
    sources: [{ t: 'Exame (conteúdo patrocinado pela Tetra Pak): a tecnologia da Tetra Pak na Tial', u: 'https://exame.com/negocios/tecnologia-tetra-pak/' }],
    nodes: chain([['tanque_agua', 1], ['tanque_xarope', 1], ['misturador', 1], ['pasteurizador', 1, 5.5], ['enchedora', 1], ['esteira', 1], ['rotuladora', 2]]),
  },
  {
    key: 'tial', name: 'Tial · suco pronto DEPOIS da nova linha (37 mil L/h)',
    company: 'Tial (sucos prontos)', place: 'Visconde do Rio Branco (MG), Brasil',
    what: 'A mesma fábrica depois da nova linha de pasteurização, que pode chegar a 37 mil litros por hora e substitui as duas linhas antigas.', ratedBph: 37000, bottleneck: 'pasteurizador',
    price: PRICE.nectar1,
    revenueRef: { brl: 350_000_000, year: 2024, text: 'Receita de R$ 350 milhões em 2024 (Exame).' },
    facts: [
      'A nova linha de pasteurização da Tetra Pak (a água é purificada por radiação ultravioleta e filtração, e o concentrado é pasteurizado separadamente, antes da mistura) pode chegar a 37 mil litros por hora.',
      'Resultados informados: consumo de vapor 64,6% menor, uso de água 50% menor, perdas de produto no envase 92% menores e economia de 190 mil litros de concentrado por ano.',
      'O investimento inicial é cerca de 10% maior que o de um sistema convencional e o retorno esperado é em menos de um ano, pela economia de energia e insumos.',
    ],
    assumptions: [
      LAYOUT_NOTE_PAST,
      'Garrafa de 1 L assumida (1 L = 1 garrafa). O gargalo é o pasteurizador, como na matéria.',
      'A economia de vapor, de água e de perdas aparece na matéria, mas o simulador só calcula capacidade, risco e energia elétrica: esses ganhos NÃO entram no cálculo em reais daqui.',
      'A matéria é conteúdo patrocinado pelo fornecedor (Tetra Pak) e os números não foram verificados de forma independente.',
    ],
    history: ['A matéria não conta a fundação da empresa. Ela aparece como fabricante de sucos prontos de Minas Gerais, líder regional, e a modernização é apresentada como parte de um plano de ampliação da fábrica (até 67% numa primeira fase).'],
    sources: [{ t: 'Exame (conteúdo patrocinado pela Tetra Pak): a tecnologia da Tetra Pak na Tial', u: 'https://exame.com/negocios/tecnologia-tetra-pak/' }],
    nodes: chain([['tanque_agua', 3], ['tanque_xarope', 3], ['misturador', 3], ['pasteurizador', 3, 6.2], ['enchedora', 4], ['esteira', 3], ['rotuladora', 4]]),
  },
  {
    key: 'tannourine', name: 'Tannourine Water · linha Sidel (água mineral)',
    company: 'Société Libanaise des Sources des Eaux de Tannourine', place: 'Tannourine, Líbano',
    what: 'Água mineral natural em garrafas PET.', ratedBph: 31500,
    facts: [
      'A nova linha Sidel Matrix Combi, anunciada em 2014, tem capacidade de 31.500 garrafas por hora.',
      'A empresa vendia cerca de 150 milhões de litros de água por ano (Líbano, Oriente Médio, África Ocidental e Austrália).',
      'Em 2023 a própria empresa declarou capacidade de 90 mil garrafas/h na fábrica (não sabemos se soma outras linhas).',
    ],
    assumptions: [
      'Água mineral natural não leva xarope, mistura, pasteurização nem gás: a cadeia é só água, enchedora, esteira e rotuladora. Quantidades calculadas para sustentar 31.500/h.',
      'O tratamento da água e o sopro das garrafas não existem no catálogo: ficam de fora. O sistema avisa que a ligação "pula etapas" do processo se você refizer a conexão à mão.',
    ],
    history: [
      'A empresa é de 1978 e envasa água mineral da nascente na região de Tannourine, nas montanhas do Líbano (cerca de 1.250 m de altitude, segundo uma fonte).',
      'Em outubro de 2025 o Ministério da Saúde libanês suspendeu a produção por suspeita de contaminação; a empresa contestou e voltou a produzir. O episódio é contestado nas fontes.',
    ],
    sources: [
      { t: 'FoodNavigator: Tannourine amplia a produção com linha Sidel (31.500/h)', u: 'https://www.foodnavigator.com/Article/2015/01/12/Tannourine-Water-boosts-production-with-Sidel-bottling-line/' },
      { t: 'Sidel: Tannourine, Líbano', u: 'https://www.sidel.com/about/media/press-releases/tannourine-lebanon/' },
      { t: 'Missão econômica (Francofonia): ficha da empresa', u: 'https://missions-economiques.francophonie.org/mission-economique-2023-liban/en/partner/f06967b8-d856-ee11-9937-000d3a4cc0c5/societe-libanaise-des-sources-des-eaux-de-tannourine' },
    ],
    nodes: chain([['tanque_agua', 3], ['enchedora', 3, 175], ['esteira', 3], ['rotuladora', 3]]),
  },
];

export const REAL_BY_KEY: Record<string, RealCase> = Object.fromEntries(REAL_CASES.map((c) => [c.key, c]));
