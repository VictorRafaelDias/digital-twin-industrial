import { useMemo } from 'react';
import { Chip } from '../components/Shared';
import { Rich } from '../components/Rich';
import { useBnName, useSim, useSimCtx } from '../components/hooks';
import { HEAT_INFO, RISK_INFO } from '../data/catalog';
import { HEAT_LABEL } from '../data/glossary';
import { clock, fmt } from '../engine/format';
import { bestProduction, heatFactor, simulate } from '../engine/simulate';
import { waterExpansionL } from '../engine/water';
import { useStore } from '../store/useStore';
import { Modal } from './Modal';
import { SettingsModal } from './SettingsModal';

export function Modals() {
  const modal = useStore((s) => s.modal);
  const openModal = useStore((s) => s.openModal);
  const close = () => openModal(null);
  if (modal === 'risk') return <RiskModal onClose={close} />;
  if (modal === 'ambient') return <AmbientModal onClose={close} />;
  if (modal === 'runresult') return <RunResultModal onClose={close} />;
  if (modal === 'about') return <AboutModal onClose={close} />;
  if (modal === 'settings') return <SettingsModal onClose={close} />;
  return null;
}

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Sobre este protótipo" onClose={onClose}>
      <div className="mb">
        <p>Protótipo de <b>front-end</b> do Digital Twin Industrial: um simulador de fábrica no estilo Cisco Packet Tracer. Você monta a fábrica, mexe nas máquinas e vê o efeito, sem risco.</p>
        <p>Os números vêm do mesmo modelo do backend, mas aqui tudo roda no navegador. Nada é salvo em servidor.</p>
      </div>
    </Modal>
  );
}

function RiskModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="O que é o risco de falha?" onClose={onClose}>
      <div className="mb">
        <p><Rich text={RISK_INFO.what} /></p>
        <table className="t" style={{ margin: '10px 0' }}><thead><tr><th>Situação</th><th>Risco</th><th>O que significa</th></tr></thead><tbody>
          {RISK_INFO.zones.map((z) => <tr key={z[0]}><td>{z[0]}</td><td><b>{z[1]}</b></td><td>{z[2]}</td></tr>)}
        </tbody></table>
        <p><b>O que pode acontecer fisicamente:</b></p>
        <ul>{RISK_INFO.physics.map((x) => <li key={x}><Rich text={x} /></li>)}</ul>
        <p style={{ color: 'var(--muted)' }}>Cada máquina tem o seu próprio texto em “O que pode dar errado”, na aba Máquina e no Manual.</p>
      </div>
    </Modal>
  );
}

