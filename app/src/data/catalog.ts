/* Gerado a partir do protótipo (frontend/prototipo/js) e mantido à mão a partir daqui. */
import type { Catalog, HeatKind, MachineType, Ref } from '../types';

export const LINK: Record<string, Ref> = {
  kronesVFJ:{t:'Krones Modulfill VFJ (página do fabricante)', u:'https://www.krones.com/en/products/machines/modulfill-vfj-water.php', k:'real'},
  kronesContiroll:{t:'Krones Contiroll (página do fabricante)', u:'https://www.krones.com/en/products/machines/wrap-around-reel-fed-labelling.php', k:'estimado'},
  tpPast:{t:'Tetra Pak Pasteurizer BF (ficha técnica)', u:'https://www.tetrapak.com/en-us/solutions/integrated-solutions-equipment/processing-equipment/pasteurization/tetra-pak-pasteurizer-bf', k:'real'},
  tpBlender:{t:'Tetra Pak In-line Blender B (ficha técnica)', u:'https://www.tetrapak.com/en-us/solutions/processing/main-technology-area/blending/in-line-blender-b', k:'real'},
  tpCarbo:{t:'Tetra Pak — blender com carbonatação', u:'https://www.tetrapak.com/solutions/processing/main-technology-area/carbonization/tetra-alblend-carboblender', k:'real'},
  tpBlending:{t:'Tetra Pak — blending (xarope e água)', u:'https://www.tetrapak.com/solutions/integrated-solutions-equipment/processing-equipment/blending', k:'estimado'},
  osterroth:{t:'Osterroth & Voigt (2021), artigo científico sobre consumo de energia', u:'https://doi.org/10.3390/su13179880', k:'real'},
  dorner:{t:'Dorner — esteiras para envase', u:'https://www.dornerconveyors.com/industries/canning-bottling', k:'estimado'},
  asm:{t:'Alimentos Sem Mitos — suco de laranja industrializado', u:'https://alimentossemmitos.com.br/informacao-muda-percepcao-de-consumidores-sobre-suco-de-laranja-industrializado', k:'estimado'},
  ital:{t:'ITAL/SP — sucos industrializados', u:'https://ital.agricultura.sp.gov.br/sucos/17/', k:'estimado'},
  rg:{t:'ResearchGate — vida útil de suco fresco não pasteurizado', u:'https://www.researchgate.net/publication/230061467_Shelf_Life_and_Quality_of_Freshly_Squeezed_Unpasteurized_Polyethylene-Bottled_Citrus_Juice', k:'estimado'},
  raw:{t:'Raw Juicery — suco pasteurizado × não pasteurizado', u:'https://rawjuicery.com/blogs/articles/pasteurized-vs-unpasteurized-juice', k:'estimado'}
} as Record<string, Ref>;
const JUICE_REFS: Ref[] = [LINK.asm, LINK.ital, LINK.rg, LINK.raw];
const JUICE_BASIS: string = 'Hipótese didática para uma operação pequena de suco natural. O fluxo (sem pasteurização e com frio crítico) tem apoio nas fontes abaixo; os números desta máquina, não.';

