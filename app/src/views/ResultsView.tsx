import { BottleneckBlock } from '../components/BottleneckBlock';
import { Donut, HBars } from '../components/Charts';
import { ReportActions, UtilBars, UtilByVersion, ValueCompare, VersionsPanel } from '../components/Versions';
import { Rich } from '../components/Rich';
import { useChartData } from '../components/hooks';
import { explainNow } from '../engine/simulate';
import { fmt } from '../engine/format';
import { useStore } from '../store/useStore';

/** Resultados tem duas sub-abas: "Relatório" (o que está acontecendo agora) e "Comparações" (versões V1, V2... lado a lado, com valor estimado). */
export function ResultsView() {
  const s = useStore();
  const cd = useChartData(true);
  const { sim } = cd;
  if (!s.nodes.length) {
    return <section className="view active"><div className="dash"><div className="card c12"><h4>Resultados</h4><div className="sub">Monte a fábrica na aba <b>Montar</b> para ver produção, gargalo, risco e energia aqui.</div></div></div></section>;
  }
  const oee = Math.min(130, (sim.production / (cd.best || 1)) * 100);
  const maxCap = Math.max(...s.nodes.map((n) => sim.res[n.id].cap), 1);
  const bad = s.nodes.filter((n) => sim.res[n.id].state !== 'normal');
  const aba = s.resTab;
  const temMaxTemp = Math.max(100, ...cd.tempRows.map((r) => r.a));

  return (
    <section className="view active">
      <div className="dash">
        <div className="restabs c12">
          <button className={aba === 'relatorio' ? 'active' : ''} onClick={() => s.setResTab('relatorio')}>Relatório</button>
          <button className={aba === 'comparacoes' ? 'active' : ''} onClick={() => s.setResTab('comparacoes')}>Comparações{s.versions.length ? ` (${s.versions.length} versões)` : ''}</button>
          <span className="sub" style={{ margin: '0 0 0 12px' }}>{aba === 'relatorio' ? 'O que está acontecendo na fábrica agora.' : 'Compare versões da fábrica (V1, V2...) para ver o efeito de cada melhoria.'}</span>
          <ReportActions />
        </div>

        {aba === 'relatorio' && (
          <>
            <div className="card c3"><h4>Produção</h4><div className="bigk">{fmt(sim.production)}</div><div className="sub">garrafas por hora</div></div>
            <div className="card c3"><h4>Eficiência</h4><div className="bigk" style={{ color: oee >= 90 ? 'var(--ok)' : oee >= 60 ? 'var(--amber)' : 'var(--danger)' }}>{fmt(oee)}%</div><div className="sub"><Rich text="produção ÷ o máximo que a fábrica faria no ótimo" terms /></div></div>
            <div className="card c3"><h4>Risco de quebra <a className="qm" onClick={() => s.openModal('risk')}>?</a></h4><div className="bigk" style={{ color: sim.maxRisk > 0.1 ? 'var(--danger)' : 'var(--ok)' }}>{fmt(sim.maxRisk * 100, 1)}%</div><div className="sub">na pior máquina</div></div>
            <div className="card c3"><h4>Energia</h4><div className="bigk">{fmt(sim.energy, 1)} <span style={{ fontSize: 14 }}>kW</span></div><div className="sub">≈ R$ {fmt(sim.energy * s.tariff, 2)}/h · R$ {fmt(sim.production ? (sim.energy * s.tariff / sim.production) * 1000 : 0, 2)} por mil garrafas</div></div>

            <div className="card c12 avisos">
              <h4>Avisos</h4>
              <BottleneckBlock />
              {bad.length ? (
                <>
                  <h5>Máquinas fora do ótimo</h5>
                  {bad.map((n) => (
                    <div className="avrow" key={n.id}>
                      <span className={'chip ' + (sim.res[n.id].state === 'falha' ? 'bad' : 'warn')}>{sim.res[n.id].state}</span> <b>{s.catalog[n.type].name}</b> — <Rich text={explainNow(n, sim, false, s.catalog[n.type]).replace(/<\/?b>/g, '')} />
                    </div>
                  ))}
                </>
              ) : <div className="sub">Nenhuma máquina fora do ótimo.</div>}
            </div>

            <div className="card c12">
              <h4>O que cada máquina consegue entregar × o que entrega de fato</h4>
              <div className="bars">
                <div className="b bhead">
                  <span>Máquina</span>
                  <span>Barra clara: o que ela consegue entregar · barra escura: o que realmente sai</span>
                  <span>sai / consegue<br />(garrafas por hora)</span>
                </div>
                {s.nodes.map((n) => {
                  const r = sim.res[n.id];
                  return (
                    <div className="b" key={n.id}>
                      <span>{s.catalog[n.type].name}{n.qty > 1 ? ' ×' + n.qty : ''}</span>
                      <div className={'bar' + (sim.bn === n.id ? ' hot' : '')}><i className="cp" style={{ width: `${(r.cap / maxCap) * 100}%` }} /><i className="ef" style={{ width: `${(r.eff / maxCap) * 100}%` }} /></div>
                      <span title="o que sai por hora / o que a máquina consegue entregar por hora">{fmt(r.eff)} / {fmt(r.cap)}{sim.bn === n.id ? ' · gargalo' : ''}{r.queue >= 1 && <><br /><small style={{ color: 'var(--amber)' }}>fila {fmt(r.queue)}/h</small></>}</span>
                    </div>
                  );
                })}
              </div>
              <div className="sub">Os números são <b>garrafas por hora</b>: primeiro o que sai da máquina, depois o que ela conseguiria entregar. A mais curta é o gargalo. <b>Nada some:</b> o que uma máquina recebe a mais do que aguenta fica parado na fila (<Rich text="conservação da massa, de Lavoisier" terms />).</div>
            </div>

            <div className="card c6">
              <h4>Uso das máquinas</h4>
              <UtilBars />
            </div>

            <div className="card c6">
              <h4>Quem gasta energia</h4>
              <div className="sub" style={{ marginTop: 0 }}>Parte do consumo de cada máquina.</div>
              <Donut slices={cd.slices} center={`${fmt(sim.energy, 1)} kW`} />
            </div>

            <div className="card c6">
              <h4>Risco de falha</h4>
              <div className="sub" style={{ marginTop: 0 }}>Chance estimada de cada máquina parar no ritmo atual (2% no ótimo, até 100% na falha).</div>
              <HBars rows={cd.riskRows} max={50} unit="%" />
            </div>

            <div className="card c6">
              <h4>Temperatura das máquinas</h4>
              <div className="sub" style={{ marginTop: 0 }}>Quanto cada máquina esquenta: ambiente ({s.ambient} °C) mais o calor do trabalho. Hipótese didática, não é medição.</div>
              <HBars rows={cd.tempRows} max={temMaxTemp} unit=" °C" />
            </div>

            <div className="card c6">
              <h4>Filas</h4>
              <div className="sub" style={{ marginTop: 0 }}>Excesso que uma máquina entrega e a seguinte não aguenta. Fica parado esperando (nada se perde).</div>
              {cd.queueRows.some((r) => r.a >= 1) ? <HBars rows={cd.queueRows} unit="/h" /> : <div className="nodata">Sem fila agora.</div>}
            </div>

            <div className="card c6">
              <h4>Desgaste</h4>
              <div className="sub" style={{ marginTop: 0 }}>Quanto da vida útil cada máquina já gastou. Passando do intervalo de manutenção, ela rende menos e arrisca mais.</div>
              {cd.hasWear ? <HBars rows={cd.wearRows} max={100} unit="%" /> : <div className="nodata">{s.server ? 'Guarde a fábrica no servidor (Arquivo) para acompanhar o desgaste das máquinas.' : 'O desgaste fica guardado no servidor: entre com “Usar o servidor” no login.'}</div>}
            </div>
          </>
        )}

        {aba === 'comparacoes' && (
          <>
            <div className="card c12">
              <h4>Versões do relatório</h4>
              <VersionsPanel />
            </div>

            <div className="card c12">
              <h4>Uso das máquinas em cada versão</h4>
              <UtilByVersion />
            </div>

            <div className="card c12">
              <h4>Valor estimado dos equipamentos</h4>
              <ValueCompare />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
