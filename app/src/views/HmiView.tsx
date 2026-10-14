import { Icon } from '../components/Icon';
import { Rich } from '../components/Rich';
import { useSim, useTrouble } from '../components/hooks';
import { fmt, fv, stepOf } from '../engine/format';
import { explainNow } from '../engine/simulate';
import { useStore } from '../store/useStore';

/** Painel da máquina: como o operador configura uma máquina na fábrica (inspirado num painel real). */
export function HmiView() {
  const s = useStore();
  const sim = useSim();
  const { affected } = useTrouble(sim);
  const n = s.nodes.find((x) => x.id === s.hmiSel) || s.nodes[0];
  if (!n) {
    return <section className="view active"><div className="hmi-wrap"><div className="hmi-help">Monte a fábrica na aba <b>Montar</b>. Depois, aqui, você configura cada máquina como no painel de uma máquina de verdade.</div></div></section>;
  }
  const t = s.catalog[n.type], r = sim.res[n.id], st = stepOf(t);
  const anyBad = s.estop || s.nodes.some((m) => ['falha', 'critico'].includes(sim.res[m.id].state));
  const recipe = (k: 'eco' | 'opt' | 'max') => s.commitValue(n.id, k === 'eco' ? Math.max(t.min, t.opt * 0.85) : k === 'opt' ? t.opt : t.warn);

  return (
    <section className="view active">
      <div className="hmi-wrap">
        <div className="hmi-help"><b>Painel da máquina.</b> É como o operador configura uma máquina na fábrica: escolhe a máquina em cima, ajusta o ritmo com os botões grandes ou usa uma receita pronta.</div>
        <div className="hmi">
          {s.estop && <div className="banner-bad">PARADA DE EMERGÊNCIA ATIVA — todas as máquinas paradas</div>}
          <div className="hmi-screen">
            <div className={'hmi-top' + (anyBad ? ' alarm' : '')}><span className="lamp">{anyBad ? 'ALERTA' : 'OK'}</span><b>{t.name}</b><span style={{ color: 'var(--muted)' }}>{s.plantName}</span></div>
            <div className="hmi-synop"><div className="hmi-line" />
              <div className="hmi-stations">
                {s.nodes.map((m) => {
                  const rr = sim.res[m.id];
                  return (
                    <div key={m.id} className={'st ' + (rr.state === 'falha' ? 'danger' : rr.state === 'desligada' ? 'off' : rr.state !== 'normal' ? 'warn' : '') + (m.id === n.id ? ' sel' : '')} onClick={() => s.setHmiSel(m.id)}>
                      <div className="box"><Icon name={s.catalog[m.type].icon} size={24} /></div>{s.catalog[m.type].name}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="hmi-main">
              <div className="hmi-set">
                <div className="lab">{t.param}</div>
                <div className="big">{fv(n.value)}<span className="un"> {t.unit}</span></div>
                <div className="stepper"><button onClick={() => s.commitValue(n.id, n.value - st)}>▼</button><button onClick={() => s.commitValue(n.id, n.value + st)}>▲</button></div>
                <div className="marks"><span>mín {fv(t.min)}</span><span>ótimo {fv(t.opt)}</span><span>falha {fv(t.crit)}</span></div>
                <div className="recipes"><button onClick={() => recipe('eco')}>Econômico</button><button onClick={() => recipe('opt')}>Padrão</button><button onClick={() => recipe('max')}>Máximo seguro</button></div>
                <div className="hmi-actions">
                  <button className="btn sec" style={{ flex: 1 }} onClick={() => s.toggleOff(n.id)}>{n.off ? 'Ligar' : 'Desligar'}</button>
                  <button className="btn sec" style={{ flex: 1 }} onClick={() => s.setQty(n.id, n.qty >= 6 ? 1 : n.qty + 1)}>Unidades: {n.qty} ＋</button>
                </div>
              </div>
              <div>
                <table><thead><tr><th>Medida</th><th style={{ textAlign: 'right' }}>Agora</th></tr></thead><tbody>
                  <tr><td>Situação</td><td className="v">{r.state.toUpperCase()}</td></tr>
                  <tr><td>Capacidade</td><td className="v">{fmt(r.cap)} gf/h</td></tr>
                  <tr><td>Saída real</td><td className="v">{fmt(r.eff)} gf/h</td></tr>
                  <tr><td>Risco de falha</td><td className="v">{fmt(r.risk * 100, 1)} %</td></tr>
                  <tr><td>Consumo</td><td className="v">{fmt(r.energy, 1)} kW</td></tr>
                </tbody></table>
                <div className={'say' + (r.state === 'normal' ? '' : ' warn')} style={{ marginTop: 10 }}><Rich text={explainNow(n, sim, affected.has(n.id), t)} terms /></div>
              </div>
            </div>
          </div>
          <div className="hmi-phys"><div><button className={'estop' + (s.estop ? ' on' : '')} onClick={s.toggleEstop}>PARAR</button><div className="plab">EMERGÊNCIA</div></div></div>
        </div>
      </div>
    </section>
  );
}
