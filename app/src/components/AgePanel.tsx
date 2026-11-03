/* Legenda lateral do quadro: "Estado das máquinas". Cada máquina tem a idade (anos de uso) e os meses desde a última manutenção.
   Por padrão todas são novas e em dia. Idade e manutenção atrasada baixam um pouco o rendimento e sobem o risco e a temperatura
   (hipótese didática, ver engine/wear.ts). A simulação não gasta a máquina: esses dados são informados por quem monta a fábrica. */
import { useState } from 'react';
import { fv } from '../engine/format';
import { intervalMonths, lifeYears, STATUS_SHORT, wearEffects } from '../engine/wear';
import { useStore } from '../store/useStore';
import { machineNames } from '../store/versions';
import { COLORS } from './Charts';

const PRESETS: [string, number][] = [['Nova', 0], ['Meia-vida', 0.5], ['Velha', 0.8], ['Fim de vida', 1]];
const statusColor = (s: string) => (s === 'ok' ? COLORS.ok : s === 'atencao' ? COLORS.warn : COLORS.bad);

/** Campo numérico que só grava ao sair do campo ou apertar Enter (não registra um "desfazer" a cada tecla). */
export function NumField({ value, min = 0, max, step = 0.5, onCommit, title }: { value: number; min?: number; max?: number; step?: number; onCommit: (v: number) => void; title?: string }) {
  return (
    <input className="agein" type="number" min={min} max={max} step={step} title={title} key={value} defaultValue={Math.round(value * 100) / 100}
      onBlur={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v !== value) onCommit(v); else e.target.value = String(Math.round(value * 100) / 100); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

export function AgePanel() {
  const nodes = useStore((s) => s.nodes);
  const catalog = useStore((s) => s.catalog);
  const { setAge, setMaintMonths, agePreset } = useStore.getState();
  const [open, setOpen] = useState(false);
  if (!nodes.length) return null;
  const names = machineNames(nodes, catalog);
  const velhas = nodes.filter((n) => (n.ageYears ?? 0) > 0).length;

  return (
    <div className="agepanel">
      <button className={'agebtn' + (velhas ? ' on' : '')} onClick={() => setOpen(!open)} title="Informe a idade e a última manutenção de cada máquina">
        ⏱ Estado das máquinas{velhas ? <span className="badge">{velhas}</span> : null} <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="agebody">
          <div className="sub" style={{ margin: '0 0 6px' }}>
            Por padrão todas as máquinas são <b>novas</b>. Quanto mais velha ou sem manutenção, menos ela rende e maior o risco (hipótese didática).
          </div>
          <table className="t agetbl"><thead><tr><th>Máquina</th><th title="Anos de uso">Idade (anos)</th><th title="Meses desde a última manutenção">Manut. (meses)</th><th /></tr></thead><tbody>
            {nodes.map((n) => {
              const t = catalog[n.type], age = n.ageYears ?? 0, months = n.maintMonths ?? 0;
              const w = wearEffects(t, age, months);
              return (
                <tr key={n.id}>
                  <td title={`Vida útil estimada: ${fv(Math.round(lifeYears(t) * 10) / 10)} anos · manutenção a cada ${fv(Math.round(intervalMonths(t) * 10) / 10)} meses`}>{names[n.id]}</td>
                  <td><NumField value={age} max={60} onCommit={(v) => setAge(n.id, v)} /></td>
                  <td><NumField value={months} max={Math.max(0, age * 12)} step={1} onCommit={(v) => setMaintMonths(n.id, v)} title="Não passa da idade da máquina" /></td>
                  <td>{age > 0 ? <span className="chip" style={{ background: statusColor(w.status), color: '#fff' }}>{STATUS_SHORT[w.status]}</span> : <span className="sub" style={{ margin: 0 }}>nova</span>}</td>
                </tr>
              );
            })}
          </tbody></table>
          <div className="agepre">
            <span className="sub" style={{ margin: 0 }}>Todas:</span>
            {PRESETS.map(([l, f]) => <button key={l} className="btn sec" onClick={() => agePreset(nodes.map((n) => n.id), f)} title={f ? `Idade = ${f * 100}% da vida útil de cada máquina` : 'Idade zero'}>{l}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}
