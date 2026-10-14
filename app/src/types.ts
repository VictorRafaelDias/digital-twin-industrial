/* Tipos do domínio do Digital Twin Industrial. */

export type HeatKind = 'tank' | 'motor' | 'cold' | 'visc' | 'none';

export interface Ref { t: string; u: string; k?: 'real' | 'estimado' }

export interface Cost { min: number; max: number; note: string; refs: Ref[]; edited?: boolean }

/** Um tipo de máquina do catálogo (dado, não código: permite outros setores no futuro). */
export interface MachineType {
  name: string; stage: string; cat: string; icon: string;
  param: string; unit: string;
  min: number; max: number; opt: number; warn: number; crit: number;
  cap: number;           // garrafas/h no ritmo ótimo
  sb: number; vr: number; // consumo parado (kW) e variável (kW)
  desc: string; src: string | null; flow?: 'suco';
  rank: number | null; heat: HeatKind; multiIn?: boolean; end?: boolean;
  basis: string; refs: Ref[]; risk: string; cost: Cost;
}
export type Catalog = Record<string, MachineType>;

export interface TypeInfo { name: string; icon: string; desc: string; on?: boolean }
export interface ManualEntry { long: string; how: string; tips: string }
export interface GuideStep { id: string; title: string; img: string; what: string; does: string[]; tip: string }

/** Uma máquina colocada no quadro. */
export interface FNode { id: string; type: string; x: number; y: number; value: number; qty: number; off: boolean }
export interface FEdge { id: string; from: string; to: string }

export type MachineState = 'normal' | 'alerta' | 'critico' | 'falha' | 'desligada';

export interface NodeResult {
  cap: number; eff: number; inflow: number; queue: number; risk: number;
  state: MachineState; energy: number; waiting?: boolean;
}
export interface SimResult {
  res: Record<string, NodeResult>; production: number; bn: string | null; energy: number; maxRisk: number;
}

export interface RunInfo { active: boolean; t: number; arrivals: Record<string, number> }

/** Tudo o que o cálculo precisa além do desenho da fábrica. */
export interface SimContext { catalog: Catalog; ambient: number; estop: boolean; run?: RunInfo }

export type ConnectLevel = 'ok' | 'warn' | 'block';
export interface ConnectResult { ok: boolean; level: ConnectLevel; msg: string }

/** Mudança que um passo de plano ou opção de melhoria aplica numa máquina. */
export interface NodeChange { id: string; value: number; qty: number; off: boolean }

export type GoalType = 'pct' | 'abs' | 'risk';
export interface GoalInput { type: GoalType; value: number; more: boolean; over: boolean }
export interface PlanStep { what: string; why: string; cost?: { min: number; max: number } | null; risk?: number; opt?: boolean }
export interface Plan {
  ok: boolean; target: number; invest: { min: number; max: number }; g: GoalInput;
  before: { prod: number; risk: number; energy: number }; after: { prod: number; risk: number; energy: number };
  steps: PlanStep[]; changes: Record<string, NodeChange>; note: string;
}

export interface BnOption {
  key: string; title: string; detail: string; prod: number; gain: number; risk: number; next: string;
  cost: { min: number; max: number } | null; change: NodeChange & { label: string };
}
export interface BnReport { id: string; name: string; prod: number; why: string[]; options: BnOption[]; hasCost: boolean }

export interface WhatIfResult {
  id: string; name: string; n: number; before: number; after: number; risk: number;
  cost: { min: number; max: number } | null; capNew: number; next: string; enough: boolean; plan: Plan | null;
}

export interface LogEvent { time: string; text: string; kind: '' | 'ok' | 'warn' | 'bad' }

export interface RunState {
  on: boolean; active: boolean; speed: number; dur: number; t: number; produced: number; kwh: number;
  queue: Record<string, number>; arrivals: Record<string, number>; announced: Record<string, boolean>;
  finished: boolean; lastK: number;
}

export type ViewId = 'logic' | 'physical' | 'hmi' | 'dashboard' | 'guide' | 'manual' | 'glossary';
export type ToolId = 'select' | 'link' | 'trash';
export type SideTab = 'goal' | 'machine' | 'chat' | 'log';

/** Mensagem da aba Conversa. Guardamos dados, não HTML. */
export type ChatMsg =
  | { who: 'me'; text: string }
  | { who: 'ai'; kind: 'text'; text: string; cites?: Ref[] }
  | { who: 'ai'; kind: 'plan'; text: string; plan: Plan }
  | { who: 'ai'; kind: 'bottleneck'; report: BnReport | null };
