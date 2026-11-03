"""Temperatura estimada de cada máquina (para o dashboard: "quanto ela está esquentando").

HIPÓTESE DIDÁTICA (o modelo de simulação original só tinha a temperatura do ambiente). Ideia simples e explicável:
a máquina fica na temperatura do ambiente mais um aquecimento proporcional à carga em que trabalha, e esse aquecimento
cresce quando ela opera acima do ritmo ótimo. Câmara fria e tanques têm comportamento próprio. Não vem de ficha técnica.
"""
from __future__ import annotations

from .types import MachineType, Node, NodeResult

AQUECIMENTO_MAXIMO = {"motor": 40.0, "tank": 12.0, "visc": 5.0, "none": 15.0}   # °C acima do ambiente a plena carga
TEMPERATURA_FRIA = 4.0                                                           # ponto de trabalho da câmara fria
SUPERAQUECIMENTO = 1.5                                                           # máquina em falha: 1,5x o aquecimento máximo


def machine_temperature(t: MachineType, n: Node, r: NodeResult, ambient: float) -> float:
    """Temperatura estimada, em °C (1 casa)."""
    qty = n.qty or 1
    if n.off:
        return round(TEMPERATURA_FRIA + 0.5 * max(0.0, ambient - 20) if t.heat == "cold" else float(ambient), 1)
    load = min(1.3, r.eff / (t.cap * qty * n.wear_cap)) if t.cap else 0.0   # carga em relação à capacidade real (máquina velha rende menos, mas não esfria por isso)
    over = max(0.0, (n.value - t.opt) / (t.crit - t.opt)) if t.crit > t.opt else 0.0
    boost = 1 + 0.5 * min(over, 1.0)
    if t.heat == "cold":
        base = TEMPERATURA_FRIA + 0.5 * max(0.0, ambient - 20)
        return round(base + (10 * SUPERAQUECIMENTO if r.state == "falha" else 10 * load * boost) + n.wear_temp, 1)
    rise = AQUECIMENTO_MAXIMO.get(t.heat, 15.0)
    if r.state == "falha":
        return round(ambient + rise * SUPERAQUECIMENTO + n.wear_temp, 1)
    return round(ambient + rise * load * boost + n.wear_temp, 1)
