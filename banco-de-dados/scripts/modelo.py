"""Modelo da base de dados do Digital Twin Industrial (única definição das tabelas).

Este arquivo descreve as tabelas uma única vez. Dele saem, automaticamente:
  - sql/01_schema_sqlite.sql e sql/01_schema_postgres.sql (comandos CREATE TABLE);
  - o banco pronto digital_twin.db (SQLite);
  - der/der.mmd (diagrama entidade-relacionamento) e docs/dicionario-de-dados.md.

Para regerar tudo: python scripts/gerar_banco.py
Biblioteca usada só para gerar os arquivos: SQLAlchemy 2.x (o banco entregue funciona sem ela).
"""
from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, MetaData,
    Numeric, SmallInteger, String, Table, Text, UniqueConstraint, false, func, true,
)

convencao = {
    "ix": "ix_%(table_name)s_%(column_0_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s",
    "pk": "pk_%(table_name)s",
}
metadata = MetaData(naming_convention=convencao)


def pk(comentario: str = "Identificador da linha (gerado automaticamente)") -> Column:
    return Column("id", Integer, primary_key=True, autoincrement=True, comment=comentario)


def agora(nome: str, comentario: str) -> Column:
    return Column(nome, DateTime, nullable=False, server_default=func.current_timestamp(), comment=comentario)


# =====================================================================================================
# MÓDULO ACESSO
# =====================================================================================================
usuarios = Table(
    "usuarios", metadata,
    pk(),
    Column("nome_usuario", String(50), nullable=False, comment="Nome de login (único)"),
    Column("nome_exibicao", String(100), nullable=False, comment="Nome mostrado na tela"),
    Column("senha_hash", String(255), nullable=False, comment="Senha protegida (PBKDF2-SHA256 com sal); nunca a senha em texto"),
    Column("ativo", Boolean, nullable=False, server_default=true(), comment="Falso = usuário desativado"),
    agora("criado_em", "Quando a conta foi criada"),
    Column("ultimo_acesso_em", DateTime, nullable=True, comment="Último login (vazio se nunca entrou)"),
    UniqueConstraint("nome_usuario"),
    comment="Pessoas que entram no sistema (login simples: usuário e senha, sem perfis)",
)

# =====================================================================================================
# MÓDULO CATÁLOGO DE MÁQUINAS
# =====================================================================================================
categorias = Table(
    "categorias", metadata,
    pk(),
    Column("codigo", String(30), nullable=False, comment="Código curto (ex.: insumos, preparo, termico)"),
    Column("nome", String(60), nullable=False, comment="Nome mostrado na lista de máquinas e no manual"),
    Column("descricao", Text, nullable=False, comment="Explicação em palavras simples"),
    Column("icone", String(30), nullable=True, comment="Nome do ícone usado na tela"),
    Column("ativa", Boolean, nullable=False, server_default=true(), comment="Falso = a categoria some da lista e do manual"),
    Column("ordem", SmallInteger, nullable=False, server_default="0", comment="Ordem de exibição"),
    UniqueConstraint("codigo"),
    comment="Tipos de máquina (grupos do catálogo): Insumos, Preparo, Térmico e gás, Envase, Pós-envase, Refrigeração",
)

etapas = Table(
    "etapas", metadata,
    pk(),
    Column("nome", String(60), nullable=False, comment="Etapa do processo (ex.: Envase, Pós-envase)"),
    Column("zona", String(40), nullable=False, comment="Área da fábrica vista de cima onde a etapa fica"),
    UniqueConstraint("nome"),
    CheckConstraint(
        "zona IN ('Recepção e preparo', 'Tratamento térmico e gás', 'Envase e expedição', 'Câmara fria')",
        name="ck_etapas_zona",
    ),
    comment="Etapas do processo produtivo e a área (zona) da planta baixa em que cada uma aparece",
)