function AmbientModal({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const ctx = useSimCtx(false);
  const T = s.ambient, has = s.nodes.length > 0;
  const prodAt = (t: number) => simulate(s.nodes, s.edges, { ...ctx, ambient: t }).production;
  const p25 = has ? prodAt(25) : 0, pNow = has ? prodAt(T) : 0, dp = p25 ? ((pNow - p25) / p25) * 100 : 0;
  const st = T < 15 ? ['frio', 'info', 'Ambiente frio: o xarope fica mais grosso e escoa mais devagar.'] : T <= 25 ? ['ideal', 'ok', 'Dentro da faixa ideal (15 a 25 °C): nenhuma máquina perde capacidade.'] : ['quente', 'warn', 'Ambiente quente: tanques, motores e a câmara fria perdem capacidade.'];
  const types = has ? [...new Set(s.nodes.map((n) => n.type))].map((k) => s.catalog[k]) : [];
  const ex = waterExpansionL(T, 1000);

  return (
    <Modal title="Temperatura do ambiente" onClose={onClose}>
      <div className="mb">
        <p style={{ marginTop: 0 }}>A temperatura do ambiente muda o desempenho das máquinas. Ajuste e veja o efeito na sua fábrica.</p>
        <div className="ambtop">
          <div className="row"><input type="number" min={0} max={45} value={T} style={{ width: 90, fontSize: 22 }} onChange={(e) => s.setAmbient(parseFloat(e.target.value))} /><b style={{ fontSize: 18 }}>°C</b><Chip kind={st[1] as 'ok'}>{st[0]}</Chip></div>
          <input type="range" min={0} max={45} value={T} style={{ width: '100%', margin: '10px 0 6px' }} onChange={(e) => s.setAmbient(parseFloat(e.target.value))} />
          <div className="sugs">{[['Inverno', 10], ['Ideal', 22], ['Verão', 32], ['Calor extremo', 40]].map(([l, v]) => <button key={l} className={'chipbtn' + (T === v ? ' on' : '')} onClick={() => s.setAmbient(+v)}>{l} · {v} °C</button>)}</div>
        </div>
        <div className={'say ' + (st[1] === 'ok' ? 'ok' : st[1] === 'warn' ? 'warn' : '')}>{st[2]}</div>
        {has
          ? <div className="gba" style={{ marginBottom: 12 }}><div><small>Produção a 25 °C (referência)</small><b>{fmt(p25)} garrafas/h</b></div><div><small>Produção a {T} °C</small><b>{fmt(pNow)} garrafas/h <span className={dp < -0.05 ? 'delta-neg' : ''}>{Math.abs(dp) < 0.05 ? '' : `(${fmt(dp, 1)}%)`}</span></b></div></div>
          : <div className="say">Monte uma fábrica para ver o efeito em números. Abaixo, a regra de cada tipo de máquina.</div>}
        <table className="t"><thead><tr><th>Máquina</th><th>O que acontece</th><th>Efeito agora</th></tr></thead><tbody>
          {has ? types.map((t) => { const hf = heatFactor(t, T); return (
            <tr key={t.name}><td>{t.name}</td><td>{HEAT_LABEL[t.heat]}</td><td><b className={hf < 0.999 ? 'delta-neg' : ''}>{hf < 0.999 ? `−${fmt((1 - hf) * 100, 1)}% de capacidade` : 'sem efeito agora'}</b></td></tr>
          ); }) : (Object.keys(HEAT_INFO) as (keyof typeof HEAT_INFO)[]).filter((k) => k !== 'none').map((k) => (
            <tr key={k}><td colSpan={2}>{HEAT_LABEL[k]}</td><td>{HEAT_INFO[k].f}</td></tr>
          ))}
        </tbody></table>
        <h4 className="gsub">Dilatação da água (física real)</h4>
        <p style={{ margin: '0 0 6px' }}>Um tanque com <b>1.000 litros</b> de água a {T} °C ocupa <b>{fmt(Math.abs(ex), 1)} litros {ex >= 0 ? 'a mais' : 'a menos'}</b> do que a 20 °C. Num tanque cheio, esse volume extra vira pressão: é por isso que tanques quentes têm menos margem de segurança.</p>
        <h4 className="gsub">Em que se baseia</h4>
        <p style={{ margin: '0 0 6px' }}><Chip kind="ok">real</Chip> A dilatação da água vem de tabela de física: <a href="https://engineeringtoolbox.com/cubical-expansion-coefficients-d_1262.html" target="_blank" rel="noopener noreferrer">EngineeringToolbox, coeficientes de dilatação da água</a>.</p>
        <p style={{ margin: '0 0 6px' }}><Chip kind="warn">hipótese didática</Chip> Quanto cada máquina perde por grau (tanques 0,4% por °C acima de 25; motores 0,5% acima de 30; câmara fria 1,5% acima de 25; xarope 0,5% abaixo de 15) foi escolhido para o simulador mostrar o efeito. Não vem de ficha de fabricante. <b>A validar com o professor de física.</b></p>
      </div>
    </Modal>
  );
}

function RunResultModal({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const sim = useSim(false);
  const ctx = useSimCtx(false);
  const bn = useBnName(sim);
  const r = s.run;
  const { hours, pct, qTot, bad } = useMemo(() => {
    const hours = r.dur / 60, ideal = bestProduction(s.nodes, s.edges, ctx) * hours;
    return { hours, pct: ideal ? (r.produced / ideal) * 100 : 0, qTot: Object.values(r.queue).reduce((a, b) => a + b, 0), bad: s.nodes.filter((n) => sim.res[n.id].state !== 'normal') };
  }, [r, s.nodes, s.edges, ctx, sim]);
  return (
    <Modal title="Resultado final da simulação" onClose={onClose}>
      <div className="mb">
        <div className="cards">
          <div className="c ok"><div className="l">Garrafas produzidas</div><div className="v">{fmt(r.produced)}</div></div>
          <div className="c"><div className="l">Média por hora</div><div className="v">{fmt(r.produced / hours)}</div></div>
          <div className={'c ' + (pct >= 90 ? 'ok' : 'warn')}><div className="l">Do máximo possível</div><div className="v">{fmt(pct)}%</div></div>
          <div className="c"><div className="l">Energia gasta</div><div className="v">{fmt(r.kwh, 1)} kWh</div></div>
          <div className="c"><div className="l">Custo da energia</div><div className="v">R$ {fmt(r.kwh * s.tariff, 2)}</div></div>
          <div className={'c ' + (qTot >= 1 ? 'warn' : '')}><div className="l"><Rich text="Garrafas paradas na fila" terms /></div><div className="v">{fmt(qTot)}</div></div>
        </div>
        <p><b>Gargalo:</b> <Rich text={`${bn} — é a máquina que mais limitou a fábrica.`} /> <b>Risco máximo:</b> {fmt(sim.maxRisk * 100, 1)}%.</p>
        {bad.length ? <p><b>Máquinas fora do ótimo:</b> {bad.map((n) => `${s.catalog[n.type].name} (${sim.res[n.id].state})`).join(', ')}.</p> : <p>Todas as máquinas ficaram dentro do <Rich text="ótimo" terms />.</p>}
        <p style={{ color: 'var(--muted)' }}>Duração simulada: {clock(r.dur)}. Para melhorar: abra a aba <b>Objetivo</b> e diga o quanto quer aumentar.</p>
        <div className="row">
          <button className="btn" onClick={() => { onClose(); s.startOrToggleRun(); }}>Rodar de novo</button>
          <button className="btn sec" onClick={() => { onClose(); s.setView('dashboard'); }}>Ver em Resultados</button>
        </div>
      </div>
    </Modal>
  );
}
