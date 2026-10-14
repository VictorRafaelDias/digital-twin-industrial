import { BottleneckBlock } from '../components/BottleneckBlock';
import { Rich } from '../components/Rich';
import { useSim, useSimCtx } from '../components/hooks';
import { bestProduction, explainNow, simulate } from '../engine/simulate';
import { fmt } from '../engine/format';
import { useStore } from '../store/useStore';

const Delta = ({ a, b, dec = 0, inv = false }: { a: number; b: number; dec?: number; inv?: boolean }) => {
  const x = b - a;
  return <span className={x === 0 ? '' : (inv ? x <= 0 : x >= 0) ? 'delta-pos' : 'delta-neg'}>{x === 0 ? '—' : (x > 0 ? '+' : '') + fmt(x, dec)}</span>;
};

export function ResultsView() {
  const s = useStore();
  const sim = useSim();
  const ctx = useSimCtx(false);
  if (!s.nodes.length) {
    return <section className="view active"><div className="dash"><div className="card c12"><h4>Resultados</h4><div className="sub">Monte a fábrica na aba <b>Montar</b> para ver produção, gargalo, risco e energia aqui.</div></div></div></section>;
  }
  const best = bestProduction(s.nodes, s.edges, ctx) || 1;
  const oee = Math.min(130, (sim.production / best) * 100);
  const base = s.baseline || { prod: best, risk: 0.02, energy: simulate(s.nodes.map((n) => ({ ...n, value: s.catalog[n.type].opt, off: false })), s.edges, ctx).energy };
  const maxCap = Math.max(...s.nodes.map((n) => sim.res[n.id].cap), 1);
  const maxE = Math.max(...s.nodes.map((n) => sim.res[n.id].energy), 1);
  const baseRisk = base.risk * 100;
  const bad = s.nodes.filter((n) => sim.res[n.id].state !== 'normal');

  return (
    <section className="view active">
      <div className="dash">
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

        <div className="card c8">
          <h4>O que cada máquina consegue entregar × o que entrega de fato</h4>
          <div className="bars">
            {s.nodes.map((n) => {
              const r = sim.res[n.id];
              return (
                <div className="b" key={n.id}>
                  <span>{s.catalog[n.type].name}{n.qty > 1 ? ' ×' + n.qty : ''}</span>
                  <div className={'bar' + (sim.bn === n.id ? ' hot' : '')}><i className="cp" style={{ width: `${(r.cap / maxCap) * 100}%` }} /><i className="ef" style={{ width: `${(r.eff / maxCap) * 100}%` }} /></div>
                  <span>{fmt(r.eff)} / {fmt(r.cap)}{sim.bn === n.id ? ' · gargalo' : ''}{r.queue >= 1 && <><br /><small style={{ color: 'var(--amber)' }}>fila {fmt(r.queue)}/h</small></>}</span>
                </div>
              );
            })}
          </div>
          <div className="sub">Barra clara = capacidade. Barra escura = o que realmente sai. A mais curta é o gargalo. <b>Nada some:</b> o que uma máquina recebe a mais do que aguenta fica parado na fila (<Rich text="conservação da massa, de Lavoisier" terms />).</div>
        </div>

        <div className="card c4">
          <h4>Antes × depois</h4>
          <table className="t"><thead><tr><th /><th>{s.baseline ? 'Ponto de partida' : 'No ótimo'}</th><th>Agora</th><th /></tr></thead><tbody>
            <tr><td>Produção</td><td>{fmt(base.prod)}</td><td><b>{fmt(sim.production)}</b></td><td><Delta a={base.prod} b={sim.production} /></td></tr>
            <tr><td>Risco (%)</td><td>{fmt(baseRisk, 1)}</td><td><b>{fmt(sim.maxRisk * 100, 1)}</b></td><td><Delta a={baseRisk} b={sim.maxRisk * 100} dec={1} inv /></td></tr>
            <tr><td>Energia (kW)</td><td>{fmt(base.energy, 1)}</td><td><b>{fmt(sim.energy, 1)}</b></td><td><Delta a={base.energy} b={sim.energy} dec={1} inv /></td></tr>
          </tbody></table>
          <button className="btn sec block" style={{ marginTop: 10 }} onClick={s.setBaseline}>Marcar a situação de agora como ponto de partida</button>
        </div>

        <div className="card c12">
          <h4>Quem gasta mais energia</h4>
          <div className="bars">
            {s.nodes.map((n) => (
              <div className="b" key={n.id} style={{ gridTemplateColumns: '150px 1fr 70px' }}>
                <span>{s.catalog[n.type].name}</span>
                <div className="bar"><i className="ef" style={{ width: `${(sim.res[n.id].energy / maxE) * 100}%` }} /></div>
                <span>{fmt(sim.res[n.id].energy, 1)} kW</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
