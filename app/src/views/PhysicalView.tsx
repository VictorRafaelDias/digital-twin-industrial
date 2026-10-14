import { ZONES } from '../data/content';
import { useSim } from '../components/hooks';
import { fmt } from '../engine/format';
import { useStore } from '../store/useStore';

/** Fábrica vista de cima: cada máquina na sua área, como numa planta baixa. */
export function PhysicalView() {
  const s = useStore();
  const sim = useSim();
  const L = s.layers;
  const zoneOf = (type: string) => ZONES.find((z) => z.stages.includes(s.catalog[type].stage)) || ZONES[0];
  const pos: Record<string, { x: number; y: number }> = {};
  const count: Record<string, number> = {};
  s.nodes.forEach((n) => {
    const z = zoneOf(n.type), zi = ZONES.indexOf(z), k = (count[z.id] = (count[z.id] ?? -1) + 1);
    pos[n.id] = { x: 20 + zi * 272 + 22, y: 150 + k * 104 };
  });

  return (
    <section className="view active">
      <div className="phys-banner"><b>O que é esta tela?</b> A fábrica vista de cima, como uma planta baixa: mostra <b>onde cada máquina fica no chão</b> e por onde o produto caminha. Na aba <i>Montar</i> você desenha a lógica (quem liga em quem); aqui você vê o resultado no espaço.</div>
      <div className="phys-tools">
        <button className={'chipbtn' + (L.pipes ? ' on' : '')} onClick={() => s.toggleLayer('pipes')}>Por onde o produto passa</button>
        <button className={'chipbtn' + (L.energy ? ' on' : '')} onClick={() => s.toggleLayer('energy')}>Quem gasta mais energia</button>
      </div>
      <svg id="physSvg" viewBox="0 0 1100 640" preserveAspectRatio="xMidYMid meet">
        <rect x={6} y={100} width={1088} height={520} rx={14} fill="#fff" stroke="#17232E" strokeWidth={3} />
        {ZONES.map((z, i) => (
          <g key={z.id}>
            <rect x={20 + i * 272} y={112} width={252} height={496} rx={10} fill={z.color} stroke="#c9d2d8" />
            <text x={34 + i * 272} y={136} fontSize={13} fontWeight={700} fill="#66757F">{z.name}</text>
          </g>
        ))}
        <text x={10} y={94} fontSize={12} fill="#2E8B57" fontWeight={700}>➜ Entrada de matéria-prima</text>
        <text x={1090} y={94} fontSize={12} fill="#2E8B57" fontWeight={700} textAnchor="end">Saída para expedição ➜</text>
        {L.pipes && s.edges.map((e) => {
          const a = pos[e.from], b = pos[e.to]; if (!a || !b) return null;
          return <line key={e.id} x1={a.x + 105} y1={a.y + 42} x2={b.x + 105} y2={b.y + 42} stroke="#1C7293" strokeWidth={5} strokeDasharray="10 6" opacity={0.5} />;
        })}
        {s.nodes.map((n) => {
          const t = s.catalog[n.type], r = sim.res[n.id], p = pos[n.id];
          const c = r.state === 'falha' ? '#C0392B' : r.state === 'normal' ? '#2E8B57' : r.state === 'desligada' ? '#9aa5ad' : '#E8871E';
          return (
            <g key={n.id}>
              {L.energy && <circle cx={p.x + 105} cy={p.y + 42} r={34 + r.energy * 6} fill="#E8871E" opacity={0.2} />}
              <rect x={p.x} y={p.y} width={210} height={84} rx={9} fill="#fff" stroke={c} strokeWidth={3} />
              <text x={p.x + 105} y={p.y + 34} textAnchor="middle" fontSize={14} fontWeight={700} fill="#17232E">{t.name}{n.qty > 1 ? ' ×' + n.qty : ''}</text>
              <text x={p.x + 105} y={p.y + 56} textAnchor="middle" fontSize={12} fill="#66757F">{fmt(r.eff)}/h · {fmt(r.energy, 1)} kW</text>
            </g>
          );
        })}
        {!s.nodes.length && <text x={550} y={360} textAnchor="middle" fontSize={16} fill="#66757F">Monte a fábrica na aba “Montar” e ela aparece aqui.</text>}
      </svg>
    </section>
  );
}