maquinas_catalogo = Table(
    "maquinas_catalogo", metadata,
    pk(),
    Column("codigo", String(40), nullable=False, comment="Código único da máquina (ex.: enchedora, extratora)"),
    Column("nome", String(80), nullable=False, comment="Nome mostrado na tela"),
    Column("categoria_id", Integer, ForeignKey("categorias.id", ondelete="RESTRICT"), nullable=False, comment="Categoria da máquina"),
    Column("etapa_id", Integer, ForeignKey("etapas.id", ondelete="RESTRICT"), nullable=False, comment="Etapa do processo"),
    Column("fluxo", String(10), nullable=False, server_default="geral", comment="geral = bebidas em geral; suco = suco de laranja natural"),
    Column("icone", String(30), nullable=True, comment="Nome do ícone usado na tela"),
    Column("parametro", String(60), nullable=False, comment="O que o ritmo controla (ex.: Cadência, Vazão, Rotação)"),
    Column("unidade", String(15), nullable=False, comment="Unidade do ritmo (ex.: gf/min, m³/h, RPM)"),
    Column("valor_min", Numeric(12, 3), nullable=False, comment="Menor ritmo permitido"),
    Column("valor_otimo", Numeric(12, 3), nullable=False, comment="Ritmo ótimo: trabalha bem, risco baixo"),
    Column("valor_atencao", Numeric(12, 3), nullable=False, comment="Limite da zona de atenção (acima do ótimo)"),
    Column("valor_falha", Numeric(12, 3), nullable=False, comment="A partir deste ritmo a máquina falha"),
    Column("valor_max", Numeric(12, 3), nullable=False, comment="Maior ritmo permitido pelo controle"),
    Column("capacidade_otima", Numeric(12, 2), nullable=False, comment="Garrafas por hora que uma unidade entrega no ritmo ótimo"),
    Column("consumo_parado_kw", Numeric(8, 3), nullable=False, comment="Consumo com a máquina ligada e sem produzir (kW)"),
    Column("consumo_variavel_kw", Numeric(8, 3), nullable=False, comment="Consumo adicional ao produzir no ótimo (kW)"),
    Column("ordem_processo", SmallInteger, nullable=True, comment="Posição no processo (0 = começo, 9 = fim); vazio = pode ficar entre quaisquer etapas"),
    Column("sensibilidade_termica", String(15), nullable=False, server_default="nenhuma", comment="Como reage à temperatura ambiente"),
    Column("aceita_varias_entradas", Boolean, nullable=False, server_default=false(), comment="Verdadeiro = recebe origens diferentes (ex.: misturador)"),
    Column("etapa_final", Boolean, nullable=False, server_default=false(), comment="Verdadeiro = última etapa: nada vem depois"),
    Column("descricao", Text, nullable=False, comment="O que a máquina faz, em palavras simples"),
    Column("risco_fisico", Text, nullable=False, comment="O que pode dar errado fisicamente"),
    Column("base_dos_numeros", Text, nullable=False, comment="Nota de em que os números se baseiam (hipótese didática ou fonte)"),
    Column("ativa", Boolean, nullable=False, server_default=true(), comment="Falso = máquina fora do catálogo"),
    UniqueConstraint("codigo"),
    CheckConstraint("fluxo IN ('geral', 'suco')", name="ck_maquinas_catalogo_fluxo"),
    CheckConstraint(
        "sensibilidade_termica IN ('tanque', 'motor', 'frio', 'viscosidade', 'nenhuma')",
        name="ck_maquinas_catalogo_sensibilidade",
    ),
    CheckConstraint(
        "valor_min <= valor_otimo AND valor_otimo <= valor_atencao AND valor_atencao <= valor_falha AND valor_falha <= valor_max",
        name="ck_maquinas_catalogo_limites",
    ),
    CheckConstraint("capacidade_otima > 0", name="ck_maquinas_catalogo_capacidade"),
    CheckConstraint("consumo_parado_kw >= 0 AND consumo_variavel_kw >= 0", name="ck_maquinas_catalogo_consumo"),
    CheckConstraint("ordem_processo IS NULL OR (ordem_processo >= 0 AND ordem_processo <= 9)", name="ck_maquinas_catalogo_ordem"),
    comment="Catálogo: os tipos de máquina que podem ser colocados numa fábrica, com limites, capacidade e consumo",
)
Index("ix_maquinas_catalogo_categoria_id", maquinas_catalogo.c.categoria_id)