/** Máquinas do catálogo (mesmos números de backend/app/catalog.py). `desc` = explicação em palavras simples. */
const BASE: Record<string, Omit<MachineType, 'rank' | 'heat' | 'basis' | 'refs' | 'risk' | 'cost'>> = {
  tanque_agua:   {name:'Tanque de água',      stage:'Insumos',            cat:'insumos', icon:'tank',    param:'Vazão de saída',   unit:'m³/h', min:2,   max:12,   opt:8,    warn:10,   crit:11.5, cap:16000, sb:0.2,  vr:0.8,  desc:'Guarda a água usada na bebida. A vazão é quanto de água sai por hora.', src:null},
  tanque_xarope: {name:'Tanque de xarope',    stage:'Preparo',            cat:'preparo', icon:'tank',    param:'Dosagem',          unit:'L/h',  min:400, max:1600, opt:1200, warn:1450, crit:1550, cap:14400, sb:0.3,  vr:1.0,  desc:'Guarda o xarope (açúcar e sabor). A dosagem é quanto xarope sai por hora.', src:null},
  misturador:    {name:'Misturador',          stage:'Preparo',            cat:'preparo', icon:'mixer',   param:'Rotação',          unit:'RPM',  min:30,  max:90,   opt:60,   warn:75,   crit:85,   cap:15000, sb:0.5,  vr:2.5,  desc:'Mistura a água com o xarope. Girar mais rápido mistura mais, mas desgasta mais.', src:'Tetra Pak In-line Blender B (ficha técnica)'},
  pasteurizador: {name:'Pasteurizador',       stage:'Tratamento térmico', cat:'termico', icon:'pasteur', param:'Vazão',            unit:'m³/h', min:3,   max:9,    opt:6.5,  warn:7.5,  crit:8.5,  cap:13000, sb:1.0,  vr:6.0,  desc:'Aquece a bebida para eliminar micro-organismos. A vazão é quanto líquido passa por hora.', src:'Tetra Pak Pasteurizer BF (ficha técnica)'},
  carbonatador:  {name:'Carbonatador',        stage:'Carbonatação',       cat:'termico', icon:'carbon',  param:'Vazão',            unit:'m³/h', min:3,   max:9,    opt:7,    warn:8,    crit:8.8,  cap:14000, sb:0.5,  vr:1.5,  desc:'Coloca gás (CO₂) na bebida, como no refrigerante.', src:'Tetra Pak In-line Blender B (ficha técnica)'},
  enchedora:     {name:'Enchedora',           stage:'Envase',             cat:'envase',  icon:'filler',  param:'Cadência',         unit:'gf/min',min:100,max:260,  opt:200,  warn:225,  crit:245,  cap:12000, sb:2.02, vr:0.53, desc:'Coloca a bebida dentro das garrafas. A cadência é quantas garrafas por minuto.', src:'Krones Modulfill VFJ (catálogo) · Osterroth & Voigt, 2021'},
  esteira:       {name:'Esteira',             stage:'Transporte',         cat:'pos',     icon:'conveyor',param:'Velocidade',       unit:'m/s',  min:0.2, max:1.2,  opt:0.8,  warn:1.0,  crit:1.15, cap:15000, sb:0.3,  vr:1.2,  desc:'Leva as garrafas de uma máquina para a outra.', src:null},
  rotuladora:    {name:'Rotuladora',          stage:'Pós-envase',         cat:'pos',     icon:'label',   param:'Cadência',         unit:'gf/min',min:100,max:260,  opt:190,  warn:225,  crit:245,  cap:11400, sb:4.11, vr:2.52, desc:'Cola o rótulo nas garrafas. A cadência é quantas garrafas por minuto.', src:'Krones Contiroll (página do fabricante) · Osterroth & Voigt, 2021'},
  recepcao_fruta:{name:'Recepção de laranjas',stage:'Insumos',            cat:'insumos', icon:'truck',   param:'Taxa de recepção', unit:'kg/h', min:100, max:800,  opt:500,  warn:650,  crit:750,  cap:1400,  sb:0.3,  vr:1.5,  desc:'Recebe as laranjas que chegam à fábrica.', src:null, flow:'suco'},
  lavadora_frutas:{name:'Lavadora de frutas', stage:'Preparo',            cat:'preparo', icon:'drop',    param:'Vazão de lavagem', unit:'kg/h', min:100, max:900,  opt:550,  warn:700,  crit:800,  cap:1450,  sb:0.4,  vr:2.0,  desc:'Lava e higieniza as laranjas antes de espremer.', src:null, flow:'suco'},
  extratora:     {name:'Extratora',           stage:'Extração',           cat:'preparo', icon:'juicer',  param:'Velocidade',       unit:'RPM',  min:100, max:500,  opt:320,  warn:400,  crit:460,  cap:1300,  sb:0.6,  vr:3.5,  desc:'Espreme as laranjas e separa o suco.', src:null, flow:'suco'},
  filtro_despolpadeira:{name:'Filtro/despolpadeira',stage:'Filtragem',    cat:'preparo', icon:'filter',  param:'Vazão de filtragem',unit:'L/h', min:80,  max:700,  opt:420,  warn:550,  crit:630,  cap:1350,  sb:0.3,  vr:1.8,  desc:'Tira bagaço e sementes do suco.', src:null, flow:'suco'},
  envasadora_suco:{name:'Envasadora de suco', stage:'Envase',             cat:'envase',  icon:'filler',  param:'Cadência',         unit:'gf/min',min:8,  max:40,   opt:20,   warn:26,   crit:32,   cap:1200,  sb:0.5,  vr:2.0,  desc:'Coloca o suco nas garrafas.', src:null, flow:'suco'},
  camara_fria:   {name:'Câmara fria',         stage:'Refrigeração',       cat:'frio',    icon:'fridge',  param:'Vazão de resfriamento',unit:'gf/h',min:200,max:1600,opt:1200,warn:1400,crit:1550,cap:1200, sb:1.2,  vr:3.0,  desc:'Guarda o suco gelado. Sem pasteurização, é o frio que mantém o suco seguro.', src:null, flow:'suco'}
};

