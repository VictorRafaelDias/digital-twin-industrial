"""Corpos dos pedidos (entrada da API), com as regras de validação. Aparecem na documentação interativa (/docs)."""
from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel as _PydanticBase
from pydantic import ConfigDict, Field, field_validator

MAX_ID = 2_147_483_647   # o maior id que o banco guarda (inteiro de 32 bits)
MAX_POS = 100_000        # posição máxima no quadro (pixels)


class BaseModel(_PydanticBase):
    """Todos os pedidos recusam NaN e Infinity (não existem como número de verdade e o banco não guarda)."""
    model_config = ConfigDict(allow_inf_nan=False)


class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9._-]+$", description="Nome de login (letras, números, ponto, hífen e sublinhado)")
    display_name: Optional[str] = Field(default=None, max_length=100, description="Nome mostrado na tela (padrão: o próprio login)")
    password: str = Field(min_length=6, max_length=128)


class UserActiveIn(BaseModel):
    active: bool = Field(description="Verdadeiro = a conta pode entrar; falso = conta desativada (não entra, mas nada é apagado)")


class LoginIn(BaseModel):
    username: str
    password: str


class ProfileIn(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    current_password: Optional[str] = None
    new_password: Optional[str] = Field(default=None, min_length=6, max_length=128)


class FactoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=100, examples=["Minha fábrica"])
    template: Optional[str] = Field(default=None, max_length=40, pattern=r"^[a-z_]+$", description="Começar de um exemplo pronto: bebidas, suco ou o de uma empresa real (cocacola_jundiai, slmg_chhata, refres_now_manaos, coca_cola_canners, quilmes_gatorade, quilmes_gatorade_antes, refriko_sjp, tial_antes, tial, tannourine). Vazio = fábrica em branco")
    ambient: int = Field(default=25, ge=0, le=45, description="Temperatura do ambiente, em °C")
    tariff: float = Field(default=0.85, ge=0, le=1000, description="Preço da energia, em R$ por kWh")


class FactoryPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    ambient: Optional[int] = Field(default=None, ge=0, le=45)
    tariff: Optional[float] = Field(default=None, ge=0, le=1000)
    emergency_stop: Optional[bool] = Field(default=None, description="Liga ou libera a parada de emergência")


class MachineIn(BaseModel):
    type: str = Field(description="Código do tipo de máquina no catálogo (ex.: enchedora)", examples=["enchedora"])
    x: int = Field(default=0, ge=0, le=MAX_POS)
    y: int = Field(default=0, ge=0, le=MAX_POS)
    value: Optional[float] = Field(default=None, ge=0, le=1e9, description="Ritmo inicial (vazio = ritmo ótimo)")
    units_in_parallel: int = Field(default=1, ge=1, le=6)
    off: bool = False
    age_years: float = Field(default=0, ge=0, le=60, description="Idade da máquina em anos de uso (0 = nova)")
    last_maintenance_date: Optional[date] = Field(default=None, description="Data da última manutenção (AAAA-MM-DD). Vazio = não informada: a máquina conta como em dia")


class MachinePatch(BaseModel):
    value: Optional[float] = Field(default=None, ge=0, le=1e9, description="Novo ritmo (dentro do mínimo e do máximo da máquina)")
    units_in_parallel: Optional[int] = Field(default=None, ge=1, le=6)
    off: Optional[bool] = None
    x: Optional[int] = Field(default=None, ge=0, le=MAX_POS)
    y: Optional[int] = Field(default=None, ge=0, le=MAX_POS)
    age_years: Optional[float] = Field(default=None, ge=0, le=60, description="Idade da máquina em anos de uso")
    last_maintenance_date: Optional[date] = Field(default=None, description="Data da última manutenção (AAAA-MM-DD). Mandar null apaga a data (conta como em dia); não mandar o campo mantém o que está")


class ConnectionIn(BaseModel):
    from_id: int = Field(ge=1, le=MAX_ID, description="Máquina de origem (a que envia o produto)")
    to_id: int = Field(ge=1, le=MAX_ID, description="Máquina de destino (a que recebe)")


class LayoutMachine(BaseModel):
    ref: str = Field(description="Nome que você dá à máquina neste pedido; as conexões usam esse nome")
    id: Optional[int] = Field(default=None, ge=1, le=MAX_ID, description="Id de uma máquina que já está nesta fábrica: ela é atualizada no lugar (mantém desgaste e manutenções)")
    type: str
    x: int = Field(default=0, ge=0, le=MAX_POS)
    y: int = Field(default=0, ge=0, le=MAX_POS)
    value: Optional[float] = Field(default=None, ge=0)
    units_in_parallel: int = Field(default=1, ge=1, le=6)
    off: bool = False
    age_years: Optional[float] = Field(default=None, ge=0, le=60, description="Idade em anos (vazio = mantém o que já estava; máquina nova = 0)")
    last_maintenance_date: Optional[date] = Field(default=None, description="Data da última manutenção (AAAA-MM-DD). Não mandar o campo mantém o que está; null apaga a data")


class LayoutConnection(BaseModel):
    from_ref: str
    to_ref: str


class LayoutIn(BaseModel):
    machines: list[LayoutMachine]
    connections: list[LayoutConnection] = []


