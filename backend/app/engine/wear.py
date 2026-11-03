"""Desgaste, depreciação e previsão de manutenção (o "mundo real" que o modelo ideal não prevê).

TUDO AQUI É HIPÓTESE DIDÁTICA (pedido do professor: degradação). Os percentuais foram escolhidos para o simulador mostrar o
efeito; não vêm de ficha de fabricante. Estão num lugar só (as constantes abaixo) para serem ajustados e explicados.

Ideia (versão 2 do desgaste):
  * A **idade da máquina** (anos de uso) e o **tempo desde a última manutenção** (meses) são DADOS DE ENTRADA, informados por quem monta a
    fábrica (padrão: máquina nova e manutenção em dia). A simulação NÃO gasta a máquina: o mesmo desenho dá sempre o mesmo resultado.
  * Quanto mais perto do fim da vida útil, menos a máquina rende, maior o risco de falha e mais ela esquenta.
  * Manutenção atrasada (passou do intervalo recomendado) também derruba o rendimento e sobe o risco.
  * Fazer a manutenção zera o tempo desde a última manutenção (não rejuvenesce a máquina). A depreciação é linear até um valor residual.
  * Por dentro, idade e meses viram horas (HORAS_USO_ANO) e usamos as mesmas colunas de horas do banco.
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
TEMP_EXTRA_IDADE = 8.0            # no fim da vida útil a máquina esquenta até +8 °C (curva quadrática: rolamentos e vedações gastos)
TEMP_EXTRA_ATRASO = 4.0           # manutenção muito atrasada soma até +4 °C (lubrificação ruim)
HORAS_USO_ANO = 4000.0            # horas de trabalho por ano de uso (hipótese: cerca de 1,5 turno por dia)
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
    temp_add: float = 0.0           # °C a mais por causa da idade e da manutenção atrasada


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
        temp_add=TEMP_EXTRA_IDADE * min(life_used, 1) ** 2 + TEMP_EXTRA_ATRASO * min(overdue, 1),
    )


def hours_from_inputs(age_years: float, months_since_maintenance: float) -> tuple[float, float]:
    """(horas de desgaste, horas de desgaste na última manutenção) a partir do que a pessoa informa: idade em anos e meses desde a manutenção.
    Os meses não passam da idade (uma máquina não fica mais tempo sem manutenção do que existe)."""
    wear = max(0.0, age_years) * HORAS_USO_ANO
    since = min(wear, max(0.0, months_since_maintenance) * HORAS_USO_ANO / 12)
    return round(wear, 1), round(wear - since, 1)


def inputs_from_hours(wear_hours: float, maintenance_at_h: float) -> tuple[float, float]:
    """O inverso: (idade em anos, meses desde a última manutenção)."""
    return round(wear_hours / HORAS_USO_ANO, 3), round(max(0.0, wear_hours - maintenance_at_h) / HORAS_USO_ANO * 12, 2)
