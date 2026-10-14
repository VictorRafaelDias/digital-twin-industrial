import { useMemo } from 'react';
import { bottleneckReport } from '../engine/bottleneck';
import { bnName, simulate, troubleMaps } from '../engine/simulate';
import { useStore } from '../store/useStore';
import type { BnReport, SimContext, SimResult } from '../types';

/** Contexto de cálculo (catálogo, ambiente, emergência e, durante o play, o relógio). */
export function useSimCtx(withRun = true): SimContext {
  const catalog = useStore((s) => s.catalog);
  const ambient = useStore((s) => s.ambient);
  const estop = useStore((s) => s.estop);
  const runActive = useStore((s) => s.run.active);
  const runT = useStore((s) => s.run.t);
  const arrivals = useStore((s) => s.run.arrivals);
  return useMemo(() => ({ catalog, ambient, estop, run: withRun && runActive ? { active: true, t: runT, arrivals } : undefined }),
    [catalog, ambient, estop, withRun, runActive, runT, arrivals]);
}

/** Resultado da simulação do desenho atual. */
export function useSim(withRun = true): SimResult {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const ctx = useSimCtx(withRun);
  return useMemo(() => simulate(nodes, edges, ctx), [nodes, edges, ctx]);
}

export function useTrouble(sim: SimResult) {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  return useMemo(() => troubleMaps(sim, nodes, edges), [sim, nodes, edges]);
}

export function useBottleneck(): BnReport | null {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const ctx = useSimCtx(false);
  return useMemo(() => bottleneckReport(nodes, edges, ctx), [nodes, edges, ctx]);
}

export function useBnName(sim: SimResult): string {
  const nodes = useStore((s) => s.nodes);
  const catalog = useStore((s) => s.catalog);
  return bnName(sim, nodes, catalog);
}
