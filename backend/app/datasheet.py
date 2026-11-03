"""Leitura de fichas técnicas: extrai, POR REGRAS (palavras-chave e padrões de texto), os dados de uma máquina.

Sem IA, sem internet e sem custo. O que as regras não entendem fica em branco para o usuário preencher na tela de conferência.
Cada campo extraído traz o trecho do documento de onde veio e a página (para o usuário conferir), e uma confiança:
  * "extraido"  : o número ou texto foi lido do documento;
  * "sugerido"  : o sistema deduziu por palavras-chave (ex.: o tipo da máquina);
  * "padrao"    : não achei no documento; usei um valor padrão (HIPÓTESE DIDÁTICA, a conferir).
"""
from __future__ import annotations

import re
import unicodedata
from collections import Counter
from typing import Optional

MAKERS = ["Tetra Pak", "Krones", "Sidel", "KHS", "GEA", "Alfa Laval", "Dorner", "SIG", "Bosch", "Sacmi", "Procomac", "Zalkin", "Ocme", "Tecnopool", "Gebo"]
STOPWORDS = {"for", "is", "are", "and", "the", "with", "in", "on", "of", "to", "from", "by", "has", "have", "provides", "can", "will", "as",
             "de", "da", "do", "para", "com", "e", "em", "um", "uma", "que", "per", "at", "or"}

# volume por hora (precisa de uma garrafa de referência para virar garrafas/h) e unidades já contadas em garrafas
VOLUME_UNITS = r"(?:l/h|litros?/h|liters?/h|litres?/h|m3/h|m³/h)"
COUNT_UNITS = r"(?:bph|bottles?/h|bottles per hour|garrafas?/h|cans?/h|latas?/h|containers?/h|recipientes?/h|pcs/h|units?/h|gf/h)"
UNIT_ANY = rf"(?:{VOLUME_UNITS}|{COUNT_UNITS})"
NUM = r"\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?"
EXCLUDE_LINE = re.compile(r"steam|vapor|vapour|water|[áa]gua|consumption|consumo|rinsing|compressed|ar comprimido|instrument air|\bair\b|\bcip\b|ice|gelad|kg/h|nl/m", re.I)

CATEGORIAS = {  # código da categoria do catálogo -> palavras-chave (sem acento, minúsculas)
    "termico": ["pasteuriz", "pasteuris", "heat exchanger", "trocador de calor", "uht", "sterili", "esteriliz", "carbonat", "carbonization", "plate heat"],
    "envase": ["filler", "filling", "enchedor", "envasad", "enchimento", "aseptic filling", "rinser", "capper"],
    "pos": ["label", "rotulad", "conveyor", "esteira", "transportador", "palletiz", "packer", "shrink", "wrap"],
    "preparo": ["blender", "blending", "mixer", "misturad", "juicer", "extrat", "filter", "filtr", "washer", "lavador", "homogeniz", "separator", "syrup", "xarope", "dosing", "dosagem"],
    "insumos": ["tank", "tanque", "silo", "reception", "recepcao", "storage", "armazenament", "reservoir"],
    "frio": ["chiller", "cold room", "camara fria", "refriger", "freezer", "cooling system"],
}
ETAPA_PADRAO = {"termico": "Tratamento térmico", "envase": "Envase", "pos": "Pós-envase", "preparo": "Preparo", "insumos": "Insumos", "frio": "Refrigeração"}
RANK_PADRAO = {"termico": 4, "envase": 6, "pos": 8, "preparo": 2, "insumos": 0, "frio": None}
SENSIBILIDADE_PADRAO = {"termico": "nenhuma", "envase": "motor", "pos": "motor", "preparo": "motor", "insumos": "tanque", "frio": "frio"}
ICONE_PADRAO = {"termico": "pasteur", "envase": "filler", "pos": "label", "preparo": "mixer", "insumos": "tank", "frio": "fridge"}
VIDA_UTIL_H = {"insumos": 60000, "preparo": 40000, "termico": 30000, "envase": 25000, "pos": 30000, "frio": 35000}
INTERVALO_MANUTENCAO_H = {"insumos": 2000, "preparo": 1500, "termico": 1000, "envase": 800, "pos": 1000, "frio": 1500}

