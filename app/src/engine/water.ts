/* Dilatação da água (física real, tabela do EngineeringToolbox) usada na janela de temperatura do ambiente. */
import { BETA_AGUA } from '../data/glossary';

/** Coeficiente de dilatação volumétrica da água (por °C) interpolado na temperatura T. */
export function betaAt(T: number): number {
  for (let i = 1; i < BETA_AGUA.length; i++) {
    const [t1, b1] = BETA_AGUA[i - 1], [t2, b2] = BETA_AGUA[i];
    if (T <= t2) return b1 + ((b2 - b1) * (T - t1)) / (t2 - t1);
  }
  return BETA_AGUA[BETA_AGUA.length - 1][1];
}

/** Litros a mais (ou a menos) que `liters` de água ocupam a T °C em relação a 20 °C. */
export const waterExpansionL = (T: number, liters = 1000): number =>
  liters * ((betaAt(20) + betaAt(T)) / 2) * (T - 20);