manuais_maquina = Table(
    "manuais_maquina", metadata,
    Column("maquina_id", Integer, ForeignKey("maquinas_catalogo.id", ondelete="CASCADE"), primary_key=True, comment="Máquina a que o manual pertence (1 manual por máquina)"),
    Column("o_que_faz", Text, nullable=False, comment="Descrição completa da máquina"),
    Column("como_funciona_ritmo", Text, nullable=False, comment="Como o ritmo funciona"),
    Column("dicas", Text, nullable=False, comment="Dicas e cuidados"),
    comment="Texto do Manual das máquinas (relação 1 para 1 com o catálogo)",
)

fontes = Table(
    "fontes", metadata,
    pk(),
    Column("titulo", String(300), nullable=False, comment="Nome da fonte"),
    Column("url", String(500), nullable=True, comment="Link da fonte (todo dado real tem link)"),
    Column("tipo", String(40), nullable=False, comment="Ex.: ficha técnica, artigo científico, anúncio de fornecedor"),
    Column("confianca", String(10), nullable=False, comment="real, estimado ou hipotese"),
    Column("na_base_conhecimento", Boolean, nullable=False, server_default=false(), comment="Verdadeiro = documento consultado pelo assistente de conversa"),
    UniqueConstraint("url"),
    CheckConstraint("confianca IN ('real', 'estimado', 'hipotese')", name="ck_fontes_confianca"),
    comment="Fontes dos números (fichas, artigos, anúncios), cada uma com o nível de confiança",
)

maquina_fontes = Table(
    "maquina_fontes", metadata,
    Column("maquina_id", Integer, ForeignKey("maquinas_catalogo.id", ondelete="CASCADE"), primary_key=True, comment="Máquina"),
    Column("fonte_id", Integer, ForeignKey("fontes.id", ondelete="CASCADE"), primary_key=True, comment="Fonte"),
    Column("finalidade", String(10), primary_key=True, comment="numeros = base dos limites e capacidade; preco = base do preço estimado"),
    CheckConstraint("finalidade IN ('numeros', 'preco')", name="ck_maquina_fontes_finalidade"),
    comment="Liga máquinas e fontes (muitos para muitos)",
)
Index("ix_maquina_fontes_fonte_id", maquina_fontes.c.fonte_id)

precos_maquina = Table(
    "precos_maquina", metadata,
    pk(),
    Column("maquina_id", Integer, ForeignKey("maquinas_catalogo.id", ondelete="CASCADE"), nullable=False, comment="Máquina"),
    Column("preco_min", Numeric(14, 2), nullable=False, comment="Menor preço estimado de 1 unidade"),
    Column("preco_max", Numeric(14, 2), nullable=False, comment="Maior preço estimado de 1 unidade"),
    Column("moeda", String(3), nullable=False, server_default="BRL", comment="Moeda (câmbio de referência R$ 5,50 por US$)"),
    Column("observacao", Text, nullable=True, comment="Nota de como a faixa foi estimada"),
    Column("editado_pelo_usuario", Boolean, nullable=False, server_default=false(), comment="Verdadeiro = ajustado nas Configurações"),
    agora("vigente_desde", "Quando esta faixa passou a valer (permite guardar o histórico)"),
    CheckConstraint("preco_min >= 0 AND preco_min <= preco_max", name="ck_precos_maquina_faixa"),
    comment="Faixas de preço estimadas (nunca cotação), usadas para calcular o custo de uma melhoria",
)
Index("ix_precos_maquina_maquina_id", precos_maquina.c.maquina_id)

