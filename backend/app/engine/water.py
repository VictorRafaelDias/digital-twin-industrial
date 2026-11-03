"""Dilatação da água (física real, tabela do EngineeringToolbox) usada na janela de temperatura do ambiente."""
from __future__ import annotations

# curva de dilatação da água: (°C, coeficiente volumétrico por °C)
BETA_AGUA = [(0, -0.00005), (4, 0), (10, 0.000088), (20, 0.000207), (30, 0.000303), (40, 0.000385), (50, 0.000457)]
FONTE_AGUA = "https://engineeringtoolbox.com/cubical-expansion-coefficients-d_1262.html"


def beta_at(T: float) -> float:
    """Coeficiente de dilatação volumétrica da água (por °C) interpolado na temperatura T."""
    for i in range(1, len(BETA_AGUA)):
        t1, b1 = BETA_AGUA[i - 1]
        t2, b2 = BETA_AGUA[i]
        if T <= t2:
            return b1 + ((b2 - b1) * (T - t1)) / (t2 - t1)
    return BETA_AGUA[-1][1]


def water_expansion_l(T: float, liters: float = 1000) -> float:
    """Litros a mais (ou a menos) que `liters` de água ocupam a T °C em relação a 20 °C."""
    return liters * ((beta_at(20) + beta_at(T)) / 2) * (T - 20)