# ritmo das máquinas importadas: % da capacidade nominal (hipótese didática: mesma lógica de risco do resto do sistema)
LIMITES_PADRAO = {"min": 30.0, "optimal": 100.0, "warning": 110.0, "failure": 120.0, "max": 125.0}
GARRAFA_PADRAO_L = 0.5     # conversão de litros por hora para garrafas por hora (hipótese: garrafa de 0,5 L)
FRACAO_PARADO = 0.15       # consumo parado = 15% da potência (hipótese didática)


def sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()


def parse_number(txt: str) -> Optional[float]:
    """'5,000' e '5.000' são cinco mil; '7,5' e '7.5' são sete e meio. Texto quebrado ('2,20 0') vira None."""
    t = txt.strip().replace(" ", "")
    if re.fullmatch(r"\d{1,3}(?:[.,]\d{3})+", t):
        return float(re.sub(r"[.,]", "", t))
    if re.fullmatch(r"\d+[.,]\d+", t):
        return float(t.replace(",", "."))
    if re.fullmatch(r"\d+", t):
        return float(t)
    return None


def _page_of(pages: list[str], snippet: str) -> Optional[int]:
    for i, p in enumerate(pages, start=1):
        if snippet in p:
            return i
    return None


def _field(value, confidence: str, snippet: Optional[str] = None, page: Optional[int] = None, note: Optional[str] = None) -> dict:
    return {"value": value, "confidence": confidence, "source_text": snippet, "page": page, "note": note}


def find_maker_and_model(lines: list[str]) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """O 'Fabricante Modelo' que mais aparece no documento (ex.: 'Tetra Pak Pasteurizer D Base'). Devolve (fabricante, modelo, trecho)."""
    contagem: Counter = Counter()
    primeira: dict = {}
    for ordem, ln in enumerate(lines):
        for maker in MAKERS:
            for m in re.finditer(rf"\b{re.escape(maker)}[®™]*\s+([A-Za-z0-9][^\n]*)", ln):
                tokens = []
                for tok in m.group(1).replace("®", "").replace("™", "").split():
                    limpo = tok.strip(",.;:()")
                    if not limpo or limpo.lower() in STOPWORDS or len(tokens) >= 5:
                        break
                    tokens.append(limpo)
                    if tok != limpo and tok[len(limpo):] in (",", ".", ";", ":", ")"):
                        break
                if not tokens:
                    continue
                chave = (maker, " ".join(tokens))
                contagem[chave] += 1 + (2 if ordem < 12 else 0)      # o que aparece no começo do documento vale mais
                primeira.setdefault(chave, (ordem, ln.strip()))
    if not contagem:
        return None, None, None
    melhor = max(contagem, key=lambda k: (contagem[k], -primeira[k][0]))
    return melhor[0], melhor[1], primeira[melhor][1]


def find_capacity(lines: list[str]) -> list[dict]:
    """Todas as capacidades (número + unidade) achadas em linhas que não falam de consumo de água, vapor, ar etc."""
    achados: list[dict] = []
    for ln in lines:
        if EXCLUDE_LINE.search(ln):
            continue
        antes = list(re.finditer(rf"({NUM})(?:\s*[–\-—]\s*({NUM}))?\s*\(?\s*({UNIT_ANY})\)?", ln, re.I))
        pegos: list[tuple[str, str]] = []
        if antes:
            for m in antes:
                for g in (m.group(1), m.group(2)):
                    if g:
                        pegos.append((g, m.group(3)))
        else:  # "Milk (l/h) 5,000  10,000": a unidade vem antes dos números
            m = re.search(rf"\(?\s*({UNIT_ANY})\s*\)?((?:\s+(?:{NUM}))+)\s*$", ln, re.I)
            if m:
                for g in re.findall(NUM, m.group(2)):
                    pegos.append((g, m.group(1)))
        for numero, unidade in pegos:
            v = parse_number(numero)
            if v is None or v < 100 or v > 5_000_000:
                continue
            familia = "contagem" if re.fullmatch(COUNT_UNITS, unidade, re.I) else "volume"
            achados.append({"value": v, "unit": unidade, "family": familia, "line": ln.strip()})
    return achados


