"""Assistente da aba Conversa.

IMPORTANTE (honestidade): não é um modelo de linguagem. É um conjunto de regras que reconhece o assunto da pergunta
(gargalo, custo, energia, falha, "+X%", "como funciona") e responde com cálculos reais sobre a fábrica montada e com
os textos dos manuais e das fontes que estão no banco. Não tem custo e funciona sem internet.
Porte de `answerQuestion` do front-end, agora lendo os manuais do banco.
"""
from __future__ import annotations

import re
from typing import Optional

from .engine.bottleneck import bottleneck_report
from .engine.format import fmt
from .engine.goal import plan_goal
from .engine.simulate import bn_name, simulate
from .engine.types import Edge, GoalInput, Node, SimContext
from .views import plan_dict, report_dict

SUGGESTIONS = ["Onde está o gargalo?", "Quanto custa melhorar o gargalo?", "Quero aumentar a produção em 10%",
               "O que acontece se a enchedora falhar?", "Como funciona o pasteurizador?"]


def _text(text: str, cites=None) -> dict:
    return {"kind": "text", "text": text, "cites": [{"title": r.t, "url": r.u, "confidence": r.k} for r in (cites or [])]}


def answer(question: str, nodes: list[Node], edges: list[Edge], ctx: SimContext, tariff: float,
           manuals: Optional[dict[str, dict]] = None) -> dict:
    """Resposta estruturada: `kind` é 'text', 'plan' ou 'bottleneck'."""
    manuals = manuals or {}
    catalog = ctx.catalog
    q = question.strip()
    ql = q.lower()
    if not nodes:
        return _text("Sua fábrica ainda está vazia. Monte uma (ou carregue um exemplo) e eu analiso.")
    calc = ctx.without_run()
    sim = simulate(nodes, edges, calc)

    def name(n: Node) -> str:
        return catalog[n.type].name

    mention = next((n for n in nodes if name(n).lower() in ql), None)
    if mention is None:
        for n in nodes:
            w = name(n).lower().split(" ")[0]
            if len(w) > 5 and w in ql:
                mention = n
                break

    pct = re.search(r"(\d+[.,]?\d*)\s*%", ql)
    if pct and re.search(r"(aument|subir|mais|produ|cresc)", ql):
        v = float(pct.group(1).replace(",", "."))
        plan = plan_goal(GoalInput("pct", v, True, True), nodes, edges, ctx)
        text = f"Dá para chegar a <b>+{pct.group(1)}%</b>." if plan.ok else f"Não dá para chegar a +{pct.group(1)}% só com isso."
        return {"kind": "plan", "text": text, "plan": plan_dict(plan)}

    if re.search(r"custa|custo|pre[çc]o|invest|quanto sai", ql) and not re.search(r"energia|kw", ql):
        if mention is not None:
            t = catalog[mention.type]
            faixa = f"R$ {fmt(t.cost.min / 1000)} mil a R$ {fmt(t.cost.max / 1000)} mil" if t.cost and t.cost.min else "consultar o fabricante"
            return _text(f"Uma unidade de <b>{t.name}</b> custa por volta de <b>{faixa}</b> (estimativa).<br>{t.cost.note if t.cost else ''}",
                         t.cost.refs if t.cost else None)
        return {"kind": "bottleneck", "text": "Análise do gargalo e do custo de melhorá-lo.", "report": report_dict(bottleneck_report(nodes, edges, ctx))}

    if re.search(r"gargalo|limita|mais lent", ql):
        return {"kind": "bottleneck", "text": "Análise do gargalo.", "report": report_dict(bottleneck_report(nodes, edges, ctx))}

    if re.search(r"falh|quebr|parar|desligar", ql):
        m = mention or next(n for n in nodes if n.id == sim.bn)
        off = []
        for n in nodes:
            c = n.copy()
            if n.id == m.id:
                c.off = True
            off.append(c)
        s2 = simulate(off, edges, calc)
        return _text(f"Se a <b>{name(m)}</b> parar, a produção vai de <b>{fmt(sim.production)}</b> para <b>{fmt(s2.production)}</b> garrafas/h "
                     f"e a energia cai de {fmt(sim.energy, 1)} para {fmt(s2.energy, 1)} kW (as máquinas ficam paradas, mas ligadas).")

    if re.search(r"como funciona|o que é|para que serve|manual", ql) and mention is not None:
        t = catalog[mention.type]
        man = manuals.get(t.code)
        if man:
            return _text(f"<b>{t.name}</b>: {man['what']}<br>{man['how']}<br><i>Dica:</i> {man['tips']}", t.refs)
        return _text(f"<b>{t.name}</b>: {t.desc}", t.refs)

    if re.search(r"energia|consumo|kw", ql):
        top = max(nodes, key=lambda n: sim.res[n.id].energy)
        cites = [r for r in (catalog["enchedora"].refs if "enchedora" in catalog else ()) if "doi.org" in r.u]
        return _text(f"A fábrica gasta <b>{fmt(sim.energy, 1)} kW</b> (≈ R$ {fmt(sim.energy * tariff, 2)}/h). "
                     f"Quem mais gasta é a <b>{name(top)}</b> ({fmt(sim.res[top.id].energy, 1)} kW).", cites)

    if re.search(r"por que|caiu|parou|menos", ql):
        bad = [n for n in nodes if sim.res[n.id].state == "falha" or n.off]
        if bad:
            return _text(f"Porque <b>{', '.join(name(n) for n in bad)}</b> {'estão' if len(bad) > 1 else 'está'} parada(s). "
                         "Tudo que vem depois fica sem produto (efeito cascata).")
        return _text(f"Não vejo nenhuma máquina parada. A produção está limitada pelo gargalo, <b>{bn_name(sim, nodes, catalog)}</b>.")

    return _text("Não sei responder isso ainda (sou um assistente de regras, não uma IA). Tente: <i>onde está o gargalo</i>, "
                 "<i>aumentar a produção em 10%</i>, <i>o que acontece se a enchedora falhar</i> ou <i>como funciona o pasteurizador</i>.")
