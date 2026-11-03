"""Desgaste, depreciação e previsão de manutenção (o "mundo real" que o modelo ideal não prevê).

TUDO AQUI É HIPÓTESE DIDÁTICA (pedido do professor: degradação). Os percentuais foram escolhidos para o simulador mostrar o
efeito; não vêm de ficha de fabricante. Estão num lugar só (as constantes abaixo) para serem ajustados e explicados.

Ideia:
  * Cada máquina acumula **horas de desgaste**. Trabalhando no ritmo ótimo, 1 hora de uso = 1 hora de desgaste.
    Acima do ótimo o desgaste anda mais rápido (até 4x perto do limite de falha). Desligada ou falhada, não desgasta.
  * Quanto mais perto do fim da vida útil, menos a máquina rende e maior o risco de falha.
  * Manutenção preventiva atrasada (passou do intervalo recomendado) também derruba o rendimento e sobe o risco.
  * A manutenção recupera parte do desgaste. A depreciação é linear até um valor residual.
"""
from __future__ import annotations

from dataclasses import dataclass

from .types import MachineType

PERDA_CAPACIDADE_IDADE = 0.20     # no fim da vida útil a máquina entrega até 20% a menos
PERDA_CAPACIDADE_ATRASO = 0.05    # manutenção muito atrasada tira mais até 5%
RISCO_EXTRA_IDADE = 0.08          # no fim da vida útil o risco base (2%) sobe até +8 pontos (curva quadrática)
RISCO_EXTRA_ATRASO = 0.04         # manutenção muito atrasada soma até +4 pontos de risco
FATOR_MINIMO_CAPACIDADE = 0.70    # trava de segurança (com as constantes acima a perda máxima é 25%)
ACELERACAO_ACIMA_DO_OTIMO = 3.0   # no limite de falha o desgaste anda 1 + 3 = 4x mais rápido
VALOR_RESIDUAL = 0.10             # depois da vida útil a máquina vale 10% do preço de nova
RECUPERA_PREVENTIVA = 0.60        # manutenção preventiva recupera 60% do desgaste acumulado
RECUPERA_CORRETIVA = 0.80         # corretiva (depois de falha, com troca de peças) recupera 80%


@dataclass(frozen=True)
class Wear:
    wear_hours: float
    operating_hours: float
    life_used: float                # fração da vida útil gasta (0 a 1,5)
    hours_since_maintenance: float
    maintenance_overdue: float      # 0 = em dia; 1 = atrasada em um intervalo inteiro (ou mais)
    capacity_factor: float          # multiplica a capacidade (1 = sem perda)
    risk_add: float                 # soma ao risco base (0 = sem efeito)
    status: str                     # ok | atencao | manutencao_atrasada | fim_de_vida
    hours_to_maintenance: float     # negativo = já passou
    hours_of_life_left: float
    residual_fraction: float        # quanto do preço de nova a máquina ainda vale (0,1 a 1)


def wear_of(wear_hours: float, maintenance_at_h: float, operating_hours: float, life_h: float, interval_h: float) -> Wear:
    life_used = max(0.0, wear_hours / life_h)
    since = max(0.0, wear_hours - maintenance_at_h)
    overdue = max(0.0, (since - interval_h) / interval_h)
    cap = max(FATOR_MINIMO_CAPACIDADE, 1 - PERDA_CAPACIDADE_IDADE * min(life_used, 1) - PERDA_CAPACIDADE_ATRASO * min(overdue, 1))
    add = RISCO_EXTRA_IDADE * min(life_used, 1) ** 2 + RISCO_EXTRA_ATRASO * min(overdue, 1)
    if life_used >= 1:
        status = "fim_de_vida"
    elif since >= interval_h:
        status = "manutencao_atrasada"
    elif since >= 0.8 * interval_h or life_used >= 0.8:
        status = "atencao"
    else:
        status = "ok"
    return Wear(
        wear_hours=wear_hours, operating_hours=operating_hours, life_used=life_used, hours_since_maintenance=since,
        maintenance_overdue=overdue, capacity_factor=cap, risk_add=add, status=status,
        hours_to_maintenance=interval_h - since, hours_of_life_left=max(0.0, life_h - wear_hours),
        residual_fraction=1 - min(life_used, 1) * (1 - VALOR_RESIDUAL),
    )


def wear_speed(t: MachineType, value: float, off: bool, failed: bool) -> float:
    """Quantas horas de desgaste cada hora de trabalho gera: 1 no ótimo, até 4 no limite de falha; 0 parada."""
    if off or failed or value >= t.crit:
        return 0.0
    if value <= t.opt:
        return 1.0
    return 1.0 + ACELERACAO_ACIMA_DO_OTIMO * min(1.0, (value - t.opt) / (t.crit - t.opt))


def after_maintenance(wear_hours: float, kind: str) -> float:
    """Horas de desgaste logo depois de uma manutenção."""
    frac = RECUPERA_CORRETIVA if kind == "corretiva" else RECUPERA_PREVENTIVA
    return round(wear_hours * (1 - frac), 1)
