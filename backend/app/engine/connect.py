"""Regras de conexão: o que pode ser ligado em quê, e que tipo de conexão resulta (porte de engine/connect.ts)."""
from __future__ import annotations

from .types import Catalog, ConnectResult, Edge, Node, NodeId


def reach(src: NodeId, dst: NodeId, edges: list[Edge]) -> bool:
    """Existe caminho de `src` até `dst`? (usado para impedir ciclos)"""
    seen: set = set()
    pilha = [src]
    while pilha:
        x = pilha.pop()
        if x == dst:
            return True
        if x in seen:
            continue
        seen.add(x)
        for e in edges:
            if e.src == x:
                pilha.append(e.dst)
    return False


def edge_kind(e: Edge, edges: list[Edge]) -> str:
    """Direta (uma liga uma), divisão (uma alimenta várias iguais) ou junção (várias entram numa só)."""
    outs = sum(1 for x in edges if x.src == e.src)
    ins = sum(1 for x in edges if x.dst == e.dst)
    return "divisão" if outs > 1 else "junção" if ins > 1 else "direta"


def can_connect(a: NodeId, b: NodeId, nodes: list[Node], edges: list[Edge], catalog: Catalog) -> ConnectResult:
    A = next((n for n in nodes if n.id == a), None)
    B = next((n for n in nodes if n.id == b), None)

    def block(msg: str) -> ConnectResult:
        return ConnectResult(False, "block", msg)

    def warn(msg: str) -> ConnectResult:
        return ConnectResult(True, "warn", msg)

    if A is None or B is None or a == b:
        return block("Uma máquina não pode ser ligada a ela mesma.")
    tA, tB = catalog[A.type], catalog[B.type]
    nA, nB = tA.name, tB.name
    if any(e.src == a and e.dst == b for e in edges):
        return block("Essas duas máquinas já estão ligadas.")
    if any(e.src == b and e.dst == a for e in edges) or reach(b, a, edges):
        return block("Isso criaria um círculo: o produto voltaria para uma máquina por onde já passou.")
    if tA.end:
        return block(f"{nA} é a última etapa: nada vem depois dela.")
    if tB.rank == 0:
        return block(f"{nB} é o começo do processo: ela só envia produto, não recebe.")
    if tA.rank is not None and tB.rank is not None and tA.rank >= tB.rank:
        if tA.rank == tB.rank:
            return block(f"{nA} e {nB} ficam na mesma etapa do processo. Ligue uma etapa na seguinte.")
        return block(f"{nB} vem antes de {nA} no processo. O produto anda para a frente: insumos → preparo → tratamento → envase → rótulo.")

    def gas(x: Node) -> bool:
        return x.type in ("carbonatador", "misturador", "tanque_xarope")

    if (tA.flow == "suco" and gas(B)) or (tB.flow == "suco" and gas(A)):
        return block("Suco de laranja natural não leva xarope, mistura nem gás. Estas máquinas são de fluxos diferentes.")

    def type_of(i: NodeId) -> str:
        return next(n.type for n in nodes if n.id == i)

    outs = [e for e in edges if e.src == a]
    if outs and not all(type_of(e.dst) == B.type for e in outs):
        return block(f"{nA} já alimenta {catalog[type_of(outs[0].dst)].name}. Uma máquina só pode alimentar várias de uma vez se forem do mesmo tipo (linhas em paralelo).")
    ins = [e for e in edges if e.dst == b]
    if ins and not tB.multi_in and not all(type_of(e.src) == A.type for e in ins):
        return block(f"{nB} já recebe de {catalog[type_of(ins[0].src)].name}. Só o Misturador aceita origens diferentes juntas (ex.: água e xarope).")
    if tA.flow == "suco" and B.type == "pasteurizador":
        return warn("Atenção: suco natural normalmente não é pasteurizado. Com pasteurização ele vira suco industrializado.")
    if tA.rank is not None and tB.rank is not None and tB.rank - tA.rank >= 4:
        return warn("Atenção: esta ligação pula várias etapas do processo. É possível, mas incomum.")
    return ConnectResult(True, "ok", "")
