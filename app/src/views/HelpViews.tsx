/* Tudo o que é manual fica na Ajuda: Guia da plataforma, Manual das máquinas e Glossário. */
import { Icon } from '../components/Icon';
import { Rich } from '../components/Rich';
import { CostInfo, Refs } from '../components/Shared';
import { GUIDE, MANUAL, TEMPLATES } from '../data/content';
import { HEAT_INFO } from '../data/catalog';
import { GLOSS } from '../data/glossary';
import { fmt, fv } from '../engine/format';
import { useStore } from '../store/useStore';
import type { MachineType, ViewId } from '../types';

function HelpBar({ active }: { active: ViewId }) {
  const setView = useStore((s) => s.setView);
  const openGlossary = useStore((s) => s.openGlossary);
  const items: [ViewId, string][] = [['guide', 'Guia da plataforma'], ['manual', 'Manual das máquinas'], ['glossary', 'Glossário']];
  return (
    <div className="helpbar">
      <b><Icon name="book" size={16} /> Ajuda</b>
      {items.map(([k, l]) => <button key={k} className={'chipbtn' + (active === k ? ' on' : '')} onClick={() => (k === 'glossary' ? openGlossary() : setView(k))}>{l}</button>)}
    </div>
  );
}

/* ---------- Guia da plataforma ---------- */
export function GuideView() {
  const i = useStore((s) => s.guideSel);
  const setGuideSel = useStore((s) => s.setGuideSel);
  const g = GUIDE[i];
  return (
    <section className="view active">
      <HelpBar active="guide" />
      <div className="gdoc">
        <nav className="gtoc"><h4>Guia da plataforma</h4>{GUIDE.map((x, k) => <a key={x.id} className={k === i ? 'on' : ''} onClick={() => setGuideSel(k)}>{x.title}</a>)}</nav>
        <article>
          <h2>{g.title}</h2>
          <p className="lead">{g.what}</p>
          <div className="shot"><img src={`${import.meta.env.BASE_URL}guia/${g.img}`} alt={g.title} onError={(e) => { (e.target as HTMLImageElement).replaceWith(Object.assign(document.createElement('div'), { className: 'noimg', textContent: 'Imagem em preparação' })); }} /></div>
          <h4>O que dá para fazer</h4>
          <ul>{g.does.map((d) => <li key={d}>{d}</li>)}</ul>
          <div className="say">💡 {g.tip}</div>
          <div className="gnav">
            <button className="btn sec" disabled={!i} onClick={() => setGuideSel(i - 1)}>‹ Anterior</button>
            <button className="btn" disabled={i >= GUIDE.length - 1} onClick={() => setGuideSel(i + 1)}>Próxima ›</button>
          </div>
        </article>
      </div>
    </section>
  );
}

/* ---------- Manual das máquinas ---------- */
function ConfigPreview({ t }: { t: MachineType }) {
  return (
    <div className="cfgshot">
      <div className="hmi-screen">
        <div className="hmi-top"><span className="lamp">OK</span><b>{t.name}</b></div>
        <div className="hmi-set" style={{ margin: 10 }}>
          <div className="lab">{t.param}</div>
          <div className="big" style={{ fontSize: 38 }}>{fv(t.opt)}<span className="un"> {t.unit}</span></div>
          <div className="stepper"><button style={{ width: 48, height: 42 }}>▼</button><button style={{ width: 48, height: 42 }}>▲</button></div>
          <div className="marks"><span>mín {fv(t.min)}</span><span>ótimo {fv(t.opt)}</span><span>falha {fv(t.crit)}</span></div>
          <div className="recipes"><button>Econômico</button><button>Padrão</button><button>Máximo seguro</button></div>
          <div className="hmi-actions"><button className="btn sec" style={{ flex: 1 }}>Desligar</button><button className="btn sec" style={{ flex: 1 }}>Unidades: 1 ＋</button></div>
        </div>
        <table style={{ margin: '0 10px 10px', width: 'calc(100% - 20px)' }}><tbody>
          <tr><td>Situação</td><td className="v">NORMAL</td></tr>
          <tr><td>Capacidade</td><td className="v">{fmt(t.cap)} gf/h</td></tr>
          <tr><td>Consumo</td><td className="v">{fv(t.sb + t.vr)} kW</td></tr>
        </tbody></table>
      </div>
      <div className="cap">Tela de configuração desta máquina — exemplo com os valores no ponto ótimo</div>
    </div>
  );
}

