#!/usr/bin/env python3
"""Desenha o DER (diagrama entidade-relacionamento) com linhas RETAS (ortogonais) e tabelas bem organizadas.

Lê as tabelas de `modelo.py` (a mesma fonte dos scripts SQL), posiciona cada tabela num lugar escolhido à mão
(veja LAYOUTS) e liga as tabelas com linhas horizontais e verticais, sem passar por cima de outras tabelas.
Notação "pé de galinha": || = exatamente um, |o = zero ou um, o< = zero ou vários.

Uso:    python scripts/gerar_der.py            (gera os PNG em der/)
Requer: SQLAlchemy e Pillow
"""
from __future__ import annotations

import heapq
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy.dialects import sqlite

sys.path.insert(0, str(Path(__file__).resolve().parent))
import modelo as M  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "der"

# ---------------------------------------------------------------------------------------------------
# Aparência
# ---------------------------------------------------------------------------------------------------
SC = 3            # desenha 3x maior e reduz (serrilhado some)
FINAL = 2         # resolução final = 2x o tamanho "lógico" (nítido ao dar zoom)
G = 8             # passo da grade onde as linhas são roteadas (px lógicos)
MARGEM_TOPO = 96
COR_MODULO = {
    "Acesso": "#2f4b7c",
    "Catálogo de máquinas": "#1c7293",
    "Apoio ao usuário": "#7a4e9e",
    "Fábricas": "#c46a1a",
    "Simulação e resultados": "#2e8b57",
}
COR_LINHA = "#4a5a69"
COR_TEXTO = "#17232e"
FUNDO = "#ffffff"


def fonte(tam: float, negrito: bool = False) -> ImageFont.FreeTypeFont:
    nome = "arialbd.ttf" if negrito else "arial.ttf"
    return ImageFont.truetype(nome, int(round(tam * SC)))


F_TIT, F_SUB = fonte(22, True), fonte(12.5)
F_CAB, F_COL, F_TIPO, F_ROT, F_BADGE = fonte(13.5, True), fonte(12), fonte(10.5), fonte(10.5), fonte(8.5, True)

TIPOS = {"INTEGER": "int", "SMALLINT": "int", "VARCHAR": "string", "TEXT": "text", "NUMERIC": "decimal", "BOOLEAN": "boolean", "DATETIME": "datetime"}
ROTULOS = {  # (tabela filha, coluna): "verbo" lido do pai para o filho
    ("maquinas_catalogo", "categoria_id"): "agrupa", ("maquinas_catalogo", "etapa_id"): "contém",
    ("manuais_maquina", "maquina_id"): "tem manual", ("maquina_fontes", "maquina_id"): "usa",
    ("maquina_fontes", "fonte_id"): "sustenta", ("precos_maquina", "maquina_id"): "tem preço",
    ("modelos_reais", "maquina_id"): "exemplificada por", ("modelos_reais", "fonte_id"): "documenta",
    ("glossario_palavras", "termo_id"): "é chamado por", ("fabricas", "usuario_id"): "possui",
    ("fabrica_maquinas", "fabrica_id"): "contém", ("fabrica_maquinas", "maquina_id"): "instancia",
    ("conexoes", "fabrica_id"): "liga dentro de", ("conexoes", "origem_id"): "envia por", ("conexoes", "destino_id"): "recebe por",
    ("cenarios", "fabrica_id"): "gera", ("cenarios", "gargalo_id"): "tinha gargalo", ("cenario_maquinas", "cenario_id"): "detalha",
    ("cenario_maquinas", "maquina_id"): "do tipo", ("cenario_maquinas", "fabrica_maquina_id"): "registra",
    ("simulacoes", "fabrica_id"): "é simulada em", ("simulacoes", "usuario_id"): "roda", ("simulacoes", "gargalo_maquina_id"): "limitou",
    ("eventos_registro", "fabrica_id"): "registra", ("eventos_registro", "usuario_id"): "causa", ("eventos_registro", "simulacao_id"): "ocorre em",
    ("planos_objetivo", "fabrica_id"): "recebe", ("planos_objetivo", "usuario_id"): "pede", ("plano_passos", "plano_id"): "é feito de",
    ("plano_passos", "fabrica_maquina_id"): "mexe em", ("plano_passos", "maquina_id"): "afeta tipo", ("mensagens_chat", "usuario_id"): "escreve",
    ("mensagens_chat", "fabrica_id"): "trata de",
}
COLUNAS_CHAVE_EXTRA = ("nome", "nome_usuario", "codigo", "titulo", "termo")