class GoalIn(BaseModel):
    type: Literal["pct", "abs", "risk"] = Field(description="pct = aumentar em %; abs = chegar a uma produção (garrafas/h); risk = reduzir o risco")
    value: float = Field(default=0, ge=0, description="O valor pedido (% ou garrafas/h); ignorado em risk")
    allow_parallel: bool = Field(default=True, description="Pode sugerir mais máquinas em paralelo?")
    allow_warning_zone: bool = Field(default=True, description="Pode operar acima do ótimo (zona de atenção)?")
    save: bool = Field(default=True, description="Guardar o plano no banco (para aplicar depois)")


class WhatIfIn(BaseModel):
    extra_units: int = Field(default=1, ge=1, le=5, description="Quantas máquinas a mais no gargalo")


class ChangeIn(BaseModel):
    machine_id: int = Field(ge=1, le=MAX_ID)
    value: float = Field(ge=0)
    units_in_parallel: int = Field(ge=1, le=6)
    off: bool = False


class ApplyChangesIn(BaseModel):
    changes: list[ChangeIn] = Field(min_length=1)
    label: Optional[str] = Field(default=None, max_length=200, description="Texto que vai para o Registro")


class ScenarioIn(BaseModel):
    name: str = Field(min_length=1, max_length=100, examples=["Situação inicial"])


class PlayIn(BaseModel):
    speed: int = Field(default=20, description="Velocidade: 1, 5, 20 ou 60 vezes")
    duration_min: int = Field(default=60, description="Duração simulada em minutos (ex.: 30, 60 ou 480)")
    save: bool = Field(default=True, description="Guardar o resultado no histórico de simulações")
    apply_wear: bool = Field(default=False, description="IGNORADO (mantido só para não quebrar quem já chamava): a simulação não gasta mais as máquinas; a idade é informada por quem monta a fábrica")


class MaintenanceIn(BaseModel):
    kind: Literal["preventiva", "corretiva"] = Field(default="preventiva", description="preventiva (planejada) ou corretiva (depois de falha): as duas zeram o tempo desde a última manutenção")
    note: Optional[str] = Field(default=None, max_length=500, description="O que foi feito")


class AskIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000, examples=["Onde está o gargalo?"])


class LimitsPatch(BaseModel):
    optimal: Optional[float] = Field(default=None, ge=0)
    warning: Optional[float] = Field(default=None, ge=0)
    failure: Optional[float] = Field(default=None, ge=0)


class PricePatch(BaseModel):
    min: float = Field(ge=0, le=1e11, description="Preço mínimo estimado de 1 unidade (R$)")
    max: float = Field(ge=0, le=1e11, description="Preço máximo estimado de 1 unidade (R$)")
    note: Optional[str] = Field(default=None, max_length=500)

    @field_validator("max")
    @classmethod
    def _faixa(cls, v, info):
        if "min" in info.data and v < info.data["min"]:
            raise ValueError("o preço máximo não pode ser menor que o mínimo")
        return v


class MachinePatchCatalog(BaseModel):
    category: Optional[str] = Field(default=None, description="Código da categoria (insumos, preparo, termico, envase, pos, frio)")
    active: Optional[bool] = Field(default=None, description="Falso = a máquina some do catálogo")
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)


class ImportFields(BaseModel):
    """O que o usuário corrigiu na tela de conferência (o que ficar vazio vale o que o sistema leu do documento)."""
    name: Optional[str] = Field(default=None, max_length=80)
    maker: Optional[str] = Field(default=None, max_length=80)
    model: Optional[str] = Field(default=None, max_length=80)
    year: Optional[int] = Field(default=None, ge=1900, le=2100)
    category: Optional[Literal["insumos", "preparo", "termico", "envase", "pos", "frio"]] = None
    capacity_nominal_per_hour: Optional[float] = Field(default=None, gt=0, description="Garrafas por hora na capacidade nominal")
    power_kw: Optional[float] = Field(default=None, gt=0)
    description: Optional[str] = Field(default=None, max_length=1000)
    how_it_works: Optional[str] = Field(default=None, max_length=1500)
    limit_min: Optional[float] = Field(default=None, ge=0)
    limit_optimal: Optional[float] = Field(default=None, gt=0)
    limit_warning: Optional[float] = Field(default=None, gt=0)
    limit_failure: Optional[float] = Field(default=None, gt=0)
    limit_max: Optional[float] = Field(default=None, gt=0)


class PreviewImportIn(BaseModel):
    fields: ImportFields = ImportFields()


class ConfirmImportIn(BaseModel):
    decision: Literal["create", "update", "new_version"] = Field(description="create = máquina nova; update = sobrepõe a existente; new_version = nova versão (v2, v3...) mantendo a antiga")
    target_code: Optional[str] = Field(default=None, description="Máquina existente (obrigatório em update e new_version)")
    fields: ImportFields = ImportFields()
    confirm_different: bool = Field(default=False, description="Em `create`, confirma que é uma máquina diferente da parecida que já existe")


class CategoryIn(BaseModel):
    code: str = Field(min_length=2, max_length=30, pattern=r"^[a-z0-9_]+$")
    name: str = Field(min_length=1, max_length=60)
    description: str = Field(default="Categoria criada por você.", max_length=500)
    icon: Optional[str] = Field(default="factory", max_length=30)


class CategoryPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    description: Optional[str] = Field(default=None, max_length=500)
    active: Optional[bool] = None
