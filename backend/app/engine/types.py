"""Tipos do domínio (porte de app/src/types.ts)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Hashable, Optional

NodeId = Hashable  # no banco é o id inteiro de fabrica_maquinas; nos testes pode ser texto

STATES = ("normal", "alerta", "critico", "falha", "desligada")


@dataclass(frozen=True)
class Ref:
    """Uma fonte: título, link e confiança (real ou estimado)."""
    t: str
    u: str
    k: Optional[str] = None


@dataclass(frozen=True)
class Cost:
    min: float
    max: float
    note: str = ""
    refs: tuple[Ref, ...] = ()
    edited: bool = False


@dataclass(frozen=True)
class MachineType:
    """Um tipo de máquina do catálogo (dado, não código: permite outros setores no futuro)."""
    code: str
    name: str
    stage: str
    cat: str
    icon: str
    param: str
    unit: str
    min: float
    max: float
    opt: float
    warn: float
    crit: float
    cap: float            # garrafas/h de UMA unidade no ritmo ótimo
    sb: float             # consumo parado (kW)
    vr: float             # consumo variável (kW)
    desc: str = ""
    flow: str = "geral"   # 'geral' | 'suco'
    rank: Optional[int] = None
    heat: str = "none"    # 'tank' | 'motor' | 'cold' | 'visc' | 'none'
    multi_in: bool = False
    end: bool = False
    basis: str = ""
    risk: str = ""
    cost: Optional[Cost] = None
    refs: tuple[Ref, ...] = ()
    db_id: Optional[int] = None
    # --- campos que o front-end não tem (versão 2 do banco) ---
    life_h: float = 30000.0           # vida útil, em horas de desgaste (hipótese didática)
    maintenance_interval_h: float = 1000.0
    maker: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    version: int = 1
    group: Optional[str] = None
    origin: str = "embutida"


Catalog = dict[str, MachineType]


@dataclass
class Node:
    """Uma máquina colocada no quadro."""
    id: NodeId
    type: str
    x: int = 0
    y: int = 0
    value: float = 0.0
    qty: int = 1
    off: bool = False
    # desgaste (neutro por padrão: 1,0 e 0,0 não mudam nenhuma conta; ver engine/wear.py)
    wear_cap: float = 1.0
    wear_risk: float = 0.0
    wear_temp: float = 0.0      # °C a mais por idade/manutenção atrasada (só a temperatura estimada usa)
    age_years: float = 0.0      # o que a pessoa informou: idade da máquina (anos)
    maint_months: float = 0.0   # e meses desde a última manutenção

    def copy(self) -> "Node":
        return Node(self.id, self.type, self.x, self.y, self.value, self.qty, self.off, self.wear_cap, self.wear_risk, self.wear_temp, self.age_years, self.maint_months)


@dataclass(frozen=True)
class Edge:
    id: NodeId
    src: NodeId
    dst: NodeId


@dataclass
class NodeResult:
    cap: float
    eff: float
    inflow: float
    queue: float
    risk: float
    state: str
    energy: float
    waiting: bool = False


@dataclass
class SimResult:
    res: dict[NodeId, NodeResult]
    production: float
    bn: Optional[NodeId]
    energy: float
    max_risk: float


@dataclass
class RunInfo:
    active: bool
    t: float
    arrivals: dict[NodeId, float]


@dataclass
class SimContext:
    """Tudo o que o cálculo precisa além do desenho da fábrica."""
    catalog: Catalog
    ambient: float = 25
    estop: bool = False
    run: Optional[RunInfo] = None

    def without_run(self) -> "SimContext":
        return SimContext(self.catalog, self.ambient, self.estop, None)


@dataclass
class ConnectResult:
    ok: bool
    level: str  # 'ok' | 'warn' | 'block'
    msg: str


@dataclass
class NodeChange:
    id: NodeId
    value: float
    qty: int
    off: bool


@dataclass
class GoalInput:
    type: str          # 'pct' | 'abs' | 'risk'
    value: float = 0.0
    more: bool = False
    over: bool = False


@dataclass
class PlanStep:
    what: str
    why: str
    action: str = "ritmo"          # 'ligar' | 'paralelo' | 'ritmo' (o front deduz; o banco precisa)
    node_id: Optional[NodeId] = None
    cost: Optional[dict[str, float]] = None
    risk: Optional[float] = None
    opt: Optional[bool] = None
    before: Optional[float] = None  # ritmo ou unidades antes
    after: Optional[float] = None


@dataclass
class Plan:
    ok: bool
    target: float
    invest: dict[str, float]
    g: GoalInput
    before: dict[str, float]
    after: dict[str, float]
    steps: list[PlanStep]
    changes: dict[NodeId, NodeChange]
    note: str


@dataclass
class BnOption:
    key: str
    title: str
    detail: str
    prod: float
    gain: float
    risk: float
    next: str
    cost: Optional[dict[str, float]]
    change: dict[str, Any]


@dataclass
class BnReport:
    id: NodeId
    name: str
    prod: float
    why: list[str]
    options: list[BnOption]
    has_cost: bool


@dataclass
class WhatIfResult:
    id: NodeId
    name: str
    n: int
    before: float
    after: float
    risk: float
    cost: Optional[dict[str, float]]
    cap_new: float
    next: str
    enough: bool
    plan: Optional[Plan] = None


@dataclass
class RunState:
    on: bool = False
    active: bool = False
    speed: int = 1
    dur: int = 60
    t: float = 0.0
    produced: float = 0.0
    kwh: float = 0.0
    queue: dict[NodeId, float] = field(default_factory=dict)
    arrivals: dict[NodeId, float] = field(default_factory=dict)
    announced: dict[NodeId, bool] = field(default_factory=dict)
    finished: bool = False
    last_k: int = 0