def modulo_de(tabela: str) -> str:
    return next(m for m, ts in M.MODULOS.items() if tabela in ts)


# ---------------------------------------------------------------------------------------------------
# Modelo -> caixas e relacionamentos
# ---------------------------------------------------------------------------------------------------
class Caixa:
    def __init__(self, nome: str, modo: str, fantasma: bool) -> None:
        tb = M.metadata.tables[nome]
        fks = {fk.parent.name for fk in tb.foreign_keys}
        self.nome, self.fantasma = nome, fantasma
        self.linhas: list[tuple[str, str, str]] = []  # (marca, nome, tipo)
        for col in tb.columns:
            marca = "PK FK" if col.primary_key and col.name in fks else "PK" if col.primary_key else "FK" if col.name in fks else ""
            if modo == "chaves" and not marca and col.name not in COLUNAS_CHAVE_EXTRA:
                continue
            if fantasma and not col.primary_key and col.name not in COLUNAS_CHAVE_EXTRA[:1] + ("nome_usuario",):
                continue
            tipo = TIPOS.get(col.type.compile(dialect=sqlite.dialect()).split("(")[0].upper(), "string")
            self.linhas.append((marca, col.name, tipo))
        self.cor = "#8a949c" if fantasma else COR_MODULO[modulo_de(nome)]
        self.x = self.y = self.w = self.h = 0

    @property
    def rect(self) -> tuple[int, int, int, int]:
        return self.x, self.y, self.x + self.w, self.y + self.h


ALTURA_CAB, ALTURA_LIN = 30, 19


def medir(txt: str, f: ImageFont.FreeTypeFont) -> float:
    return f.getlength(txt) / SC


def relacionamentos(nomes: set[str], fantasmas: set[str] = frozenset()) -> list[dict]:
    """Um item por chave estrangeira entre as tabelas do diagrama (mesma regra dos .mmd)."""
    rels, feitos = [], set()
    for nome in sorted(nomes, key=list(M.metadata.tables).index):
        tb = M.metadata.tables[nome]
        for fk in tb.foreign_keys:
            pai = fk.column.table.name
            if pai == "fabrica_maquinas" and fk.column.name == "fabrica_id":
                continue  # parte da chave composta de conexoes
            if pai not in nomes or (nome, fk.parent.name, pai) in feitos:
                continue
            if pai in fantasmas and nome in fantasmas:
                continue  # entre duas tabelas de contexto não desenha
            feitos.add((nome, fk.parent.name, pai))
            rels.append({
                "pai": pai, "filho": nome, "col": fk.parent.name,
                "um_um": fk.parent.primary_key and len(tb.primary_key.columns) == 1,
                "obrig": not fk.parent.nullable,
                "rotulo": ROTULOS.get((nome, fk.parent.name), fk.parent.name),
            })
    return rels


# ---------------------------------------------------------------------------------------------------
# Roteamento ortogonal (A* na grade, com penalidade por curva e por sobrepor outras linhas)
# ---------------------------------------------------------------------------------------------------
DIRS = [(1, 0), (0, 1), (-1, 0), (0, -1)]  # leste, sul, oeste, norte
LADO_DIR = {"right": 0, "bottom": 1, "left": 2, "top": 3}


