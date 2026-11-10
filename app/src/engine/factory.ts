/* Montagem de fábricas: nó novo e exemplos prontos. */
import { TEMPLATES } from '../data/content';
import type { Catalog, FEdge, FNode } from '../types';

export const mkNode = (id: string, type: string, x: number, y: number, catalog: Catalog): FNode =>
  ({ id, type, x, y, value: catalog[type].opt, qty: 1, off: false });

/** Carrega um exemplo: as máquinas na ordem da lista, cada uma ligada à seguinte. */
export function buildFromTemplate(key: string, catalog: Catalog, seq: number): { nodes: FNode[]; edges: FEdge[]; seq: number; name: string } {
  const tpl = TEMPLATES[key];
  const nodes = tpl.nodes.map(([type, x, y, qty, value]) => ({ ...mkNode('n' + seq++, type, x, y, catalog), ...(qty ? { qty } : {}), ...(value !== undefined ? { value } : {}) }));
  const edges: FEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) edges.push({ id: 'e' + seq++, from: nodes[i].id, to: nodes[i + 1].id });
  return { nodes, edges, seq, name: tpl.name };
}