modelos_reais = Table(
    "modelos_reais", metadata,
    pk(),
    Column("maquina_id", Integer, ForeignKey("maquinas_catalogo.id", ondelete="CASCADE"), nullable=False, comment="Tipo de máquina do catálogo a que o modelo corresponde"),
    Column("fabricante", String(80), nullable=False, comment="Fabricante (ex.: Krones, Tetra Pak)"),
    Column("modelo", String(80), nullable=False, comment="Nome do modelo"),
    Column("aplicacao", String(200), nullable=True, comment="Para que serve (ex.: água sem gás em PET)"),
    Column("capacidade_min", Numeric(12, 0), nullable=True, comment="Capacidade mínima, quando a fonte informa uma faixa"),
    Column("capacidade_max", Numeric(12, 0), nullable=False, comment="Capacidade nominal máxima"),
    Column("unidade_capacidade", String(20), nullable=False, comment="garrafas/h, latas/h, recipientes/h ou L/h"),
    Column("fonte_id", Integer, ForeignKey("fontes.id", ondelete="RESTRICT"), nullable=False, comment="De onde vem o dado (com link e confiança)"),
    Column("observacao", Text, nullable=True, comment="Observações da pesquisa"),
    UniqueConstraint("fabricante", "modelo"),
    CheckConstraint("capacidade_max > 0 AND (capacidade_min IS NULL OR capacidade_min <= capacidade_max)", name="ck_modelos_reais_capacidade"),
    comment="Modelos comerciais reais pesquisados (capacidades de fabricantes), com a fonte de cada um",
)
Index("ix_modelos_reais_maquina_id", modelos_reais.c.maquina_id)

glossario_termos = Table(
    "glossario_termos", metadata,
    pk(),
    Column("grupo", String(40), nullable=False, comment="Produção, Risco e física, Energia e dinheiro, Processo de bebidas ou Sistema"),
    Column("termo", String(80), nullable=False, comment="A palavra explicada"),
    Column("definicao", Text, nullable=False, comment="Explicação em palavras simples"),
    UniqueConstraint("termo"),
    comment="Glossário de palavras difíceis do sistema",
)

glossario_palavras = Table(
    "glossario_palavras", metadata,
    pk(),
    Column("termo_id", Integer, ForeignKey("glossario_termos.id", ondelete="CASCADE"), nullable=False, comment="Termo do glossário"),
    Column("palavra", String(60), nullable=False, comment="Palavra que aparece nas telas e ganha o sublinhado com a explicação"),
    UniqueConstraint("palavra"),
    comment="Palavras que disparam a explicação de um termo nas telas (um termo pode ter várias)",
)
Index("ix_glossario_palavras_termo_id", glossario_palavras.c.termo_id)

# =====================================================================================================
# MÓDULO FÁBRICAS (o desenho montado pelo usuário)
# =====================================================================================================
fabricas = Table(
    "fabricas", metadata,
    pk(),
    Column("usuario_id", Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, comment="Dono da fábrica"),
    Column("nome", String(100), nullable=False, comment="Nome da fábrica"),
    Column("exemplo_origem", String(20), nullable=True, comment="Exemplo de que partiu (bebidas ou suco); vazio = montada do zero"),
    Column("temperatura_ambiente", SmallInteger, nullable=False, server_default="25", comment="Temperatura do ambiente em °C (0 a 45)"),
    Column("tarifa_energia", Numeric(8, 4), nullable=False, server_default="0.85", comment="Preço da energia em R$ por kWh"),
    Column("parada_emergencia", Boolean, nullable=False, server_default=false(), comment="Verdadeiro = botão de emergência acionado"),
    agora("criada_em", "Quando a fábrica foi criada"),
    agora("atualizada_em", "Última alteração"),
    UniqueConstraint("usuario_id", "nome", name="uq_fabricas_usuario_nome"),
    CheckConstraint("exemplo_origem IS NULL OR exemplo_origem IN ('bebidas', 'suco')", name="ck_fabricas_exemplo"),
    CheckConstraint("temperatura_ambiente >= 0 AND temperatura_ambiente <= 45", name="ck_fabricas_temperatura"),
    CheckConstraint("tarifa_energia >= 0", name="ck_fabricas_tarifa"),
    comment="Fábricas salvas pelos usuários (cada uma é um mapa de máquinas ligadas entre si)",
)
Index("ix_fabricas_usuario_id", fabricas.c.usuario_id)

