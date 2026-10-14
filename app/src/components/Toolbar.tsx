import { useEffect, useState, type ReactNode } from 'react';
import { clock } from '../engine/format';
import { useStore } from '../store/useStore';
import type { ToolId } from '../types';
import { Icon } from './Icon';

const Group = ({ name, cls = '', children }: { name: string; cls?: string; children: ReactNode }) => (
  <div className={'tgroup ' + cls}><div className="gl">{name}</div><div className="gb">{children}</div></div>
);

export function Toolbar() {
  const s = useStore();
  const r = s.run;
  const [amb, setAmb] = useState(String(s.ambient));
  useEffect(() => setAmb(String(s.ambient)), [s.ambient]);

  const tool = (id: ToolId, ic: string, label: string) => (
    <button className={'tbtn' + (s.tool === id ? ' active' : '')} title={label} onClick={() => s.setTool(id)}><Icon name={ic} size={17} /><span>{label}</span></button>
  );
  const label = r.on ? 'Pausar' : r.active && !r.finished ? 'Continuar' : 'Iniciar';
  const T = s.ambient;
  const st = T < 15 ? ['frio', 'info'] : T <= 25 ? ['ideal', 'ok'] : ['quente', 'warn'];

  return (
    <div className="toolbar">
      <Group name="Ferramentas">
        {tool('select', 'select', 'Selecionar')}{tool('link', 'link', 'Conectar')}{tool('trash', 'trash', 'Excluir')}
        <span className="sep" />
        <button className="tbtn" title="Desfazer (Ctrl+Z)" onClick={s.undo}><Icon name="undo" size={17} /></button>
        <button className="tbtn" title="Refazer (Ctrl+Y)" onClick={s.redo}><Icon name="redo" size={17} /></button>
        <span className="sep" />
        <button className="tbtn" title="Apaga toda a fábrica (dá para desfazer)" onClick={() => (s.nodes.length ? s.clearAll() : s.showToast('A fábrica já está vazia'))}><Icon name="clear" size={17} /><span>Limpar tudo</span></button>
      </Group>
      <Group name="Zoom">
        <button className="tbtn" title="Afastar" onClick={() => s.setZoom(s.zoom - 0.1)}><Icon name="zoomout" size={17} /></button>
        <span className="zoomval">{Math.round(s.zoom * 100)}%</span>
        <button className="tbtn" title="Aproximar" onClick={() => s.setZoom(s.zoom + 0.1)}><Icon name="zoomin" size={17} /></button>
        <button className="tbtn" title="Voltar a 100%" onClick={() => s.setZoom(1)}><Icon name="fit" size={17} /></button>
      </Group>
      <span className="spacer" />
      <Group name="Simulação" cls="sim">
        <button className={'tbtn runplay' + (r.on ? ' active' : '')} onClick={s.startOrToggleRun}><Icon name={r.on ? 'pause' : 'play'} size={16} /><span>{label}</span></button>
        <button className="tbtn" title="Parar e zerar" onClick={s.stopRun}><Icon name="stop" size={15} /></button>
        <select className="selectbox" title="Velocidade" value={r.speed} onChange={(e) => s.setRunSpeed(+e.target.value)}>
          {[1, 5, 20, 60].map((v) => <option key={v} value={v}>×{v}</option>)}
        </select>
        <select className="selectbox" title="Duração simulada" value={r.dur} disabled={r.active} onChange={(e) => s.setRunDur(+e.target.value)}>
          {[[30, '30 min'], [60, '1 hora'], [480, '8 horas']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="runclock">{r.active ? `${clock(r.t)} / ${clock(r.dur)}` : 'parado'}</span>
      </Group>
      <Group name="Ambiente" cls="amb">
        <Icon name="thermo" size={16} />
        <input type="number" value={amb} min={0} max={45} title="Temperatura do ambiente"
          onChange={(e) => setAmb(e.target.value)} onBlur={() => s.setAmbient(parseFloat(amb))} onKeyDown={(e) => { if (e.key === 'Enter') s.setAmbient(parseFloat(amb)); }} /> °C
        <span className={'chip ' + st[1]}>{st[0]}</span>
        <button className="tbtn" title="Ver o que a temperatura muda na fábrica" onClick={() => s.openModal('ambient')}>Efeitos ›</button>
      </Group>
    </div>
  );
}