def find_power_kw(lines: list[str]) -> Optional[tuple[float, str]]:
    """Maior potência elétrica citada (kW), de preferência numa linha que fale de eletricidade/potência."""
    candidatos = []
    for ln in lines:
        if re.search(r"kw\s*/\s*h|kwh", ln, re.I):
            continue
        for m in re.finditer(rf"({NUM})\s*(?:[–\-—]\s*({NUM})\s*)?kW\b", ln, re.I):
            for g in (m.group(1), m.group(2)):
                v = parse_number(g) if g else None
                if v is not None and 0 < v <= 5000:
                    peso = 2 if re.search(r"electric|eletric|elétric|power|pot[êe]ncia|installed|instalada", ln, re.I) else 1
                    candidatos.append((peso, v, ln.strip()))
    if not candidatos:
        return None
    peso, v, ln = max(candidatos, key=lambda c: (c[0], c[1]))
    return v, ln


def suggest_category(text: str, title: str) -> dict:
    t, ti = sem_acento(text), sem_acento(title)
    placar = {}
    achadas = {}
    for cat, palavras in CATEGORIAS.items():
        pts, ach = 0, []
        for p in palavras:
            n = t.count(p)
            if n:
                pts += n + (5 if p in ti else 0)
                ach.append(p)
        placar[cat], achadas[cat] = pts, ach
    ordenado = sorted(placar, key=lambda c: -placar[c])
    if placar[ordenado[0]] == 0:
        return {"code": None, "score": 0, "reasons": [], "alternatives": []}
    return {"code": ordenado[0], "score": placar[ordenado[0]], "reasons": achadas[ordenado[0]][:4],
            "alternatives": [c for c in ordenado[1:3] if placar[c] > 0]}


TITULOS = re.compile(r"^\s*(highlights|application|working principle|technical data|capacity|dimensions|consumption data|processing parameters|"
                     r"aplica[çc][ãa]o|princ[ií]pio de funcionamento|dados t[ée]cnicos|especifica[çc][õo]es)\s*$", re.I)


def section(text: str, heading: str, size: int = 500) -> Optional[str]:
    """O texto que vem depois de um título (ex.: 'Application'), até o próximo título ou até `size` caracteres."""
    linhas = text.splitlines()
    for i, ln in enumerate(linhas):
        if re.fullmatch(rf"\s*{heading}\s*", ln, re.I):
            corpo = []
            for prox in linhas[i + 1:]:
                if TITULOS.match(prox) or re.match(r"^\s*Tetra Pak.{0,3}\s+\w.*$", prox) and len(prox) < 70 and corpo:
                    break
                corpo.append(prox)
            txt = re.sub(r"\s+", " ", " ".join(corpo)).strip()
            if not txt:
                return None
            return txt[:size].rsplit(" ", 1)[0] if len(txt) > size else txt
    return None


def slug(s: str) -> str:
    s = sem_acento(s)
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s[:34] or "maquina"