fabrica_maquinas = Table(
    "fabrica_maquinas", metadata,
    pk(),
    Column("fabrica_id", Integer, ForeignKey("fabricas.id", ondelete="CASCADE"), nullable=False, comment="Fábrica em que a máquina foi colocada"),
    Column("maquina_id", Integer, ForeignKey("maquinas_catalogo.id", ondelete="RESTRICT"), nullable=False, comment="Tipo de máquina do catálogo"),
    Column("pos_x", Integer, nullable=False, server_default="0", comment="Posição horizontal no quadro (pixels)"),
    Column("pos_y", Integer, nullable=False, server_default="0", comment="Posição vertical no quadro (pixels)"),
    Column("ritmo", Numeric(12, 3), nullable=False, comment="Ritmo atual (na unidade do parâmetro da máquina)"),
    Column("unidades_paralelo", SmallInteger, nullable=False, server_default="1", comment="Quantas máquinas iguais trabalham lado a lado (1 a 6)"),
    Column("desligada", Boolean, nullable=False, server_default=false(), comment="Verdadeiro = máquina desligada"),
    UniqueConstraint("fabrica_id", "id", name="uq_fabrica_maquinas_fabrica_id"),
    CheckConstraint("pos_x >= 0 AND pos_y >= 0", name="ck_fabrica_maquinas_posicao"),
    CheckConstraint("ritmo >= 0", name="ck_fabrica_maquinas_ritmo"),
    CheckConstraint("unidades_paralelo >= 1 AND unidades_paralelo <= 6", name="ck_fabrica_maquinas_paralelo"),
    comment="Máquinas colocadas numa fábrica (um tipo do catálogo + ritmo, posição e unidades em paralelo)",
)
Index("ix_fabrica_maquinas_fabrica_id", fabrica_maquinas.c.fabrica_id)
Index("ix_fabrica_maquinas_maquina_id", fabrica_maquinas.c.maquina_id)

conexoes = Table(
    "conexoes", metadata,
    pk(),
    Column("fabrica_id", Integer, ForeignKey("fabricas.id", ondelete="CASCADE"), nullable=False, comment="Fábrica"),
    Column("origem_id", Integer, nullable=False, comment="Máquina de origem (a que envia o produto)"),
    Column("destino_id", Integer, nullable=False, comment="Máquina de destino (a que recebe o produto)"),
    # chaves compostas: garantem que origem e destino pertencem à MESMA fábrica da conexão
    ForeignKeyConstraint(["fabrica_id", "origem_id"], ["fabrica_maquinas.fabrica_id", "fabrica_maquinas.id"], ondelete="CASCADE", name="fk_conexoes_origem"),
    ForeignKeyConstraint(["fabrica_id", "destino_id"], ["fabrica_maquinas.fabrica_id", "fabrica_maquinas.id"], ondelete="CASCADE", name="fk_conexoes_destino"),
    UniqueConstraint("origem_id", "destino_id", name="uq_conexoes_origem_destino"),
    CheckConstraint("origem_id <> destino_id", name="ck_conexoes_sem_laco"),
    comment="Ligações entre duas máquinas da mesma fábrica (por onde o produto passa)",
)
Index("ix_conexoes_fabrica_id", conexoes.c.fabrica_id)
Index("ix_conexoes_destino_id", conexoes.c.destino_id)

# =====================================================================================================
# MÓDULO SIMULAÇÃO E RESULTADOS
# =====================================================================================================
cenarios = Table(
    "cenarios", metadata,
    pk(),
    Column("fabrica_id", Integer, ForeignKey("fabricas.id", ondelete="CASCADE"), nullable=False, comment="Fábrica fotografada"),
    Column("nome", String(100), nullable=False, comment="Nome do cenário (ex.: Situação inicial)"),
    agora("criado_em", "Quando a foto foi tirada"),
    Column("temperatura_ambiente", SmallInteger, nullable=False, comment="Temperatura considerada (°C)"),
    Column("producao_h", Numeric(12, 2), nullable=False, comment="Produção da fábrica (garrafas por hora)"),
    Column("risco_max", Numeric(5, 4), nullable=False, comment="Risco da pior máquina (0 a 1)"),
    Column("energia_kw", Numeric(10, 3), nullable=False, comment="Consumo total (kW)"),
    Column("gargalo_id", Integer, ForeignKey("fabrica_maquinas.id", ondelete="SET NULL"), nullable=True, comment="Máquina que era o gargalo"),
    CheckConstraint("risco_max >= 0 AND risco_max <= 1", name="ck_cenarios_risco"),
    CheckConstraint("producao_h >= 0 AND energia_kw >= 0", name="ck_cenarios_valores"),
    comment="Fotos de uma fábrica simulada, para comparar antes e depois",
)
Index("ix_cenarios_fabrica_id", cenarios.c.fabrica_id)

