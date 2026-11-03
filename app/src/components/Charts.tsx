/* Gráficos simples em SVG (sem biblioteca) para o dashboard. Cada um é pequeno e só desenha; quem calcula é o motor. */
import type { ReactNode } from 'react';
import { fmt } from '../engine/format';

export const COLORS = { ok: '#2E8B57', warn: '#E8871E', bad: '#C0392B', teal: '#1C7293', navy: '#17232E', muted: '#66757F', line: '#DCE3E8', soft: '#E3F0F4' };

export const riskColor = (risk: number) => (risk > 0.4 ? COLORS.bad : risk > 0.1 ? COLORS.warn : COLORS.ok);
export const stateColor = (state: string) => (state === 'falha' ? COLORS.bad : state === 'normal' ? COLORS.ok : state === 'desligada' ? COLORS.muted : COLORS.warn);

/** Cada gráfico vem numa caixinha com o que ele mostra (para contar a história sem o usuário precisar ler números). */
export function ChartBox({ title, what, children }: { title: string; what: string; children: ReactNode }) {
  return (
    <section className="chartbox">
      <h4>{title}</h4>
      <div className="what">{what}</div>
      {children}
    </section>
  );
}

/** Medidor em meia-lua: 0 a 100%. */
export function Gauge({ value, color, label }: { value: number; color: string; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  const R = 70, cx = 90, cy = 85;
  const ang = Math.PI * (1 - v / 100);
  const x = cx + R * Math.cos(ang), y = cy - R * Math.sin(ang);
  const arc = (a: number) => `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R * Math.cos(a)} ${cy - R * Math.sin(a)}`;
  return (
    <svg viewBox="0 0 180 112" className="gauge" role="img" aria-label={`${label}: ${fmt(v)}%`}>
      <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`} fill="none" stroke={COLORS.line} strokeWidth="14" strokeLinecap="round" />
      {v > 0.5 && <path d={arc(ang)} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" />}
      <circle cx={x} cy={y} r="4" fill="#fff" stroke={color} strokeWidth="2" />
      <text x={cx} y={cy - 12} textAnchor="middle" fontSize="26" fontWeight="700" fill={COLORS.navy}>{fmt(v)}%</text>
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize="10" fill={COLORS.muted}>{label}</text>
    </svg>
  );
}

export interface Line { label: string; color: string; points: [number, number][]; dashed?: boolean }

/** Linhas ao longo do tempo (eixo x em minutos simulados). */
export function LineChart({ lines, yLabel, height = 150 }: { lines: Line[]; yLabel: string; height?: number }) {
  const W = 320, H = height, L = 40, R = 8, T = 8, B = 22;
  const pts = lines.flatMap((l) => l.points);
  if (pts.length < 2) return <div className="nodata">Rode a simulação (botão Iniciar) para ver a linha do tempo.</div>;
  const xmax = Math.max(...pts.map((p) => p[0])) || 1;
  const ymax = Math.max(...pts.map((p) => p[1]), 1) * 1.08;
  const sx = (x: number) => L + (x / xmax) * (W - L - R);
  const sy = (y: number) => T + (1 - y / ymax) * (H - T - B);
  const ticks = [0, 0.5, 1].map((f) => f * ymax);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="linechart" role="img" aria-label={yLabel}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} stroke={COLORS.line} strokeWidth="1" />
          <text x={L - 4} y={sy(t) + 3} textAnchor="end" fontSize="9" fill={COLORS.muted}>{fmt(t)}</text>
        </g>
      ))}
      {[0, 0.5, 1].map((f) => <text key={f} x={sx(f * xmax)} y={H - 6} textAnchor="middle" fontSize="9" fill={COLORS.muted}>{fmt(f * xmax)} min</text>)}
      {lines.map((l) => (
        <polyline key={l.label} fill="none" stroke={l.color} strokeWidth="2" strokeDasharray={l.dashed ? '4 3' : undefined}
          points={l.points.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ')} />
      ))}
    </svg>
  );
}

export function Legend({ items }: { items: [string, string][] }) {
  return <div className="legend2">{items.map(([c, l]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</div>;
}

export interface BarRow { label: string; a: number; b?: number; color: string; note?: string }

/** Barras horizontais; com `b`, desenha duas barras por linha (ex.: capacidade e saída). */
export function HBars({ rows, max, unit = '', showNote = true }: { rows: BarRow[]; max?: number; unit?: string; showNote?: boolean }) {
  const m = max ?? Math.max(...rows.flatMap((r) => [r.a, r.b ?? 0]), 1);
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.label} className="hb">
          <div className="hl" title={r.label}>{r.label}</div>
          <div className="ht">
            <div className="bar" style={{ width: `${Math.min(100, (r.a / m) * 100)}%`, background: r.b == null ? r.color : '#B9CBD6' }} />
            {r.b != null && <div className="bar b" style={{ width: `${Math.min(100, (r.b / m) * 100)}%`, background: r.color }} />}
          </div>
          <div className="hv">{r.b != null ? `${fmt(r.b)} / ${fmt(r.a)}` : fmt(r.a, r.a < 10 ? 1 : 0)}{unit}{showNote && r.note ? <small> {r.note}</small> : null}</div>
        </div>
      ))}
      {rows.length === 0 && <div className="nodata">Monte a fábrica para ver este gráfico.</div>}
    </div>
  );
}

export interface Slice { label: string; value: number; color: string }
const PALETTE = ['#1C7293', '#E8871E', '#2E8B57', '#7A4E9E', '#C0392B', '#2F4B7C', '#8A949C', '#B8860B', '#3A9188', '#C46A1A'];
export const sliceColor = (i: number) => PALETTE[i % PALETTE.length];

/** Rosca: fatias proporcionais ao valor. */
export function Donut({ slices, center }: { slices: Slice[]; center: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return <div className="nodata">Sem consumo para mostrar.</div>;
  const R = 46, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="donutwrap">
      <svg viewBox="0 0 120 120" className="donut" role="img" aria-label="Consumo de energia por máquina">
        <circle cx="60" cy="60" r={R} fill="none" stroke={COLORS.line} strokeWidth="18" />
        {slices.map((s) => {
          const len = (s.value / total) * C;
          const el = <circle key={s.label} cx="60" cy="60" r={R} fill="none" stroke={s.color} strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 60 60)" />;
          acc += len;
          return el;
        })}
        <text x="60" y="58" textAnchor="middle" fontSize="15" fontWeight="700" fill={COLORS.navy}>{center}</text>
        <text x="60" y="72" textAnchor="middle" fontSize="8" fill={COLORS.muted}>total</text>
      </svg>
      <div className="dlegend">{slices.map((s) => <div key={s.label}><i style={{ background: s.color }} />{s.label} <b>{fmt((s.value / total) * 100)}%</b></div>)}</div>
    </div>
  );
}

/** Mini-gráfico de linha, sem eixos (para o painel de uma máquina). */
export function Spark({ points, color, height = 34 }: { points: number[]; color: string; height?: number }) {
  if (points.length < 2) return <div className="nodata small">sem leituras ainda</div>;
  const W = 150, max = Math.max(...points, 1e-9), min = Math.min(...points, 0);
  const sy = (v: number) => 3 + (1 - (v - min) / (max - min || 1)) * (height - 6);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="spark" role="img">
      <polyline fill="none" stroke={color} strokeWidth="1.8" points={points.map((v, i) => `${((i / (points.length - 1)) * (W - 4) + 2).toFixed(1)},${sy(v).toFixed(1)}`).join(' ')} />
    </svg>
  );
}