def analyze(pages: list[str], filename: str, bottle_l: float = GARRAFA_PADRAO_L) -> dict:
    """Entende o texto da ficha. Devolve os campos (com trecho e página), a sugestão de tipo, avisos e o rascunho da máquina."""
    pages = [p.replace("\x00", "") for p in pages]    # o caractere NUL aparece em arquivos corrompidos e o PostgreSQL não aceita guardá-lo
    filename = filename.replace("\x00", "")
    texto = "\n".join(pages)
    lines = [ln for ln in texto.splitlines() if ln.strip()]
    avisos: list[str] = []
    campos: dict[str, dict] = {}

    maker, model, trecho = find_maker_and_model(lines)
    campos["maker"] = _field(maker, "extraido", trecho, _page_of(pages, trecho) if trecho else None) if maker else _field(None, "padrao")
    campos["model"] = _field(model, "extraido", trecho, _page_of(pages, trecho) if trecho else None) if model else _field(None, "padrao")
    if not model:
        avisos.append("Não encontrei o nome do modelo no documento: preencha o nome da máquina.")

    ano = re.search(r"(?:©|\(c\)|copyright)[^\n]{0,80}?\b((?:19|20)\d{2})\b", texto, re.I)
    campos["year"] = _field(int(ano.group(1)), "extraido", ano.group(0), _page_of(pages, ano.group(0))) if ano else _field(None, "padrao")

    # capacidade: prefere unidades já em garrafas; se só houver litros, converte com a garrafa de referência
    cap = find_capacity(lines)
    campos["capacity_nominal_per_hour"] = _field(None, "padrao")
    campos["capacity_min_per_hour"] = _field(None, "padrao")
    campos["capacity_original"] = _field(None, "padrao")
    if cap:
        familia = "contagem" if any(c["family"] == "contagem" for c in cap) else "volume"
        cs = [c for c in cap if c["family"] == familia]
        maior, menor = max(cs, key=lambda c: c["value"]), min(cs, key=lambda c: c["value"])
        fator = 1.0 if familia == "contagem" else (1000.0 if re.search(r"m3|m³", maior["unit"], re.I) else 1.0) / bottle_l
        fator_min = 1.0 if familia == "contagem" else (1000.0 if re.search(r"m3|m³", menor["unit"], re.I) else 1.0) / bottle_l
        pg = _page_of(pages, maior["line"])
        nota = None if familia == "contagem" else f"Convertido de {maior['unit']} para garrafas/h supondo garrafa de {bottle_l:g} L (hipótese)."
        campos["capacity_nominal_per_hour"] = _field(round(maior["value"] * fator), "extraido", maior["line"], pg, nota)
        campos["capacity_original"] = _field(f"{maior['value']:,.0f} {maior['unit']}".replace(",", "."), "extraido", maior["line"], pg)
        if menor["value"] != maior["value"]:
            campos["capacity_min_per_hour"] = _field(round(menor["value"] * fator_min), "extraido", menor["line"], _page_of(pages, menor["line"]))
        if familia == "volume":
            avisos.append(f"A capacidade está em volume por hora; converti para garrafas/h supondo garrafa de {bottle_l:g} L. Confira o valor.")
    else:
        avisos.append("Não encontrei a capacidade (litros/h ou garrafas/h): preencha a capacidade nominal.")

    pot = find_power_kw(lines)
    if pot:
        campos["power_kw"] = _field(pot[0], "extraido", pot[1], _page_of(pages, pot[1]))
    else:
        campos["power_kw"] = _field(None, "padrao")
        avisos.append("Não encontrei a potência elétrica (kW): usei um consumo padrão (hipótese). Confira.")

    titulo = f"{maker or ''} {model or ''} {filename}"
    cat = suggest_category(texto, titulo)
    campos["category"] = _field(cat["code"], "sugerido" if cat["code"] else "padrao", None, None,
                                ("Palavras-chave: " + ", ".join(cat["reasons"])) if cat["reasons"] else None)
    if not cat["code"]:
        avisos.append("Não consegui descobrir o tipo da máquina pelas palavras do documento: escolha o tipo.")

    app_txt, how = section(texto, "Application", 450), section(texto, "Working principle", 600)
    campos["description"] = _field(app_txt, "extraido", (app_txt or "")[:120] or None) if app_txt else _field(None, "padrao")
    campos["how_it_works"] = _field(how, "extraido", (how or "")[:120] or None) if how else _field(None, "padrao")

    return {"fields": campos, "category_suggestion": cat, "warnings": avisos, "bottle_volume_l": bottle_l}


