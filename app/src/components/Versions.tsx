/* Uso das máquinas, versões do relatório (V1, V2...) com o comparador, e a faixa de "mudanças para simular" do quadro. */
import { useMemo, useState } from 'react';
import { fmt, fv } from '../engine/format';
import { useStore } from '../store/useStore';
import { buildReportHtml, printHtml, type ExportKind } from '../export/reportHtml';
import { bottleneckReport } from '../engine/bottleneck';
import { moneyRange } from '../engine/cost';
import { computeChartData } from '../store/reportData';
import { moneyDelta, valueCompare } from '../store/value';
import { cfgOf, describeChanges, diffVersions, machineNames, pickCompare, UTIL_TEXT, utilLevel, utilization, type ReportVersion } from '../store/versions';
import { COLORS, sliceColor } from './Charts';
import { useFlow, useSim } from './hooks';

const LEVEL_COLOR = { ociosa: COLORS.warn, folga: COLORS.teal, bem: COLORS.ok, limite: COLORS.bad } as const;

/** Quanto de cada máquina está sendo usado: o que sai ÷ o que ela conseguiria entregar. */
export function UtilBars() {
  const nodes = useStore((s) => s.nodes);
  const catalog = useStore((s) => s.catalog);
  const sim = useSim(true);
  const flow = useFlow(sim);
  const names = useMemo(() => machineNames(nodes, catalog), [nodes, catalog]);
  if (!nodes.length) return null;
  const rows = nodes.map((n) => {
    const r = sim.res[n.id];
    const off = r.state === 'desligada' || r.cap <= 0;
    return { n, off, failed: r.state === 'falha', u: utilization(r.cap, flow[n.id]), cap: r.cap, eff: flow[n.id] };
  });
  const ociosas = rows.filter((x) => !x.off && !x.failed && utilLevel(x.u) === 'ociosa');
  return (
    <div className="utilbars">
      {rows.map(({ n, off, failed, u, cap, eff }) => {
        const lv = utilLevel(u);
        return (
          <div className="ub" key={n.id} title={off ? 'Máquina desligada' : `Passam ${fmt(eff)}/h por ela, de ${fmt(cap)}/h que ela consegue entregar`}>
            <span className="nm">{names[n.id]}{n.qty > 1 ? ` ×${n.qty}` : ''}</span>
            <div className="trk"><i style={{ width: `${off ? 0 : Math.max(2, u * 100)}%`, background: off ? COLORS.muted : failed ? COLORS.bad : LEVEL_COLOR[lv] }} /></div>
            <b>{off ? '—' : `${fmt(u * 100)}%`}</b>
            <em>{off ? 'desligada' : failed ? 'em falha' : UTIL_TEXT[lv]}</em>
          </div>
        );
      })}
      <div className="sub" style={{ marginTop: 8 }}>
        Uso = o que realmente passa pela máquina ÷ o que ela conseguiria entregar. A fábrica anda no ritmo da máquina mais lenta, então as outras trabalham com folga. Perto de 100% a máquina está no limite (é o gargalo); bem abaixo, sobra capacidade.
      </div>
      {ociosas.map(({ n, u }) => (
        <div className="say warn" key={n.id} style={{ marginTop: 6 }}>
          <b>{names[n.id]}{n.qty > 1 ? ` ×${n.qty}` : ''}</b> usa só <b>{fmt(u * 100)}%</b> da capacidade
          {n.qty > 1 ? `: das ${n.qty} unidades, o que a fábrica consegue usar equivale a ${fv(Math.round(u * n.qty * 10) / 10)}. Talvez não valha pagar pelas outras.` : ': sobra máquina, ou o produto não está chegando até ela por causa de outra máquina limitando antes.'}
        </div>
      ))}
    </div>
  );
}

const better = (a: number, b: number, lowerIsBetter: boolean) => (a === b ? '' : (b < a) === lowerIsBetter ? 'delta-pos' : 'delta-neg');
const Dlt = ({ a, b, dec = 0, low = false, pre = '' }: { a: number; b: number; dec?: number; low?: boolean; pre?: string }) => (
  <span className={better(a, b, low)}>{a === b ? '—' : `${b > a ? '+' : '−'}${pre}${fmt(Math.abs(b - a), dec)}`}</span>
);