export function ManualView() {
  const s = useStore();
  const m = s.manual;
  const typesOn = Object.entries(s.typeInfo).filter(([, t]) => t.on !== false);
  const plural = (q: number) => q + (q === 1 ? ' máquina' : ' máquinas');

  let body;
  if (!m.type) {
    body = (
      <>
        <h2>Manual das máquinas</h2>
        <p className="lead">Explore as máquinas que existem no catálogo: o que cada uma faz, até onde ela aguenta e como é a tela para configurá-la. Comece escolhendo um tipo.</p>
        <div className="tgrid">{typesOn.map(([k, t]) => (
          <div key={k} className="tcard" onClick={() => s.setManual({ type: k, machine: null })}>
            <div className="ico"><Icon name={t.icon} size={22} /></div><b><Rich text={t.name} terms /></b><p><Rich text={t.desc} terms /></p>
            <small>{plural(Object.values(s.catalog).filter((c) => c.cat === k).length)} ›</small>
          </div>
        ))}</div>
      </>
    );
  } else if (!m.machine) {
    const ti = s.typeInfo[m.type];
    body = (
      <>
        <h2>{ti.name}</h2><p className="lead">{ti.desc}</p>
        <div className="tgrid">{Object.entries(s.catalog).filter(([, t]) => t.cat === m.type).map(([k, t]) => (
          <div key={k} className="tcard" onClick={() => s.setManual({ ...m, machine: k })}>
            <div className="ico"><Icon name={t.icon} size={22} /></div><b>{t.name}</b><p>{t.desc}</p><small>Ver detalhes ›</small>
          </div>
        ))}</div>
      </>
    );
  } else {
    const id = m.machine, t = s.catalog[id], mn = MANUAL[id];
    const flows = Object.values(TEMPLATES).filter((tp) => tp.nodes.some((n) => n[0] === id)).map((tp) => tp.name);
    body = (
      <div className="mdetail">
        <div>
          <div className="sidehead" style={{ marginBottom: 14 }}><div className="ico" style={{ width: 48, height: 48 }}><Icon name={t.icon} size={26} /></div>
            <div><h2 style={{ margin: 0 }}>{t.name}</h2><div style={{ color: 'var(--muted)' }}>{s.typeInfo[t.cat]?.name} · {t.stage}</div></div></div>
          <div className="box"><h4>O que ela faz</h4><p>{mn.long}</p></div>
          <div className="box"><h4>Como o ritmo funciona</h4><p><Rich text={mn.how} terms /></p></div>
          <div className="box"><h4>Limites e capacidade</h4><table className="lim"><tbody>
            <tr><td>Ritmo ajustado por</td><td>{t.param} ({t.unit})</td></tr>
            <tr><td>Faixa de ajuste</td><td>{fv(t.min)} a {fv(t.max)} {t.unit}</td></tr>
            <tr><td>Ponto ótimo (trabalha bem)</td><td>{fv(t.opt)} {t.unit}</td></tr>
            <tr><td>Atenção (acima do ótimo)</td><td>{fv(t.opt)} → {fv(t.warn)} {t.unit}</td></tr>
            <tr><td>Zona crítica</td><td>{fv(t.warn)} → {fv(t.crit)} {t.unit}</td></tr>
            <tr><td>Falha (a máquina para)</td><td>a partir de {fv(t.crit)} {t.unit}</td></tr>
            <tr><td>Capacidade no ótimo</td><td>{fmt(t.cap)} garrafas/h</td></tr>
            <tr><td>Consumo parada / trabalhando</td><td>{fv(t.sb)} kW / {fv(t.sb + t.vr)} kW</td></tr>
          </tbody></table></div>
          <div className="box"><h4>O que pode dar errado (risco)</h4><p>{t.risk}</p></div>
          <div className="box"><h4>Dicas e cuidados</h4><p>{mn.tips}</p></div>
          <div className="box"><h4>Temperatura e ambiente</h4><p>{HEAT_INFO[t.heat].n}<br /><b>No simulador:</b> {HEAT_INFO[t.heat].f}. <span style={{ color: 'var(--muted)' }}>Ambiente ideal (didático): 15 a 25 °C.</span></p></div>
          <div className="box"><h4>Onde aparece</h4><p>{flows.length ? flows.map((f) => <span key={f} className="chip info">{f}</span>) : 'Fora dos exemplos prontos — use livremente ao montar.'}</p></div>
          <div className="box"><h4>De onde vêm os números</h4><Refs t={t} id={id} /></div>
          <div className="box"><h4>Preço estimado</h4><CostInfo t={t} /></div>
          <button className="btn" style={{ padding: '11px 20px' }} onClick={() => { const c = s.nodes.length; s.addNode(id, 40 + (c % 5) * 210, 60 + Math.floor(c / 5) * 170); s.setView('logic'); s.showToast('Máquina adicionada ao quadro'); }}>+ Adicionar à minha fábrica</button>
        </div>
        <div><ConfigPreview t={t} /></div>
      </div>
    );
  }

  return (
    <section className="view active">
      <HelpBar active="manual" />
      <div className="man">
        <div className="crumbs">
          <a onClick={() => s.setManual({ type: null, machine: null })}>Manual das máquinas</a>
          {m.type && <> › <a onClick={() => s.setManual({ type: m.type, machine: null })}>{s.typeInfo[m.type]?.name}</a></>}
          {m.machine && <> › <b>{s.catalog[m.machine].name}</b></>}
        </div>
        {body}
      </div>
    </section>
  );
}

