"""Dinheiro: faixas de preço estimadas (nunca cotação) para o custo de uma melhoria (porte de engine/cost.ts)."""
from __future__ import annotations

from typing import Optional

from .types import MachineType


def cost_of(t: MachineType, q: int = 1) -> Optional[dict[str, float]]:
    """Faixa de preço de `q` unidades da máquina."""
    return {"min": t.cost.min * q, "max": t.cost.max * q} if t.cost else None


def sum_ranges(items: list[Optional[dict[str, float]]]) -> dict[str, float]:
    total = {"min": 0.0, "max": 0.0}
    for c in items:
        if c:
            total = {"min": total["min"] + c["min"], "max": total["max"] + c["max"]}
    return total