/** rank = posição no processo (null = pode ficar entre quaisquer etapas) · heat = como reage ao calor/frio */
interface Meta { rank: number | null; heat: HeatKind; multiIn?: boolean; end?: boolean; basis: string; refs: Ref[]; risk: string }
const META: Record<string, Meta> = {
  tanque_agua:{rank:0, heat:'tank', basis:'Valores didáticos, escolhidos para uma linha de cerca de 12 mil garrafas/h. Não vêm de ficha de fabricante.', refs:[],
    risk:'Vazão acima do limite sobrecarrega a bomba e as tubulações (pressão alta) e pode causar vazamento ou transbordamento do tanque.'},
  tanque_xarope:{rank:1, heat:'visc', basis:'Didático. Proporção de referência: 1 parte de xarope para 3 a 6 de água (Tetra Pak, blending — a conferir).', refs:[LINK.tpBlending],
    risk:'Dosagem forçada pode causar cavitação na bomba (bolhas que desgastam o metal) e dosar errado, mudando o sabor.'},
  misturador:{rank:2, heat:'motor', multiIn:true, basis:'Capacidade didática. Para comparação: o In-line Blender B da Tetra Pak (20 a 60 mil L/h, ficha real) é bem maior que a nossa linha.', refs:[LINK.tpBlender],
    risk:'Rotação alta aumenta a vibração e a sobrecarga do motor: ele superaquece, eixo e rolamentos se desgastam e pode travar.'},
  pasteurizador:{rank:4, heat:'none', basis:'Didático. Para comparação: o Pasteurizer BF da Tetra Pak faz 3.000 a 55.000 L/h (ficha real). Os limites de risco são hipótese nossa.', refs:[LINK.tpPast],
    risk:'Vazão alta passa o líquido rápido demais pelo calor (tratamento incompleto) e força bombas e trocador de calor. Pressão ou temperatura fora da faixa podem parar a linha.'},
  carbonatador:{rank:5, heat:'none', basis:'Didático. O equipamento de referência (Tetra Pak) mistura e carbonata. Pressões e limites são hipótese.', refs:[LINK.tpCarbo],
    risk:'Pressão de CO₂ acima do limite pode estourar tubulação ou garrafa; abaixo dela, a bebida fica sem gás.'},
  enchedora:{rank:6, heat:'motor', basis:'Consumo de energia calculado a partir de dado real medido (Osterroth & Voigt, 2021) e adaptado à nossa escala. Capacidade e limites: didáticos (referência: Krones Modulfill VFJ, até 81.000 garrafas/h).', refs:[LINK.kronesVFJ, LINK.osterroth],
    risk:'Cadência alta aumenta a vibração e o desgaste das válvulas; pode derramar produto ou falhar na hora de encher.'},
  esteira:{rank:null, heat:'motor', basis:'Didático. Referências de mercado: Dorner e Krones; sem dados de consumo.', refs:[LINK.dorner],
    risk:'Velocidade ou corrente alta superaquece o motor e pode derrubar ou prender garrafas.'},
  rotuladora:{rank:8, heat:'motor', basis:'Energia a partir do artigo científico (adaptada à nossa escala). Capacidade de referência: Krones Contiroll (3.000 a 36.000/h na versão padrão — a confirmar).', refs:[LINK.kronesContiroll, LINK.osterroth],
    risk:'Cadência alta desalinha o rótulo, superaquece o motor e pode travar a máquina.'},
  recepcao_fruta:{rank:0, heat:'none', basis:JUICE_BASIS, refs:JUICE_REFS,
    risk:'Receber além do limite entope as esteiras e acumula fruta, que estraga.'},
  lavadora_frutas:{rank:1, heat:'none', basis:JUICE_BASIS, refs:JUICE_REFS,
    risk:'Passar fruta rápido demais lava mal (risco de higiene) e sobrecarrega o motor.'},
  extratora:{rank:2, heat:'motor', basis:JUICE_BASIS, refs:JUICE_REFS,
    risk:'Rotação alta sobrecarrega o motor e as lâminas, reduz o rendimento de suco e pode quebrar peças.'},
  filtro_despolpadeira:{rank:3, heat:'none', basis:JUICE_BASIS, refs:JUICE_REFS,
    risk:'Vazão acima do limite entope o filtro e aumenta a pressão, podendo romper a tela.'},
  envasadora_suco:{rank:6, heat:'motor', basis:JUICE_BASIS, refs:JUICE_REFS,
    risk:'Cadência alta derrama suco, enche pela metade e aumenta o risco de contaminação.'},
  camara_fria:{rank:9, heat:'cold', end:true, basis:JUICE_BASIS, refs:JUICE_REFS,
    risk:'Carga acima do limite faz o compressor trabalhar demais: a temperatura sobe e o suco, que não é pasteurizado, fica inseguro.'}
};

