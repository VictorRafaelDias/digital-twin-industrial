"""Formatação de números no padrão brasileiro (igual ao `toLocaleString('pt-BR')` do front-end)."""
from __future__ import annotations

import math
from decimal import ROUND_HALF_UP, Decimal


def _quantize(x: float, d: int) -> Decimal:
    # a biblioteca de internacionalização do navegador arredonda a representação decimal mais curta do número
    # (1,005 vira 1,01), diferente do round() do Python (que olha o valor binário)
    return Decimal(repr(float(x))).quantize(Decimal(1).scaleb(-d), rounding=ROUND_HALF_UP)


def _montar(x: float, d_max: int, d_min: int) -> str:
    q = _quantize(x or 0.0, d_max)
    sinal = "-" if (x or 0.0) < 0 else ""
    inteiro, _, frac = f"{abs(q):f}".partition(".")
    frac = frac.rstrip("0").ljust(d_min, "0")
    return sinal + f"{int(inteiro):,}".replace(",", ".") + ("," + frac if frac else "")


def fmt(n: float | None, d: int = 0) -> str:
    """Número com `d` casas fixas (ex.: fmt(12345.6, 1) -> '12.345,6')."""
    return _montar(n or 0.0, d, d)


def fv(v: float) -> str:
    """Valor de um ritmo: até 2 casas, sem zeros sobrando."""
    return _montar(v, 2, 0)


def pad(n: int) -> str:
    return str(n).zfill(2)


def clock(minutes: float) -> str:
    """Relógio 'hh:mm' a partir de minutos simulados."""
    return f"{pad(math.floor(minutes / 60))}:{pad(math.floor(minutes % 60))}"
