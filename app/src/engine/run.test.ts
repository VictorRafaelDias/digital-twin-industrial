/* O relógio do Play: o total produzido não pode depender da velocidade escolhida (antes, em ×60 num Play curto, dava 0 garrafas). */
import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../data/catalog';
import { buildFromTemplate } from './factory';
import { advanceRun, computeArrivals, newRun } from './run';
import { simulate } from './simulate';
import type { RunState, SimContext } from '../types';

const catalog = buildCatalog();
const base = { catalog, ambient: 25, estop: false } as SimContext;

function play(key: string, speed: number, dur: number) {
  const f = buildFromTemplate(key, catalog, 1);
  let r: RunState = { ...newRun(speed, dur), active: true, arrivals: computeArrivals(f.nodes, f.edges), on: true };
  let ticks = 0;
  while (r.on && ticks < 100000) {
    ticks++;
    const s = advanceRun(r, f.nodes, f.edges, base);
    r = { ...r, t: s.t, produced: s.produced, kwh: s.kwh, queue: s.queue, announced: s.announced, lastK: s.lastK, on: !s.finished, finished: s.finished || r.finished };
  }
  return { r, f, ticks };
}

describe('Play: o total produzido não depende da velocidade', () => {
  it('30 min em ×60 não fecha mais em 0 e bate com ×1 e ×5', () => {
    const rapido = play('bebidas', 60, 30).r.produced;
    const medio = play('bebidas', 5, 30).r.produced;
    const lento = play('bebidas', 1, 30).r.produced;
    expect(rapido).toBeGreaterThan(1000);
    // o produto chega à última máquina no minuto 21: sobram 9 min a 11.400/h = 1.710 garrafas
    expect(lento).toBeGreaterThan(1500); expect(lento).toBeLessThan(1900);
    expect(Math.abs(rapido - lento) / lento).toBeLessThan(0.01);
    expect(Math.abs(medio - lento) / lento).toBeLessThan(0.01);
  });

  it('8 horas: o total é a produção por hora vezes o tempo, menos o tempo de o produto chegar (21 min)', () => {
    const { r, f } = play('bebidas', 60, 480);
    const porHora = simulate(f.nodes, f.edges, { ...base, run: undefined }).production;
    const esperado = porHora * ((480 - 21) / 60);
    expect(Math.abs(r.produced - esperado) / esperado).toBeLessThan(0.02);
  });

  it('o número de passos continua sendo duração ÷ (0,25 × velocidade)', () => {
    expect(play('bebidas', 60, 30).ticks).toBe(2);
    expect(play('bebidas', 20, 60).ticks).toBe(12);
    expect(play('suco', 5, 30).ticks).toBe(24);
  });

  it('energia e fila também acumulam em pedaços e dão o mesmo total em qualquer velocidade', () => {
    const a = play('bebidas', 60, 60).r, b = play('bebidas', 5, 60).r;
    expect(Math.abs(a.kwh - b.kwh) / b.kwh).toBeLessThan(0.02);
    const fila = (r: RunState) => Object.values(r.queue).reduce((x, y) => x + y, 0);
    expect(fila(b)).toBeGreaterThan(0);
    expect(Math.abs(fila(a) - fila(b)) / fila(b)).toBeLessThan(0.03);
  });

  it('passo no fim da simulação (mais curto que o normal) não conta tempo a mais', () => {
    const f = buildFromTemplate('bebidas', catalog, 1);
    const r: RunState = { ...newRun(60, 20), active: true, arrivals: computeArrivals(f.nodes, f.edges), on: true, t: 18 };
    const s = advanceRun(r, f.nodes, f.edges, base);
    expect(s.t).toBe(20);
    expect(s.finished).toBe(true);
    expect(s.produced).toBe(0);            // aos 20 min o produto ainda não chegou à última máquina (chega aos 21)
  });
});