export const HEAT_INFO: Record<HeatKind, { n: string; f: string }> = {
  tank:{n:'Líquidos dilatam com o calor (a água, cerca de 0,02% por °C). Num tanque cheio isso aumenta a pressão e reduz o volume que dá para usar com segurança.', f:'perde cerca de 0,4% de capacidade por °C acima de 25 °C'},
  motor:{n:'Motores esquentam mais em ambiente quente e precisam trabalhar mais leves para não superaquecer.', f:'perde cerca de 0,5% de capacidade por °C acima de 30 °C'},
  cold:{n:'Em ambiente quente o compressor do frio trabalha mais e rende menos.', f:'perde cerca de 1,5% de capacidade por °C acima de 25 °C'},
  visc:{n:'O xarope fica mais grosso no frio e escoa mais devagar.', f:'perde cerca de 0,5% de capacidade por °C abaixo de 15 °C'},
  none:{n:'Sem efeito relevante da temperatura ambiente neste modelo.', f:'não muda com o ambiente'}
};

const PR: Record<string, Ref> = {
  gwkent:{t:'GW Kent — tanque misturador de 1.000 L em inox (US$ 4.995)', u:'https://www.gwkent.com/mixing-blending-tank-1000-l-265-gal.html'},
  past1:{t:'TradeIndia — pasteurizador flash pequeno (35 L, US$ 4.000)', u:'https://www.tradeindia.com/products/small-juice-flash-pasteurizer-3735975.html'},
  past2:{t:'IndiaMART — pasteurizador de suco de 1.000 L/h', u:'https://m.indiamart.com/proddetail/juice-pasteurizer-machine-pasteurizer-machine-for-juice-22062476288.html'},
  carb1:{t:'BrewBids — carbonatador em linha Padovan, novo (US$ 29.950)', u:'https://brewbids.com/?p=58539'},
  carb2:{t:'SIBA — carbonatador Carbotech 500 (£ 4.500 usado; £ 9.000 novo)', u:'https://siba.co.uk/awpcp/show-ad/?id=49149'},
  fill1:{t:'Zonesun ZS-CF4 — enchedora isobárica de 4 bicos (US$ 6.980)', u:'https://zonesunautopack.com/products/zs-cf4-carbonated-drinks-liquid-filling-machine'},
  fill2:{t:'Exapro — ICS multiFILL de 6.000 garrafas/h, usada (preço sob consulta)', u:'https://www.exapro.com/ics-multifill-960-24-240-6kk-6sv-p251028072/'},
  fill3:{t:'Zonesun ZS-CFC4 — enchedora e tampadora, 800 garrafas/h (US$ 51.999)', u:'https://www.zonesuntech.com/products/automatic-4-heads-beer-soda-carbonated-drinks-glass-bottle-crown-caps-bottling-isobaric-filling-capping-machine'},
  belt:{t:'MROSupply — correia modular plástica (US$ 47 a 89 por pé, só a correia)', u:'https://www.mrosupply.com/products/2778890/as-markdown/'},
  label:{t:'Zonesun ZS-STB150 — rotuladora de luva, até 150 garrafas/min (US$ 11.999)', u:'https://zonesunautopack.com/products/zs-stb150-bottle-sleeving-and-shrinking-labeling-machine'},
  juicer:{t:'Zanduco — extratora Omcan Citrus Max, 20 laranjas/min (US$ 2.030)', u:'https://www.zanduco.com/us/omcan-citrus-max-orange-juice-extractor-20-oranges-per-minute-stainless-steel.html'},
  pulper:{t:'Zonesun ZS-ZJ02 — despolpadeira de 0,5 a 2,5 t/h (US$ 11.300)', u:'https://www.zonesunautopack.com/ja/products/zonesun-zs-zj02-double-stage-fruit-vegetable-pulping-machine'},
  cold:{t:'UNICEF — câmaras frias de 10 a 40 m³ (US$ 14 mil a 31 mil)', u:'https://supply.unicef.org/all-materials/cold-chain-equipment/cold-freezer-rooms.html?p=3'}
};
const COST: Record<string, { min: number; max: number; note: string; refs: Ref[] }> = {
  tanque_agua:{min:20000, max:80000, note:'Um tanque inox de 1.000 L custa de US$ 1,7 mil (usado) a US$ 5–7 mil (novo). Para 12 m³/h precisamos de tanque e bomba bem maiores: a faixa é uma estimativa por escala.', refs:[PR.gwkent]},
  tanque_xarope:{min:20000, max:80000, note:'Mesma base do tanque de água (tanque inox com agitador: US$ 2,5 a 7 mil por 1.000 L). Estimativa por escala.', refs:[PR.gwkent]},
  misturador:{min:30000, max:150000, note:'Tanque misturador de 1.000 L com agitador: US$ 2,5 a 7 mil. Um misturador contínuo com dosagem custa bem mais; faixa estimada.', refs:[PR.gwkent]},
  pasteurizador:{min:150000, max:600000, note:'Só achei anúncios de porte pequeno (35 L por US$ 4 mil; 1.000 L/h por ~US$ 3,5 mil). Para 13 mil L/h a faixa é estimada por escala. Peça cotação.', refs:[PR.past1, PR.past2]},
  carbonatador:{min:60000, max:200000, note:'Carbonatador em linha: US$ 29,95 mil novo (Padovan) e £ 4,5 mil usado (Carbotech 500, 500 L/h, £ 9 mil novo). Fabricantes grandes não publicam preço.', refs:[PR.carb1, PR.carb2]},
  enchedora:{min:1500000, max:4000000, note:'Enchedoras pequenas: US$ 7 mil (240–400 garrafas/h) a US$ 52 mil (800/h, com tampadora). Uma de 12 mil/h é de outra escala (a de 6.000/h usada tem preço sob consulta). Faixa estimada.', refs:[PR.fill1, PR.fill3, PR.fill2]},
  esteira:{min:20000, max:80000, note:'Só a correia modular custa US$ 144 a 270 por metro. Com motor, estrutura e instalação de uma linha, estimamos esta faixa.', refs:[PR.belt]},
  rotuladora:{min:40000, max:140000, note:'Rotuladoras de luva termo-encolhível: US$ 7 mil a 25 mil (até 100–150 garrafas/min).', refs:[PR.label]},
  recepcao_fruta:{min:20000, max:80000, note:'Sem preço encontrado: estimativa por analogia com esteiras e moegas de recebimento.', refs:[]},
  lavadora_frutas:{min:25000, max:60000, note:'Anúncios de lavadoras de bolhas ficam entre US$ 4,5 mil e 6 mil (300 a 5.000 kg/h), em sites de revenda: fonte fraca, sem link confiável.', refs:[]},
  extratora:{min:150000, max:600000, note:'Extratoras comerciais pequenas custam US$ 0,5 a 2 mil (20–25 laranjas/min). Uma industrial de 1,3 t/h é de outra escala: estimativa.', refs:[PR.juicer]},
  filtro_despolpadeira:{min:20000, max:80000, note:'Despolpadeiras de 0,5 a 2,5 t/h: de ~US$ 1 mil a US$ 11 mil.', refs:[PR.pulper]},
  envasadora_suco:{min:200000, max:500000, note:'Enchedora de 4 bicos com tampadora a ~800 garrafas/h: US$ 52 mil (≈ R$ 286 mil).', refs:[PR.fill3]},
  camara_fria:{min:120000, max:250000, note:'Câmaras frias de 10 a 40 m³: US$ 14 mil a 31 mil (cerca de US$ 580 a 1.400 por m³), em compras de vacinas (UNICEF), que costumam ser mais caras que as comerciais.', refs:[PR.cold]}
};