/** Versões do relatório: lista (com "Voltar a esta versão") e comparação lado a lado de duas versões. */
export function VersionsPanel({ compact = false }: { compact?: boolean }) {
  const versions = useStore((s) => s.versions);
  const catalog = useStore((s) => s.catalog);
  const cmp = useStore((s) => s.cmp);
  const { setCmp, restoreVersion } = useStore.getState();
  const { a: A, b: B } = pickCompare(versions, cmp);
  const pick = (v: ReportVersion) => `V${v.n} · ${v.label} (${v.at})`;

  return (
    <div className="vers">
      <div className="sub" style={{ marginTop: 0 }}>
        A <b>V1</b> é guardada sozinha quando você aplica a primeira melhoria e cada Play terminado vira uma nova versão. Uma versão é uma <b>foto</b> dos números e das configurações das máquinas
        (ela não cria outra fábrica). Para voltar ao que você tinha, use <b>Voltar a esta versão</b>.
      </div>

      {!versions.length && <div className="nodata">Ainda não há versões. Aplique uma melhoria, rode um Play ou use <b>Salvar versão agora</b>.</div>}

      {versions.length > 0 && (
        <table className="t"><thead><tr><th>Versão</th><th>O que é</th><th>Produção/h</th>{!compact && <><th>Risco</th><th>Gargalo</th></>}<th /></tr></thead><tbody>
          {versions.map((v) => (
            <tr key={v.n} className={v === A || v === B ? 'vsel' : ''}>
              <td><b>V{v.n}</b></td><td>{v.label}<div className="sub" style={{ margin: 0 }}>{v.at}{v.played ? ` · Play: ${fmt(v.played.produced)} garrafas` : ''}</div></td>
              <td>{fmt(v.prod)}</td>{!compact && <><td>{fmt(v.risk * 100, 1)}%</td><td>{v.bottleneck ?? '—'}</td></>}
              <td><button className="btn sec" style={{ padding: '4px 10px', fontSize: 12 }} title="Volta o quadro para as configurações desta versão (dá para desfazer)" onClick={() => restoreVersion(v.n)}>{compact ? 'Voltar' : 'Voltar a esta versão'}</button></td>
            </tr>
          ))}
        </tbody></table>
      )}

      {versions.length === 1 && <div className="sub">Para comparar, falta uma segunda versão: aplique uma melhoria e rode o Play.</div>}

      {versions.length > 1 && A && B && (
        <>
          <div className="vpick">
            <label>Comparar <select className="in" value={A.n} onChange={(e) => setCmp({ a: Number(e.target.value) })}>{versions.map((v) => <option key={v.n} value={v.n}>{pick(v)}</option>)}</select></label>
            <label>com <select className="in" value={B.n} onChange={(e) => setCmp({ b: Number(e.target.value) })}>{versions.map((v) => <option key={v.n} value={v.n}>{pick(v)}</option>)}</select></label>
          </div>
          <Compare a={A} b={B} catalog={catalog} compact={compact} />
        </>
      )}
    </div>
  );
}

