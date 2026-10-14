import { useStore } from '../store/useStore';
import { Icon } from './Icon';

/** Lista de máquinas para arrastar (só na aba Montar). */
export function Palette() {
  const catalog = useStore((s) => s.catalog);
  const typeInfo = useStore((s) => s.typeInfo);
  const cat = useStore((s) => s.cat);
  const q = useStore((s) => s.q);
  const setCat = useStore((s) => s.setCat);
  const setQ = useStore((s) => s.setQ);
  const addNode = useStore((s) => s.addNode);
  const count = useStore((s) => s.nodes.length);

  const cats = [{ id: 'all', name: 'Todas' }, ...Object.entries(typeInfo).filter(([, t]) => t.on !== false).map(([id, t]) => ({ id, name: t.name }))];
  const active = cats.some((c) => c.id === cat) ? cat : 'all';
  const term = q.trim().toLowerCase();
  const list = Object.entries(catalog).filter(([, t]) =>
    typeInfo[t.cat]?.on !== false && (active === 'all' || t.cat === active) && (!term || (t.name + ' ' + t.stage).toLowerCase().includes(term)));

  return (
    <div className="pal">
      <div className="palhead">
        <div className="search">
          <Icon name="search" size={16} />
          <input type="text" placeholder="Buscar máquina…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="cats">
          {cats.map((c) => <button key={c.id} className={'chipbtn' + (active === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>{c.name}</button>)}
        </div>
      </div>
      <div className="devlist">
        {list.length ? list.map(([k, t]) => (
          <div key={k} className="dev" draggable title={t.desc}
            onDragStart={(e) => e.dataTransfer.setData('text/plain', k)}
            onDoubleClick={() => addNode(k, 40 + (count % 5) * 210, 60 + Math.floor(count / 5) * 170)}>
            <Icon name={t.icon} size={28} /><b>{t.name}</b><small>{t.stage}{t.flow === 'suco' ? ' · suco' : ''}</small>
          </div>
        )) : <div className="nores">Nenhuma máquina com esse nome.</div>}
      </div>
    </div>
  );
}
