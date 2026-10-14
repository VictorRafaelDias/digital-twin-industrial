import { useEffect, useRef, useState } from 'react';
import { HEAT_INFO } from '../data/catalog';
import { KB, SUGGESTIONS } from '../data/content';
import { moneyRange } from '../engine/cost';
import { fmt, fv, stepOf } from '../engine/format';
import { explainNow, heatFactor } from '../engine/simulate';
import { useStore } from '../store/useStore';
import type { ChatMsg, SideTab } from '../types';
import { Icon } from './Icon';
import { Rich } from './Rich';
import { BottleneckChat, Chip, Cites, CostInfo, PlanResult, Refs } from './Shared';
import { useBnName, useSim, useTrouble } from './hooks';

const TABS: [SideTab, string, string][] = [['goal', 'Objetivo', 'target'], ['machine', 'Máquina', 'gauge'], ['chat', 'Conversa', 'chat'], ['log', 'Registro', 'list']];

export function SidePanel() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  return (
    <>
      <div className="stabs">
        {TABS.map(([k, l, ic]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}><Icon name={ic} size={16} />{l}</button>)}
      </div>
      {tab === 'chat' ? <ChatTab /> : <div className="sbody">{tab === 'goal' ? <GoalTab /> : tab === 'machine' ? <MachineTab /> : <LogTab />}</div>}
    </>
  );
}

/* ---------- Objetivo ---------- */
function GoalTab() {
  const g = useStore((s) => s.goal);
  const plan = useStore((s) => s.goalPlan);
  const has = useStore((s) => s.nodes.length > 0);
  const { setGoal, planGoalNow, applyPlan, clearGoalPlan } = useStore.getState();
  const sim = useSim(false);
  const bn = useBnName(sim);
  return (
    <>
      <div className="goalbox">
        <div className="gq">Eu quero</div>
        <select className="in" value={g.type} onChange={(e) => setGoal({ type: e.target.value as typeof g.type })}>
          <option value="pct">Aumentar a produção</option>
          <option value="abs">Chegar a uma produção de…</option>
          <option value="risk">Reduzir o risco de quebra</option>
        </select>
        {g.type !== 'risk' && (
          <div className="gnum"><input type="number" value={g.value} onChange={(e) => setGoal({ value: parseFloat(e.target.value) || 0 })} />
            <span>{g.type === 'pct' ? '% a mais' : 'garrafas por hora'}</span></div>
        )}
        <button className="btn block" style={{ padding: 12, fontSize: 14 }} disabled={!has} onClick={planGoalNow}>Ver o que fazer</button>
        <details style={{ marginTop: 10 }}>
          <summary>O que posso sugerir?</summary>
          <label className="chk"><input type="checkbox" checked={g.over} onChange={(e) => setGoal({ over: e.target.checked })} /><span>Operar um pouco acima do ótimo (aumenta o risco)</span></label>
          <label className="chk"><input type="checkbox" checked={g.more} onChange={(e) => setGoal({ more: e.target.checked })} /><span>Usar mais máquinas iguais em paralelo</span></label>
        </details>
      </div>
      {has
        ? <div className="gnow">Hoje: <b>{fmt(sim.production)}</b> garrafas/h · <Rich text="gargalo" terms />: <b>{bn}</b></div>
        : <div className="say warn">Monte ou carregue uma fábrica primeiro.</div>}
      {plan && <PlanResult plan={plan} onApply={() => applyPlan(plan)} onDrop={clearGoalPlan} />}
    </>
  );
}

