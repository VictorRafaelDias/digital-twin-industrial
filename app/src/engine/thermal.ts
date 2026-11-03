/* Temperatura estimada de cada máquina ("quanto ela está esquentando"). Porte de backend/app/engine/thermal.py.
   HIPÓTESE DIDÁTICA: o modelo original só tinha a temperatura do ambiente. Aqui a máquina fica no ambiente mais um aquecimento
   proporcional à carga em que trabalha, que cresce acima do ritmo ótimo. Câmara fria e tanques têm comportamento próprio. */
import type { FNode, MachineType, NodeResult } from '../types';

const RISE: Record<string, number> = { motor: 40, tank: 12, visc: 5, none: 15 }; // °C acima do ambiente a plena carga
const COLD_SET = 4;       // ponto de trabalho da câmara fria
const OVERHEAT = 1.5;     // máquina em falha: 1,5x o aquecimento máximo

const round1 = (x: number) => Math.round(x * 10) / 10;

export function machineTemp(t: MachineType, n: FNode, r: NodeResult, ambient: number): number {
  const qty = n.qty || 1;
  const cold = COLD_SET + 0.5 * Math.max(0, ambient - 20);
  if (n.off) return round1(t.heat === 'cold' ? cold : ambient);
  const load = t.cap ? Math.min(1.3, r.eff / (t.cap * qty)) : 0;
  const over = t.crit > t.opt ? Math.max(0, (n.value - t.opt) / (t.crit - t.opt)) : 0;
  const boost = 1 + 0.5 * Math.min(over, 1);
  if (t.heat === 'cold') return round1(cold + (r.state === 'falha' ? 10 * OVERHEAT : 10 * load * boost));
  const rise = RISE[t.heat] ?? 15;
  if (r.state === 'falha') return round1(ambient + rise * OVERHEAT);
  return round1(ambient + rise * load * boost);
}