class Roteador:
    def __init__(self, largura: int, altura: int, caixas: list[Caixa]) -> None:
        self.nx, self.ny = largura // G + 2, altura // G + 2
        self.bloq = set()
        margem = 12
        for c in caixas:
            x0, y0, x1, y1 = c.rect
            for cx in range((x0 - margem) // G, (x1 + margem) // G + 1):
                for cy in range((y0 - margem) // G, (y1 + margem) // G + 1):
                    self.bloq.add((cx, cy))
        for cx in range(self.nx):
            for cy in range(MARGEM_TOPO // G):
                self.bloq.add((cx, cy))
        self.uso: dict[tuple[int, int], set[int]] = {}  # célula -> {0: horizontal, 1: vertical}

    def marcar(self, cel: tuple[int, int], orient: int) -> None:
        self.uso.setdefault(cel, set()).add(orient)

    def custo_celula(self, cel: tuple[int, int], orient: int) -> float:
        c = 0.0
        u = self.uso.get(cel)
        if u:
            c += 22 if orient in u else 5
        # vizinhas paralelas (evita linhas coladas)
        dx, dy = (0, 1) if orient == 0 else (1, 0)
        for s in (-1, 1):
            v = self.uso.get((cel[0] + dx * s, cel[1] + dy * s))
            if v and orient in v:
                c += 3
        return c

    def rota(self, ini: tuple[int, int], dir_ini: int, fim: tuple[int, int], dir_fim: int) -> list[tuple[int, int]] | None:
        """Caminho de ini até fim (células). Sai de `ini` na direção dir_ini e chega em `fim` andando em dir_fim."""
        h = lambda c: abs(c[0] - fim[0]) + abs(c[1] - fim[1])  # noqa: E731
        inicio = (ini, dir_ini)
        melhor = {inicio: 0.0}
        veio: dict = {}
        fila = [(h(ini), 0.0, ini, dir_ini)]
        while fila:
            _, g, cel, d = heapq.heappop(fila)
            if g > melhor.get((cel, d), 1e18):
                continue
            if cel == fim and d == dir_fim:
                cam = [cel]
                est = (cel, d)
                while est in veio:
                    est = veio[est]
                    cam.append(est[0])
                return cam[::-1]
            for nd, (dx, dy) in enumerate(DIRS):
                if (nd + 2) % 4 == d:
                    continue  # não volta
                nxt = (cel[0] + dx, cel[1] + dy)
                if not (0 <= nxt[0] < self.nx and 0 <= nxt[1] < self.ny):
                    continue
                if nxt in self.bloq and nxt != fim:
                    continue
                novo = g + 1 + (9 if nd != d else 0) + self.custo_celula(nxt, nd % 2)
                chave = (nxt, nd)
                if novo < melhor.get(chave, 1e18):
                    melhor[chave] = novo
                    veio[chave] = (cel, d)
                    heapq.heappush(fila, (novo + h(nxt), novo, nxt, nd))
        return None


# ---------------------------------------------------------------------------------------------------
# Desenho
# ---------------------------------------------------------------------------------------------------
def pt(x: float, y: float) -> tuple[float, float]:
    return x * SC, y * SC


def desenhar_pe_de_galinha(d: ImageDraw.ImageDraw, p: tuple[int, int], saida: tuple[int, int], tipo: str) -> None:
    """tipo: 'um' (||), 'zero_um' (|o), 'zero_muitos' (o<). p = ponto na borda da tabela; saida = direção que se afasta da tabela."""
    ox, oy = saida
    px, py = -oy, ox  # perpendicular
    L = 2.0 * SC

    def ponto(a: float, b: float) -> tuple[float, float]:
        return (p[0] + ox * a + px * b) * SC, (p[1] + oy * a + py * b) * SC

    def traco(a: float, b: float) -> None:
        d.line([ponto(a, -b), ponto(a, b)], fill=COR_LINHA, width=int(L))

    def circulo(a: float) -> None:
        cx, cy = ponto(a, 0)
        r = 4.2 * SC
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=FUNDO, outline=COR_LINHA, width=int(L))

    if tipo == "um":
        traco(9, 6)
        traco(14, 6)
    elif tipo == "zero_um":
        traco(9, 6)
        circulo(17)
    else:  # zero_muitos
        for b in (-7, 0, 7):
            d.line([ponto(13, 0), ponto(0, b)], fill=COR_LINHA, width=int(L))
        circulo(19)


def gerar(layout: dict, arquivo: Path) -> None:
    modo = layout["modo"]
    fantasmas = layout.get("fantasmas", [])
    nomes_mod = [n for col in layout["colunas"] for n in [(i if isinstance(i, str) else i[0]) for i in col] if n not in fantasmas]
    caixas: dict[str, Caixa] = {}
    for n in nomes_mod:
        caixas[n] = Caixa(n, modo, False)
    for n in fantasmas:
        caixas[n] = Caixa(n, modo, True)
    # tamanho das caixas: largura única por diagrama
    larg = 0.0
    for c in caixas.values():
        larg = max(larg, medir(c.nome, F_CAB) + 26)
        for marca, nome, tipo in c.linhas:
            larg = max(larg, 38 + medir(nome, F_COL) + 18 + medir(tipo, F_TIPO) + 12)
    W = int(max(larg, layout.get("largura_min", 200)) // 2 * 2)
    canal = layout.get("canal", 150)
    for c in caixas.values():
        c.w, c.h = W, ALTURA_CAB + ALTURA_LIN * len(c.linhas) + 6
    # colunas: cada item é "tabela" ou ("tabela", {"y": px} | {"gap": px} | {"com": "outra_tabela"})
    gap_padrao = layout.get("gap", 56)
    for ci, itens in enumerate(layout["colunas"]):
        y = 0
        for item in itens:
            nome, op = (item, {}) if isinstance(item, str) else item
            c = caixas[nome]
            if "y" in op:
                y = op["y"]
            elif "com" in op:
                y = caixas[op["com"]].y - MARGEM_TOPO - 20
            else:
                y += op.get("gap", 0)
            c.x = 40 + int(ci * (W + canal))
            c.y = MARGEM_TOPO + 20 + int(y)
            y += c.h + gap_padrao
    largura = max(c.x + c.w for c in caixas.values()) + layout.get("margem_dir", 40)
    altura = max(c.y + c.h for c in caixas.values()) + 90
    largura = max(largura, 1000)

    # --- relacionamentos, lados e portas
    rels = relacionamentos(set(caixas), set(fantasmas))
    dicas = layout.get("lados", {})
    for r in rels:
        a, b = caixas[r["pai"]], caixas[r["filho"]]
        dica = dicas.get((r["pai"], r["filho"], r["col"])) or dicas.get((r["pai"], r["filho"]))
        if dica:
            r["lado_p"], r["lado_f"] = dica
        elif a.x + a.w + 40 <= b.x:
            r["lado_p"], r["lado_f"] = "right", "left"
        elif b.x + b.w + 40 <= a.x:
            r["lado_p"], r["lado_f"] = "left", "right"
        elif a.y + a.h <= b.y:
            r["lado_p"], r["lado_f"] = "bottom", "top"
        else:
            r["lado_p"], r["lado_f"] = "top", "bottom"

    portas: dict[tuple[str, str], list[tuple[dict, str]]] = {}
    for r in rels:
        portas.setdefault((r["pai"], r["lado_p"]), []).append((r, "p"))
        portas.setdefault((r["filho"], r["lado_f"]), []).append((r, "f"))
    for (nome, lado), itens in portas.items():
        c = caixas[nome]

        def chave(it):
            r, papel = it
            outro = caixas[r["filho"] if papel == "p" else r["pai"]]
            return (outro.y + outro.h / 2) if lado in ("left", "right") else (outro.x + outro.w / 2)

        itens.sort(key=chave)
        comp = c.h - ALTURA_CAB if lado in ("left", "right") else c.w
        ini = (c.y + ALTURA_CAB) if lado in ("left", "right") else c.x
        n = len(itens)
        for i, (r, papel) in enumerate(itens):
            pos = ini + comp * (i + 1) / (n + 1)
            pos = round((pos - G / 2) / G) * G + G / 2
            r["porta_" + papel] = pos
    # (as portas têm de ficar dentro da lateral da caixa)
    def ponto_porta(c: Caixa, lado: str, pos: float) -> tuple[int, int]:
        if lado == "left":
            return c.x, int(pos)
        if lado == "right":
            return c.x + c.w, int(pos)
        if lado == "top":
            return int(pos), c.y
        return int(pos), c.y + c.h

    rot = Roteador(largura, altura, list(caixas.values()))
    # rota primeiro as ligações curtas (acham o melhor caminho sem atrapalhar)
    ordem = sorted(rels, key=lambda r: abs(caixas[r["pai"]].x - caixas[r["filho"]].x) + abs(caixas[r["pai"]].y - caixas[r["filho"]].y))
    STUB = 30
    falhas = []
    for r in ordem:
        pa, pf = caixas[r["pai"]], caixas[r["filho"]]
        p0, p1 = ponto_porta(pa, r["lado_p"], r["porta_p"]), ponto_porta(pf, r["lado_f"], r["porta_f"])
        d0, d1 = DIRS[LADO_DIR[r["lado_p"]]], DIRS[LADO_DIR[r["lado_f"]]]
        s0 = (p0[0] + d0[0] * STUB, p0[1] + d0[1] * STUB)
        s1 = (p1[0] + d1[0] * STUB, p1[1] + d1[1] * STUB)
        c0 = (int(s0[0] // G), int(s0[1] // G))
        c1 = (int(s1[0] // G), int(s1[1] // G))
        # a ponta da parte reta precisa ficar exatamente no centro da célula: ajusta a porta
        cam = rot.rota(c0, LADO_DIR[r["lado_p"]], c1, (LADO_DIR[r["lado_f"]] + 2) % 4)
        if cam is None:
            falhas.append(r)
            r["pts"] = [p0, p1]
            continue
        centro = lambda c: (c[0] * G + G // 2, c[1] * G + G // 2)  # noqa: E731
        pts = [p0] + [centro(c) for c in cam] + [p1]
        r["pts"] = pts
        r["cam"] = cam
        for i in range(len(cam) - 1):
            o = 0 if cam[i][1] == cam[i + 1][1] else 1
            rot.marcar(cam[i], o)
            rot.marcar(cam[i + 1], o)
    if falhas:
        print("  aviso: sem caminho para", [(r["pai"], r["filho"]) for r in falhas])

    # --- desenha
    img = Image.new("RGB", (largura * SC, altura * SC), FUNDO)
    d = ImageDraw.Draw(img)
    d.text(pt(40, 26), layout["titulo"], font=F_TIT, fill=COR_TEXTO)
    d.text(pt(40, 58), layout["subtitulo"], font=F_SUB, fill="#5d6b78")

    # linhas (por baixo das caixas)
    def ortogonal(pts: list[tuple[float, float]], d0: tuple[int, int], d1: tuple[int, int]) -> list[tuple[float, float]]:
        """Liga porta -> grade -> porta só com segmentos horizontais/verticais."""
        res = [pts[0]]
        # porta até o 1º ponto da grade: anda na direção de saída e depois ajusta o outro eixo no ponto da grade
        p0, g0 = pts[0], pts[1]
        if d0[0]:
            res += [(g0[0], p0[1]), g0]
        else:
            res += [(p0[0], g0[1]), g0]
        res += pts[2:-2]
        if len(pts) > 3:
            g1, p1 = pts[-2], pts[-1]
            res.append(g1)
            if d1[0]:
                res += [(g1[0], p1[1]), p1]
            else:
                res += [(p1[0], g1[1]), p1]
        else:
            res.append(pts[-1])
        # tira pontos repetidos e colineares
        lim = [res[0]]
        for p in res[1:]:
            if p != lim[-1]:
                lim.append(p)
        fin = [lim[0]]
        for i in range(1, len(lim) - 1):
            a, b, c = fin[-1], lim[i], lim[i + 1]
            if (a[0] == b[0] == c[0]) or (a[1] == b[1] == c[1]):
                continue
            fin.append(b)
        fin.append(lim[-1])
        return fin

    for r in rels:
        if "cam" not in r:
            continue
        d0, d1 = DIRS[LADO_DIR[r["lado_p"]]], DIRS[LADO_DIR[r["lado_f"]]]
        r["poli"] = ortogonal(r["pts"], d0, d1)
        d.line([pt(*p) for p in r["poli"]], fill=COR_LINHA, width=int(1.7 * SC), joint="curve")

    # caixas
    for c in caixas.values():
        x0, y0, x1, y1 = c.rect
        d.rectangle([pt(x0 + 3, y0 + 3), pt(x1 + 3, y1 + 3)], fill="#e3e8ec")  # sombra
        d.rectangle([pt(x0, y0), pt(x1, y1)], fill="#ffffff", outline=c.cor, width=int(1.6 * SC))
        d.rectangle([pt(x0, y0), pt(x1, y0 + ALTURA_CAB)], fill=c.cor)
        d.text(pt(x0 + 10, y0 + ALTURA_CAB / 2), c.nome, font=F_CAB, fill="#ffffff", anchor="lm")
        for i, (marca, nome, tipo) in enumerate(c.linhas):
            ly = y0 + ALTURA_CAB + 3 + i * ALTURA_LIN
            if marca:
                d.rectangle([pt(x0 + 1, ly), pt(x1 - 1, ly + ALTURA_LIN)], fill="#f1f6f9" if "PK" in marca else "#fbf5ec")
            if i:
                d.line([pt(x0 + 1, ly), pt(x1 - 1, ly)], fill="#e6ebef", width=SC)
            cor_badge = "#b3541e" if "FK" in marca and "PK" not in marca else "#1c4f6b"
            if marca:
                d.text(pt(x0 + 7, ly + ALTURA_LIN / 2 + 0.5), marca, font=F_BADGE, fill=cor_badge, anchor="lm")
            d.text(pt(x0 + 38, ly + ALTURA_LIN / 2), nome, font=fonte(12, "PK" in marca), fill=COR_TEXTO, anchor="lm")
            d.text(pt(x1 - 8, ly + ALTURA_LIN / 2), tipo, font=F_TIPO, fill="#7a8791", anchor="rm")

    # símbolos de cardinalidade
    for r in rels:
        if "poli" not in r:
            continue
        pa, pf = caixas[r["pai"]], caixas[r["filho"]]
        p0, p1 = r["poli"][0], r["poli"][-1]
        d0, d1 = DIRS[LADO_DIR[r["lado_p"]]], DIRS[LADO_DIR[r["lado_f"]]]
        desenhar_pe_de_galinha(d, (int(p0[0]), int(p0[1])), d0, "um" if r["obrig"] else "zero_um")
        desenhar_pe_de_galinha(d, (int(p1[0]), int(p1[1])), d1, "um" if r["um_um"] else "zero_muitos")

    # rótulos (no meio do trecho mais longo que couber)
    ocupados: list[tuple[float, float, float, float]] = [tuple(map(float, (c.x - 2, c.y - 2, c.x + c.w + 2, c.y + c.h + 2))) for c in caixas.values()]
    for r in sorted(rels, key=lambda r: -len(r.get("poli", []))):
        poli = r.get("poli")
        if not poli:
            continue
        txt = r["rotulo"]
        tw, th = medir(txt, F_ROT) + 8, 14
        cands = []
        for a, b in zip(poli, poli[1:]):
            comp = abs(a[0] - b[0]) + abs(a[1] - b[1])
            if comp < 20:
                continue
            horiz = a[1] == b[1]
            if horiz and comp < tw + 10:
                continue
            for frac in (0.5, 0.3, 0.7, 0.2, 0.8):
                mx = a[0] + (b[0] - a[0]) * frac
                my = a[1] + (b[1] - a[1]) * frac
                cands.append((abs(frac - 0.5) - comp / 400, mx, my))
        cands.sort()
        escolhido = None
        for _, mx, my in cands:
            caixa = (mx - tw / 2, my - th / 2, mx + tw / 2, my + th / 2)
            if not any(not (caixa[2] < o[0] or caixa[0] > o[2] or caixa[3] < o[1] or caixa[1] > o[3]) for o in ocupados):
                escolhido = caixa
                break
        if escolhido is None and cands:
            _, mx, my = cands[0]
            escolhido = (mx - tw / 2, my - th / 2, mx + tw / 2, my + th / 2)
        if escolhido:
            ocupados.append(escolhido)
            d.rectangle([pt(escolhido[0], escolhido[1]), pt(escolhido[2], escolhido[3])], fill=FUNDO)
            d.text(pt((escolhido[0] + escolhido[2]) / 2, (escolhido[1] + escolhido[3]) / 2), txt, font=F_ROT, fill="#3b4a57", anchor="mm")

    # legenda
    ly = altura - 56
    d.line([pt(40, ly - 12), pt(largura - 40, ly - 12)], fill="#d5dce2", width=SC)
    x = 40
    for modulo, cor in COR_MODULO.items():
        if any(modulo_de(n) == modulo for n in nomes_mod):
            d.rectangle([pt(x, ly), pt(x + 14, ly + 14)], fill=cor)
            d.text(pt(x + 20, ly + 7), modulo, font=F_COL, fill=COR_TEXTO, anchor="lm")
            x += 40 + medir(modulo, F_COL)
    if fantasmas:
        d.rectangle([pt(x, ly), pt(x + 14, ly + 14)], fill="#8a949c")
        d.text(pt(x + 20, ly + 7), "tabela de outro módulo (só a chave)", font=F_COL, fill=COR_TEXTO, anchor="lm")
    d.text(pt(40, ly + 30), "PK = chave primária   FK = chave estrangeira   ||  exatamente um    |o  zero ou um    o<  zero ou vários (pé de galinha)", font=F_SUB, fill="#5d6b78", anchor="lm")

    final = img.resize((largura * FINAL, altura * FINAL), Image.LANCZOS)
    final.save(arquivo, optimize=True)
    print(f"  {arquivo.name}: {final.size[0]}x{final.size[1]}")


# ---------------------------------------------------------------------------------------------------
# Onde fica cada tabela: (coluna, y em px a partir do topo). Ajuste aqui para reorganizar.
# ---------------------------------------------------------------------------------------------------
from layouts_der import LAYOUTS  # noqa: E402


def main() -> None:
    SAIDA.mkdir(exist_ok=True)
    nomes = sys.argv[1:]
    for chave, lay in LAYOUTS.items():
        if nomes and chave not in nomes:
            continue
        print(chave)
        gerar(lay, SAIDA / lay["arquivo"])


if __name__ == "__main__":
    main()
