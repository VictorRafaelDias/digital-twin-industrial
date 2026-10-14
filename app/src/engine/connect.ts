/* Regras de conexão: o que pode ser ligado em quê, e que tipo de conexão resulta. */
import type { Catalog, ConnectResult, FEdge, FNode } from '../types';

/** Existe caminho de `from` até `to`? (usado para impedir ciclos) */
export function reach(from: string, to: string, edges: FEdge[]): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const x = stack.pop() as string;
    if (x === to) return true;
    if (seen.has(x)) continue;
    seen.add(x);
    edges.filter((e) => e.from === x).forEach((e) => stack.push(e.to));
  }
  return false;
}

export type EdgeKind = 'direta' | 'divisão' | 'junção';

/** Direta (uma liga uma), divisão (uma alimenta várias iguais) ou junção (várias entram numa só). */
export function edgeKind(e: FEdge, edges: FEdge[]): EdgeKind {
  const outs = edges.filter((x) => x.from === e.from).length;
  const ins = edges.filter((x) => x.to === e.to).length;
  return outs > 1 ? 'divisão' : ins > 1 ? 'junção' : 'direta';
}

export function canConnect(a: string, b: string, nodes: FNode[], edges: FEdge[], catalog: Catalog): ConnectResult {
  const A = nodes.find((n) => n.id === a);
  const B = nodes.find((n) => n.id === b);
  const block = (msg: string): ConnectResult => ({ ok: false, level: 'block', msg });
  const warn = (msg: string): ConnectResult => ({ ok: true, level: 'warn', msg });
  if (!A || !B || a === b) return block('Uma máquina não pode ser ligada a ela mesma.');
  const tA = catalog[A.type], tB = catalog[B.type], nA = tA.name, nB = tB.name;
  if (edges.some((e) => e.from === a && e.to === b)) return block('Essas duas máquinas já estão ligadas.');
  if (edges.some((e) => e.from === b && e.to === a) || reach(b, a, edges)) return block('Isso criaria um círculo: o produto voltaria para uma máquina por onde já passou.');
  if (tA.end) return block(`${nA} é a última etapa: nada vem depois dela.`);
  if (tB.rank === 0) return block(`${nB} é o começo do processo: ela só envia produto, não recebe.`);
  if (tA.rank != null && tB.rank != null && tA.rank >= tB.rank) {
    return block(tA.rank === tB.rank
      ? `${nA} e ${nB} ficam na mesma etapa do processo. Ligue uma etapa na seguinte.`
      : `${nB} vem antes de ${nA} no processo. O produto anda para a frente: insumos → preparo → tratamento → envase → rótulo.`);
  }
  const gas = (x: FNode) => ['carbonatador', 'misturador', 'tanque_xarope'].includes(x.type);
  if ((tA.flow === 'suco' && gas(B)) || (tB.flow === 'suco' && gas(A))) {
    return block('Suco de laranja natural não leva xarope, mistura nem gás. Estas máquinas são de fluxos diferentes.');
  }
  const typeOf = (id: string) => nodes.find((n) => n.id === id)?.type as string;
  const outs = edges.filter((e) => e.from === a);
  if (outs.length && !outs.every((e) => typeOf(e.to) === B.type)) {
    return block(`${nA} já alimenta ${catalog[typeOf(outs[0].to)].name}. Uma máquina só pode alimentar várias de uma vez se forem do mesmo tipo (linhas em paralelo).`);
  }
  const ins = edges.filter((e) => e.to === b);
  if (ins.length && !tB.multiIn && !ins.every((e) => typeOf(e.from) === A.type)) {
    return block(`${nB} já recebe de ${catalog[typeOf(ins[0].from)].name}. Só o Misturador aceita origens diferentes juntas (ex.: água e xarope).`);
  }
  if (tA.flow === 'suco' && B.type === 'pasteurizador') return warn('Atenção: suco natural normalmente não é pasteurizado. Com pasteurização ele vira suco industrializado.');
  if (tA.rank != null && tB.rank != null && tB.rank - tA.rank >= 4) return warn('Atenção: esta ligação pula várias etapas do processo. É possível, mas incomum.');
  return { ok: true, level: 'ok', msg: '' };
}