def build_draft(analysis_fields: dict, overrides: dict, filename: str) -> dict:
    """Junta o que foi lido do documento com o que o usuário digitou e monta os dados de uma máquina do catálogo."""
    def val(k):
        o = overrides.get(k)
        if o is not None and o != "":
            return o
        return analysis_fields.get(k, {}).get("value")

    maker, model = val("maker"), val("model")
    cat = val("category")
    nome = overrides.get("name") or (f"{model}" if model else None)
    nominal = val("capacity_nominal_per_hour")
    power = val("power_kw")
    problemas = []
    if not nome:
        problemas.append("Dê um nome para a máquina.")
    if not cat or cat not in CATEGORIAS:
        problemas.append("Escolha o tipo da máquina.")
    if not nominal or float(nominal) <= 0:
        problemas.append("Informe a capacidade nominal (garrafas por hora).")
    limites = dict(LIMITES_PADRAO)
    for k in limites:
        if overrides.get(f"limit_{k}") is not None:
            limites[k] = float(overrides[f"limit_{k}"])
    if not (limites["min"] <= limites["optimal"] <= limites["warning"] <= limites["failure"] <= limites["max"]):
        problemas.append("Os limites precisam seguir: mínimo ≤ ótimo ≤ atenção ≤ falha ≤ máximo.")
    if power is not None and float(power) > 0:
        parado, variavel = round(float(power) * FRACAO_PARADO, 3), round(float(power) * (1 - FRACAO_PARADO), 3)
        energia_conf = analysis_fields.get("power_kw", {}).get("confidence", "extraido") if overrides.get("power_kw") is None else "informado"
    else:
        parado, variavel, energia_conf = 1.0, 3.0, "padrao"
    cap_fonte = "informado pelo usuário" if overrides.get("capacity_nominal_per_hour") is not None else "lido do documento"
    base = (f"Importada da ficha técnica '{filename}'. Capacidade nominal de {float(nominal):,.0f} garrafas/h ({cap_fonte}). "
            .replace(",", ".") if nominal else f"Importada da ficha técnica '{filename}'. ")
    base += (f"Consumo elétrico: {'derivado de ' + str(power) + ' kW (' + str(int(FRACAO_PARADO * 100)) + '% parado, o resto variável; hipótese didática)' if power else 'valor padrão (hipótese didática)'}. "
             "O ritmo é medido em % da capacidade nominal e os limites (ótimo 100%, atenção 110%, falha 120%) são hipótese didática, a validar.")
    desc = val("description") or f"Máquina importada da ficha técnica {filename}."
    como = val("how_it_works") or "Ajuste o ritmo em % da capacidade nominal. No ótimo (100%) ela trabalha bem; acima disso rende um pouco mais, mas o risco e o desgaste aumentam."
    draft = {
        "name": nome, "maker": maker, "model": model, "year": val("year"), "category": cat,
        "capacity_nominal_per_hour": float(nominal) if nominal else None, "power_kw": float(power) if power else None,
        "limits": limites, "standby_kw": parado, "variable_kw": variavel, "energy_confidence": energia_conf,
        "description": desc, "how_it_works": como, "basis": base,
        "stage": ETAPA_PADRAO.get(cat), "process_order": RANK_PADRAO.get(cat), "thermal_sensitivity": SENSIBILIDADE_PADRAO.get(cat, "nenhuma"),
        "icon": ICONE_PADRAO.get(cat, "factory"),
        "life_hours": VIDA_UTIL_H.get(cat, 30000), "maintenance_interval_hours": INTERVALO_MANUTENCAO_H.get(cat, 1000),
        "problems": problemas,
    }
    return draft
