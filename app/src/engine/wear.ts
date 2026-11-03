/* Idade e manutenção das máquinas: o que a pessoa informa ao montar a fábrica e o efeito disso no rendimento, no risco e na temperatura.
   Porte de backend/app/engine/wear.py (o mesmo cálculo, conferido por testes de paridade).

   TUDO AQUI É HIPÓTESE DIDÁTICA: os percentuais mostram o efeito, não vêm de ficha de fabricante.
   A simulação NÃO gasta a máquina: a idade é um dado de entrada (padrão: nova, manutenção em dia). */
import type { FNode, MachineType } from '../types';

export const HORAS_USO_ANO = 4000;   // horas de trabalho por ano de uso (hipótese: cerca de 1,5 turno por dia)
const PERDA_IDADE = 0.2;             // no fim da vida útil a máquina entrega até 20% a menos
const PERDA_ATRASO = 0.05;           // manutenção muito atrasada tira mais até 5%
const RISCO_IDADE = 0.08;            // no fim da vida útil o risco base sobe até +8 pontos (curva quadrática)
const RISCO_ATRASO = 0.04;           // manutenção muito atrasada soma até +4 pontos
const FATOR_MINIMO = 0.7;            // trava de segurança (com as constantes acima a perda máxima é 25%)
const TEMP_IDADE = 8;                // no fim da vida útil esquenta até +8 °C (curva quadrática)
const TEMP_ATRASO = 4;               // manutenção muito atrasada soma até +4 °C
const VALOR_RESIDUAL = 0.1;          // depois da vida útil a máquina vale 10% do preço de nova

/** Vida útil e intervalo de manutenção por categoria (horas de uso). Iguais aos do banco (banco-de-dados/scripts/gerar_banco.py). */
export const LIFE_H_BY_CAT: Record<string, number> = { insumos: 60000, preparo: 40000, termico: 30000, envase: 25000, pos: 30000, frio: 35000 };
export const MAINT_H_BY_CAT: Record<string, number> = { insumos: 2000, preparo: 1500, termico: 1000, envase: 800, pos: 1000, frio: 1500 };

export const lifeHOf = (t: MachineType): number => t.lifeH ?? LIFE_H_BY_CAT[t.cat] ?? 30000;
export const maintHOf = (t: MachineType): number => t.maintH ?? MAINT_H_BY_CAT[t.cat] ?? 1000;

export type WearStatus = 'ok' | 'atencao' | 'manutencao_atrasada' | 'fim_de_vida';
export const STATUS_TEXT: Record<WearStatus, string> = {
  ok: 'Em dia',
  atencao: 'Perto da hora de fazer manutenção ou do fim da vida útil',
  manutencao_atrasada: 'Manutenção atrasada: rende menos e o risco é maior',
  fim_de_vida: 'Passou da vida útil: rende bem menos e o risco de falha é alto',
};
export const STATUS_SHORT: Record<WearStatus, string> = { ok: 'em dia', atencao: 'atenção', manutencao_atrasada: 'manutenção atrasada', fim_de_vida: 'fim de vida' };

export interface WearEffects {
  lifeUsed: number;            // fração da vida útil gasta (0 a 1,5 ou mais)
  overdue: number;             // 0 = em dia; 1 = atrasada em um intervalo inteiro (ou mais)
  cap: number;                 // multiplica a capacidade (1 = sem perda)
  risk: number;                // soma ao risco base (0 = sem efeito)
  temp: number;                // °C a mais
  status: WearStatus;
  hoursToMaintenance: number;  // negativo = já passou
  hoursOfLifeLeft: number;
  residual: number;            // quanto do preço de nova a máquina ainda vale (0,1 a 1)
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** (horas de desgaste, horas de desgaste na última manutenção) a partir da idade em anos e dos meses desde a manutenção.
 *  Os meses não passam da idade (uma máquina não fica mais tempo sem manutenção do que existe). */
export function hoursFromInputs(ageYears: number, maintMonths: number): [number, number] {
  const wear = Math.max(0, ageYears) * HORAS_USO_ANO;
  const since = Math.min(wear, (Math.max(0, maintMonths) * HORAS_USO_ANO) / 12);
  return [r1(wear), r1(wear - since)];
}

export function wearOf(wearH: number, maintAtH: number, lifeH: number, intervalH: number): WearEffects {
  const lifeUsed = Math.max(0, wearH / lifeH);
  const since = Math.max(0, wearH - maintAtH);
  const overdue = Math.max(0, (since - intervalH) / intervalH);
  const lu = Math.min(lifeUsed, 1), od = Math.min(overdue, 1);
  const status: WearStatus = lifeUsed >= 1 ? 'fim_de_vida' : since >= intervalH ? 'manutencao_atrasada' : since >= 0.8 * intervalH || lifeUsed >= 0.8 ? 'atencao' : 'ok';
  return {
    lifeUsed, overdue, status,
    cap: Math.max(FATOR_MINIMO, 1 - PERDA_IDADE * lu - PERDA_ATRASO * od),
    risk: RISCO_IDADE * lu ** 2 + RISCO_ATRASO * od,
    temp: TEMP_IDADE * lu ** 2 + TEMP_ATRASO * od,
    hoursToMaintenance: intervalH - since,
    hoursOfLifeLeft: Math.max(0, lifeH - wearH),
    residual: 1 - lu * (1 - VALOR_RESIDUAL),
  };
}

/** Efeitos de uma máquina de um tipo, dados a idade (anos) e os meses desde a última manutenção. */
export function wearEffects(t: MachineType, ageYears: number, maintMonths: number): WearEffects {
  const [w, m] = hoursFromInputs(ageYears, maintMonths);
  return wearOf(w, m, lifeHOf(t), maintHOf(t));
}

/** A máquina com os efeitos da idade já calculados (wearCap/wearRisk/wearTemp). Máquina nova e em dia fica sem esses campos (neutra). */
export function withWear(n: FNode, t: MachineType | undefined): FNode {
  const { wearCap: _c, wearRisk: _r, wearTemp: _t, ...rest } = n;
  void _c; void _r; void _t;
  if (!t || !((n.ageYears ?? 0) > 0)) return rest;
  const w = wearEffects(t, n.ageYears ?? 0, n.maintMonths ?? 0);
  return { ...rest, wearCap: w.cap, wearRisk: w.risk, wearTemp: w.temp };
}

/** Vida útil do tipo em anos (para mostrar na tela). */
export const lifeYears = (t: MachineType): number => lifeHOf(t) / HORAS_USO_ANO;
/** Intervalo de manutenção do tipo em meses. */
export const intervalMonths = (t: MachineType): number => (maintHOf(t) / HORAS_USO_ANO) * 12;