function Compare({ a, b, catalog, compact }: { a: ReportVersion; b: ReportVersion; catalog: ReturnType<typeof useStore.getState>['catalog']; compact: boolean }) {
  const changes = diffVersions(a, b, catalog);
  const ids = [...new Set([...a.machines.map((m) => m.id), ...b.machines.map((m) => m.id)])];
  const ma = (id: string) => a.machines.find((m) => m.id === id), mb = (id: string) => b.machines.find((m) => m.id === id);
  const ut = (m?: ReportVersion['machines'][number]) => (m ? (m.off ? '—' : `${fmt(utilization(m.cap, m.eff) * 100)}%`) : '—');
  return (
    <>
      <table className="t vcmp"><thead><tr><th /><th>V{a.n}</th><th>V{b.n}</th><th>Mudou</th></tr></thead><tbody>
        <tr><td>Produção (garrafas/h)</td><td>{fmt(a.prod)}</td><td><b>{fmt(b.prod)}</b></td><td><Dlt a={a.prod} b={b.prod} /></td></tr>
        <tr><td>Risco máximo (%)</td><td>{fmt(a.risk * 100, 1)}</td><td><b>{fmt(b.risk * 100, 1)}</b></td><td><Dlt a={a.risk * 100} b={b.risk * 100} dec={1} low /></td></tr>
        <tr><td>Energia (kW)</td><td>{fmt(a.energy, 1)}</td><td><b>{fmt(b.energy, 1)}</b></td><td><Dlt a={a.energy} b={b.energy} dec={1} low /></td></tr>
        {a.costPerBottle != null && b.costPerBottle != null && (
          <tr><td>Energia por garrafa (R$)</td><td>{fmt(a.costPerBottle, 4)}</td><td><b>{fmt(b.costPerBottle, 4)}</b></td><td><Dlt a={a.costPerBottle} b={b.costPerBottle} dec={4} low /></td></tr>
        )}
        <tr><td>Gargalo</td><td>{a.bottleneck ?? '—'}</td><td><b>{b.bottleneck ?? '—'}</b></td><td>{a.bottleneck === b.bottleneck ? '—' : 'mudou'}</td></tr>
        {a.played && b.played && a.played.durMin === b.played.durMin && (
          <tr><td>Produzido no Play ({a.played.durMin >= 60 ? a.played.durMin / 60 + ' h' : a.played.durMin + ' min'})</td><td>{fmt(a.played.produced)}</td><td><b>{fmt(b.played.produced)}</b></td><td><Dlt a={a.played.produced} b={b.played.produced} /></td></tr>
        )}
      </tbody></table>

      <h5 style={{ margin: '12px 0 4px' }}>O que foi mudado de V{a.n} para V{b.n}</h5>
      {changes.length ? <ul className="chg">{changes.map((c) => <li key={c}>{c}</li>)}</ul> : <div className="sub">Nenhuma máquina foi mudada (a diferença vem de outras condições, como temperatura ou desgaste).</div>}

      {!compact && (
        <>
          <h5 style={{ margin: '12px 0 4px' }}>Máquina por máquina</h5>
          <table className="t"><thead><tr><th>Máquina</th><th>Unidades</th><th>Ritmo</th><th>Uso da capacidade</th></tr></thead><tbody>
            {ids.map((id) => {
              const x = ma(id), y = mb(id); const nm = (y ?? x)!.name;
              const ch = !x || !y || x.qty !== y.qty || x.value !== y.value || x.off !== y.off;
              return (
                <tr key={id} className={ch ? 'vchg' : ''}>
                  <td>{nm}</td>
                  <td>{x ? x.qty : '—'} → <b>{y ? y.qty : '—'}</b></td>
                  <td>{x ? fv(x.value) : '—'} → <b>{y ? fv(y.value) : '—'}</b></td>
                  <td>{ut(x)} → <b>{ut(y)}</b></td>
                </tr>
              );
            })}
          </tbody></table>
        </>
      )}
    </>
  );
}

/** Faixa no quadro: o que foi aplicado e ainda não foi simulado. */
export function PendingBanner() {
  const base = useStore((s) => s.pendingBase);
  const nodes = useStore((s) => s.nodes);
  const catalog = useStore((s) => s.catalog);
  const seq = useStore((s) => s.versionSeq);
  const run = useStore((s) => s.run);
  const { startOrToggleRun, discardPending } = useStore.getState();
  const changes = useMemo(() => (base ? describeChanges(base, cfgOf(nodes, catalog), catalog) : []), [base, nodes, catalog]);
  if (!base || !changes.length) return null;
  const rodando = run.active && !run.finished;
  return (
    <div className="pending">
      <div className="ph"><b>Mudanças aplicadas, ainda não simuladas</b><span> → serão a V{seq + 1}</span></div>
      <ul>{changes.map((c) => <li key={c}>{c}</li>)}</ul>
      <div className="pf">
        {rodando
          ? <span className="sub" style={{ margin: 0 }}>Simulação em andamento… ao terminar, o resultado vira a V{seq + 1} e você compara em Resultados.</span>
          : <>
            <button className="btn" onClick={startOrToggleRun}>▶ Rodar a simulação (V{seq + 1})</button>
            <button className="btn sec" onClick={discardPending}>Desfazer as mudanças</button>
          </>}
      </div>
    </div>
  );
}

