import { fmt } from '../engine/format';
import { useStore } from '../store/useStore';
import type { ViewId } from '../types';
import { Icon } from './Icon';
import { useBnName, useSim } from './hooks';

export const HELP_VIEWS: ViewId[] = ['guide', 'manual', 'glossary'];
const VIEWS: [ViewId, string, string][] = [
  ['logic', 'Montar', 'grid'], ['physical', 'Fábrica vista de cima', 'layers'], ['hmi', 'Painel da máquina', 'gauge'], ['dashboard', 'Resultados', 'chart'],
];

export function ViewBar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const openModal = useStore((s) => s.openModal);
  const has = useStore((s) => s.nodes.length > 0);
  const run = useStore((s) => s.run);
  const sim = useSim();
  const bn = useBnName(sim);
  const help = HELP_VIEWS.includes(view);
  const bnCap = sim.bn ? sim.res[sim.bn].cap : 1;

  return (
    <nav className="viewbar">
      {VIEWS.map(([id, n, ic]) => (
        <button key={id} className={'vtab' + (view === id ? ' active' : '')} onClick={() => setView(id)}><Icon name={ic} size={16} />{n}</button>
      ))}
      {help && <button className="vtab active"><Icon name="book" size={16} />Ajuda</button>}
      <span className="spacer" />
      {has ? (
        <div className="kpis">
          {run.active && <div><small>Produzidas</small><b>{fmt(run.produced)}</b></div>}
          <div><small>Produção agora</small><b>{fmt(sim.production)}/h</b></div>
          <div className={(sim.bn && bnCap === 0 ? 'bad' : 'warn') + ' kpirisk'} title="Ver por que é o gargalo e como melhorar" onClick={() => setView('dashboard')}><small>Gargalo ?</small><b>{bn}</b></div>
          <div className={(sim.maxRisk > 0.1 ? 'warn' : '') + ' kpirisk'} title="O que é o risco?" onClick={() => openModal('risk')}><small>Risco máx. ?</small><b>{fmt(sim.maxRisk * 100, 1)}%</b></div>
          <div><small>Energia</small><b>{fmt(sim.energy, 1)} kW</b></div>
        </div>
      ) : <div className="kpis"><div><small>Comece arrastando uma máquina</small></div></div>}
    </nav>
  );
}