/* ---------- Máquina ---------- */
function MachineTab() {
  const s = useStore();
  const sim = useSim(false);
  const { affected } = useTrouble(sim);
  const n = s.nodes.find((x) => x.id === s.selected);
  const [drag, setDrag] = useState<number | null>(null);
  if (!n) {
    return (
      <>
        <h3>Máquina</h3>
        <p className="lead">Clique numa máquina no quadro para ver e ajustar. Aqui você muda o ritmo dela, liga/desliga e vê o que acontece com a fábrica.</p>
        <div className="say">Dica: no quadro, arraste para mover, e use <b>Conectar</b> para ligar uma máquina na outra.</div>
      </>
    );
  }
  const t = s.catalog[n.type], r = sim.res[n.id], hf = heatFactor(t, s.ambient), st = stepOf(t);
  const cls = r.state === 'falha' ? 'bad' : r.state === 'normal' ? 'ok' : 'warn';
  const commitDrag = () => { if (drag != null) { s.commitValue(n.id, drag); setDrag(null); } };
  const shown = drag ?? n.value;

  return (
    <>
      <div className="sidehead"><div className="ico"><Icon name={t.icon} size={22} /></div><div><h3 style={{ margin: 0 }}>{t.name}</h3><div style={{ color: 'var(--muted)' }}>{t.stage}</div></div></div>
      <p className="lead" style={{ marginBottom: 12 }}><Rich text={t.desc} terms /></p>
      <div className="field"><label>Ritmo da máquina — {t.param} ({t.unit})</label>
        <div className="stepper">
          <button onClick={() => s.commitValue(n.id, n.value - st)}>−</button>
          <input key={n.value} type="number" step="any" defaultValue={Math.round(n.value * 100) / 100} onBlur={(e) => s.commitValue(n.id, parseFloat(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
          <button onClick={() => s.commitValue(n.id, n.value + st)}>+</button>
          <span style={{ color: 'var(--muted)' }}>{t.unit}</span>
        </div>
        <input type="range" min={t.min} max={t.max} step="any" value={shown} style={{ width: '100%', marginTop: 8 }}
          onChange={(e) => setDrag(parseFloat(e.target.value))} onPointerUp={commitDrag} onKeyUp={commitDrag} />
        <div className="marks"><span>{fv(t.min)}</span><span>ótimo {fv(t.opt)}</span><span>falha {fv(t.crit)}</span><span>{fv(t.max)}</span></div>
      </div>
      <div className="cards">
        <div className="c"><div className="l"><Rich text="Capacidade" terms /></div><div className="v">{fmt(r.cap)}/h</div></div>
        <div className={'c ' + cls}><div className="l">Situação</div><div className="v">{r.state}</div></div>
        <div className="c"><div className="l"><Rich text="Saída real" terms /></div><div className="v">{fmt(r.eff)}/h</div></div>
        <div className={'c ' + (r.risk > 0.1 ? 'warn' : '')}><div className="l">Risco de falha <a className="qm" onClick={() => s.openModal('risk')}>?</a></div><div className="v">{fmt(r.risk * 100, 1)}%</div></div>
        <div className="c"><div className="l">Consumo</div><div className="v">{fmt(r.energy, 1)} kW</div></div>
        <div className="c"><div className="l"><Rich text="Fila" terms /> de excesso</div><div className="v">{fmt(r.queue)}/h</div></div>
      </div>
      <div className={'say ' + (cls === 'ok' ? '' : cls)}><Rich text={explainNow(n, sim, affected.has(n.id), t)} terms /></div>
      {hf < 0.999 && <div className="say warn">🌡 Com o ambiente a {s.ambient} °C, esta máquina rende <b>{fmt((1 - hf) * 100, 1)}%</b> menos. {HEAT_INFO[t.heat].n}</div>}
      <div className="field"><label>Unidades em paralelo</label>
        <div className="stepper">
          <button onClick={() => s.setQty(n.id, n.qty - 1)}>−</button>
          <input key={n.qty} type="number" min={1} max={6} defaultValue={n.qty} onBlur={(e) => s.setQty(n.id, parseInt(e.target.value) || 1)} />
          <button onClick={() => s.setQty(n.id, n.qty + 1)}>+</button>
          <span style={{ color: 'var(--muted)' }}>máquinas iguais lado a lado</span>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn sec" style={{ flex: 1 }} onClick={() => s.toggleOff(n.id)}>{n.off ? 'Ligar a máquina' : 'Desligar a máquina'}</button>
        <button className="btn sec" style={{ flex: 1 }} onClick={() => s.commitValue(n.id, t.crit)}>Testar falha</button>
        <button className="btn sec" style={{ flex: 1 }} onClick={() => s.commitValue(n.id, t.opt)}>Voltar ao ótimo</button>
      </div>
      <details>
        <summary>Mais detalhes</summary>
        <div className="field"><label>O que pode dar errado</label>{t.risk}</div>
        <div className="field"><label>Consumo de energia</label>Parada: <b>{fv(t.sb)} kW</b> · Trabalhando no ótimo: <b>+{fv(t.vr)} kW</b> · Custo agora: <b>R$ {fmt(r.energy * s.tariff, 2)}/h</b></div>
        <div className="field"><label>De onde vêm os números</label><Refs t={t} id={n.type} /></div>
        <div className="field"><label>Preço estimado (1 unidade)</label><CostInfo t={t} /></div>
        <button className="btn danger" onClick={() => s.removeNode(n.id)}>Remover esta máquina</button>
      </details>
    </>
  );
}

/* ---------- Conversa ---------- */
function ChatTab() {
  const chat = useStore((s) => s.chat);
  const ask = useStore((s) => s.ask);
  const showToast = useStore((s) => s.showToast);
  const applyPlan = useStore((s) => s.applyPlan);
  const [text, setText] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; }, [chat]);
  const send = (q: string) => { ask(q); setText(''); };

  const bubble = (m: ChatMsg, i: number) => {
    if (m.who === 'me') return <div key={i} className="bub me">{m.text}</div>;
    if (m.kind === 'text') return <div key={i} className="bub ai"><Rich text={m.text} terms /><Cites refs={m.cites} /></div>;
    if (m.kind === 'plan') {
      return (
        <div key={i} className="bub ai">
          <Rich text={m.text} /> {m.plan.steps.length > 0 && 'Eu faria assim:'}
          <ol className="steps">{m.plan.steps.map((st, k) => (
            <li key={k}><div className="b">{k + 1}</div><div><Rich text={st.what} /><div style={{ color: 'var(--muted)' }}><Rich text={st.why} /></div></div></li>
          ))}</ol>
          {m.plan.invest.max > 0 && <div>Investimento estimado: <b>{moneyRange(m.plan.invest)}</b>.</div>}
          {m.plan.note && <div><Rich text={m.plan.note} /></div>}
          {m.plan.steps.length > 0 && <button className="btn amber" style={{ marginTop: 8 }} onClick={() => applyPlan(m.plan)}>Aplicar na fábrica</button>}
        </div>
      );
    }
    return <div key={i} className="bub ai"><BottleneckChat rep={m.report} /></div>;
  };

  return (
    <>
      <div className="sbody" ref={boxRef}>
        <h3>Conversa</h3>
        <details>
          <summary>Base de conhecimento ({KB.length} documentos)</summary>
          {KB.map((k) => (
            <div key={k[0]} style={{ padding: '4px 0' }}><Icon name="book" size={14} /> <b>{k[0]}</b><br /><span style={{ color: 'var(--muted)' }}>{k[1]} · </span><Chip kind={k[2] === 'real' ? 'ok' : 'info'}>{k[2]}</Chip></div>
          ))}
          <button className="btn sec block" style={{ marginTop: 8 }} onClick={() => showToast('No sistema final você sobe o PDF e o assistente passa a consultá-lo')}>+ Adicionar manual (PDF)</button>
        </details>
        <div className="chat">
          <div className="bub ai">Olá! Eu analiso a sua fábrica e consulto os manuais cadastrados. Pergunte, por exemplo, <i>onde está o gargalo</i> ou <i>como aumentar a produção em 10%</i>.</div>
          {chat.map(bubble)}
        </div>
        <div className="sugs">{SUGGESTIONS.map((q) => <button key={q} className="chipbtn" onClick={() => send(q)}>{q}</button>)}</div>
        <div style={{ color: 'var(--muted)', fontSize: 11 }}>Protótipo: as respostas são calculadas em cima da sua fábrica, mas a leitura dos manuais ainda é de exemplo.</div>
      </div>
      <div className="chatin">
        <input type="text" placeholder="Pergunte ou peça uma análise…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(text); }} />
        <button className="btn" onClick={() => send(text)}>Enviar</button>
      </div>
    </>
  );
}

/* ---------- Registro ---------- */
function LogTab() {
  const events = useStore((s) => s.events);
  const clearEvents = useStore((s) => s.clearEvents);
  return (
    <>
      <h3>Registro</h3>
      <p className="lead">Tudo o que acontece, do mais novo para o mais antigo.</p>
      <div className="loglist">
        {events.length ? events.map((e, i) => <div key={i} className={'lg ' + e.kind}><time>{e.time}</time><span>{e.text}</span></div>)
          : <div className="sub">Nada aconteceu ainda. Aqui aparece o que você faz e o que acontece durante a simulação.</div>}
      </div>
      <button className="btn sec" style={{ marginTop: 12 }} onClick={clearEvents}>Limpar registro</button>
    </>
  );
}