/** Uso da capacidade de cada máquina em todas as versões, lado a lado (uma barra por versão, dentro de cada máquina). */
export function UtilByVersion() {
  const versions = useStore((s) => s.versions);
  const [hidden, setHidden] = useState<number[]>([]);
  if (!versions.length) return <div className="nodata">Ainda não há versões. Aplique uma melhoria, rode um Play ou use <b>Salvar versão agora</b>.</div>;
  const recent = versions.slice(-8);
  const shown = recent.filter((v) => !hidden.includes(v.n));
  const order: { id: string; name: string }[] = [];
  [...recent].reverse().forEach((v) => v.machines.forEach((m) => { if (!order.some((o) => o.id === m.id)) order.push({ id: m.id, name: m.name }); }));
  order.sort((a, b) => (recent[recent.length - 1].machines.findIndex((m) => m.id === a.id) + 1 || 99) - (recent[recent.length - 1].machines.findIndex((m) => m.id === b.id) + 1 || 99));
  const color = (v: ReportVersion) => sliceColor(versions.indexOf(v));
  return (
    <div className="uvers">
      <div className="leg">
        {recent.map((v) => (
          <button key={v.n} className={hidden.includes(v.n) ? 'off' : ''} title={`${v.label} (${v.at})`} onClick={() => setHidden((h) => (h.includes(v.n) ? h.filter((x) => x !== v.n) : [...h, v.n]))}>
            <i style={{ background: color(v) }} />V{v.n} · {v.label}
          </button>
        ))}
      </div>
      {order.map((o) => (
        <div className="uv" key={o.id}>
          <span className="nm">{o.name}</span>
          <div>
            {shown.map((v) => {
              const m = v.machines.find((x) => x.id === o.id);
              const off = !m || m.off || m.cap <= 0;
              const u = m && !off ? utilization(m.cap, m.eff) : 0;
              return (
                <div className="uvb" key={v.n} title={m ? `V${v.n}: passam ${fmt(m.eff)}/h de ${fmt(m.cap)}/h que ela consegue entregar` : `V${v.n}: a máquina não existia`}>
                  <small>V{v.n}</small>
                  <div className="trk"><i style={{ width: `${off ? 0 : Math.max(2, u * 100)}%`, background: color(v) }} /></div>
                  <b>{!m ? '—' : off ? 'desl.' : `${fmt(u * 100)}%`}</b>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="sub" style={{ marginTop: 8 }}>
        Cada máquina tem uma barra por versão. Quanto mais cheia, mais da capacidade dela está sendo usada (100% = no limite, provável gargalo). Clique numa versão acima para escondê-la ou mostrá-la.
        {versions.length > recent.length && ` Mostrando as ${recent.length} versões mais recentes.`}
      </div>
    </div>
  );
}

/** Valor estimado dos equipamentos nas duas versões comparadas (e o que a mudança custa). */
export function ValueCompare() {
  const versions = useStore((s) => s.versions);
  const catalog = useStore((s) => s.catalog);
  const cmp = useStore((s) => s.cmp);
  const { a, b } = pickCompare(versions, cmp);
  if (!a || !b) return <div className="nodata">Precisa de duas versões para estimar o valor da mudança.</div>;
  const v = valueCompare(a, b, catalog);
  return (
    <div>
      <div className="sub" style={{ marginTop: 0 }}>
        Quanto valem os equipamentos de cada versão (unidades × preço estimado) e quanto a mudança de <b>V{a.n}</b> para <b>V{b.n}</b> custa. Faixas tiradas de anúncios de fornecedores: não é cotação.
      </div>
      <table className="t"><thead><tr><th>Máquina</th><th>Unidades</th><th>Valor V{a.n}</th><th>Valor V{b.n}</th><th>Diferença</th></tr></thead><tbody>
        {v.rows.map((r) => (
          <tr key={r.id} className={r.delta && (r.delta.min !== 0 || r.delta.max !== 0) ? 'vchg' : ''}>
            <td>{r.name}</td>
            <td>{r.qtyA ?? '—'} → <b>{r.qtyB ?? '—'}</b></td>
            <td>{r.priced ? moneyRange(r.a) : <span className="sub">consultar o fabricante</span>}</td>
            <td>{r.priced ? moneyRange(r.b) : <span className="sub">consultar o fabricante</span>}</td>
            <td>{r.priced ? moneyDelta(r.delta) : '—'}</td>
          </tr>
        ))}
        <tr><td><b>Total</b></td><td /><td><b>{moneyRange(v.totalA)}</b></td><td><b>{moneyRange(v.totalB)}</b></td><td><b>{moneyDelta(v.delta)}</b></td></tr>
      </tbody></table>
      {v.perThousand != null && (
        <div className="say">💡 A produção subiu <b>{fmt(v.gainPerHour)} garrafas/h</b> com um investimento adicional de cerca de <b>R$ {fmt(Math.round(v.perThousand / 1000))} mil por cada 1.000 garrafas/h</b> a mais (ponto médio da faixa).</div>
      )}
      {v.gainPerHour > 0 && v.perThousand == null && <div className="sub">A produção subiu {fmt(v.gainPerHour)} garrafas/h sem gasto em equipamentos (só ajuste de ritmo).</div>}
      {v.unpriced.length > 0 && <div className="sub">Sem preço no catálogo (não entram na soma): {v.unpriced.join(', ')}. Você pode informar preços em Configurações › Preços das máquinas.</div>}
    </div>
  );
}

/** Faixa de cima de Resultados: salvar versão e exportar em PDF (relatório, comparação ou os dois). */
export function ReportActions() {
  const saveVersion = useStore((s) => s.saveVersion);
  const [open, setOpen] = useState(false);

  const exportar = (kind: ExportKind) => {
    setOpen(false);
    const s = useStore.getState();
    if (!s.nodes.length) return s.showToast('Monte a fábrica antes de exportar.');
    const { a, b } = pickCompare(s.versions, s.cmp);
    if (kind === 'comparacao' && !(a && b)) return s.showToast('Para exportar uma comparação, crie pelo menos duas versões (aplique uma melhoria e rode o Play, ou use Salvar versão agora).');
    const ctx = { ...s.simCtx(), run: undefined };
    const cd = computeChartData({ nodes: s.nodes, edges: s.edges, catalog: s.catalog, ambient: s.ambient, ctx });
    const html = buildReportHtml({
      kind, factory: s.plantName, ambient: s.ambient, tariff: s.tariff, server: !!s.server, generatedAt: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
      cd, nodes: s.nodes, catalog: s.catalog, bn: bottleneckReport(s.nodes, s.edges, ctx), versions: s.versions, a, b,
    });
    printHtml(html);
    s.showToast('Na janela que abriu, escolha “Salvar como PDF” como impressora.');
  };

  return (
    <div className="ractions">
      <button className="btn sec" title="Guarda uma foto dos números e das configurações de agora como a próxima versão (V1, V2...). Não cria outra fábrica." onClick={saveVersion}>Salvar versão agora</button>
      <div className="exp">
        <button className="btn" onClick={() => setOpen(!open)}>Exportar PDF ▾</button>
        {open && (
          <div className="expmenu" onMouseLeave={() => setOpen(false)}>
            <button onClick={() => exportar('relatorio')}>Só o relatório</button>
            <button onClick={() => exportar('comparacao')}>Só a comparação (versões escolhidas)</button>
            <button onClick={() => exportar('ambos')}>Relatório + comparação</button>
          </div>
        )}
      </div>
    </div>
  );
}
