/* Gerado a partir do protótipo (frontend/prototipo/js) e mantido à mão a partir daqui. */
export interface GlossEntry { g: string; t: string; k: string[]; d: string }

export const GLOSS: GlossEntry[] = [
  {g:'Produção', t:'Gargalo', k:['gargalo'], d:'A máquina mais lenta da fábrica. Ela limita a produção de todas as outras, como o gargalo de uma garrafa limita a água que sai.'},
  {g:'Produção', t:'Ritmo', k:['ritmo'], d:'O “botão” principal da máquina: quanto líquido passa (vazão), quantas garrafas por minuto (cadência) ou quantas voltas por minuto (rotação). Depende da máquina.'},
  {g:'Produção', t:'Capacidade', k:['capacidade'], d:'Quantas garrafas por hora a máquina consegue entregar no ritmo em que está.'},
  {g:'Produção', t:'Saída real', k:['saída real'], d:'O que realmente sai da máquina. Pode ser menor que a capacidade se ela receber pouco produto da máquina anterior.'},
  {g:'Produção', t:'Vazão', k:['vazão'], d:'Quantidade de líquido que passa por hora (litros ou m³ por hora).'},
  {g:'Produção', t:'Cadência', k:['cadência'], d:'Quantas garrafas por minuto a máquina trabalha.'},
  {g:'Produção', t:'RPM', k:['RPM'], d:'Rotações por minuto: quantas voltas o eixo da máquina dá em um minuto.'},
  {g:'Produção', t:'gf (garrafas)', k:['gf'], d:'Abreviação de “garrafas”. “gf/h” = garrafas por hora; “gf/min” = garrafas por minuto.'},
  {g:'Produção', t:'m³ (metro cúbico)', k:['m³'], d:'Mil litros. Uma vazão de 8 m³/h são 8.000 litros por hora.'},
  {g:'Produção', t:'Eficiência (OEE)', k:['eficiência','OEE'], d:'Quanto a fábrica produz comparado com o máximo que ela faria com tudo no ponto ótimo. 100% = aproveitamento total.'},
  {g:'Produção', t:'Unidades em paralelo', k:['em paralelo','paralelo','paralelas'], d:'Usar mais de uma máquina igual lado a lado (ex.: 2 pasteurizadores) para somar a capacidade daquela etapa.'},
  {g:'Produção', t:'Fila', k:['fila'], d:'O excesso que uma máquina entrega além do que a seguinte aguenta. Fica parado esperando: nada some (ideia da conservação da massa).'},
  {g:'Produção', t:'Conservação da massa (Lavoisier)', k:['Lavoisier','conservação da massa'], d:'“Na natureza nada se cria, nada se perde, tudo se transforma.” No simulador: o que entra numa máquina sai dela ou fica parado na fila.'},
  {g:'Produção', t:'Efeito cascata', k:['cascata'], d:'Quando uma máquina com problema faz as seguintes sofrerem também. No quadro aparece como um rastro vermelho que vai enfraquecendo.'},
  {g:'Produção', t:'A montante / a jusante', k:['a montante','jusante'], d:'Montante = as máquinas que vêm antes (de onde o produto vem). Jusante = as que vêm depois.'},
  {g:'Produção', t:'Divisão e junção', k:['junção'], d:'Divisão: uma máquina alimenta várias iguais e o fluxo se reparte. Junção: várias entram numa só (ex.: água e xarope no misturador).'},
  {g:'Risco e física', t:'Ótimo', k:['ótimo'], d:'O ritmo em que a máquina trabalha bem, com pouco desgaste e risco baixo (cerca de 2%).'},
  {g:'Risco e física', t:'Atenção (alerta)', k:['atenção'], d:'Acima do ótimo: produz um pouco mais, mas o desgaste e o risco de quebra sobem (de 2% até 10%).'},
  {g:'Risco e física', t:'Zona crítica', k:['zona crítica','crítico'], d:'Faixa perto do limite da máquina (risco de 10% a 40%). Pequenas variações já podem fazer a máquina parar.'},
  {g:'Risco e física', t:'Falha', k:['falha'], d:'Passou do limite: a máquina para e tudo o que vem depois dela fica sem produto.'},
  {g:'Risco e física', t:'Risco de falha', k:['risco'], d:'Chance estimada de a máquina parar no ritmo atual. É uma estimativa didática do simulador, não uma medição.'},
  {g:'Risco e física', t:'Sobrecarga', k:['sobrecarga'], d:'Pedir à máquina mais do que ela foi feita para entregar. Gera calor, vibração e desgaste.'},
  {g:'Risco e física', t:'Cavitação', k:['cavitação'], d:'Bolhas que se formam dentro de uma bomba quando ela é forçada. Ao estourar, elas “mordem” e desgastam o metal.'},
  {g:'Risco e física', t:'Dilatação térmica', k:['dilatação','dilata'], d:'Materiais e líquidos aumentam de volume com o calor. Num tanque cheio isso eleva a pressão e reduz a margem de segurança.'},
  {g:'Risco e física', t:'Viscosidade', k:['viscosidade','grosso'], d:'O quanto um líquido é “grosso”. O xarope fica mais grosso no frio e escoa mais devagar.'},
  {g:'Risco e física', t:'Compressor', k:['compressor'], d:'Peça do sistema de frio que comprime o gás refrigerante. Em ambiente quente ele trabalha mais e rende menos.'},
  {g:'Energia e dinheiro', t:'kW e kWh', k:['kW','kWh'], d:'kW é a potência (quanta energia a máquina puxa a cada instante). kWh é a energia gasta: 1 kW ligado por 1 hora = 1 kWh, que é o que aparece na conta de luz.'},
  {g:'Energia e dinheiro', t:'Consumo parado (standby)', k:['standby','consumo parado'], d:'Mesmo sem trabalhar, a máquina ligada gasta energia. Nunca é zero.'},
  {g:'Energia e dinheiro', t:'Investimento estimado', k:['investimento','custo estimado'], d:'Quanto custaria comprar a máquina extra. É uma faixa de preço tirada de anúncios de fornecedores, não uma cotação.'},
  {g:'Processo de bebidas', t:'Pasteurização', k:['pasteuriza','pasteurização'], d:'Aquecer a bebida por pouco tempo para eliminar micro-organismos e ela durar mais. O suco natural não passa por isso.'},
  {g:'Processo de bebidas', t:'Carbonatação', k:['carbonatação','CO₂'], d:'Dissolver gás carbônico (CO₂) na bebida, como no refrigerante.'},
  {g:'Processo de bebidas', t:'Brix', k:['brix'], d:'Medida de açúcar da bebida (°Brix). Define a doçura.'},
  {g:'Processo de bebidas', t:'Envase', k:['envase'], d:'A etapa de colocar a bebida dentro das garrafas.'},
  {g:'Processo de bebidas', t:'Insumo', k:['insumo','insumos'], d:'Matéria-prima que entra na fábrica (água, açúcar, frutas…).'},
  {g:'Sistema', t:'Receita (Econômico, Padrão, Máximo seguro)', k:['receita'], d:'Ritmos prontos para uma máquina: Econômico (mais leve), Padrão (ótimo) e Máximo seguro (o limite da zona de atenção).'},
  {g:'Sistema', t:'Parada de emergência', k:['parada de emergência'], d:'O botão vermelho que para todas as máquinas de uma vez.'},
  {g:'Sistema', t:'Hipótese didática', k:['hipótese didática'], d:'Número escolhido para o simulador mostrar o efeito, sem vir de medição ou ficha técnica. Sempre vem com uma nota dizendo em que se baseia.'},
  {g:'Sistema', t:'Real × estimado', k:['estimado'], d:'“Real” = vem de uma fonte com link (ficha, artigo). “Estimado” = adaptado de uma fonte, mas não igual a ela.'}
];

/** curva de dilatação da água (EngineeringToolbox): [°C, coeficiente por °C] */
export const BETA_AGUA: [number, number][] = [[0, -0.00005], [4, 0], [10, 0.000088], [20, 0.000207], [30, 0.000303], [40, 0.000385], [50, 0.000457]];

export const HEAT_LABEL: Record<string, string> = {tank:'Tanque: o líquido dilata', motor:'Motor: esquenta', cold:'Frio: o compressor trabalha mais', visc:'Xarope: fica grosso no frio', none:'Sem efeito da temperatura'};