cenario_maquinas = Table(
    "cenario_maquinas", metadata,
    pk(),
    Column("cenario_id", Integer, ForeignKey("cenarios.id", ondelete="CASCADE"), nullable=False, comment="Cenário"),
    Column("maquina_id", Integer, ForeignKey("maquinas_catalogo.id", ondelete="RESTRICT"), nullable=False, comment="Tipo da máquina"),
    Column("fabrica_maquina_id", Integer, ForeignKey("fabrica_maquinas.id", ondelete="SET NULL"), nullable=True, comment="Máquina na fábrica (vazio se ela foi removida depois)"),
    Column("ritmo", Numeric(12, 3), nullable=False, comment="Ritmo na foto"),
    Column("unidades_paralelo", SmallInteger, nullable=False, comment="Unidades em paralelo na foto"),
    Column("desligada", Boolean, nullable=False, server_default=false(), comment="Estava desligada?"),
    Column("capacidade_h", Numeric(12, 2), nullable=False, comment="Quanto conseguia entregar (garrafas/h)"),
    Column("saida_h", Numeric(12, 2), nullable=False, comment="O que realmente saía (garrafas/h)"),
    Column("fila_h", Numeric(12, 2), nullable=False, server_default="0", comment="Excesso parado esperando esta máquina (garrafas/h)"),
    Column("risco", Numeric(5, 4), nullable=False, comment="Risco de falha (0 a 1)"),
    Column("estado", String(10), nullable=False, comment="normal, alerta, critico, falha ou desligada"),
    Column("energia_kw", Numeric(10, 3), nullable=False, comment="Consumo (kW)"),
    CheckConstraint("estado IN ('normal', 'alerta', 'critico', 'falha', 'desligada')", name="ck_cenario_maquinas_estado"),
    CheckConstraint("risco >= 0 AND risco <= 1", name="ck_cenario_maquinas_risco"),
    comment="Situação de cada máquina dentro de um cenário (capacidade, saída, fila, risco e energia)",
)
Index("ix_cenario_maquinas_cenario_id", cenario_maquinas.c.cenario_id)

simulacoes = Table(
    "simulacoes", metadata,
    pk(),
    Column("fabrica_id", Integer, ForeignKey("fabricas.id", ondelete="CASCADE"), nullable=False, comment="Fábrica simulada"),
    Column("usuario_id", Integer, ForeignKey("usuarios.id", ondelete="RESTRICT"), nullable=False, comment="Quem rodou o Play"),
    agora("iniciada_em", "Quando o Play foi iniciado"),
    Column("velocidade", SmallInteger, nullable=False, comment="Velocidade usada: 1, 5, 20 ou 60 vezes"),
    Column("duracao_min", Integer, nullable=False, comment="Duração simulada em minutos (30, 60 ou 480)"),
    Column("concluida", Boolean, nullable=False, server_default=true(), comment="Falso = parada antes do fim"),
    Column("garrafas_produzidas", Numeric(14, 0), nullable=False, comment="Total produzido no período"),
    Column("energia_kwh", Numeric(12, 2), nullable=False, comment="Energia gasta no período (kWh)"),
    Column("fila_total", Numeric(14, 0), nullable=False, server_default="0", comment="Garrafas paradas na fila ao final"),
    Column("pct_do_maximo", Numeric(6, 2), nullable=False, comment="Percentual do máximo possível (tudo no ótimo)"),
    Column("risco_max", Numeric(5, 4), nullable=False, comment="Maior risco visto (0 a 1)"),
    Column("gargalo_maquina_id", Integer, ForeignKey("maquinas_catalogo.id", ondelete="SET NULL"), nullable=True, comment="Tipo de máquina que mais limitou a fábrica"),
    CheckConstraint("velocidade IN (1, 5, 20, 60)", name="ck_simulacoes_velocidade"),
    CheckConstraint("duracao_min > 0", name="ck_simulacoes_duracao"),
    CheckConstraint("risco_max >= 0 AND risco_max <= 1", name="ck_simulacoes_risco"),
    CheckConstraint("garrafas_produzidas >= 0 AND energia_kwh >= 0 AND fila_total >= 0", name="ck_simulacoes_valores"),
    comment="Resultado final de cada vez que o usuário roda o Play",
)
Index("ix_simulacoes_fabrica_id", simulacoes.c.fabrica_id)