export const RISK_INFO: { what: string; zones: string[][]; physics: string[] } = {
  what:'O risco de falha é a <b>chance estimada de a máquina parar</b> por causa do ritmo em que ela está trabalhando. Não é uma medição: é uma estimativa didática do simulador.',
  zones:[['No ótimo','2%','Máquina trabalhando como foi projetada.'],['Atenção (acima do ótimo)','2% a 10%','Produz um pouco mais, mas o desgaste e o aquecimento aumentam.'],['Zona crítica','10% a 40%','Perto do limite: pequenas variações já podem causar parada.'],['Falha','100%','Passou do limite: a máquina para e tudo depois dela fica sem produto.']],
  physics:['<b>Sobrecarga</b>: pedir mais do que o motor ou a bomba foram feitos para entregar.','<b>Superaquecimento</b>: mais trabalho gera mais calor; passando de certo ponto, o equipamento se danifica.','<b>Vibração e desgaste</b>: rolamentos, eixos e válvulas se desgastam mais rápido em alta velocidade.','<b>Pressão</b>: em tubulações e vasos, pressão acima do limite pode causar vazamento ou estouro.']
};

/** Catálogo inicial: cada tela recebe uma cópia (as Configurações podem editar limites, tipos e preços). */
export function buildCatalog(): Catalog {
  const out: Catalog = {};
  Object.entries(BASE).forEach(([k, b]) => {
    const m = META[k]; const c = COST[k];
    out[k] = { ...b, ...m, cost: { ...c, refs: [...c.refs] } };
  });
  return out;
}
