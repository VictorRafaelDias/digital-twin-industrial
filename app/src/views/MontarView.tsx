import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { GuideChecklist } from '../components/GuideChecklist';
import { Icon } from '../components/Icon';
import { useSim, useSimCtx, useTrouble } from '../components/hooks';
import { canConnect, edgeKind } from '../engine/connect';
import { fmt, fv } from '../engine/format';
import { useStore } from '../store/useStore';

interface Rect { x: number; y: number; w: number; h: number }
type Pt = [number, number];

/** Pontos de ligação entre dois cartões (horizontal se estiverem na mesma linha, senão vertical). */
function route(A: Rect, B: Rect): { p1: Pt; p2: Pt; c1: Pt; c2: Pt } {
  const acx = A.x + A.w / 2, acy = A.y + A.h / 2, bcx = B.x + B.w / 2, bcy = B.y + B.h / 2;
  let p1: Pt, p2: Pt, c1: Pt, c2: Pt;
  if (Math.abs(bcy - acy) < 60) {
    if (bcx > acx) { p1 = [A.x + A.w, acy]; p2 = [B.x, bcy]; } else { p1 = [A.x, acy]; p2 = [B.x + B.w, bcy]; }
    const mx = (p1[0] + p2[0]) / 2; c1 = [mx, p1[1]]; c2 = [mx, p2[1]];
  } else {
    if (bcy > acy) { p1 = [acx, A.y + A.h]; p2 = [bcx, B.y]; } else { p1 = [acx, A.y]; p2 = [bcx, B.y + B.h]; }
    const my = (p1[1] + p2[1]) / 2; c1 = [p1[0], my]; c2 = [p2[0], my];
  }
  return { p1, p2, c1, c2 };
}

/** Ponto e ângulo de uma curva de Bézier cúbica no parâmetro t (para a seta no meio da conexão). */
function bezier(p1: Pt, c1: Pt, c2: Pt, p2: Pt, t: number) {
  const u = 1 - t;
  const pt = (i: 0 | 1) => u ** 3 * p1[i] + 3 * u * u * t * c1[i] + 3 * u * t * t * c2[i] + t ** 3 * p2[i];
  const dv = (i: 0 | 1) => 3 * u * u * (c1[i] - p1[i]) + 6 * u * t * (c2[i] - c1[i]) + 3 * t * t * (p2[i] - c2[i]);
  return { x: pt(0), y: pt(1), ang: (Math.atan2(dv(1), dv(0)) * 180) / Math.PI };
}

