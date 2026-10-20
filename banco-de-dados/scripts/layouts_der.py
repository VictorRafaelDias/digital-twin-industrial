"""Onde fica cada tabela em cada diagrama (usado por gerar_der.py).

`colunas`: lista de colunas (da esquerda para a direita); cada coluna lista as tabelas de cima para baixo.
Um item pode ser "tabela" ou ("tabela", {"y": px} | {"gap": px} | {"com": "outra"}) para ajustar a posição.
`lados`: força por onde a linha sai/entra: {(pai, filho): ("lado do pai", "lado do filho")}.
`fantasmas`: tabelas de outros módulos mostradas só com a chave, para dar contexto.
"""

SUB = "Digital Twin Industrial · base de dados PostgreSQL · gerado de banco-de-dados/scripts/modelo.py"

LAYOUTS = {
    "visao_geral": {
        "arquivo": "DER-visao-geral.png",
        "titulo": "Digital Twin Industrial: DER, visão geral (21 tabelas)",
        "subtitulo": "Cada caixa mostra as chaves (PK, FK) e o nome da tabela. Todas as colunas estão em DER-completo.png. " + "Lê-se: um(a) pai … vários(as) filho(s).",
        "modo": "chaves",
        "canal": 150,
        "gap": 100,
        "margem_dir": 110,
        "colunas": [
            ["glossario_termos", "glossario_palavras", ("fontes", {"y": 330})],
            [("categorias", {"y": 0}), ("maquina_fontes", {"y": 200}), "modelos_reais", "precos_maquina", "manuais_maquina"],
            [("etapas", {"y": 0}), ("maquinas_catalogo", {"y": 200})],
            [("fabrica_maquinas", {"y": 200}), "conexoes", "cenario_maquinas"],
            [("fabricas", {"y": 200}), ("cenarios", {"com": "cenario_maquinas"}), "plano_passos"],
            [("usuarios", {"y": 0}), ("simulacoes", {"y": 200}), "eventos_registro", ("planos_objetivo", {"com": "plano_passos"}), "mensagens_chat"],
        ],
        "lados": {
            ("usuarios", "fabricas"): ("left", "top"),
            ("usuarios", "eventos_registro"): ("right", "right"),
            ("usuarios", "planos_objetivo"): ("right", "right"),
            ("usuarios", "mensagens_chat"): ("right", "right"),
        },
    },

    "completo": {
        "arquivo": "DER-completo.png",
        "titulo": "Digital Twin Industrial: DER, modelo completo (todas as colunas)",
        "subtitulo": "As 21 tabelas com todas as colunas e os tipos. " + "Lê-se: um(a) pai … vários(as) filho(s).",
        "modo": "completo",
        "canal": 170,
        "gap": 100,
        "margem_dir": 110,
        "colunas": [
            ["glossario_termos", "glossario_palavras", ("fontes", {"y": 330})],
            [("categorias", {"y": 0}), ("maquina_fontes", {"y": 240}), "modelos_reais", "precos_maquina", "manuais_maquina"],
            [("etapas", {"y": 0}), ("maquinas_catalogo", {"y": 200})],
            [("fabrica_maquinas", {"y": 200}), "conexoes", "cenario_maquinas"],
            [("fabricas", {"y": 200}), ("cenarios", {"com": "cenario_maquinas"}), "plano_passos"],
            [("usuarios", {"y": 0}), ("simulacoes", {"y": 300}), "eventos_registro", ("planos_objetivo", {"com": "plano_passos"}), "mensagens_chat"],
        ],
        "lados": {
            ("usuarios", "fabricas"): ("left", "top"),
            ("usuarios", "eventos_registro"): ("right", "right"),
            ("usuarios", "planos_objetivo"): ("right", "right"),
            ("usuarios", "mensagens_chat"): ("right", "right"),
        },
    },
    "modulo1": {
        "arquivo": "DER-modulo-1-acesso.png",
        "titulo": "DER do módulo 1: Acesso (usuários)",
        "subtitulo": "A tabela de usuários e as tabelas que dependem dela (em cinza, só a chave). " + "Lê-se: um(a) pai … vários(as) filho(s).",
        "modo": "completo",
        "canal": 190,
        "gap": 60,
        "colunas": [
            [("usuarios", {"y": 150})],
            ["fabricas", "simulacoes", "planos_objetivo", "eventos_registro", "mensagens_chat"],
        ],
        "fantasmas": ["fabricas", "simulacoes", "planos_objetivo", "eventos_registro", "mensagens_chat"],
    },
    "modulo2": {
        "arquivo": "DER-modulo-2-catalogo.png",
        "titulo": "DER do módulo 2: Catálogo de máquinas",
        "subtitulo": "Máquinas, categorias, etapas, manuais, fontes, preços e modelos reais (em cinza, tabelas de outros módulos que usam o catálogo). " + "Lê-se: um(a) pai … vários(as) filho(s).",
        "modo": "completo",
        "canal": 170,
        "gap": 80,
        "colunas": [
            [("fontes", {"y": 330})],
            [("categorias", {"y": 0}), ("maquina_fontes", {"y": 240}), "modelos_reais", "precos_maquina", "manuais_maquina"],
            [("etapas", {"y": 0}), "maquinas_catalogo"],
            ["fabrica_maquinas", "cenario_maquinas", "plano_passos", "simulacoes"],
        ],
        "fantasmas": ["fabrica_maquinas", "cenario_maquinas", "plano_passos", "simulacoes"],
    },
    "modulo3": {
        "arquivo": "DER-modulo-3-apoio.png",
        "titulo": "DER do módulo 3: Apoio ao usuário (glossário e conversa)",
        "subtitulo": "Glossário e mensagens do assistente (em cinza, tabelas de outros módulos). " + "Lê-se: um(a) pai … vários(as) filho(s).",
        "modo": "completo",
        "canal": 170,
        "gap": 90,
        "colunas": [
            ["glossario_termos", "glossario_palavras"],
            [("usuarios", {"y": 0}), ("fabricas", {"y": 200})],
            [("mensagens_chat", {"y": 60})],
        ],
        "fantasmas": ["usuarios", "fabricas"],
    },
    "modulo4": {
        "arquivo": "DER-modulo-4-fabricas.png",
        "titulo": "DER do módulo 4: Fábricas (fábricas, máquinas colocadas e conexões)",
        "subtitulo": "Em cinza, tabelas de outros módulos ligadas a este. " + "Lê-se: um(a) pai … vários(as) filho(s).",
        "modo": "completo",
        "canal": 190,
        "gap": 90,
        "colunas": [
            [("usuarios", {"y": 0}), ("fabricas", {"y": 220})],
            [("maquinas_catalogo", {"y": 0}), "fabrica_maquinas", "conexoes"],
        ],
        "fantasmas": ["usuarios", "maquinas_catalogo"],
    },
    "modulo5": {
        "arquivo": "DER-modulo-5-simulacao.png",
        "titulo": "DER do módulo 5: Simulação e resultados",
        "subtitulo": "Cenários, simulações, planos de melhoria e registro de eventos (em cinza, tabelas de outros módulos). " + "Lê-se: um(a) pai … vários(as) filho(s).",
        "modo": "completo",
        "canal": 210,
        "gap": 80,
        "margem_dir": 60,
        "colunas": [
            [("cenarios", {"y": 0}), ("cenario_maquinas", {"y": 330})],
            [("fabricas", {"y": 0}), ("maquinas_catalogo", {"y": 200}), ("fabrica_maquinas", {"y": 380})],
            [("simulacoes", {"y": 0}), "eventos_registro", "planos_objetivo", "plano_passos"],
            [("usuarios", {"y": 0})],
        ],
        "fantasmas": ["fabricas", "usuarios", "fabrica_maquinas", "maquinas_catalogo"],
    },
}
