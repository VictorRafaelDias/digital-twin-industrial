/* Aba "Perspectiva de receita" (Resultados): a pessoa informa o preço da garrafa e QUANDO a fábrica trabalha (calendário: horas por dia, dias da
   semana e meses; ou direto em horas por ano) uma vez, e vê quanto CADA versão fatura por ano, com a comparação entre duas versões escolhidas
   ("antes" e "depois"). Receita = o que entra de vendas, antes de qualquer custo; o lucro é só uma estimativa opcional em cima dela. */
import { useState } from 'react';
import { REAL_BY_KEY } from '../data/realCases';
import { fmt } from '../engine/format';
import { useStore } from '../store/useStore';
import { pickCompare, type ReportVersion } from '../store/versions';
import { DAY_NAMES, DAY_SHORT, ECON_DEFAULTS, MONTH_SHORT, effectivePrice, gainReais, moneyBig, moneyDelta, paybackText, scheduleHours, scheduleText, valueCompare, versionProfit } from '../store/value';

/** Campo numérico que aceita digitar com vírgula ou ponto e grava ao digitar; ao sair, volta a mostrar o valor guardado. */
function EconNum({ value, step, onCommit }: { value: number; step: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input type="number" min={0} step={step} value={draft ?? String(Math.round(value * 100) / 100)}
      onChange={(e) => { setDraft(e.target.value); const v = parseFloat(e.target.value.replace(',', '.')); if (Number.isFinite(v)) onCommit(v); }}
      onBlur={() => setDraft(null)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

/** Fileira de caixinhas clicáveis (dias da semana ou meses): preenchida = entra na conta. */
function Chips({ labels, titles, on, onToggle }: { labels: string[]; titles?: string[]; on: boolean[]; onToggle: (i: number) => void }) {
  return (
    <div className="gchips">
      {labels.map((l, i) => (
        <button type="button" key={l} className={'gchip' + (on[i] ? ' on' : '')} aria-pressed={on[i]} title={(titles?.[i] ?? l) + (on[i] ? ': conta (clique para tirar)' : ': não conta (clique para incluir)')} onClick={() => onToggle(i)}>{l}</button>
      ))}
    </div>
  );
}

const signed = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '');
const moneySigned = (v: number) => (v === 0 ? 'R$ 0' : signed(v) + moneyBig(Math.abs(v)));
const sameList = (a: boolean[], b: boolean[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function RevenueTab() {
  const versions = useStore((s) => s.versions);
  const catalog = useStore((s) => s.catalog);
  const cmp = useStore((s) => s.cmp);
  const caseKey = useStore((s) => s.caseKey), econPrice = useStore((s) => s.econPrice), margin = useStore((s) => s.econMargin);
  const mode = useStore((s) => s.econMode), hoursYearDirect = useStore((s) => s.econHours), hoursDay = useStore((s) => s.econHoursDay);
  const days = useStore((s) => s.econDays), months = useStore((s) => s.econMonths);
  const { setEcon, setCmp, setResTab } = useStore.getState();
  const real = caseKey ? REAL_BY_KEY[caseKey] : null;
  const ref = real?.price ?? null;
  const price = effectivePrice(econPrice, ref);
  const sc = { mode, hoursYear: hoursYearDirect, hoursDay, days, months };
  const hours = scheduleHours(sc);
  const econ = { price, hoursYear: hours, margin };
  const padrao = econPrice == null && margin === ECON_DEFAULTS.margin && mode === ECON_DEFAULTS.mode && hoursYearDirect === ECON_DEFAULTS.hoursYear
    && hoursDay === ECON_DEFAULTS.hoursDay && sameList(days, ECON_DEFAULTS.days) && sameList(months, ECON_DEFAULTS.months);
  const { a: A, b: B } = pickCompare(versions, cmp);
  const pick = (v: ReportVersion) => `V${v.n} · ${v.label} (${v.at})`;
  const toggle = (list: boolean[], i: number) => list.map((x, k) => (k === i ? !x : x));

  if (!versions.length) {
    return <div className="card c12"><h4>Perspectiva de receita</h4><div className="nodata">Ainda não há versões. Aplique uma melhoria no quadro e rode a simulação (ou use <b>Salvar versão agora</b>): cada versão aparece aqui com o quanto ela fatura por ano.</div></div>;
  }

  const rows = versions.map((v) => ({ v, p: versionProfit(v, econ, catalog) }));
  const delta = A && B ? valueCompare(A, B, catalog).delta : { min: 0, max: 0 };
  const g = A && B ? gainReais(A, B, delta, econ, real?.investRef?.perThousand) : null;
  const pA = A ? versionProfit(A, econ, catalog) : null, pB = B ? versionProfit(B, econ, catalog) : null;

  return (
    <>
      <div className="card c12">
        <h4>Perspectiva de receita</h4>
        <div className="gainbox" style={{ marginTop: 0 }}>
          <p className="gsub">
            Quanto cada versão da fábrica <b>fatura por ano</b>: é a <b>receita</b>, o que entra de vendas, antes de qualquer custo. <b>Os quadros amarelos são seus: digite ou clique</b> e a tabela abaixo mostra a V1, a V2 e as outras, uma ao lado da outra.
            {!padrao && <> <a onClick={() => setEcon({ price: null, hours: ECON_DEFAULTS.hoursYear, margin: ECON_DEFAULTS.margin, mode: ECON_DEFAULTS.mode, hoursDay: ECON_DEFAULTS.hoursDay, days: ECON_DEFAULTS.days, months: ECON_DEFAULTS.months })}>Voltar aos valores padrão</a></>}
          </p>
          <div className="gfields">
            <label className="gf">
              <span className="gl">1. Preço de venda de cada garrafa</span>
              <span className="gin"><i>R$</i><EconNum value={price ?? 0} step={0.1} onCommit={(v) => setEcon({ price: v })} /></span>
              <span className="gh">{ref ? <>Pesquisamos R$ {fmt(ref.min, 2)} a R$ {fmt(ref.max, 2)} para esta empresa (fonte abaixo). Pode trocar.</> : 'Digite o preço que a fábrica recebe por garrafa. Sem preço, não há conta.'}</span>
            </label>
            <label className="gf">
              <span className="gl">2. Lucro sobre a receita <small>(opcional)</small></span>
              <span className="gin"><EconNum value={margin} step={1} onCommit={(v) => setEcon({ margin: v })} /><i>%</i></span>
              <span className="gh">Só serve para <b>estimar o lucro</b> e o prazo de retorno do investimento; a receita não depende dele. Padrão 15%: margem operacional pública da Coca-Cola FEMSA (depois de matéria-prima, mão de obra e impostos).</span>
            </label>
            <div className="gf wide">
              <span className="gl">3. Quando a fábrica trabalha</span>
              <div className="gmode" role="group" aria-label="Como informar o funcionamento">
                <button type="button" className={mode === 'calendario' ? 'on' : ''} onClick={() => setEcon({ mode: 'calendario' })}>Por calendário (dias e meses)</button>
                <button type="button" className={mode === 'horas' ? 'on' : ''} onClick={() => setEcon({ mode: 'horas' })}>Direto em horas por ano</button>
              </div>
              {mode === 'horas' ? (
                <>
                  <span className="gin"><EconNum value={hoursYearDirect} step={100} onCommit={(v) => setEcon({ hours: v })} /><i>horas por ano</i></span>
                  <span className="gh">4.000 h é cerca de 1,5 turno por dia. Fábrica ligada 24 h por dia, o ano todo: cerca de 8.766 h.</span>
                </>
              ) : (
                <div className="gcal">
                  <div>
                    <h6>Horas trabalhadas por dia</h6>
                    <span className="gin"><EconNum value={hoursDay} step={1} onCommit={(v) => setEcon({ hoursDay: v })} /><i>horas por dia</i></span>
                    <span className="gh"> 8 h = 1 turno · 16 h = 2 turnos · 24 h = ligada o dia todo.</span>
                  </div>
                  <div>
                    <h6>Dias da semana em que trabalha
                      <span className="gquick">
                        <a onClick={() => setEcon({ days: [true, true, true, true, true, false, false] })}>Seg a Sex</a>
                        <a onClick={() => setEcon({ days: [true, true, true, true, true, true, false] })}>Seg a Sáb</a>
                        <a onClick={() => setEcon({ days: [true, true, true, true, true, true, true] })}>Todos</a>
                      </span>
                    </h6>
                    <Chips labels={DAY_SHORT} titles={DAY_NAMES} on={days} onToggle={(i) => setEcon({ days: toggle(days, i) })} />
                  </div>
                  <div>
                    <h6>Meses em que produz <small>(fábrica sazonal: desmarque os meses parados)</small>
                      <span className="gquick">
                        <a onClick={() => setEcon({ months: Array(12).fill(true) })}>O ano todo</a>
                        <a onClick={() => setEcon({ months: Array.from({ length: 12 }, (_, i) => i >= 6) })}>Jul a Dez</a>
                      </span>
                    </h6>
                    <Chips labels={MONTH_SHORT} on={months} onToggle={(i) => setEcon({ months: toggle(months, i) })} />
                  </div>
                </div>
              )}
              <div className="gsum">⏱ <b>{scheduleText(sc)}</b></div>
            </div>
          </div>
          {price == null && <div className="say">Digite o preço da garrafa no quadro 1{caseKey && !ref ? ' (não encontramos preço público para esta empresa)' : ''} para ver a receita de cada versão.</div>}
          {price != null && !(hours > 0) && <div className="say warn">Com este calendário a fábrica não trabalha nenhuma hora: informe as horas por dia e marque pelo menos um dia da semana e um mês.</div>}
        </div>
      </div>

      <div className="card c12">
        <h4>Quanto cada versão fatura por ano</h4>
        <div className="sub" style={{ marginTop: 0 }}>Cada linha é uma versão guardada. <b>Receita</b> = produção por hora × {fmt(hours)} horas por ano × {price != null ? `R$ ${fmt(price, 2)}` : 'preço da garrafa'}. O lucro é só uma estimativa: {fmt(margin)}% da receita.</div>
        <table className="t profit"><thead><tr><th>Versão</th><th>O que é</th><th className="n">Produção por hora</th><th className="n">Garrafas por ano</th><th className="n">Receita por ano</th><th className="n">Lucro estimado ({fmt(margin)}%)</th><th className="n">Valor dos equipamentos</th></tr></thead><tbody>
          {rows.map(({ v, p }) => (
            <tr key={v.n} className={v === A || v === B ? 'vsel' : ''}>
              <td><b>V{v.n}</b>{versions.length > 1 && v === A && <span className="vtag a">antes</span>}{versions.length > 1 && v === B && <span className="vtag b">depois</span>}</td>
              <td>{v.label}<div className="sub" style={{ margin: 0 }}>{v.at}</div></td>
              <td className="n"><b>{fmt(v.prod)}</b></td>
              <td className="n">{p ? fmt(p.bottlesYear) : '—'}</td>
              <td className="n">{p ? <b>{moneyBig(p.revenueYear)}</b> : '—'}</td>
              <td className="n" style={{ color: 'var(--muted)' }}>{p ? moneyBig(p.profitYear) : '—'}</td>
              <td className="n">{p && p.equipment > 0 ? `≈ ${moneyBig(p.equipment)}` : '—'}</td>
            </tr>
          ))}
        </tbody></table>
      </div>

      {versions.length < 2 && <div className="card c12"><div className="nodata">Para comparar o antes e o depois, falta uma segunda versão: aplique uma melhoria no quadro e rode a simulação.</div></div>}

      {versions.length > 1 && A && B && (
        <div className="card c12">
          <h4>Antes × depois: quanto a melhoria muda a receita</h4>
          <div className="vpick">
            <label><b>Antes:</b> <select className="in" value={A.n} onChange={(e) => setCmp({ a: Number(e.target.value) })}>{versions.map((v) => <option key={v.n} value={v.n}>{pick(v)}</option>)}</select></label>
            <label><b>Depois:</b> <select className="in" value={B.n} onChange={(e) => setCmp({ b: Number(e.target.value) })}>{versions.map((v) => <option key={v.n} value={v.n}>{pick(v)}</option>)}</select></label>
          </div>
          {A.n === B.n && <div className="say warn">Escolha duas versões diferentes para comparar.</div>}
          {g && pA && pB && (
            <>
              <div className="say">
                Passar da <b>V{A.n}</b> ({fmt(A.prod)} garrafas/h) para a <b>V{B.n}</b> ({fmt(B.prod)} garrafas/h) {g.gainPerHour >= 0 ? 'faz a receita subir' : 'faz a receita cair'} <b>{moneySigned(g.revenueYear)} por ano</b>.
                {' '}Se sobrarem {fmt(margin)}% de lucro, são <b>{moneySigned(g.profitYear)}</b> por ano
                {g.invest != null ? <>, e o investimento adicional de cerca de <b>{moneyBig(g.invest)}</b> se paga em <b>{paybackText(g.paybackMonths)}</b>.</> : g.gainPerHour > 0 ? ', sem gasto em equipamentos (só ajuste de ritmo).' : '.'}
              </div>
              <div className="gks">
                <div className="gk"><small>Antes: V{A.n}</small><b>{moneyBig(pA.revenueYear)}</b><span>receita por ano · {fmt(A.prod)} garrafas/h</span></div>
                <div className="gk"><small>Depois: V{B.n}</small><b>{moneyBig(pB.revenueYear)}</b><span>receita por ano · {fmt(B.prod)} garrafas/h</span></div>
                <div className={'gk main' + (g.revenueYear < 0 ? ' neg' : '')}><small>Diferença de receita (V{B.n} − V{A.n})</small><b>{moneySigned(g.revenueYear)}</b><span>por ano · {signed(g.bottlesYear)}{fmt(Math.abs(g.bottlesYear))} garrafas</span></div>
                <div className="gk"><small>Lucro estimado a mais</small><b>{moneySigned(g.profitYear)}</b><span>{fmt(margin)}% da diferença de receita</span></div>
                <div className="gk"><small>Investimento paga em</small><b>{g.invest != null ? paybackText(g.paybackMonths) : '—'}</b><span>{g.invest != null ? `custo do catálogo: ${moneyBig(g.invest)} · com o lucro estimado` : 'nenhum investimento adicional'}</span></div>
              </div>
              <details className="gcalc">
                <summary>Como chegamos nesses números (conta passo a passo)</summary>
                <table className="t"><tbody>
                  <tr><td>Garrafas a mais por hora (V{B.n} − V{A.n})</td><td><b>{signed(g.gainPerHour)}{fmt(Math.abs(g.gainPerHour))}</b></td></tr>
                  <tr><td>× {fmt(hours)} horas por ano ({scheduleText(sc)}) → garrafas a mais por ano</td><td><b>{signed(g.bottlesYear)}{fmt(Math.abs(g.bottlesYear))}</b></td></tr>
                  <tr><td>× preço de R$ {fmt(price ?? 0, 2)} → <b>receita a mais por ano</b></td><td><b>{moneySigned(g.revenueYear)}</b></td></tr>
                  <tr><td>× {fmt(margin)}% → lucro estimado a mais por ano</td><td>{moneySigned(g.profitYear)}</td></tr>
                  <tr><td>Investimento adicional (catálogo, ponto médio; faixa {moneyDelta(delta)})</td><td>{g.invest != null ? moneyBig(g.invest) : 'nenhum'}</td></tr>
                  <tr><td>Investimento ÷ lucro estimado por mês → retorno</td><td><b>{g.invest != null ? paybackText(g.paybackMonths) : '—'}</b></td></tr>
                  {g.investRef != null && <tr><td>Com o custo real da linha ({moneyBig(real!.investRef!.perThousand)} por 1.000 garrafas/h)</td><td><b>{moneyBig(g.investRef)}</b> · retorno em <b>{paybackText(g.paybackRefMonths)}</b></td></tr>}
                </tbody></table>
              </details>
            </>
          )}
        </div>
      )}

      {price != null && (
        <div className="card c12">
          {real?.revenueRef && A && (
            <div className="say">🔎 <b>Conferência com a realidade:</b> a receita publicada da empresa foi {moneyBig(real.revenueRef.brl)} em {real.revenueRef.year}. Com a V{versions[0].n} ({fmt(versions[0].prod)} garrafas/h × {fmt(hours)} h × R$ {fmt(price, 2)}) o simulador dá {moneyBig(versions[0].prod * hours * price)} no preço de prateleira: mesma ordem de grandeza, e maior porque a fábrica recebe menos que o preço de prateleira. Já a receita de uma versão nova é <b>capacidade nova</b>: ela só vira dinheiro se o mercado comprar essa produção a mais.</div>
          )}
          <div className="gwarn">
            <b>Cuidado ao ler:</b> receita é o que entra de vendas, <b>antes de qualquer custo</b> (matéria-prima, mão de obra, impostos, energia). Além disso o preço é o de <b>prateleira</b> (a fábrica recebe menos: imposto e varejo ficam com a diferença), então os valores são um <b>teto</b>. O simulador também não sabe se o mercado compra a produção a mais. As máquinas do catálogo são de escala menor que as de uma linha real, por isso o retorno pelo catálogo sai mais rápido do que seria na vida real.
            {ref && <> <b>Preço:</b> {ref.basis} {ref.sources.map((r, i) => <span key={r.u}>{i ? ' · ' : ''}<a href={r.u} target="_blank" rel="noreferrer">{r.t}</a></span>)}</>}
            {real?.investRef && <> <b>Custo real:</b> {real.investRef.text}</>}
          </div>
          <div className="sub">Voltar para <a onClick={() => setResTab('comparacoes')}>Comparações</a> (produção, risco e valor dos equipamentos, versão a versão).</div>
        </div>
      )}
    </>
  );
}