eventos_registro = Table(
    "eventos_registro", metadata,
    pk(),
    Column("fabrica_id", Integer, ForeignKey("fabricas.id", ondelete="CASCADE"), nullable=True, comment="Fábrica a que o evento se refere (vazio = evento geral)"),
    Column("usuario_id", Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True, comment="Quem causou o evento"),
    Column("simulacao_id", Integer, ForeignKey("simulacoes.id", ondelete="CASCADE"), nullable=True, comment="Simulação em que ocorreu (se foi durante o Play)"),
    agora("ocorrido_em", "Quando aconteceu"),
    Column("tipo", String(5), nullable=False, server_default="info", comment="info, ok, warn ou bad (cor da linha no Registro)"),
    Column("mensagem", Text, nullable=False, comment="O que aconteceu"),
    CheckConstraint("tipo IN ('info', 'ok', 'warn', 'bad')", name="ck_eventos_registro_tipo"),
    comment="Registro (log) do que o usuário faz e do que acontece durante a simulação",
)
Index("ix_eventos_registro_fabrica_ocorrido", eventos_registro.c.fabrica_id, eventos_registro.c.ocorrido_em)

planos_objetivo = Table(
    "planos_objetivo", metadata,
    pk(),
    Column("fabrica_id", Integer, ForeignKey("fabricas.id", ondelete="CASCADE"), nullable=False, comment="Fábrica"),
    Column("usuario_id", Integer, ForeignKey("usuarios.id", ondelete="RESTRICT"), nullable=False, comment="Quem pediu o plano"),
    agora("criado_em", "Quando o plano foi calculado"),
    Column("tipo_objetivo", String(5), nullable=False, comment="pct = aumentar em %; abs = chegar a uma produção; risk = reduzir o risco"),
    Column("valor_meta", Numeric(12, 2), nullable=True, comment="Valor pedido (% ou garrafas/h); vazio para risk"),
    Column("aceita_zona_atencao", Boolean, nullable=False, server_default=false(), comment="Permitiu operar acima do ótimo?"),
    Column("aceita_paralelo", Boolean, nullable=False, server_default=false(), comment="Permitiu usar mais máquinas em paralelo?"),
    Column("producao_antes", Numeric(12, 2), nullable=False, comment="Produção antes do plano (garrafas/h)"),
    Column("producao_depois", Numeric(12, 2), nullable=False, comment="Produção prevista depois do plano"),
    Column("risco_antes", Numeric(5, 4), nullable=False, comment="Risco máximo antes (0 a 1)"),
    Column("risco_depois", Numeric(5, 4), nullable=False, comment="Risco máximo depois (0 a 1)"),
    Column("investimento_min", Numeric(14, 2), nullable=False, server_default="0", comment="Investimento estimado mínimo (R$)"),
    Column("investimento_max", Numeric(14, 2), nullable=False, server_default="0", comment="Investimento estimado máximo (R$)"),
    Column("atingiu_meta", Boolean, nullable=False, comment="O plano consegue chegar à meta?"),
    Column("aplicado", Boolean, nullable=False, server_default=false(), comment="O usuário aplicou o plano na fábrica?"),
    CheckConstraint("tipo_objetivo IN ('pct', 'abs', 'risk')", name="ck_planos_objetivo_tipo"),
    CheckConstraint("investimento_min >= 0 AND investimento_min <= investimento_max", name="ck_planos_objetivo_investimento"),
    CheckConstraint("risco_antes >= 0 AND risco_antes <= 1 AND risco_depois >= 0 AND risco_depois <= 1", name="ck_planos_objetivo_risco"),
    comment="Planos do tipo 'quero +10% de produção': o que fazer, o resultado esperado e o investimento",
)
Index("ix_planos_objetivo_fabrica_id", planos_objetivo.c.fabrica_id)

