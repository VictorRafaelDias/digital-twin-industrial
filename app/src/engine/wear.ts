/* Idade e manutenção das máquinas: o que a pessoa informa ao montar a fábrica e o efeito disso no rendimento, no risco e na temperatura.
   Porte de backend/app/engine/wear.py (o mesmo cálculo, conferido por testes de paridade).

   TUDO AQUI É HIPÓTESE DIDÁTICA: os percentuais mostram o efeito, não vêm de ficha de fabricante.
   A simulação NÃO gasta a máquina: a idade e a data da última manutenção são dados de entrada (padrão: nova, manutenção em dia). */
import type { FNode, MachineType } from '../types';

export const HORAS_USO_ANO = 4000;   // horas de trabalho por ano de uso (hipótese: cerca de 1,5 turno por dia)
export const DIAS_ANO = 365.25;
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
/** Intervalo entre manutenções: 1.000 h de uso = 3 meses e 2.000 h = 6 meses de calendário (ver docs/manutencao-intervalos.md). */
export const MAINT_H_BY_CAT: Record<string, number> = { insumos: 2000, preparo: 2000, termico: 1000, envase: 1000, pos: 1000, frio: 2000 };

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

/** Hoje, como AAAA-MM-DD (data do computador de quem usa). */
export function todayISO(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Dias desde a data da última manutenção. Sem data (não informada) ou data inválida ou no futuro: 0, a máquina conta como em dia. */
export function daysSince(iso: string | undefined, now: Date = new Date()): number {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  if (!m) return 0;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((hoje.getTime() - d.getTime()) / 86400000));
}

/** (horas de desgaste, horas de desgaste na última manutenção) a partir da idade em anos e dos dias desde a última manutenção.
 *  Os dias não passam da idade (a máquina não ficou mais tempo sem manutenção do que existe). */
export function hoursFromInputs(ageYears: number, daysSinceMaint: number): [number, number] {
  const wear = Math.max(0, ageYears) * HORAS_USO_ANO;
  const since = Math.min(wear, (Math.max(0, daysSinceMaint) * HORAS_USO_ANO) / DIAS_ANO);
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

/** Efeitos de uma máquina de um tipo, dados a idade (anos) e os dias desde a última manutenção. */
export function wearEffects(t: MachineType, ageYears: number, daysSinceMaint: number): WearEffects {
  const [w, m] = hoursFromInputs(ageYears, daysSinceMaint);
  return wearOf(w, m, lifeHOf(t), maintHOf(t));
}

/** A máquina com os efeitos da idade já calculados (wearCap/wearRisk/wearTemp). Máquina nova e em dia fica sem esses campos (neutra). */
export function withWear(n: FNode, t: MachineType | undefined, now: Date = new Date()): FNode {
  const { wearCap: _c, wearRisk: _r, wearTemp: _t, ...rest } = n;
  void _c; void _r; void _t;
  if (!t || !((n.ageYears ?? 0) > 0)) return rest;
  const w = wearEffects(t, n.ageYears ?? 0, daysSince(n.maintDate, now));
  return { ...rest, wearCap: w.cap, wearRisk: w.risk, wearTemp: w.temp };
}

/** Vida útil do tipo em anos (para mostrar na tela). */
export const lifeYears = (t: MachineType): number => lifeHOf(t) / HORAS_USO_ANO;
/** Intervalo de manutenção do tipo em meses. */
export const intervalMonths = (t: MachineType): number => (maintHOf(t) / HORAS_USO_ANO) * 12;
/** Dias em meses, para mostrar na tela. */
export const monthsOfDays = (days: number): number => days / (DIAS_ANO / 12);
/** A data (AAAA-MM-DD) como dd/mm/aaaa. */
export const brDate = (iso: string): string => iso.split('-').reverse().join('/');
/** Texto curto do tempo sem manutenção: "hoje", "12 dias", "3 meses", "2 anos e 1 mês". */
export function sinceText(days: number): string {
  if (days < 1) return 'hoje';
  if (days < 60) return `${Math.round(days)} dia${Math.round(days) === 1 ? '' : 's'}`;
  const m = monthsOfDays(days);
  if (m < 24) return `${Math.round(m)} meses`;
  const anos = Math.floor(m / 12), resto = Math.round(m - anos * 12);
  return `${anos} anos${resto ? ` e ${resto} ${resto === 1 ? 'mês' : 'meses'}` : ''}`;
}