export function MontarView() {
  const s = useStore();
  const sim = useSim();
  const ctx = useSimCtx();
  const { affected, sev } = useTrouble(sim);
  const innerRef = useRef<HTMLDivElement>(null);
  const nodeEls = useRef<Record<string, HTMLDivElement | null>>({});
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({});
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; started: boolean } | null>(null);

  // mede os cartões depois de desenhar, para traçar as conexões encostando neles
  useLayoutEffect(() => {
    const next: Record<string, { w: number; h: number }> = {};
    s.nodes.forEach((n) => { const el = nodeEls.current[n.id]; if (el) next[n.id] = { w: el.offsetWidth, h: el.offsetHeight }; });
    const same = Object.keys(next).length === Object.keys(sizes).length && Object.entries(next).every(([k, v]) => sizes[k] && sizes[k].w === v.w && sizes[k].h === v.h);
    if (!same) setSizes(next);
  });

  useEffect(() => {
    const move = (e: globalThis.MouseEvent) => {
      const d = drag.current; if (!d) return;
      const st = useStore.getState();
      const dx = (e.clientX - d.sx) / st.zoom, dy = (e.clientY - d.sy) / st.zoom;
      if (!d.started) { if (Math.abs(dx) + Math.abs(dy) <= 3) return; d.started = true; st.dragStart(); }
      st.moveNode(d.id, d.ox + dx, d.oy + dy);
    };
    const up = () => { drag.current = null; };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);

  const rect = (id: string): Rect | null => {
    const n = s.nodes.find((x) => x.id === id), z = sizes[id];
    return n && z ? { x: n.x, y: n.y, w: z.w, h: z.h } : null;
  };

  const onNodeDown = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    const n = s.nodes.find((x) => x.id === id); if (!n) return;
    s.nodeClick(id);
    if (s.tool === 'select') drag.current = { id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, started: false };
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const k = e.dataTransfer.getData('text/plain'); if (!s.catalog[k] || !innerRef.current) return;
    const r = innerRef.current.getBoundingClientRect();
    s.addNode(k, (e.clientX - r.left) / s.zoom - 88, (e.clientY - r.top) / s.zoom - 40);
  };

  const clickBackground = (e: MouseEvent) => {
    const t = e.target as HTMLElement | SVGElement;
    if (t === e.currentTarget || t.id === 'logicInner' || t.tagName === 'svg' || t.classList.contains('empty')) { s.select(null); s.setSelEdge(null); }
  };

  return (
    <section className="view active canvas-grid" onDragOver={(e) => e.preventDefault()} onDrop={onDrop} onClick={clickBackground}>
      <div id="logicInner" ref={innerRef} style={{ transform: `scale(${s.zoom})` }}>
        <svg id="edges" width={1700} height={1000}>
          {s.edges.map((e) => {
            const A = rect(e.from), B = rect(e.to); if (!A || !B) return null;
            const { p1, p2, c1, c2 } = route(A, B);
            const d = `M ${p1} C ${c1} ${c2} ${p2}`, kind = edgeKind(e, s.edges), info = sev[e.id];
            let color = '#9AAAB4', w = 2.5;
            if (info) { color = `rgba(${info.kind === 'danger' ? '192,57,43' : '232,135,30'},${Math.max(0.18, info.level)})`; w = 3.5; }
            if (s.selEdge === e.id) w += 1;
            const flow = (sim.res[e.from]?.eff || 0) / Math.max(1, s.edges.filter((x) => x.from === e.from).length);
            const flowing = s.run.active && flow > 0 && !sim.res[e.to].waiting;
            const mid = bezier(p1, c1, c2, p2, 0.55);
            const nameOf = (id: string) => s.catalog[s.nodes.find((n) => n.id === id)!.type].name;
            return (
              <g key={e.id}>
                <path d={d} stroke={color} strokeWidth={w} strokeDasharray={kind !== 'direta' || s.selEdge === e.id ? '9 6' : undefined}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (s.tool === 'trash') s.removeEdge(e.id);
                    else { s.setSelEdge(s.selEdge === e.id ? null : e.id); s.showToast(`Conexão ${kind}: ${nameOf(e.from)} → ${nameOf(e.to)}`); }
                  }} />
                {flowing && <path d={d} className="flowdash" style={{ animationDuration: `${Math.max(0.15, 1.1 / (1 + Math.log2(s.run.speed)))}s`, animationPlayState: s.run.on ? 'running' : 'paused' }} />}
                <path d="M -6 -5 L 6 0 L -6 5 z" style={{ fill: color, pointerEvents: 'none' }} transform={`translate(${mid.x},${mid.y}) rotate(${mid.ang})`} />
              </g>
            );
          })}
        </svg>
        <div id="nodes">
          {s.nodes.map((n) => {
            const t = s.catalog[n.type], r = sim.res[n.id];
            const q = s.run.active ? s.run.queue[n.id] || 0 : 0;
            let cls = 'node' + (r.state === 'falha' ? ' danger' : r.state === 'desligada' ? ' off' : r.state !== 'normal' ? ' warn' : '')
              + (s.selected === n.id ? ' selected' : '') + (s.connectFrom === n.id ? ' src' : '');
            if (s.tool === 'link' && s.connectFrom && s.connectFrom !== n.id) cls += canConnect(s.connectFrom, n.id, s.nodes, s.edges, ctx.catalog).ok ? ' can' : ' cant';
            return (
              <div key={n.id} ref={(el) => { nodeEls.current[n.id] = el; }} className={cls} style={{ left: n.x, top: n.y }} data-id={n.id} onMouseDown={(e) => onNodeDown(e, n.id)}>
                <span className="led" title={r.state} />
                <div className="top"><div className="ico"><Icon name={t.icon} size={18} /></div>
                  <div><div className="nm">{t.name}</div><div className="st">{n.qty > 1 ? `${n.qty} unidades em paralelo` : t.stage}</div></div></div>
                <div className="stats">
                  <span className="m">Ritmo</span> <b>{fv(n.value)}</b> {t.unit}{n.off && <> · <b>desligada</b></>}<br />
                  <span className="m">Sai</span> <b>{fmt(r.eff)}</b>/h · <b>{fmt(r.energy, 1)}</b> kW
                  {s.run.active && r.waiting && <><br /><i style={{ color: 'var(--muted)' }}>aguardando produto…</i></>}
                  {q >= 1 && <><br /><span className="m">Fila</span> <b>{fmt(q)}</b> garrafas</>}
                </div>
                {sim.bn === n.id && <span className="tag bn">gargalo</span>}
                {affected.has(n.id) && <span className="tag up">afetada a montante</span>}
              </div>
            );
          })}
        </div>
      </div>
      {!s.nodes.length && (
        <div className="empty">
          <h2>Sua fábrica está vazia</h2>
          <p>Arraste uma máquina da lista aqui de baixo para este quadro. Ou comece por um exemplo pronto.</p>
          <div className="acts">
            <button className="btn" onClick={() => s.loadTemplate('bebidas')}>Exemplo: bebidas em geral</button>
            <button className="btn sec" onClick={() => s.loadTemplate('suco')}>Exemplo: suco de laranja natural</button>
          </div>
        </div>
      )}
      <GuideChecklist />
      <div className="legend">
        <span><i style={{ background: '#2E8B57' }} />Normal</span>
        <span><i style={{ background: '#E8871E' }} />Atenção</span>
        <span><i style={{ background: '#C0392B' }} />Falha</span>
        <span><span className="grad" />Efeito cascata</span>
      </div>
    </section>
  );
}