plano_passos = Table(
    "plano_passos", metadata,
    pk(),
    Column("plano_id", Integer, ForeignKey("planos_objetivo.id", ondelete="CASCADE"), nullable=False, comment="Plano"),
    Column("ordem", SmallInteger, nullable=False, comment="Posição do passo no plano (1, 2, 3...)"),
    Column("acao", String(10), nullable=False, comment="ligar, paralelo ou ritmo"),
    Column("fabrica_maquina_id", Integer, ForeignKey("fabrica_maquinas.id", ondelete="SET NULL"), nullable=True, comment="Máquina da fábrica afetada (vazio se foi removida)"),
    Column("maquina_id", Integer, ForeignKey("maquinas_catalogo.id", ondelete="RESTRICT"), nullable=False, comment="Tipo da máquina afetada"),
    Column("ritmo_antes", Numeric(12, 3), nullable=True, comment="Ritmo antes (ação ritmo)"),
    Column("ritmo_depois", Numeric(12, 3), nullable=True, comment="Ritmo depois (ação ritmo)"),
    Column("unidades_antes", SmallInteger, nullable=True, comment="Unidades em paralelo antes (ação paralelo)"),
    Column("unidades_depois", SmallInteger, nullable=True, comment="Unidades em paralelo depois (ação paralelo)"),
    Column("motivo", Text, nullable=False, comment="O porquê do passo, em palavras simples"),
    Column("custo_min", Numeric(14, 2), nullable=True, comment="Custo estimado mínimo do passo (R$)"),
    Column("custo_max", Numeric(14, 2), nullable=True, comment="Custo estimado máximo do passo (R$)"),
    UniqueConstraint("plano_id", "ordem", name="uq_plano_passos_plano_ordem"),
    CheckConstraint("acao IN ('ligar', 'paralelo', 'ritmo')", name="ck_plano_passos_acao"),
    CheckConstraint("ordem >= 1", name="ck_plano_passos_ordem"),
    comment="Passos de um plano (qual máquina mexer, de quanto para quanto, por quê e quanto custa)",
)
Index("ix_plano_passos_plano_id", plano_passos.c.plano_id)

mensagens_chat = Table(
    "mensagens_chat", metadata,
    pk(),
    Column("usuario_id", Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, comment="Dono da conversa"),
    Column("fabrica_id", Integer, ForeignKey("fabricas.id", ondelete="SET NULL"), nullable=True, comment="Fábrica sobre a qual se conversava"),
    Column("autor", String(12), nullable=False, comment="usuario ou assistente"),
    Column("texto", Text, nullable=False, comment="Conteúdo da mensagem"),
    agora("criada_em", "Quando foi enviada"),
    CheckConstraint("autor IN ('usuario', 'assistente')", name="ck_mensagens_chat_autor"),
    comment="Conversa do usuário com o assistente",
)
Index("ix_mensagens_chat_usuario_criada", mensagens_chat.c.usuario_id, mensagens_chat.c.criada_em)

# Agrupamento usado no diagrama e na documentação
MODULOS = {
    "Acesso": ["usuarios"],
    "Catálogo de máquinas": ["categorias", "etapas", "maquinas_catalogo", "manuais_maquina", "fontes", "maquina_fontes", "precos_maquina", "modelos_reais"],
    "Apoio ao usuário": ["glossario_termos", "glossario_palavras", "mensagens_chat"],
    "Fábricas": ["fabricas", "fabrica_maquinas", "conexoes"],
    "Simulação e resultados": ["cenarios", "cenario_maquinas", "simulacoes", "planos_objetivo", "plano_passos", "eventos_registro"],
}
