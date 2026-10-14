/** Formatação de números no padrão brasileiro. */
export const fmt = (n: number | null | undefined, d = 0): string =>
  Number(n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Valor de um ritmo (até 2 casas, sem zeros sobrando). */
export const fv = (v: number): string => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export const pad = (n: number): string => String(n).padStart(2, '0');

/** Relógio "hh:mm" a partir de minutos simulados. */
export const clock = (min: number): string => `${pad(Math.floor(min / 60))}:${pad(Math.floor(min % 60))}`;

/** Passo sugerido para os botões − e + de uma máquina. */
export const stepOf = (t: { min: number; max: number }): number => {
  const s = (t.max - t.min) / 100;
  return s >= 10 ? 10 : s >= 1 ? 1 : s >= 0.5 ? 0.5 : s >= 0.1 ? 0.1 : 0.05;
};
