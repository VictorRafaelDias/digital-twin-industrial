import { beforeEach, describe, expect, it } from 'vitest';
import { simulate } from '../engine/simulate';
import { useStore } from './useStore';

const st = () => useStore.getState();
const find = (type: string) => st().nodes.find((n) => n.type === type)!;
const production = () => { const s = st(); return simulate(s.nodes, s.edges, { ...s.simCtx(), run: undefined }).production; };

describe('estado do front-end', () => {
  beforeEach(() => { useStore.setState({ nodes: [], edges: [], undoStack: [], redoStack: [], events: [], ambient: 25, estop: false, goalPlan: null }); st().loadTemplate('bebidas'); });

  it('carrega o exemplo e registra no histórico', () => {
    expect(st().nodes).toHaveLength(8);
    expect(st().edges).toHaveLength(7);
    expect(st().events[0].text).toContain('Exemplo carregado');
  });

  it('mudar o ritmo recalcula a produção e dá para desfazer e refazer', () => {
    const e = find('enchedora'); const before = production();
    st().commitValue(e.id, 225);
    expect(production()).toBeGreaterThanOrEqual(before);
    st().commitValue(e.id, 245); // falha
    expect(production()).toBe(0);
    st().undo();
    expect(find('enchedora').value).toBe(225);
    st().redo();
    expect(find('enchedora').value).toBe(245);
  });

  it('a ferramenta Conectar respeita as regras e liga máquinas válidas', () => {
    st().setTool('link');
    st().nodeClick(find('misturador').id);
    st().nodeClick(find('esteira').id);
    expect(st().toast).toContain('Não pode ligar');
    expect(st().edges).toHaveLength(7);
    // remove uma ligação e refaz a mesma (permitida)
    const edge = st().edges.find((e) => e.from === find('misturador').id)!;
    st().removeEdge(edge.id);
    st().setTool('link');
    st().nodeClick(find('misturador').id);
    st().nodeClick(find('pasteurizador').id);
    expect(st().edges).toHaveLength(7);
  });

  it('aplicar o plano de objetivo muda a fábrica', () => {
    st().planGoalNow();
    const plan = st().goalPlan!;
    expect(plan.ok).toBe(true);
    const before = production();
    st().applyPlan(plan);
    expect(production()).toBeGreaterThan(before);
    expect(st().goalPlan).toBeNull();
  });

  it('o play avança o relógio, acumula garrafas e termina com a janela de resultado', () => {
    st().setRunSpeed(60);
    st().startOrToggleRun();
    expect(st().run.on).toBe(true);
    for (let i = 0; i < 400 && st().run.on; i++) st().tickRun();
    expect(st().run.finished).toBe(true);
    expect(st().run.produced).toBeGreaterThan(0);
    expect(st().modal).toBe('runresult');
  });

  it('a parada de emergência zera a produção', () => {
    st().toggleEstop();
    expect(production()).toBe(0);
    st().toggleEstop();
    expect(production()).toBeGreaterThan(0);
  });
});
