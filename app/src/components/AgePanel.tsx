/* Legenda lateral do quadro: "Estado das máquinas". Cada máquina tem a idade (anos de uso) e os meses desde a última manutenção.
   Por padrão todas são novas e em dia. Idade e manutenção atrasada baixam um pouco o rendimento e sobem o risco e a temperatura
   (hipótese didática, ver engine/wear.ts). A simulação não gasta a máquina: esses dados são informados por quem monta a fábrica. */
import { useState } from 'react';
import { fv } from '../engine/format';
import { daysSince, intervalMonths, lifeYears, sinceText, STATUS_SHORT, todayISO, wearEffects } from '../engine/wear';
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

/** Campo de data (dia/mês/ano). Não aceita data no futuro; vazio = não informada. Só grava ao sair do campo. */
export function DateField({ value, onCommit }: { value?: string; onCommit: (iso: string | null) => void }) {
  return (
    <input className="agein agedate" type="date" max={todayISO()} min="1950-01-01" value={value ?? ''} title="Data da última manutenção (vazio = não informada: conta como em dia)"
      onChange={(e) => { if (e.target.value === '' || e.target.validity.valid) onCommit(e.target.value || null); }} />
  );
}

export function AgePanel() {
  const nodes = useStore((s) => s.nodes);
  const catalog = useStore((s) => s.catalog);
  const { setAge, setMaintDate, agePreset } = useStore.getState();
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
            Por padrão todas as máquinas são <b>novas</b>. Quanto mais velha ou sem manutenção em dia, menos ela rende e maior o risco (hipótese didática). Informe a <b>data da última manutenção</b>: sem data, a máquina conta como em dia.
          </div>
          <table className="t agetbl"><thead><tr><th>Máquina</th><th title="Anos de uso">Idade (anos)</th><th title="Data da última manutenção. Vazia = não informada (conta como em dia)">Última manutenção</th><th /></tr></thead><tbody>
            {nodes.map((n) => {
              const t = catalog[n.type], age = n.ageYears ?? 0, dias = daysSince(n.maintDate);
              const w = wearEffects(t, age, dias);
              return (
                <tr key={n.id}>
                  <td title={`Vida útil estimada: ${fv(Math.round(lifeYears(t) * 10) / 10)} anos · manutenção a cada ${fv(Math.round(intervalMonths(t) * 10) / 10)} meses`}>{names[n.id]}</td>
                  <td><NumField value={age} max={60} onCommit={(v) => setAge(n.id, v)} /></td>
                  <td>{age > 0 ? <DateField value={n.maintDate} onCommit={(v) => setMaintDate(n.id, v)} /> : <span className="sub" style={{ margin: 0 }}>—</span>}{n.maintDate && <div className="sub" style={{ margin: 0 }}>há {sinceText(dias)}</div>}</td>
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