/* ---------- Glossário ---------- */
export function GlossaryView() {
  const q = useStore((s) => s.glossQ);
  const term = useStore((s) => s.glossTerm);
  const setGlossQ = useStore((s) => s.setGlossQ);
  const ql = q.toLowerCase();
  const groups = [...new Set(GLOSS.map((g) => g.g))];
  const body = groups.map((gr) => {
    const items = GLOSS.filter((g) => g.g === gr && (!ql || (g.t + ' ' + g.d + ' ' + g.k.join(' ')).toLowerCase().includes(ql)));
    return items.length ? (
      <div key={gr}><h3 className="glg">{gr}</h3>
        <div className="gl2">{items.map((g) => (
          <div key={g.t} className={'gitem' + (term === g.t ? ' hl' : '')} ref={term === g.t ? (el) => el?.scrollIntoView({ block: 'center' }) : undefined}><b>{g.t}</b><p>{g.d}</p></div>
        ))}</div></div>
    ) : null;
  });
  return (
    <section className="view active">
      <HelpBar active="glossary" />
      <div className="man">
        <h2>Glossário</h2>
        <p className="lead">O que significa cada palavra difícil do sistema. Nas telas, as palavras sublinhadas têm a explicação ao passar o mouse.</p>
        <div className="search" style={{ width: 320, marginBottom: 12 }}><Icon name="search" size={16} /><input type="text" placeholder="Buscar um termo…" value={q} onChange={(e) => setGlossQ(e.target.value)} /></div>
        {body.some(Boolean) ? body : <p style={{ color: 'var(--muted)' }}>Nenhum termo encontrado.</p>}
      </div>
    </section>
  );
}
